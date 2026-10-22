"""HTTP API. Internal only: the web app reaches it over the private network
and every request but /health carries the shared bearer token."""

from __future__ import annotations

import base64
import binascii
import os
from contextlib import asynccontextmanager
from dataclasses import replace
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from pyhanko.sign import timestamps
from pyhanko_certvalidator.fetchers.aiohttp_fetchers import AIOHttpFetcherBackend

from . import remote_sign
from .answers import MAX_VALUE, AnswersError, fill_answers
from .fetching import public_fetch_session
from .prepare import FieldRequest, PrepareError, prepare_fields
from .request_guard import SigningRequestGuard
from .validate import (
    ValidationSettings,
    certificate_trusted,
    load_trust_roots,
    validate_pdf_async,
)

MAX_PDF_BYTES = 25 * 1024 * 1024
# Includes the 60 MiB signing state, or a base64 PDF plus certificate metadata.
MAX_JSON_BYTES = 64 * 1024 * 1024
DEFAULT_ROOTS = Path(__file__).resolve().parent.parent / "roots"
DEFAULT_INTERMEDIATES = Path(__file__).resolve().parent.parent / "intermediates"


class PrepareField(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    page: int
    box: tuple[float, float, float, float]
    answersName: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$"
    )
    answersBox: tuple[float, float, float, float] | None = None


class SignStartRequest(BaseModel):
    pdf: str = Field(description="The latest PDF, base64")
    fieldName: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    certificate: str = Field(description="The signer's certificate, DER in base64")
    chain: list[str] = Field(default_factory=list, max_length=8)


class CertificateRequest(BaseModel):
    certificate: str = Field(description="The certificate, DER in base64")
    chain: list[str] = Field(default_factory=list, max_length=8)


class SignFinishRequest(BaseModel):
    state: str = Field(max_length=60 * 1024 * 1024)
    signature: str = Field(description="The token's signature value, base64")


class PrepareRequest(BaseModel):
    pdf: str = Field(description="The PDF, base64")
    fields: list[PrepareField]


class FillRequest(BaseModel):
    pdf: str = Field(description="The latest PDF, base64")
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    value: str = Field(max_length=MAX_VALUE)


def _settings() -> ValidationSettings:
    roots_dir = os.environ.get("SIGNING_TRUST_ROOTS_DIR")
    return ValidationSettings(
        trust_roots=load_trust_roots(Path(roots_dir) if roots_dir else DEFAULT_ROOTS),
        intermediates=load_trust_roots(DEFAULT_INTERMEDIATES),
        allow_fetching=os.environ.get("SIGNING_ALLOW_FETCHING") == "true",
    )


def _timestamper(url: str | None) -> timestamps.TimeStamper | None:
    if not url or url == "none":
        return None
    return timestamps.HTTPTimeStamper(url)


def create_app(
    settings: ValidationSettings | None = None,
    token: str | None = None,
    tsa_url: str | None = None,
) -> FastAPI:
    resolved = settings or _settings()
    initial_settings = resolved

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        nonlocal resolved
        if not resolved.allow_fetching:
            yield
            return
        async with public_fetch_session() as session:
            resolved = replace(
                resolved, fetcher_backend=AIOHttpFetcherBackend(session=session)
            )
            try:
                yield
            finally:
                resolved = initial_settings

    app = FastAPI(title="pi-dash signing", docs_url=None, redoc_url=None, lifespan=lifespan)
    expected = token if token is not None else os.environ.get("SIGNING_SERVICE_TOKEN", "")
    app.add_middleware(
        SigningRequestGuard,
        token=expected,
        max_json_bytes=MAX_JSON_BYTES,
        max_pdf_bytes=MAX_PDF_BYTES,
    )
    tsa = _timestamper(
        tsa_url
        if tsa_url is not None
        else os.environ.get("SIGNING_TSA_URL", "http://timestamp.digicert.com")
    )

    @app.get("/health")
    def health() -> dict[str, object]:
        return {"ok": True, "trustRoots": len(resolved.trust_roots)}

    @app.post("/validate")
    async def validate(
        request: Request,
        base: int | None = Query(
            default=None, ge=1, description="Bytes of the copy the signer was given"
        ),
    ) -> dict[str, object]:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_PDF_BYTES:
                raise HTTPException(413, "PDF too large")
        if not body:
            raise HTTPException(400, "Empty body")
        return await validate_pdf_async(bytes(body), resolved, base)

    def _b64(value: str, what: str) -> bytes:
        try:
            return base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, f"{what} is not base64") from error

    @app.post("/certificate")
    async def certificate(body: CertificateRequest) -> dict[str, bool]:
        try:
            cert = remote_sign.load_cert(body.certificate)
            chain = [remote_sign.load_cert(c) for c in body.chain]
            remote_sign.algorithms(cert)
        except remote_sign.RemoteSignError as error:
            raise HTTPException(400, str(error)) from error
        return {"trusted": await certificate_trusted(cert, chain, resolved)}

    @app.post("/sign/start")
    async def sign_start(body: SignStartRequest) -> dict[str, str]:
        pdf = _b64(body.pdf, "pdf")
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            result = await remote_sign.start(
                pdf, body.fieldName, body.certificate, body.chain
            )
        except remote_sign.UnsupportedKeyError as error:
            raise HTTPException(400, str(error)) from error
        except remote_sign.RemoteSignError as error:
            raise HTTPException(422, str(error)) from error
        return {
            "digestAlgorithm": result.digest_algorithm,
            "state": result.state,
            "toSign": base64.b64encode(result.to_sign).decode(),
        }

    @app.post("/sign/finish")
    async def sign_finish(body: SignFinishRequest) -> Response:
        try:
            pdf = await remote_sign.finish(
                body.state, _b64(body.signature, "signature"), tsa
            )
        except remote_sign.RemoteSignError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=pdf, media_type="application/pdf")

    async def _read_pdf(request: Request) -> bytes:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_PDF_BYTES:
                raise HTTPException(413, "PDF too large")
        if not body:
            raise HTTPException(400, "Empty body")
        return bytes(body)

    @app.post("/finalize")
    async def finalize(request: Request) -> Response:
        if tsa is None:
            raise HTTPException(503, "No timestamp authority is configured")
        pdf = await _read_pdf(request)
        try:
            out = await remote_sign.finalize(pdf, tsa, resolved.context())
        except Exception as error:  # noqa: BLE001 - reported, the PDF stays as it was
            raise HTTPException(422, f"Couldn't finalise: {type(error).__name__}") from error
        return Response(content=out, media_type="application/pdf")

    @app.post("/retimestamp")
    async def retimestamp(request: Request) -> Response:
        if tsa is None:
            raise HTTPException(503, "No timestamp authority is configured")
        pdf = await _read_pdf(request)
        try:
            out = await remote_sign.retimestamp(pdf, tsa, resolved.context())
        except Exception as error:  # noqa: BLE001
            raise HTTPException(422, f"Couldn't timestamp: {type(error).__name__}") from error
        return Response(content=out, media_type="application/pdf")

    @app.post("/prepare")
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

    @app.post("/fill")
    def fill(body: FillRequest) -> Response:
        pdf = _b64(body.pdf, "pdf")
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            filled = fill_answers(pdf, body.name, body.value)
        except AnswersError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=filled, media_type="application/pdf")

    return app


app = create_app()
