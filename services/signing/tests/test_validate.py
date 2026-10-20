from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from cryptography.hazmat.primitives import serialization
from fastapi.testclient import TestClient
from pyhanko_certvalidator import ValidationContext

from pidash_signing import validate
from pidash_signing.app import create_app
from pidash_signing.validate import ValidationSettings, load_trust_roots, validate_pdf

from .conftest import Pki, blank_pdf, sign
from .test_remote_sign import b64


def settings_with(pki: Pki) -> ValidationSettings:
    return ValidationSettings(trust_roots=[pki.ca_asn1])


def with_crl(monkeypatch: pytest.MonkeyPatch, crl: bytes, historical: bool = True) -> None:
    """Every validation context holds `crl`, or with `historical` off only
    those checking at the present."""

    def context(**kwargs: Any) -> ValidationContext:
        if historical or kwargs.get("moment") is None:
            kwargs["crls"] = [*(kwargs.get("crls") or []), crl]
        return ValidationContext(**kwargs)

    monkeypatch.setattr(validate, "ValidationContext", context)


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


def test_a_revoked_signature_stays_trusted_only_with_a_timestamp_before_it(
    pki: Pki, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = datetime.now(UTC)
    plain = sign(blank_pdf(), pki)
    stamped = sign(blank_pdf(), pki, timestamper=pki.timestamper(now - timedelta(hours=2)))

    def revoked_at(at: datetime) -> None:
        with_crl(monkeypatch, pki.crl_revoking_signer(at))

    revoked_at(now - timedelta(hours=1))
    [untimed] = validate_pdf(plain, settings_with(pki))["signatures"]
    assert untimed["intact"] is True
    assert untimed["trusted"] is False
    # The timestamp proves the signature was made before the revocation.
    [older] = validate_pdf(stamped, settings_with(pki))["signatures"]
    assert older["timestamped"] is True
    assert older["trusted"] is True

    revoked_at(now - timedelta(hours=3))
    [after] = validate_pdf(stamped, settings_with(pki))["signatures"]
    assert "error" not in after
    assert after["trusted"] is False


def test_a_revocation_found_now_counts_when_checking_at_the_timestamp(
    pki: Pki, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = datetime.now(UTC)
    stamped = sign(blank_pdf(), pki, timestamper=pki.timestamper(now - timedelta(hours=2)))
    # Only the check at the present finds the CRL; the fetch at the
    # timestamp's time fails.
    with_crl(monkeypatch, pki.crl_revoking_signer(now - timedelta(hours=3)), historical=False)
    [signature] = validate_pdf(stamped, settings_with(pki))["signatures"]
    assert signature["timestamped"] is True
    assert signature["trusted"] is False


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


def test_prepare_adds_empty_fields_that_signers_fill(pki: Pki) -> None:
    import base64

    from pidash_signing.prepare import FieldRequest, prepare_fields

    prepared = prepare_fields(
        blank_pdf(),
        [
            FieldRequest(name="Trustee_a", page=-1, box=(300, 600, 547, 672)),
            FieldRequest(name="Trustee_b", page=-1, box=(300, 470, 547, 542)),
        ],
    )
    assert prepared.startswith(blank_pdf()[:8])
    # An unsigned prepared PDF has fields but no signatures yet.
    assert validate_pdf(prepared, settings_with(pki))["status"] == "no_signatures"
    # Each trustee signs their own field, one incremental update at a time.
    first = sign(prepared, pki, "Trustee_a")
    assert first.startswith(prepared)
    second = sign(first, pki, "Trustee_b")
    assert second.startswith(first)
    report = validate_pdf(second, settings_with(pki))
    assert report["status"] == "valid"
    assert [s["fieldName"] for s in report["signatures"]] == ["Trustee_a", "Trustee_b"]

    client = TestClient(create_app(settings_with(pki), token="secret"))
    response = client.post(
        "/prepare",
        json={
            "fields": [{"box": [300, 600, 547, 672], "name": "Trustee_a", "page": -1}],
            "pdf": base64.b64encode(blank_pdf()).decode(),
        },
        headers={"Authorization": "Bearer secret"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    bad = client.post(
        "/prepare",
        json={
            "fields": [{"box": [0, 0, 10, 10], "name": "x", "page": 9}],
            "pdf": base64.b64encode(blank_pdf()).decode(),
        },
        headers={"Authorization": "Bearer secret"},
    )
    assert bad.status_code == 422


def test_a_system_root_or_unknown_ca_is_not_a_configured_root(pki: Pki) -> None:
    other = Pki()
    report = validate_pdf(sign(blank_pdf(), other), settings_with(pki))
    assert report["signatures"][0]["trusted"] is False


def test_certificate_check_needs_a_configured_root(pki: Pki) -> None:
    client = TestClient(create_app(settings_with(pki), token="secret"))
    auth = {"Authorization": "Bearer secret"}
    other = Pki()

    def check(owner: Pki) -> bool:
        der = owner.signer_cert.public_bytes(serialization.Encoding.DER)
        ca = owner.ca.public_bytes(serialization.Encoding.DER)
        response = client.post(
            "/certificate",
            headers=auth,
            json={"certificate": b64(der), "chain": [b64(ca)]},
        )
        assert response.status_code == 200
        return response.json()["trusted"]

    assert check(pki) is True
    assert check(other) is False
    # Chains to the root, but may only encrypt, so it can't sign for us.
    encryption = client.post(
        "/certificate",
        headers=auth,
        json={
            "certificate": b64(pki.encryption_cert().public_bytes(serialization.Encoding.DER)),
            "chain": [b64(pki.ca.public_bytes(serialization.Encoding.DER))],
        },
    )
    assert encryption.json()["trusted"] is False
    assert (
        client.post("/certificate", headers=auth, json={"certificate": "nope"}).status_code
        == 400
    )


# ── Income Tax Department signatures ────────────────────────────────────────


def _digest_info_block(key_size: int, digest_info: bytes) -> bytes:
    return b"\x00\x01" + b"\xff" * (key_size - 3 - len(digest_info)) + b"\x00" + digest_info


def _raw_rsa_sign(pki: Pki, block: bytes) -> bytes:
    """Signs a padded PKCS#1 block as is, as a signer that builds its own DigestInfo would."""
    numbers = pki.signer_key.private_numbers()
    n = numbers.public_numbers.n
    size = (n.bit_length() + 7) // 8
    return pow(int.from_bytes(block, "big"), numbers.d, n).to_bytes(size, "big")


def _without_null(digest: bytes) -> bytes:
    body = bytes.fromhex("300b0609608648016503040201") + bytes([0x04, len(digest)]) + digest
    return bytes([0x30, len(body)]) + body


def _check(pki: Pki, signature: bytes, data: bytes) -> None:
    from asn1crypto import algos, keys

    spki = keys.PublicKeyInfo.load(
        pki.signer_key.public_key().public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    )
    validate.SIGNATURE_VALIDATOR.validate_signature(
        signature,
        data,
        spki,
        algos.SignedDigestAlgorithm({"algorithm": "sha256_rsa"}),
    )


def test_accepts_a_digest_info_without_null_parameters(pki: Pki) -> None:
    import hashlib

    data = b"signed attributes"
    size = pki.signer_key.key_size // 8
    signature = _raw_rsa_sign(pki, _digest_info_block(size, _without_null(hashlib.sha256(data).digest())))
    _check(pki, signature, data)


def test_still_refuses_other_digest_info_encodings(pki: Pki) -> None:
    import hashlib

    from cryptography.exceptions import InvalidSignature

    data = b"signed attributes"
    size = pki.signer_key.key_size // 8
    digest = hashlib.sha256(data).digest()
    variants = {
        # The right encoding over different data.
        "other data": _without_null(hashlib.sha256(b"other").digest()),
        # Trailing bytes after the digest.
        "trailing bytes": _without_null(digest) + b"\x00",
        # SHA-1's identifier with a SHA-256 signature algorithm.
        "wrong hash": bytes.fromhex("3021300906052b0e03021a0414") + hashlib.sha1(data).digest(),
    }
    for name, digest_info in variants.items():
        signature = _raw_rsa_sign(pki, _digest_info_block(size, digest_info))
        with pytest.raises(InvalidSignature):
            _check(pki, signature, data)
        assert name


def test_intermediates_complete_a_chain_the_pdf_leaves_out(tmp_path: Path) -> None:
    from asn1crypto import keys
    from cryptography.hazmat.primitives.asymmetric import rsa
    from pyhanko.sign import signers
    from pyhanko_certvalidator.registry import SimpleCertificateStore

    from .conftest import _asn1, _cert, _name

    root_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    root = _cert(_name("Test CCA Root"), _name("Test CCA Root"), root_key.public_key(), root_key, ca=True)
    sub_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    sub = _cert(_name("Test Sub CA"), _name("Test CCA Root"), sub_key.public_key(), root_key, ca=True)
    leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    leaf = _cert(_name("PRAVEEN KARANTH"), _name("Test Sub CA"), leaf_key.public_key(), sub_key, ca=False)
    signer = signers.SimpleSigner(
        signing_cert=_asn1(leaf),
        signing_key=keys.PrivateKeyInfo.load(
            leaf_key.private_bytes(
                serialization.Encoding.DER,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        ),
        # The PDF carries no chain, as the department's don't.
        cert_registry=SimpleCertificateStore.from_certs([]),
    )
    import io

    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

    signed = signers.sign_pdf(
        IncrementalPdfFileWriter(io.BytesIO(blank_pdf())),
        signers.PdfSignatureMetadata(field_name="Signature1"),
        signer=signer,
    ).getvalue()

    without = validate_pdf(signed, ValidationSettings(trust_roots=[_asn1(root)]))
    assert without["signatures"][0]["intact"] is True
    assert without["signatures"][0]["trusted"] is False

    (tmp_path / "sub.pem").write_bytes(sub.public_bytes(serialization.Encoding.PEM))
    with_sub = validate_pdf(
        signed,
        ValidationSettings(trust_roots=[_asn1(root)], intermediates=load_trust_roots(tmp_path)),
    )
    assert with_sub["signatures"][0]["trusted"] is True

    # An intermediate is never a trust anchor on its own.
    only_sub = validate_pdf(
        signed, ValidationSettings(trust_roots=[], intermediates=load_trust_roots(tmp_path))
    )
    assert only_sub["signatures"][0]["trusted"] is False


def test_shipped_intermediates_chain_to_the_shipped_root() -> None:
    from cryptography import x509 as cx509

    here = Path(__file__).resolve().parent.parent

    def load(path: Path) -> cx509.Certificate:
        data = path.read_bytes()
        if data.startswith(b"-----BEGIN"):
            return cx509.load_pem_x509_certificate(data)
        return cx509.load_der_x509_certificate(data)

    root = load(here / "roots" / "cca-india-2022.cer")
    ca = load(here / "intermediates" / "emudhra-ca-2022.crt")
    sub = load(here / "intermediates" / "emudhra-sub-ca-class-3-organisation-2022.crt")
    ca.verify_directly_issued_by(root)
    sub.verify_directly_issued_by(ca)
