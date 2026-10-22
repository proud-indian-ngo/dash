"""Signing with a key the service never sees (PAdES, deferred signing).

1. `start`: given the circular's latest PDF, the trustee's field and their
   certificate, reserve the signature in the field and return the CMS
   signed attributes the token must sign, plus an opaque state.
2. The trustee's helper signs those bytes on their token: RSA PKCS#1 v1.5
   with SHA-256, or ECDSA with SHA-256 (P-256) or SHA-384 (P-384) returned
   as a DER ECDSA-Sig-Value.
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

from asn1crypto import algos, cms, x509
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

#: Digest, signature mechanism and the largest DER ECDSA-Sig-Value per curve.
_EC = {
    "secp256r1": ("sha256", "sha256_ecdsa", 72),
    "secp384r1": ("sha384", "sha384_ecdsa", 104),
}


class RemoteSignError(ValueError):
    pass


class UnsupportedKeyError(RemoteSignError):
    pass


@dataclass(frozen=True)
class Algorithms:
    digest: str
    mechanism: str
    #: Placeholder signature size while the document is prepared.
    signature_size: int


def algorithms(cert: x509.Certificate) -> Algorithms:
    """The digest and signature mechanism the certificate's key signs with."""
    key = cert.public_key
    if key.algorithm == "rsa":
        return Algorithms(MD, "sha256_rsa", key.byte_size)
    if key.algorithm == "ec":
        kind, curve = key.curve
        if kind == "named" and curve in _EC:
            return Algorithms(*_EC[curve])
        raise UnsupportedKeyError(
            "Only P-256 and P-384 elliptic-curve DSC certificates are supported"
        )
    raise UnsupportedKeyError("Only RSA and elliptic-curve DSC certificates are supported")


def load_cert(der_b64: str) -> x509.Certificate:
    try:
        return x509.Certificate.load(base64.b64decode(der_b64, validate=True))
    except Exception as error:  # noqa: BLE001
        raise RemoteSignError("Certificate is not DER in base64") from error


@dataclass(frozen=True)
class StartResult:
    #: DER of the signed attributes; the token signs exactly these bytes.
    to_sign: bytes
    #: The digest the token hashes `to_sign` with.
    digest_algorithm: str
    #: Opaque; hand back unchanged to `finish`.
    state: str


async def start(
    pdf: bytes,
    field_name: str,
    certificate_b64: str,
    chain_b64: list[str],
) -> StartResult:
    """Reserves the signature in `field_name` and returns what the token signs."""
    cert = load_cert(certificate_b64)
    chosen = algorithms(cert)
    chain = [load_cert(c) for c in chain_b64]
    reader = PdfFileReader(io.BytesIO(pdf))
    names = [f[0] for f in fields.enumerate_sig_fields(reader, filled_status=False)]
    if field_name not in names:
        raise RemoteSignError(f"The PDF has no empty field {field_name}")
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    ext = signers.ExternalSigner(
        signing_cert=cert,
        cert_registry=SimpleCertificateStore.from_certs(chain),
        # A placeholder of the right size; the real value comes in `finish`.
        signature_value=bytes(chosen.signature_size),
        signature_mechanism=algos.SignedDigestAlgorithm({"algorithm": chosen.mechanism}),
    )
    pdf_signer = signers.PdfSigner(
        signers.PdfSignatureMetadata(
            field_name=field_name,
            md_algorithm=chosen.digest,
            subfilter=fields.SigSeedSubFilter.PADES,
        ),
        signer=ext,
        stamp_style=SignedByStampStyle(),
    )
    prep, _tbs, output = await pdf_signer.async_digest_doc_for_signing(
        writer, existing_fields_only=True, bytes_reserved=BYTES_RESERVED
    )
    signed_attrs = await ext.signed_attrs(
        prep.document_digest, chosen.digest, use_pades=True
    )
    output.seek(0)
    state = {
        "certificate": certificate_b64,
        "chain": chain_b64,
        "digest": base64.b64encode(prep.document_digest).decode(),
        "digestAlgorithm": chosen.digest,
        "output": base64.b64encode(output.read()).decode(),
        "reservedEnd": prep.reserved_region_end,
        "reservedStart": prep.reserved_region_start,
        "signatureMechanism": chosen.mechanism,
        "signedAttrs": base64.b64encode(signed_attrs.dump()).decode(),
    }
    return StartResult(
        to_sign=signed_attrs.dump(), digest_algorithm=chosen.digest, state=json.dumps(state)
    )


async def finish(
    state_json: str,
    signature_value: bytes,
    timestamper: timestamps.TimeStamper | None,
) -> bytes:
    """Builds the CMS around the token's signature and writes it into the PDF."""
    try:
        state = json.loads(state_json)
        cert = load_cert(state["certificate"])
        chain = [load_cert(c) for c in state["chain"]]
        digest_algorithm = str(state["digestAlgorithm"])
        mechanism = algos.SignedDigestAlgorithm({"algorithm": state["signatureMechanism"]})
        signed_attrs = cms.CMSAttributes.load(base64.b64decode(state["signedAttrs"]))
        output = io.BytesIO(base64.b64decode(state["output"]))
        prep = PreparedByteRangeDigest(
            document_digest=base64.b64decode(state["digest"]),
            reserved_region_start=int(state["reservedStart"]),
            reserved_region_end=int(state["reservedEnd"]),
        )
    except (KeyError, ValueError, TypeError) as error:
        raise RemoteSignError("The signing state is damaged") from error
    _verify_signature(cert, digest_algorithm, signed_attrs.dump(), signature_value)
    ext = signers.ExternalSigner(
        signing_cert=cert,
        cert_registry=SimpleCertificateStore.from_certs(chain),
        signature_value=signature_value,
        signature_mechanism=mechanism,
    )
    signature_cms = await ext.async_sign_prescribed_attributes(
        digest_algorithm, signed_attrs=signed_attrs, timestamper=timestamper
    )
    await PdfTBSDocument.async_finish_signing(
        output, prepared_digest=prep, signature_cms=signature_cms
    )
    return output.getvalue()


def _verify_signature(
    cert: x509.Certificate, digest_algorithm: str, data: bytes, signature: bytes
) -> None:
    """Refuses a signature that isn't the certificate's over the signed attributes."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.hazmat.primitives.serialization import load_der_public_key

    public_key = load_der_public_key(cert.public_key.dump())
    digest = hashes.SHA384() if digest_algorithm == "sha384" else hashes.SHA256()
    try:
        if isinstance(public_key, rsa.RSAPublicKey):
            public_key.verify(signature, data, padding.PKCS1v15(), digest)
        elif isinstance(public_key, ec.EllipticCurvePublicKey):
            try:
                decode_dss_signature(signature)
            except ValueError as error:
                raise RemoteSignError(
                    "The ECDSA signature must be a DER ECDSA-Sig-Value, not raw r||s"
                ) from error
            public_key.verify(signature, data, ec.ECDSA(digest))
        else:
            raise UnsupportedKeyError("Only RSA and elliptic-curve DSC certificates are supported")
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
