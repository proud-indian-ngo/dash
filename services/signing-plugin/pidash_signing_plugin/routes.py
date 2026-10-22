"""pi-dash's routes: preparing a resolution's fields and filling a trustee's\nanswers field before they sign."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from signr_service.app import MAX_PDF_BYTES
from signr_service.settings import Settings

from .answers import MAX_VALUE, AnswersError, fill_answers
from .prepare import FieldRequest, PrepareError, prepare_fields


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


class FillRequest(BaseModel):
    pdf: str = Field(description="The latest PDF, base64")
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    value: str = Field(max_length=MAX_VALUE)


def router(_settings: Settings) -> APIRouter:
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

    return r
