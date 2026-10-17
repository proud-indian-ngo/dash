"""Signature validation for PDFs in the governance vault.

The report carries certificate facts and pyHanko's verdicts only, never the
document's text. The web app matches signers to the trustee register.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from asn1crypto import pem, x509
from pyhanko.pdf_utils.misc import PdfReadError
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import async_validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext

log = logging.getLogger(__name__)

CERT_SUFFIXES = {".pem", ".cer", ".crt", ".der"}


def load_trust_roots(directory: Path | None) -> list[x509.Certificate]:
    """Every certificate in the directory, PEM or DER; unreadable files are logged and skipped."""
    if directory is None or not directory.is_dir():
        return []
    roots: list[x509.Certificate] = []
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() not in CERT_SUFFIXES:
            continue
        data = path.read_bytes()
        try:
            if pem.detect(data):
                for _, _, der in pem.unarmor(data, multiple=True):
                    roots.append(x509.Certificate.load(der))
            else:
                roots.append(x509.Certificate.load(data))
        except Exception:  # noqa: BLE001 - a bad file must not stop the service
            log.warning("trust root unreadable: %s", path.name)
    return roots


@dataclass(frozen=True)
class ValidationSettings:
    trust_roots: list[x509.Certificate]
    allow_fetching: bool = False

    def context(self) -> ValidationContext:
        return ValidationContext(
            trust_roots=self.trust_roots,
            allow_fetching=self.allow_fetching,
            revocation_mode="soft-fail",
        )


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _common_name(name: x509.Name) -> str | None:
    native = name.native
    cn = native.get("common_name")
    if isinstance(cn, list):
        return cn[0] if cn else None
    return cn


def _certificate_facts(cert: x509.Certificate) -> dict[str, Any]:
    validity = cert["tbs_certificate"]["validity"]
    return {
        "issuer": cert.issuer.human_friendly,
        "notAfter": _iso(validity["not_after"].native),
        "notBefore": _iso(validity["not_before"].native),
        "serial": format(cert.serial_number, "X"),
        "sha256Fingerprint": hashlib.sha256(cert.dump()).hexdigest(),
        "signerName": _common_name(cert.subject),
        "subject": cert.subject.human_friendly,
    }


def validate_pdf(data: bytes, settings: ValidationSettings) -> dict[str, Any]:
    """Synchronous form of `validate_pdf_async`, for scripts and tests."""
    return asyncio.run(validate_pdf_async(data, settings))


async def validate_pdf_async(
    data: bytes, settings: ValidationSettings
) -> dict[str, Any]:
    """Validate every signature in a PDF; `status` sums them up."""
    checked_at = datetime.now(UTC).isoformat()
    try:
        reader = PdfFileReader(io.BytesIO(data), strict=False)
        embedded = list(reader.embedded_signatures)
    except (PdfReadError, ValueError, KeyError) as error:
        return {
            "checkedAt": checked_at,
            "message": f"Not a readable PDF: {type(error).__name__}",
            "signatures": [],
            "status": "invalid",
        }

    if not embedded:
        return {"checkedAt": checked_at, "signatures": [], "status": "no_signatures"}

    signatures: list[dict[str, Any]] = []
    all_good = True
    for sig in embedded:
        try:
            status = await async_validate_pdf_signature(
                sig, signer_validation_context=settings.context()
            )
        except Exception as error:  # noqa: BLE001 - report, don't crash
            all_good = False
            signatures.append(
                {
                    "coversWholeRevision": False,
                    "fieldName": sig.field_name,
                    "intact": False,
                    "issuer": "",
                    "matchedTrusteeId": None,
                    "modificationLevel": None,
                    "notAfter": None,
                    "notBefore": None,
                    "serial": "",
                    "sha256Fingerprint": "",
                    "signerName": None,
                    "signingTime": None,
                    "subject": "",
                    "timestamped": False,
                    "trusted": False,
                    "error": type(error).__name__,
                }
            )
            continue
        covers = status.coverage is not None and (
            status.coverage >= SignatureCoverageLevel.ENTIRE_REVISION
        )
        intact = bool(status.intact and status.valid)
        docmdp_ok = status.docmdp_ok is not False
        if not (intact and covers and docmdp_ok):
            all_good = False
        signatures.append(
            {
                **_certificate_facts(status.signing_cert),
                "coversWholeRevision": covers,
                "fieldName": sig.field_name,
                "intact": intact,
                "matchedTrusteeId": None,
                "modificationLevel": (
                    status.modification_level.name
                    if status.modification_level is not None
                    else None
                ),
                "signingTime": _iso(status.signer_reported_dt),
                "timestamped": status.timestamp_validity is not None,
                "trusted": bool(status.trusted),
            }
        )

    return {
        "checkedAt": checked_at,
        "signatures": signatures,
        "status": "valid" if all_good else "invalid",
    }
