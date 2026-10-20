"""Test fixtures: a throwaway CA, a signer certificate and signed PDFs."""

from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from asn1crypto import keys, x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.writer import PdfFileWriter
from pyhanko.sign import signers
from pyhanko_certvalidator.registry import SimpleCertificateStore


def _name(cn: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
            x509.NameAttribute(NameOID.COMMON_NAME, cn),
        ]
    )


def _cert(subject, issuer, public_key, signing_key, *, ca: bool) -> x509.Certificate:
    now = datetime.now(UTC)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    if ca:
        builder = builder.add_extension(
            x509.KeyUsage(
                digital_signature=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    else:
        builder = builder.add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
    return builder.sign(signing_key, hashes.SHA256())


def _asn1(cert: x509.Certificate) -> asn1_x509.Certificate:
    return asn1_x509.Certificate.load(cert.public_bytes(serialization.Encoding.DER))


class Pki:
    def __init__(self) -> None:
        self.ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.ca = _cert(
            _name("Test CCA Root"),
            _name("Test CCA Root"),
            self.ca_key.public_key(),
            self.ca_key,
            ca=True,
        )
        self.signer_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.signer_cert = _cert(
            _name("SARJUN H HAJATHULLA"),
            _name("Test CCA Root"),
            self.signer_key.public_key(),
            self.ca_key,
            ca=False,
        )

    @property
    def ca_asn1(self) -> asn1_x509.Certificate:
        return _asn1(self.ca)

    def signer(self) -> signers.SimpleSigner:
        key_der = self.signer_key.private_bytes(
            serialization.Encoding.DER,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        return signers.SimpleSigner(
            signing_cert=_asn1(self.signer_cert),
            signing_key=keys.PrivateKeyInfo.load(key_der),
            cert_registry=SimpleCertificateStore.from_certs([self.ca_asn1]),
        )

    def write_ca(self, directory: Path) -> Path:
        path = directory / "test-root.pem"
        path.write_bytes(self.ca.public_bytes(serialization.Encoding.PEM))
        return path


def blank_pdf() -> bytes:
    writer = PdfFileWriter()
    page = generic.DictionaryObject(
        {
            generic.NameObject("/Type"): generic.NameObject("/Page"),
            generic.NameObject("/MediaBox"): generic.ArrayObject(
                [generic.NumberObject(n) for n in (0, 0, 595, 842)]
            ),
            generic.NameObject("/Resources"): generic.DictionaryObject(),
        }
    )
    writer.insert_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def sign(pdf: bytes, pki: Pki, field: str = "Signature1") -> bytes:
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    out = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name=field),
        signer=pki.signer(),
    )
    return out.getvalue()


@pytest.fixture(scope="session")
def pki() -> Pki:
    return Pki()
