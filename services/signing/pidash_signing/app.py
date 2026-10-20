"""HTTP API. Internal only: the web app reaches it over the private network
and every request but /health carries the shared bearer token."""

from __future__ import annotations

import hmac
import os
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from .validate import ValidationSettings, load_trust_roots, validate_pdf_async

MAX_PDF_BYTES = 25 * 1024 * 1024
DEFAULT_ROOTS = Path(__file__).resolve().parent.parent / "roots"


def _settings() -> ValidationSettings:
    roots_dir = os.environ.get("SIGNING_TRUST_ROOTS_DIR")
    return ValidationSettings(
        trust_roots=load_trust_roots(Path(roots_dir) if roots_dir else DEFAULT_ROOTS),
        allow_fetching=os.environ.get("SIGNING_ALLOW_FETCHING") == "true",
    )


def create_app(settings: ValidationSettings | None = None, token: str | None = None) -> FastAPI:
    app = FastAPI(title="pi-dash signing", docs_url=None, redoc_url=None)
    resolved = settings or _settings()
    expected = token if token is not None else os.environ.get("SIGNING_SERVICE_TOKEN", "")

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

    return app


app = create_app()
