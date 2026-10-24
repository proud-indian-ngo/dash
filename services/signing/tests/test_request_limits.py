"""Exercise the ASGI boundary without letting a client pre-buffer the body."""

import asyncio

import pytest

from pidash_signing import app as signing_app
from pidash_signing.validate import ValidationSettings

PATHS = [
    "/certificate", "/prepare", "/fill", "/sign/start", "/sign/finish",
    "/validate", "/finalize", "/retimestamp",
]


def request(path, chunks, *, authorization=b"Bearer secret", content_length=None, token="secret"):
    reads = []
    messages = []
    headers = [(b"content-type", b"application/json")]
    if authorization is not None:
        headers.append((b"authorization", authorization))
    if content_length is not None:
        headers.append((b"content-length", str(content_length).encode()))

    async def receive():
        index = len(reads)
        reads.append(index)
        assert index < len(chunks), "The service read past the rejected body"
        return {"type": "http.request", "body": chunks[index], "more_body": index < len(chunks) - 1}

    async def send(message):
        messages.append(message)

    app = signing_app.create_app(ValidationSettings(trust_roots=[]), token=token, tsa_url="https://tsa.example")
    asyncio.run(app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "GET" if path == "/health" else "POST", "scheme": "http",
        "path": path, "raw_path": path.encode(), "query_string": b"",
        "headers": headers, "server": ("testserver", 80), "client": ("127.0.0.1", 1),
    }, receive, send))
    return next(m["status"] for m in messages if m["type"] == "http.response.start"), reads


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("authorization", [None, b"Bearer wrong", b"secret"])
def test_unauthenticated_body_is_never_read(path, authorization):
    assert request(path, [], authorization=authorization) == (401, [])


def test_missing_token_is_rejected_without_reading_and_health_stays_public():
    assert request("/certificate", [], token="") == (503, [])
    assert request("/health", [], authorization=None) == (200, [])


@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("declared", [None, 1, 33])
def test_streamed_and_declared_oversized_bodies_are_413(path, declared, monkeypatch):
    monkeypatch.setattr(signing_app, "MAX_JSON_BYTES", 32, raising=False)
    monkeypatch.setattr(signing_app, "MAX_PDF_BYTES", 32)
    status, reads = request(path, [b" " * 16, b" " * 17, b"unread"], content_length=declared)
    assert status == 413
    assert reads == ([] if declared == 33 else [0, 1])


def test_authenticated_json_reaches_validation():
    assert request("/certificate", [b'{"certificate":"invalid"}']) == (400, [0])


def test_normal_pdf_limit_is_preserved():
    assert signing_app.MAX_PDF_BYTES == 25 * 1024 * 1024
    assert request("/validate", [b"%PDF"], content_length=25 * 1024 * 1024 + 1) == (413, [])
