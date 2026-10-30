"""Checking a PDF signed with Aadhaar eSign through Leegality.

Leegality signs in fields it adds itself, one incremental update per signer,
and gives each new field the object number the revision before used for its
cross-reference stream. The generic check reads that reuse as a change the
earlier signatures don't allow, and refuses any field added since the copy the
signer was given. This check accepts both, and nothing else: the signatures'
trust and integrity are KeySeal's own report.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any

from keyseal_service.validate import (
    DIFF_POLICY as GENERIC_DIFF_POLICY,
    ValidationSettings,
    load_trust_roots,
    validate_pdf_async,
)
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.form_tools import enumerate_fields_in
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import HistoricalResolver, PdfFileReader
from pyhanko.sign import signers, timestamps
from pyhanko.sign.diff_analysis import StandardDiffPolicy, SuspiciousModification
from pyhanko.sign.general import NonexistentAttributeError, find_unique_cms_attribute
from pyhanko.sign.validation import (
    DocumentSecurityStore,
    EmbeddedPdfSignature,
    async_add_validation_info,
    async_validate_pdf_timestamp,
)

#: Protean eGov CA 2022, under CCA India 2022. eSign certificates live about
#: 30 minutes, so a signature is soon checked as of its timestamp, whose
#: chain the PDF doesn't carry.
INTERMEDIATES = load_trust_roots(Path(__file__).parent / "trust")

#: What signing a new field may change, as pyHanko grades it.
SIGNING_LEVELS = {"NONE", "LTA_UPDATES", "FORM_FILLING"}


def _children(obj: generic.PdfObject) -> list[generic.PdfObject]:
    if isinstance(obj, generic.DictionaryObject):
        return [obj.raw_get(key) for key in obj.keys()]
    if isinstance(obj, generic.ArrayObject):
        return [obj.raw_get(index) for index in range(len(obj))]
    return []


def _referenced(resolver: HistoricalResolver, target: generic.Reference) -> bool:
    """Whether anything reachable from the revision's trailer refers to
    `target`."""
    seen: set[generic.Reference] = set()
    stack: list[generic.PdfObject] = [resolver.trailer_view]
    while stack:
        obj = stack.pop()
        if isinstance(obj, generic.IndirectObject):
            ref = obj.reference
            if ref == target:
                return True
            if ref in seen:
                continue
            seen.add(ref)
            obj = resolver(ref)
        stack.extend(_children(obj))
    return False


class _XrefStreamNumberFree(HistoricalResolver):
    """The base of a diff in which `free`, the number the revision before
    the new one used for its cross-reference stream, counts as unassigned.
    Leegality gives that number to the next signature field; it is freed
    only when nothing in that revision refers to it, so taking it changes
    nothing signed."""

    def __init__(self, reader: PdfFileReader, revision: int, free: generic.Reference | None):
        super().__init__(reader, revision)
        self.free = free

    def is_ref_unassignable(self, ref: generic.Reference) -> bool:
        return super().is_ref_unassignable(ref) or ref == self.free


class _DiffPolicy(StandardDiffPolicy):
    def apply(self, old, new, field_mdp_spec=None, doc_mdp=None):  # type: ignore[no-untyped-def]
        previous = new.revision - 1
        free = old.reader.xrefs.get_xref_container_info(previous).stream_ref
        if free is not None and _referenced(
            old.reader.get_historical_resolver(previous), free
        ):
            free = None
        return super().apply(
            _XrefStreamNumberFree(old.reader, old.revision, free),
            new,
            field_mdp_spec,
            doc_mdp,
        )


DIFF_POLICY = _DiffPolicy(
    global_rules=GENERIC_DIFF_POLICY.global_rules, form_rule=GENERIC_DIFF_POLICY.form_rule
)


def _level(reader: PdfFileReader, revision: int, **mdp: Any) -> str:
    result = DIFF_POLICY.review_file(reader, revision, **mdp)
    if isinstance(result, SuspiciousModification):
        return "OTHER"
    return result.modification_level.name


def _signature_fields(reader: PdfFileReader, signed_only: bool = False) -> set[str]:
    try:
        fields = reader.root["/AcroForm"]["/Fields"]
    except KeyError:
        return set()
    return {
        name
        for name, value, _ in enumerate_fields_in(
            fields, refs_seen=set(), target_field_type="/Sig"
        )
        if value is not None or not signed_only
    }


#: Deeper than any field tree; a deeper one counts as unreadable.
MAX_DEPTH = 32


def _field_name(widget: generic.DictionaryObject) -> str:
    """The widget's fully qualified field name, from its /Parent chain."""
    parts: list[str] = []
    node: generic.DictionaryObject | None = widget
    for _ in range(MAX_DEPTH):
        if node is None:
            return ".".join(reversed(parts))
        if "/T" in node:
            parts.append(str(node["/T"]))
        parent = node.get("/Parent")
        node = parent.get_object() if parent is not None else None
    raise ValueError("Field tree too deep")


def _placements(reader: PdfFileReader) -> list[tuple[str, int, tuple[float, ...], str]]:
    """Every widget on a page: its field's name, 0-based page, /Rect and a
    digest of its appearance."""
    found: list[tuple[str, int, tuple[float, ...], str]] = []
    for index in range(int(reader.root["/Pages"]["/Count"])):
        page = reader.find_page_for_modification(index)[0].get_object()
        for ref in page["/Annots"] if "/Annots" in page else ():
            annot = ref.get_object()
            if annot.get("/Subtype") != "/Widget":
                continue
            x1, y1, x2, y2 = (float(v) for v in annot["/Rect"])
            rect = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
            look = repr(
                _canonical(generic.DictionaryObject({
                    k: annot.raw_get(k) for k in annot.keys() if k in LOOK_KEYS
                }))
            )
            found.append(
                (_field_name(annot), index, rect, hashlib.sha256(look.encode()).hexdigest())
            )
    return found


def _changes_since(reader: PdfFileReader, data: bytes, base_length: int) -> str:
    """The most the revisions appended to the first `base_length` bytes
    change. They may add signed signature fields; every widget the base had
    must stay where it was, and no unsigned field may appear."""
    try:
        base = PdfFileReader(io.BytesIO(data[:base_length]), strict=False)
        last = base.xrefs.total_revisions - 1
        if reader.xrefs.get_startxref_for_revision(
            last
        ) != base.xrefs.get_startxref_for_revision(last):
            return "OTHER"
        level = _level(reader, last)
        base_fields = _signature_fields(base)
        added = _signature_fields(reader) - base_fields
        if added - _signature_fields(reader, signed_only=True):
            return "OTHER"
        # Every widget the base had renders as it did, even a signed one.
        before = sorted(_placements(base))
        after = sorted(w for w in _placements(reader) if w[0] not in added)
        # Asked to, a viewer redraws every field from its value.
        redraw = [
            "/AcroForm" in r.root and bool(r.root["/AcroForm"].get("/NeedAppearances", False))
            for r in (base, reader)
        ]
    except Exception:  # noqa: BLE001 - unreadable counts as changed
        return "OTHER"
    if before != after or redraw[0] != redraw[1]:
        return "OTHER"
    return level


class PrepareEsignError(ValueError):
    pass


def prepare_esign(pdf: bytes) -> tuple[bytes, int]:
    """The copy sent to Leegality: `pdf` with an empty form, since pyHanko
    can't review a signature that adds a document's first form, and its
    page count, which Leegality's signature positions need."""
    try:
        reader = PdfFileReader(io.BytesIO(pdf))
        page_count = int(reader.root["/Pages"]["/Count"])
    except Exception as error:  # noqa: BLE001
        raise PrepareEsignError("Not a readable PDF") from error
    if "/AcroForm" in reader.root:
        raise PrepareEsignError("The PDF already has a form")
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    writer.root[generic.NameObject("/AcroForm")] = writer.add_object(
        generic.DictionaryObject({generic.NameObject("/Fields"): generic.ArrayObject()})
    )
    writer.update_root()
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue(), page_count


#: Keys that point back up the tree or only file the object.
SKIPPED_KEYS = {"/Parent", "/P", "/Length", "/Filter", "/DecodeParms"}
#: What decides how a widget renders.
LOOK_KEYS = {"/AP", "/AS", "/F", "/MK", "/DA", "/Rect", "/BS", "/Border"}
#: Page attributes a page takes from its /Pages ancestors when it has none.
INHERITED = ("/Resources", "/MediaBox", "/CropBox", "/Rotate")


def _canonical(obj: generic.PdfObject, depth: int = 0) -> Any:
    """`obj` with references followed and streams decoded, so two files
    that store the same page differently compare equal."""
    if depth > MAX_DEPTH:
        raise ValueError("Too deep")
    if isinstance(obj, generic.IndirectObject):
        return _canonical(obj.get_object(), depth + 1)
    if isinstance(obj, generic.StreamObject):
        return (
            "stream",
            _canonical(generic.DictionaryObject(obj), depth + 1),
            obj.data,
        )
    if isinstance(obj, generic.DictionaryObject):
        return tuple(
            sorted(
                (str(k), _canonical(v, depth + 1))
                for k, v in obj.items()
                if k not in SKIPPED_KEYS
            )
        )
    if isinstance(obj, generic.ArrayObject):
        return tuple(_canonical(v, depth + 1) for v in obj)
    if isinstance(obj, generic.NullObject):
        return ("null",)
    if isinstance(obj, (generic.NumberObject, generic.FloatObject)):
        return ("number", float(obj))
    return (type(obj).__name__, str(obj))


def _page(reader: PdfFileReader, index: int) -> Any:
    """The page as it renders: every key, inherited ones resolved, with its
    content decoded and only whether it has annotations."""
    page = reader.find_page_for_modification(index)[0].get_object()
    keys = {k: page.raw_get(k) for k in page.keys() if k not in {"/Parent", "/Annots", "/Contents"}}
    node = page
    for _ in range(MAX_DEPTH):
        parent = node.get("/Parent")
        if parent is None:
            break
        node = parent.get_object()
        for key in INHERITED:
            if key not in keys and key in node:
                keys[key] = node.raw_get(key)
    contents = page.get("/Contents")
    if isinstance(contents, generic.ArrayObject):
        data = b"\n".join(c.get_object().data for c in contents)
    else:
        data = contents.get_object().data if contents is not None else b""
    return (
        _canonical(generic.DictionaryObject(keys)),
        data,
        "/Annots" in page and len(page["/Annots"]) > 0,
    )


def same_pages(pdf: bytes, other: bytes) -> bool:
    """Whether `other` (Leegality's copy) shows exactly `pdf`'s pages and
    document: every page key (inherited ones too), its content and no
    annotations, and the catalog apart from the form and the page tree.
    Anything unknown counts as different."""
    try:
        a = PdfFileReader(io.BytesIO(pdf), strict=False)
        b = PdfFileReader(io.BytesIO(other), strict=False)
        count = int(a.root["/Pages"]["/Count"])
        if count != int(b.root["/Pages"]["/Count"]):
            return False

        def catalog(r: PdfFileReader) -> Any:
            return _canonical(
                generic.DictionaryObject(
                    {k: r.root.raw_get(k) for k in r.root.keys() if k not in {"/AcroForm", "/Pages"}}
                )
            )

        return catalog(a) == catalog(b) and all(_page(a, i) == _page(b, i) for i in range(count))
    except Exception:  # noqa: BLE001 - unreadable counts as different
        return False


def _esign_settings(settings: ValidationSettings) -> ValidationSettings:
    # Revocation isn't fetched here: an eSign certificate expires within the
    # hour, so the timestamp is what its check rests on.
    return replace(
        settings,
        allow_fetching=False,
        fetcher_backend=None,
        intermediates=[*settings.intermediates, *INTERMEDIATES],
    )


def timestamp_time(sig: EmbeddedPdfSignature) -> datetime:
    """When the signature's timestamp token says it was made. An eSign
    certificate is valid only around then, so a signature without one is
    refused."""
    try:
        token = find_unique_cms_attribute(
            sig.signer_info["unsigned_attrs"], "signature_time_stamp_token"
        )
    except (NonexistentAttributeError, KeyError) as error:
        raise ValueError("An eSign signature has no timestamp") from error
    info = token["content"]["encap_content_info"]["content"].parsed
    return info["gen_time"].native


async def finalize_esign(
    pdf: bytes, timestamper: timestamps.TimeStamper, settings: ValidationSettings
) -> bytes:
    """KeySeal's `/finalize` for an eSign copy: validation data for every
    signature and a document timestamp (B-LTA), read leniently, since the
    strict reader refuses Leegality's reuse of a cross-reference stream's
    number. An eSign certificate expires within the hour, so each
    signature's certificates are gathered as of its timestamp; no revocation
    data is fetched."""
    esign = _esign_settings(settings)
    context = esign.context()
    buf = io.BytesIO(pdf)
    count = len(PdfFileReader(io.BytesIO(pdf), strict=False).embedded_signatures)
    for index in range(count):
        sig = PdfFileReader(buf, strict=False).embedded_signatures[index]
        out = io.BytesIO()
        await async_add_validation_info(
            sig, esign.context(moment=timestamp_time(sig)), output=out
        )
        buf = io.BytesIO(out.getvalue())
    writer = IncrementalPdfFileWriter(buf, strict=False)
    out = io.BytesIO()
    await signers.PdfTimeStamper(timestamper).async_timestamp_pdf(
        writer, md_algorithm="sha256", validation_context=context, output=out
    )
    return out.getvalue()


async def retimestamp_esign(
    pdf: bytes, timestamper: timestamps.TimeStamper, settings: ValidationSettings
) -> bytes:
    """KeySeal's `/retimestamp` for an eSign copy: validation data for the
    last document timestamp and a new one. pyHanko's
    `update_archival_timestamp_chain` reopens the file strictly, so its
    steps are taken here with a lenient writer."""
    context = _esign_settings(settings).context()
    reader = PdfFileReader(io.BytesIO(pdf), strict=False)
    [*_, last] = reader.embedded_timestamp_signatures
    status = await async_validate_pdf_timestamp(last, validation_context=context)
    if not (status.intact and status.valid and status.validation_path is not None):
        raise ValueError("The last document timestamp doesn't validate")
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf), strict=False)
    DocumentSecurityStore.supply_dss_in_writer(
        writer,
        last.pkcs7_content,
        paths=(status.validation_path,),
        validation_context=context,
    )
    out = io.BytesIO()
    await signers.PdfTimeStamper(timestamper).async_timestamp_pdf(
        writer, status.md_algorithm, context, output=out
    )
    return out.getvalue()


async def validate_esign_pdf(
    data: bytes, settings: ValidationSettings, base_length: int | None = None
) -> dict[str, Any]:
    """KeySeal's report, with each signature's `modificationLevel` judged by
    this module's policy, its `page` and `rect`, and the document's
    `pageCount`, `end`, the length of the file as each signature left it,
    and `timestampTime`, when its timestamp token says it was made. With `base_length` (Leegality's copy before anyone signed,
    or the copy the last check accepted), `changesSinceBase` is what the
    revisions since change and `baseSignatureFields` the fields it had."""
    report = await validate_pdf_async(data, _esign_settings(settings))
    if not report["signatures"]:
        return report
    reader = PdfFileReader(io.BytesIO(data), strict=False)
    embedded = {s.field_name: s for s in reader.embedded_signatures}
    placed = {name: (page, rect) for name, page, rect, _ in _placements(reader)}
    for entry in report["signatures"]:
        sig = embedded.get(entry["fieldName"])
        page, rect = placed.get(entry["fieldName"], (None, None))
        entry["page"], entry["rect"] = page, rect
        # The bytes of the file as this signature left it.
        entry["end"] = (
            int(sig.byte_range[-2]) + int(sig.byte_range[-1]) if sig is not None else None
        )
        try:
            entry["timestampTime"] = timestamp_time(sig).isoformat() if sig is not None else None
        except ValueError:
            entry["timestampTime"] = None
        if sig is not None and not entry.get("error"):
            entry["modificationLevel"] = _level(
                reader,
                sig.signed_revision,
                field_mdp_spec=sig.fieldmdp,
                doc_mdp=sig.docmdp_level,
            )
    good = all(
        not s.get("error")
        and not s.get("certifies")
        and s["intact"]
        and s["coversWholeRevision"]
        and s["modificationLevel"] in SIGNING_LEVELS
        for s in report["signatures"]
    ) and all(t["intact"] for t in report.get("documentTimestamps", []))
    report["status"] = "valid" if good else "invalid"
    report["pageCount"] = int(reader.root["/Pages"]["/Count"])
    if base_length is not None:
        report["changesSinceBase"] = _changes_since(reader, data, base_length)
        try:
            base = PdfFileReader(io.BytesIO(data[:base_length]), strict=False)
            report["baseSignatureFields"] = sorted(_signature_fields(base))
        except Exception:  # noqa: BLE001 - unreadable counts as changed
            report["changesSinceBase"] = "OTHER"
    return report
