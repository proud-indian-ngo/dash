"""A throwaway CA and DSC-like signer certificates for one E2E run.

Runs inside the signing service image (which has `cryptography`), writing
to the directory given: `roots/test-ca.pem`, which the E2E signing service
trusts instead of the CCA roots, and `signers/<name>.json` with each
signer's certificate (DER, base64) and private key (PEM), which the specs
use to play the DSC helper. The names are the seeded trustees'.
"""

from __future__ import annotations

import base64
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

SIGNERS = {"asha-rao": "Asha Rao", "vikram-menon": "Vikram Menon"}


def name(common_name: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ]
    )


def usage(*, ca: bool) -> x509.KeyUsage:
    return x509.KeyUsage(
        digital_signature=not ca,
        content_commitment=not ca,
        key_encipherment=False,
        data_encipherment=False,
        key_agreement=False,
        key_cert_sign=ca,
        crl_sign=ca,
        encipher_only=False,
        decipher_only=False,
    )


def certificate(subject, issuer, public_key, signing_key, *, ca: bool):
    now = datetime.now(UTC)
    return (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(usage(ca=ca), critical=True)
        .sign(signing_key, hashes.SHA256())
    )


def main(out: Path) -> None:
    (out / "roots").mkdir(parents=True, exist_ok=True)
    (out / "signers").mkdir(parents=True, exist_ok=True)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_name = name("E2E Test CCA Root")
    ca = certificate(ca_name, ca_name, ca_key.public_key(), ca_key, ca=True)
    (out / "roots" / "test-ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    for slug, common_name in SIGNERS.items():
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cert = certificate(name(common_name), ca_name, key.public_key(), ca_key, ca=False)
        (out / "signers" / f"{slug}.json").write_text(
            json.dumps(
                {
                    "certificate": base64.b64encode(
                        cert.public_bytes(serialization.Encoding.DER)
                    ).decode(),
                    "privateKey": key.private_bytes(
                        serialization.Encoding.PEM,
                        serialization.PrivateFormat.PKCS8,
                        serialization.NoEncryption(),
                    ).decode(),
                }
            )
        )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
