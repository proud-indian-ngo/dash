from __future__ import annotations

import asyncio
import io

import pytest

from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers

from keyseal_service.settings import TRUST
from keyseal_service.validate import ValidationSettings, load_trust_roots
from pidash_signing_plugin.esign import (
    INTERMEDIATES,
    PrepareEsignError,
    prepare_esign,
    same_pages,
    validate_esign_pdf,
)

from .conftest import AUTH, Pki, b64, blank_pdf, client_for


def settings_with(pki: Pki) -> ValidationSettings:
    return ValidationSettings(trust_roots=[pki.ca_asn1])


def reusing_xref_number(pdf: bytes, back: int = 1) -> IncrementalPdfFileWriter:
    """A writer whose first new object takes the number of the cross-reference
    stream of the revision `back` from the end (1: the last, as Leegality's)."""
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf), strict=False)
    xrefs = PdfFileReader(io.BytesIO(pdf), strict=False).xrefs
    stream_ref = xrefs.get_xref_container_info(xrefs.total_revisions - back).stream_ref
    assert stream_ref is not None
    writer._lastobj_id = stream_ref.idnum - 1
    return writer


def sign_in_new_box(
    pdf: bytes,
    pki: Pki,
    field: str,
    box: tuple[int, int, int, int],
    reuse_xref_number: bool,
    back: int = 1,
) -> bytes:
    """`pdf` signed in a field the signer adds, as Leegality signs: with
    `reuse_xref_number`, the first new object takes the number of a
    cross-reference stream (`reusing_xref_number`)."""
    writer = (
        reusing_xref_number(pdf, back)
        if reuse_xref_number
        else IncrementalPdfFileWriter(io.BytesIO(pdf), strict=False)
    )
    out = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name=field),
        signer=pki.signer(),
        new_field_spec=fields.SigFieldSpec(field, box=box),
    )
    return out.getvalue()


def blank_form_pdf() -> bytes:
    """A blank page as it goes to Leegality."""
    return prepare_esign(blank_pdf())[0]


def check(pdf: bytes, pki: Pki, base: bytes | None = None) -> dict:
    return asyncio.run(
        validate_esign_pdf(pdf, settings_with(pki), len(base) if base is not None else None)
    )


def test_a_signer_may_take_the_last_xref_stream_number_for_its_field(pki: Pki) -> None:
    first = sign_in_new_box(blank_form_pdf(), pki, "Signer1", (50, 50, 200, 120), False)
    second = sign_in_new_box(first, pki, "Signer2", (300, 50, 450, 120), True)
    report = check(second, pki, first)
    assert report["status"] == "valid"
    assert report["pageCount"] == 1
    assert [s["modificationLevel"] for s in report["signatures"]] == ["FORM_FILLING", "NONE"]
    assert [(s["page"], s["rect"]) for s in report["signatures"]] == [
        (0, (50.0, 50.0, 200.0, 120.0)),
        (0, (300.0, 50.0, 450.0, 120.0)),
    ]
    assert report["changesSinceBase"] == "FORM_FILLING"
    assert report["baseSignatureFields"] == ["Signer1"]
    assert [s["end"] for s in report["signatures"]] == [len(first), len(second)]
    # The test signers don't timestamp.
    assert [s["timestampTime"] for s in report["signatures"]] == [None, None]


def test_an_unsigned_new_field_counts_as_a_change(pki: Pki) -> None:
    first = sign_in_new_box(blank_form_pdf(), pki, "Signer1", (50, 50, 200, 120), False)
    writer = IncrementalPdfFileWriter(io.BytesIO(first))
    fields.append_signature_field(writer, fields.SigFieldSpec("Extra", box=(300, 50, 450, 120)))
    out = io.BytesIO()
    writer.write(out)
    assert check(out.getvalue(), pki, first)["changesSinceBase"] == "OTHER"


def test_new_page_content_after_the_base_counts_as_a_change(pki: Pki) -> None:
    base = blank_form_pdf()
    writer = IncrementalPdfFileWriter(io.BytesIO(base))
    page = writer.find_page_for_modification(0)[0].get_object()
    page[generic.NameObject("/Contents")] = writer.add_object(
        generic.StreamObject(stream_data=b"BT /F1 12 Tf 50 700 Td (Changed) Tj ET")
    )
    writer.update_container(page)
    out = io.BytesIO()
    writer.write(out)
    signed = sign_in_new_box(out.getvalue(), pki, "Signer1", (50, 50, 200, 120), False)
    assert check(signed, pki, base)["changesSinceBase"] == "OTHER"


def test_the_route_checks_a_base64_pdf(pki: Pki) -> None:
    base = blank_form_pdf()
    first = sign_in_new_box(base, pki, "Signer1", (50, 50, 200, 120), False)
    client = client_for(settings_with(pki))
    response = client.post(
        "/pidash/validate-esign", json={"pdf": b64(first), "base": len(base)}, headers=AUTH
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "valid"
    assert body["changesSinceBase"] == "FORM_FILLING"
    assert body["signatures"][0]["signerName"] == "SARJUN H HAJATHULLA"
    bad = client.post("/pidash/validate-esign", json={"pdf": "not base64!"}, headers=AUTH)
    assert bad.status_code == 400


def test_the_shipped_intermediate_chains_to_the_bundled_root() -> None:
    [root] = load_trust_roots(TRUST / "roots")
    [protean] = INTERMEDIATES
    assert protean.issuer == root.subject
    assert protean.subject.native["common_name"] == "Protean eGov CA 2022"


def test_a_first_form_added_after_the_base_counts_as_a_change(pki: Pki) -> None:
    base = blank_pdf()
    signed = sign_in_new_box(base, pki, "Signer1", (50, 50, 200, 120), False)
    assert check(signed, pki, base)["changesSinceBase"] == "OTHER"


def test_preparing_adds_an_empty_form_and_counts_the_pages(pki: Pki) -> None:
    original = blank_pdf()
    prepared, pages = prepare_esign(original)
    assert pages == 1
    assert prepared.startswith(original)
    form = PdfFileReader(io.BytesIO(prepared)).root["/AcroForm"]
    assert list(form["/Fields"]) == []
    with pytest.raises(PrepareEsignError):
        prepare_esign(prepared)
    client = client_for(settings_with(pki))
    response = client.post("/pidash/prepare-esign", json={"pdf": b64(blank_pdf())}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["pageCount"] == 1
    assert client.post(
        "/pidash/prepare-esign", json={"pdf": b64(prepared)}, headers=AUTH
    ).status_code == 422


def _rewritten(pdf: bytes, content: bytes | None = None) -> bytes:
    """`pdf` saved afresh, as Leegality does, optionally with new content."""
    from pyhanko.pdf_utils.writer import copy_into_new_writer

    writer = copy_into_new_writer(PdfFileReader(io.BytesIO(pdf)))
    if content is not None:
        page = writer.find_page_for_modification(0)[0].get_object()
        page[generic.NameObject("/Contents")] = writer.add_object(
            generic.StreamObject(stream_data=content)
        )
        writer.update_container(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_a_copy_saved_afresh_shows_the_same_pages(pki: Pki) -> None:
    prepared, _ = prepare_esign(blank_pdf())
    assert same_pages(prepared, _rewritten(prepared))
    assert not same_pages(prepared, _rewritten(prepared, b"BT (Changed) Tj ET"))
    assert not same_pages(prepared, b"not a pdf")
    client = client_for(settings_with(pki))
    response = client.post(
        "/pidash/same-pages",
        json={"other": b64(_rewritten(prepared)), "pdf": b64(prepared)},
        headers=AUTH,
    )
    assert response.json() == {"same": True}


def test_the_archive_routes_need_a_timestamp_authority(pki: Pki) -> None:
    client = client_for(settings_with(pki))
    for path in ("/pidash/finalize-esign", "/pidash/retimestamp-esign"):
        response = client.post(
            path,
            content=blank_form_pdf(),
            headers={**AUTH, "Content-Type": "application/pdf"},
        )
        assert response.status_code == 503


def test_an_older_revisions_xref_number_stays_taken(pki: Pki) -> None:
    first = sign_in_new_box(blank_form_pdf(), pki, "Signer1", (50, 50, 200, 120), False)
    second = sign_in_new_box(first, pki, "Signer2", (300, 50, 450, 120), False)
    third = sign_in_new_box(second, pki, "Signer3", (50, 200, 200, 270), True, back=2)
    report = check(third, pki, second)
    assert report["changesSinceBase"] == "OTHER"
    assert report["status"] == "invalid"


def test_new_content_under_the_reused_number_counts_as_a_change(pki: Pki) -> None:
    first = sign_in_new_box(blank_form_pdf(), pki, "Signer1", (50, 50, 200, 120), False)
    writer = reusing_xref_number(first)
    page = writer.find_page_for_modification(0)[0].get_object()
    page[generic.NameObject("/Contents")] = writer.add_object(
        generic.StreamObject(stream_data=b"BT (Changed) Tj ET")
    )
    writer.update_container(page)
    out = io.BytesIO()
    writer.write(out)
    changed = sign_in_new_box(out.getvalue(), pki, "Signer2", (300, 50, 450, 120), False)
    report = check(changed, pki, first)
    assert report["changesSinceBase"] == "OTHER"
    assert report["signatures"][0]["modificationLevel"] == "OTHER"


def _with(pdf: bytes, edit) -> bytes:  # type: ignore[no-untyped-def]
    """`pdf` saved afresh after `edit(writer)`."""
    from pyhanko.pdf_utils.writer import copy_into_new_writer

    writer = copy_into_new_writer(PdfFileReader(io.BytesIO(pdf)))
    edit(writer)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_a_crop_box_or_inherited_rotation_shows_different_pages() -> None:
    prepared, _ = prepare_esign(blank_pdf())

    def crop(writer) -> None:  # type: ignore[no-untyped-def]
        page = writer.find_page_for_modification(0)[0].get_object()
        page[generic.NameObject("/CropBox")] = generic.ArrayObject(
            [generic.NumberObject(n) for n in (0, 0, 100, 100)]
        )
        writer.update_container(page)

    def rotate(writer) -> None:  # type: ignore[no-untyped-def]
        pages = writer.root["/Pages"]
        pages[generic.NameObject("/Rotate")] = generic.NumberObject(90)
        writer.update_container(pages)

    def open_action(writer) -> None:  # type: ignore[no-untyped-def]
        writer.root[generic.NameObject("/OpenAction")] = generic.ArrayObject(
            [generic.NumberObject(0)]
        )
        writer.update_root()

    for edit in (crop, rotate, open_action):
        assert not same_pages(prepared, _with(prepared, edit))
