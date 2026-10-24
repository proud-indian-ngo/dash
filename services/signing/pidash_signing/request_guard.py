"""Authenticate before FastAPI reads JSON, then cap the actual body stream."""

import hmac

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SigningRequestGuard:
    def __init__(self, app: ASGIApp, token: str, max_json_bytes: int, max_pdf_bytes: int):
        self.app = app
        self.token = token
        self.max_json_bytes = max_json_bytes
        self.max_pdf_bytes = max_pdf_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or (
            scope["method"] == "GET" and scope["path"] == "/health"
        ):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        scheme, _, supplied = headers.get("authorization", "").partition(" ")
        if not self.token:
            await JSONResponse(
                {"detail": "SIGNING_SERVICE_TOKEN is not set"}, status_code=503
            )(scope, receive, send)
            return
        if scheme.lower() != "bearer" or not hmac.compare_digest(
            supplied.strip().encode(), self.token.encode()
        ):
            await JSONResponse({"detail": "Unauthorized"}, status_code=401)(
                scope, receive, send
            )
            return

        limit = (
            self.max_pdf_bytes
            if scope["path"] in {"/validate", "/finalize", "/retimestamp"}
            else self.max_json_bytes
        )
        length = headers.get("content-length")
        if length is not None:
            try:
                declared = int(length)
                if declared < 0:
                    raise ValueError
            except ValueError:
                await JSONResponse(
                    {"detail": "Invalid Content-Length"}, status_code=400
                )(scope, receive, send)
                return
            if declared > limit:
                await JSONResponse({"detail": "Body too large"}, status_code=413)(
                    scope, receive, send
                )
                return

        size = 0

        async def bounded_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > limit:
                    raise HTTPException(413, "Body too large")
            return message

        await self.app(scope, bounded_receive, send)
