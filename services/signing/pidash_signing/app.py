"""HTTP API. Internal only: the web app reaches it over the private network
and every request but /health carries the shared bearer token."""

from __future__ import annotations

import base64
import binascii
import hmac
import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

from pyhanko.sign import timestamps

from . import remote_sign
from .prepare import FieldRequest, PrepareError, prepare_fields
from .validate import ValidationSettings, load_trust_roots, validate_pdf_async

MAX_PDF_BYTES = 25 * 1024 * 1024
DEFAULT_ROOTS = Path(__file__).resolve().parent.parent / "roots"


class PrepareField(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    page: int
    box: tuple[float, float, float, float]


class SignStartRequest(BaseModel):
    pdf: str = Field(description="The latest PDF, base64")
    fieldName: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_]+$")
    certificate: str = Field(description="The signer's certificate, DER in base64")
    chain: list[str] = Field(default_factory=list, max_length=8)


class SignFinishRequest(BaseModel):
    state: str = Field(max_length=60 * 1024 * 1024)
    signature: str = Field(description="The token's signature value, base64")


class PrepareRequest(BaseModel):
    pdf: str = Field(description="The PDF, base64")
    fields: list[PrepareField]


def _settings() -> ValidationSettings:
    roots_dir = os.environ.get("SIGNING_TRUST_ROOTS_DIR")
    return ValidationSettings(
        trust_roots=load_trust_roots(Path(roots_dir) if roots_dir else DEFAULT_ROOTS),
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
    app = FastAPI(title="pi-dash signing", docs_url=None, redoc_url=None)
    resolved = settings or _settings()
    expected = token if token is not None else os.environ.get("SIGNING_SERVICE_TOKEN", "")
    tsa = _timestamper(
        tsa_url
        if tsa_url is not None
        else os.environ.get("SIGNING_TSA_URL", "http://timestamp.digicert.com")
    )

    def require_token(authorization: str | None = Header(default=None)) -> None:
        if not expected:
            raise HTTPException(503, "SIGNING_SERVICE_TOKEN is not set")
        supplied = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise HTTPException(401, "Unauthorized")

    @app.get("/health")
    def health() -> dict[str, object]:
        return {"ok": True, "trustRoots": len(resolved.trust_roots)}

    @app.post("/validate", dependencies=[Depends(require_token)])
    async def validate(request: Request) -> dict[str, object]:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_PDF_BYTES:
                raise HTTPException(413, "PDF too large")
        if not body:
            raise HTTPException(400, "Empty body")
        return await validate_pdf_async(bytes(body), resolved)

    def _b64(value: str, what: str) -> bytes:
        try:
            return base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(400, f"{what} is not base64") from error

    @app.post("/sign/start", dependencies=[Depends(require_token)])
    async def sign_start(body: SignStartRequest) -> dict[str, str]:
        pdf = _b64(body.pdf, "pdf")
        if len(pdf) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF too large")
        try:
            result = await remote_sign.start(
                pdf, body.fieldName, body.certificate, body.chain
            )
        except remote_sign.RemoteSignError as error:
            raise HTTPException(422, str(error)) from error
        return {
            "state": result.state,
            "toSign": base64.b64encode(result.to_sign).decode(),
        }

    @app.post("/sign/finish", dependencies=[Depends(require_token)])
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

    @app.post("/finalize", dependencies=[Depends(require_token)])
    async def finalize(request: Request) -> Response:
        if tsa is None:
            raise HTTPException(503, "No timestamp authority is configured")
        pdf = await _read_pdf(request)
        try:
            out = await remote_sign.finalize(pdf, tsa, resolved.context())
        except Exception as error:  # noqa: BLE001 - reported, the PDF stays as it was
            raise HTTPException(422, f"Couldn't finalise: {type(error).__name__}") from error
        return Response(content=out, media_type="application/pdf")

    @app.post("/retimestamp", dependencies=[Depends(require_token)])
    async def retimestamp(request: Request) -> Response:
        if tsa is None:
            raise HTTPException(503, "No timestamp authority is configured")
        pdf = await _read_pdf(request)
        try:
            out = await remote_sign.retimestamp(pdf, tsa, resolved.context())
        except Exception as error:  # noqa: BLE001
            raise HTTPException(422, f"Couldn't timestamp: {type(error).__name__}") from error
        return Response(content=out, media_type="application/pdf")

    @app.post("/prepare", dependencies=[Depends(require_token)])
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
                    FieldRequest(name=f.name, page=f.page, box=tuple(int(round(v)) for v in f.box))  # type: ignore[arg-type]
                    for f in body.fields
                ],
            )
        except PrepareError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=prepared, media_type="application/pdf")

    return app


app = create_app()
