from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from pidash_signing.app import create_app
from pidash_signing.validate import ValidationSettings, load_trust_roots, validate_pdf

from .conftest import Pki, blank_pdf, sign


def settings_with(pki: Pki) -> ValidationSettings:
    return ValidationSettings(trust_roots=[pki.ca_asn1])


def test_unsigned_pdf_has_no_signatures(pki: Pki) -> None:
    report = validate_pdf(blank_pdf(), settings_with(pki))
    assert report["status"] == "no_signatures"
    assert report["signatures"] == []


def test_signed_pdf_is_valid_and_trusted(pki: Pki) -> None:
    report = validate_pdf(sign(blank_pdf(), pki), settings_with(pki))
    assert report["status"] == "valid"
    [signature] = report["signatures"]
    assert signature["signerName"] == "SARJUN H HAJATHULLA"
    assert signature["intact"] is True
    assert signature["trusted"] is True
    assert signature["coversWholeRevision"] is True
    assert len(signature["sha256Fingerprint"]) == 64
    assert signature["fieldName"] == "Signature1"


def test_unknown_root_is_valid_but_untrusted(pki: Pki) -> None:
    report = validate_pdf(sign(blank_pdf(), pki), ValidationSettings(trust_roots=[]))
    assert report["status"] == "valid"
    assert report["signatures"][0]["trusted"] is False


def test_two_signatures_in_sequence(pki: Pki) -> None:
    twice = sign(sign(blank_pdf(), pki, "Trustee1"), pki, "Trustee2")
    report = validate_pdf(twice, settings_with(pki))
    assert report["status"] == "valid"
    assert [s["fieldName"] for s in report["signatures"]] == ["Trustee1", "Trustee2"]


def test_tampered_bytes_are_invalid(pki: Pki) -> None:
    signed = bytearray(sign(blank_pdf(), pki))
    # Flip a byte inside the signed page dictionary.
    index = signed.index(b"/MediaBox")
    signed[index + 1] = ord("N")
    report = validate_pdf(bytes(signed), settings_with(pki))
    assert report["status"] == "invalid"


def test_garbage_is_reported_not_raised(pki: Pki) -> None:
    report = validate_pdf(b"not a pdf", settings_with(pki))
    assert report["status"] == "invalid"
    assert "message" in report


def test_trust_roots_load_from_a_directory(pki: Pki, tmp_path: Path) -> None:
    pki.write_ca(tmp_path)
    (tmp_path / "notes.txt").write_text("ignored")
    (tmp_path / "broken.pem").write_text("-----BEGIN CERTIFICATE-----\nnope\n")
    roots = load_trust_roots(tmp_path)
    assert len(roots) == 1


def test_api_requires_the_token(pki: Pki) -> None:
    client = TestClient(create_app(settings_with(pki), token="secret"))
    assert client.get("/health").json()["ok"] is True
    assert client.post("/validate", content=blank_pdf()).status_code == 401
    response = client.post(
        "/validate",
        content=sign(blank_pdf(), pki),
        headers={"Authorization": "Bearer secret", "Content-Type": "application/pdf"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "valid"


def test_api_refuses_without_a_configured_token(pki: Pki) -> None:
    client = TestClient(create_app(settings_with(pki), token=""))
    response = client.post(
        "/validate", content=blank_pdf(), headers={"Authorization": "Bearer "}
    )
    assert response.status_code == 503
