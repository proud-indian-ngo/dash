from __future__ import annotations

import asyncio
import base64
import os

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from pyhanko.sign import timestamps

from pidash_signing.prepare import FieldRequest, prepare_fields
from pidash_signing.remote_sign import RemoteSignError, finalize, finish, start
from pidash_signing.validate import ValidationSettings, validate_pdf

from .conftest import Pki, blank_pdf


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def prepared() -> bytes:
    return prepare_fields(
        blank_pdf(),
        [
            FieldRequest(name="Trustee_a", page=-1, box=(300, 600, 547, 672)),
            FieldRequest(name="Trustee_b", page=-1, box=(300, 470, 547, 542)),
        ],
    )


def token_sign(pki: Pki, data: bytes) -> bytes:
    """What the helper does on the token: RSA PKCS#1 v1.5 over SHA-256."""
    return pki.signer_key.sign(data, padding.PKCS1v15(), hashes.SHA256())


def cert_b64(pki: Pki) -> str:
    return b64(pki.signer_cert.public_bytes(serialization.Encoding.DER))


def ca_b64(pki: Pki) -> str:
    return b64(pki.ca.public_bytes(serialization.Encoding.DER))


def test_deferred_signing_produces_a_valid_signature_in_the_field(pki: Pki) -> None:
    pdf = prepared()
    started = asyncio.run(start(pdf, "Trustee_a", cert_b64(pki), [ca_b64(pki)]))
    signed = asyncio.run(finish(started.state, token_sign(pki, started.to_sign), None))
    assert signed.startswith(pdf)
    report = validate_pdf(signed, ValidationSettings(trust_roots=[pki.ca_asn1]))
    assert report["status"] == "valid"
    [sig] = report["signatures"]
    assert sig["fieldName"] == "Trustee_a"
    assert sig["signerName"] == "SARJUN H HAJATHULLA"
    assert sig["trusted"] is True


def test_two_trustees_sign_in_turn(pki: Pki) -> None:
    first_start = asyncio.run(start(prepared(), "Trustee_a", cert_b64(pki), [ca_b64(pki)]))
    first = asyncio.run(finish(first_start.state, token_sign(pki, first_start.to_sign), None))
    second_start = asyncio.run(start(first, "Trustee_b", cert_b64(pki), [ca_b64(pki)]))
    second = asyncio.run(
        finish(second_start.state, token_sign(pki, second_start.to_sign), None)
    )
    report = validate_pdf(second, ValidationSettings(trust_roots=[pki.ca_asn1]))
    assert report["status"] == "valid"
    assert [s["fieldName"] for s in report["signatures"]] == ["Trustee_a", "Trustee_b"]


def test_a_wrong_signature_is_refused(pki: Pki) -> None:
    started = asyncio.run(start(prepared(), "Trustee_a", cert_b64(pki), [ca_b64(pki)]))
    with pytest.raises(RemoteSignError, match="doesn't match the certificate"):
        asyncio.run(finish(started.state, token_sign(pki, b"something else"), None))


def test_a_missing_or_filled_field_is_refused(pki: Pki) -> None:
    with pytest.raises(RemoteSignError, match="no empty field"):
        asyncio.run(start(prepared(), "Nobody", cert_b64(pki), [ca_b64(pki)]))


@pytest.mark.skipif(
    os.environ.get("SIGNING_NETWORK_TESTS") != "1",
    reason="needs the DigiCert TSA; set SIGNING_NETWORK_TESTS=1",
)
def test_timestamped_signature_and_long_term_finalisation(pki: Pki) -> None:
    tsa = timestamps.HTTPTimeStamper("http://timestamp.digicert.com")
    started = asyncio.run(start(prepared(), "Trustee_a", cert_b64(pki), [ca_b64(pki)]))
    signed = asyncio.run(finish(started.state, token_sign(pki, started.to_sign), tsa))
    settings = ValidationSettings(trust_roots=[pki.ca_asn1])
    assert validate_pdf(signed, settings)["signatures"][0]["timestamped"] is True
    final = asyncio.run(finalize(signed, tsa, settings.context()))
    assert final.startswith(signed)
    assert validate_pdf(final, settings)["status"] == "valid"


def test_api_signs_in_two_steps(pki: Pki) -> None:
    from fastapi.testclient import TestClient

    from pidash_signing.app import create_app

    client = TestClient(
        create_app(ValidationSettings(trust_roots=[pki.ca_asn1]), token="secret", tsa_url="none")
    )
    auth = {"Authorization": "Bearer secret"}
    started = client.post(
        "/sign/start",
        headers=auth,
        json={
            "certificate": cert_b64(pki),
            "chain": [ca_b64(pki)],
            "fieldName": "Trustee_b",
            "pdf": b64(prepared()),
        },
    )
    assert started.status_code == 200
    body = started.json()
    signature = token_sign(pki, base64.b64decode(body["toSign"]))
    finished = client.post(
        "/sign/finish",
        headers=auth,
        json={"signature": b64(signature), "state": body["state"]},
    )
    assert finished.status_code == 200
    report = validate_pdf(finished.content, ValidationSettings(trust_roots=[pki.ca_asn1]))
    assert report["status"] == "valid"
    bad = client.post(
        "/sign/finish",
        headers=auth,
        json={"signature": b64(b"x" * 256), "state": body["state"]},
    )
    assert bad.status_code == 422
    assert client.post("/finalize", headers=auth, content=b"%PDF").status_code == 503
