"""Signing with a key the service never sees (PAdES, deferred signing).

1. `start`: given the circular's latest PDF, the trustee's field and their
   certificate, reserve the signature in the field and return the CMS
   signed attributes the token must sign, plus an opaque state.
2. The trustee's helper signs those bytes on their HYP2003 token
   (RSA PKCS#1 v1.5 with SHA-256, CKM_SHA256_RSA_PKCS).
3. `finish`: given the state and the signature value, build the CMS with a
   signature timestamp from the TSA (PAdES B-T) and write it into the PDF.

`finalize` makes a passed resolution's PDF long-term verifiable (PAdES
B-LTA): revocation data for every signature and a document timestamp.
`retimestamp` adds another document timestamp before the last one's
certificate expires.
"""

from __future__ import annotations

import base64
import io
import json
from dataclasses import dataclass

from asn1crypto import cms, x509
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers, timestamps
from pyhanko.sign.signers.pdf_byterange import PreparedByteRangeDigest
from pyhanko.sign.signers.pdf_signer import PdfTBSDocument
from pyhanko.sign.validation import async_add_validation_info
from pyhanko_certvalidator import ValidationContext
from pyhanko_certvalidator.registry import SimpleCertificateStore

from .appearance import SignedByStampStyle

#: Room for the CMS: the signature, the certificate chain and the TSA token.
#: An Indian DSC chain with a TSA token already needs about 13 KB.
BYTES_RESERVED = 65_536
MD = "sha256"


class RemoteSignError(ValueError):
    pass


def _load_cert(der_b64: str) -> x509.Certificate:
    try:
        return x509.Certificate.load(base64.b64decode(der_b64, validate=True))
    except Exception as error:  # noqa: BLE001
        raise RemoteSignError("Certificate is not DER in base64") from error


@dataclass(frozen=True)
class StartResult:
    #: DER of the signed attributes; the token signs exactly these bytes.
    to_sign: bytes
    #: Opaque; hand back unchanged to `finish`.
    state: str


async def start(
    pdf: bytes,
    field_name: str,
    certificate_b64: str,
    chain_b64: list[str],
) -> StartResult:
    """Reserves the signature in `field_name` and returns what the token signs."""
    cert = _load_cert(certificate_b64)
    chain = [_load_cert(c) for c in chain_b64]
    reader = PdfFileReader(io.BytesIO(pdf))
    names = [f[0] for f in fields.enumerate_sig_fields(reader, filled_status=False)]
    if field_name not in names:
        raise RemoteSignError(f"The PDF has no empty field {field_name}")
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    ext = signers.ExternalSigner(
        signing_cert=cert,
        cert_registry=SimpleCertificateStore.from_certs(chain),
        # A placeholder of the right size; the real value comes in `finish`.
        signature_value=bytes(cert.public_key.byte_size),
    )
    pdf_signer = signers.PdfSigner(
        signers.PdfSignatureMetadata(
            field_name=field_name,
            md_algorithm=MD,
            subfilter=fields.SigSeedSubFilter.PADES,
        ),
        signer=ext,
        stamp_style=SignedByStampStyle(),
    )
    prep, _tbs, output = await pdf_signer.async_digest_doc_for_signing(
        writer, existing_fields_only=True, bytes_reserved=BYTES_RESERVED
    )
    signed_attrs = await ext.signed_attrs(prep.document_digest, MD, use_pades=True)
    output.seek(0)
    state = {
        "certificate": certificate_b64,
        "chain": chain_b64,
        "digest": base64.b64encode(prep.document_digest).decode(),
        "output": base64.b64encode(output.read()).decode(),
        "reservedEnd": prep.reserved_region_end,
        "reservedStart": prep.reserved_region_start,
        "signedAttrs": base64.b64encode(signed_attrs.dump()).decode(),
    }
    return StartResult(to_sign=signed_attrs.dump(), state=json.dumps(state))


async def finish(
    state_json: str,
    signature_value: bytes,
    timestamper: timestamps.TimeStamper | None,
) -> bytes:
    """Builds the CMS around the token's signature and writes it into the PDF."""
    try:
        state = json.loads(state_json)
        cert = _load_cert(state["certificate"])
        chain = [_load_cert(c) for c in state["chain"]]
        signed_attrs = cms.CMSAttributes.load(base64.b64decode(state["signedAttrs"]))
        output = io.BytesIO(base64.b64decode(state["output"]))
        prep = PreparedByteRangeDigest(
            document_digest=base64.b64decode(state["digest"]),
            reserved_region_start=int(state["reservedStart"]),
            reserved_region_end=int(state["reservedEnd"]),
        )
    except (KeyError, ValueError, TypeError) as error:
        raise RemoteSignError("The signing state is damaged") from error
    _verify_signature(cert, signed_attrs.dump(), signature_value)
    ext = signers.ExternalSigner(
        signing_cert=cert,
        cert_registry=SimpleCertificateStore.from_certs(chain),
        signature_value=signature_value,
    )
    signature_cms = await ext.async_sign_prescribed_attributes(
        MD, signed_attrs=signed_attrs, timestamper=timestamper
    )
    await PdfTBSDocument.async_finish_signing(
        output, prepared_digest=prep, signature_cms=signature_cms
    )
    return output.getvalue()


def _verify_signature(cert: x509.Certificate, data: bytes, signature: bytes) -> None:
    """Refuses a signature that isn't the certificate's over the signed attributes."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives.serialization import load_der_public_key

    public_key = load_der_public_key(cert.public_key.dump())
    if not isinstance(public_key, rsa.RSAPublicKey):
        raise RemoteSignError("Only RSA DSC certificates are supported")
    try:
        public_key.verify(signature, data, padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature as error:
        raise RemoteSignError(
            "The signature doesn't match the certificate: was the right token used?"
        ) from error


async def finalize(
    pdf: bytes,
    timestamper: timestamps.TimeStamper,
    validation_context: ValidationContext,
) -> bytes:
    """Adds revocation data for every signature and a document timestamp (B-LTA)."""
    buf = io.BytesIO(pdf)
    count = len(PdfFileReader(io.BytesIO(pdf)).embedded_signatures)
    for index in range(count):
        reader = PdfFileReader(buf)
        sig = reader.embedded_signatures[index]
        out = io.BytesIO()
        await async_add_validation_info(sig, validation_context, output=out)
        buf = io.BytesIO(out.getvalue())
    writer = IncrementalPdfFileWriter(buf)
    out = io.BytesIO()
    await signers.PdfTimeStamper(timestamper).async_timestamp_pdf(
        writer,
        md_algorithm=MD,
        validation_context=validation_context,
        output=out,
    )
    return out.getvalue()


async def retimestamp(
    pdf: bytes,
    timestamper: timestamps.TimeStamper,
    validation_context: ValidationContext,
) -> bytes:
    """Adds revocation data for the last timestamp and a new document timestamp."""
    reader = PdfFileReader(io.BytesIO(pdf))
    out = io.BytesIO()
    await signers.PdfTimeStamper(timestamper).async_update_archival_timestamp_chain(
        reader, validation_context, output=out
    )
    return out.getvalue()
