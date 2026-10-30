"""pi-dash's routes: preparing a resolution's fields, filling a trustee's\nanswers field before they sign, and checking an Aadhaar eSign copy."""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from pyhanko.sign import timestamps
from starlette.concurrency import run_in_threadpool
from keyseal_service.app import MAX_PDF_BYTES
from keyseal_service.settings import Settings

from .answers import MAX_VALUE, AnswersError, fill_answers
from .esign import (
    PrepareEsignError,
    finalize_esign,
    prepare_esign,
    retimestamp_esign,
    same_pages,
    validate_esign_pdf,
)
from .prepare import FieldRequest, PrepareError, prepare_fields


log = logging.getLogger(__name__)

T = TypeVar("T")


async def off_loop(run: Callable[[], Awaitable[T]]) -> T:
    """Runs a check in a worker thread, so pyHanko's diff reviews and
    hashing don't hold up other requests."""
    return await run_in_threadpool(lambda: asyncio.run(run()))  # type: ignore[arg-type]


class PrepareField(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    page: int
    box: tuple[float, float, float, float]
    answersName: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$"
    )
    answersBox: tuple[float, float, float, float] | None = None


class PrepareRequest(BaseModel):
    pdf: str = Field(description="The PDF, base64")
    fields: list[PrepareField]


class PdfRequest(BaseModel):
    pdf: str = Field(description="The PDF, base64")


class SamePagesRequest(BaseModel):
    pdf: str = Field(description="The PDF sent to Leegality, base64")
    other: str = Field(description="Leegality's copy of it, base64")


class ValidateEsignRequest(BaseModel):
    pdf: str = Field(description="The signed PDF, base64")
    base: int | None = Field(default=None, ge=1, description="Bytes of the copy it extends")


class FillRequest(BaseModel):
    pdf: str = Field(description="The latest PDF, base64")
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    value: str = Field(max_length=MAX_VALUE)


def router(settings: Settings) -> APIRouter:
    r = APIRouter()

    @r.post("/pidash/prepare")
    def prepare(body: PrepareRequest) -> Response:
        try:
            pdf = base64.b64decode(body.pdf, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, "pdf is not base64") from error
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            prepared = prepare_fields(
                pdf,
                [
                    FieldRequest(
                        name=f.name,
                        page=f.page,
                        box=tuple(int(round(v)) for v in f.box),  # type: ignore[arg-type]
                        answers_name=f.answersName,
                        answers_box=f.answersBox,
                    )
                    for f in body.fields
                ],
            )
        except PrepareError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=prepared, media_type="application/pdf")

    @r.post("/fill")
    def fill(body: FillRequest) -> Response:
        try:
            pdf = base64.b64decode(body.pdf, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, "pdf is not base64") from error
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            filled = fill_answers(pdf, body.name, body.value)
        except AnswersError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=filled, media_type="application/pdf")

    @r.post("/pidash/prepare-esign")
    def prepare_for_esign(body: PdfRequest) -> dict[str, object]:
        try:
            pdf = base64.b64decode(body.pdf, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, "pdf is not base64") from error
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            prepared, page_count = prepare_esign(pdf)
        except PrepareEsignError as error:
            raise HTTPException(422, str(error)) from error
        return {"pageCount": page_count, "pdf": base64.b64encode(prepared).decode()}

    @r.post("/pidash/same-pages")
    def compare_pages(body: SamePagesRequest) -> dict[str, bool]:
        try:
            pdf = base64.b64decode(body.pdf, validate=True)
            other = base64.b64decode(body.other, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, "pdf is not base64") from error
        if max(len(pdf), len(other)) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        return {"same": same_pages(pdf, other)}

    tsa = timestamps.HTTPTimeStamper(settings.tsa_url) if settings.tsa_url else None

    async def archive(request: Request, run, what: str) -> Response:  # type: ignore[no-untyped-def]
        if tsa is None:
            raise HTTPException(503, "No timestamp authority is configured")
        pdf = await request.body()
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            out = await off_loop(lambda: run(pdf, tsa, settings.validation))
        except Exception as error:  # noqa: BLE001 - reported, the PDF stays as it was
            log.exception("Couldn't %s an eSign copy", what)
            raise HTTPException(422, f"Couldn't {what}: {type(error).__name__}") from error
        return Response(content=out, media_type="application/pdf")

    @r.post("/pidash/finalize-esign")
    async def finalize(request: Request) -> Response:
        return await archive(request, finalize_esign, "finalise")

    @r.post("/pidash/retimestamp-esign")
    async def retimestamp(request: Request) -> Response:
        return await archive(request, retimestamp_esign, "timestamp")

    @r.post("/pidash/validate-esign")
    async def validate_esign(body: ValidateEsignRequest) -> dict[str, object]:
        try:
            pdf = base64.b64decode(body.pdf, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, "pdf is not base64") from error
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        return await off_loop(lambda: validate_esign_pdf(pdf, settings.validation, body.base))

    return r
