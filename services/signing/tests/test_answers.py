from __future__ import annotations

import asyncio
import io
import time

import pytest
from fastapi.testclient import TestClient
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers

from pidash_signing.answers import AnswersError, fill_answers
from pidash_signing.app import create_app
from pidash_signing.prepare import FieldRequest, PrepareError, prepare_fields
from pidash_signing.remote_sign import finish, start
from pidash_signing.validate import ValidationSettings, validate_pdf

from .conftest import Pki, blank_pdf
from .test_remote_sign import b64, ca_b64, cert_b64, token_sign

ANSWERS_A = "Resolution 1: assents\nResolution 2: objects"
ANSWERS_B = "Resolution 1: objects\nResolution 2: assents"


def prepared() -> bytes:
    return prepare_fields(
        blank_pdf(),
        [
            FieldRequest(
                name="Trustee_a",
                page=-1,
                box=(300, 600, 547, 672),
                answers_name="Answers_a",
                answers_box=(48, 600, 290, 672),
            ),
            FieldRequest(
                name="Trustee_b",
                page=-1,
                box=(300, 470, 547, 542),
                answers_name="Answers_b",
                answers_box=(48, 470, 290, 542),
            ),
        ],
    )


def remote_sign(pdf: bytes, pki: Pki, field: str) -> bytes:
    started = asyncio.run(start(pdf, field, cert_b64(pki), [ca_b64(pki)]))
    return asyncio.run(finish(started.state, token_sign(pki, started.to_sign), None))


def fields_by_name(pdf: bytes) -> dict[str, generic.DictionaryObject]:
    reader = PdfFileReader(io.BytesIO(pdf))
    return {
        str(ref.get_object()["/T"]): ref.get_object()
        for ref in reader.root["/AcroForm"]["/Fields"]
    }


def settings(pki: Pki) -> ValidationSettings:
    return ValidationSettings(trust_roots=[pki.ca_asn1])


def test_prepare_adds_a_read_only_answers_field_the_signature_locks() -> None:
    fields = fields_by_name(prepared())
    answers = fields["Answers_a"]
    assert answers["/FT"] == "/Tx"
    assert int(answers["/Ff"]) & 1
    assert int(answers["/F"]) == 4
    assert "/V" not in answers
    assert [float(v) for v in answers["/Rect"]] == [48, 600, 290, 672]
    lock = fields["Trustee_a"]["/Lock"]
    assert lock["/Action"] == "/Include"
    assert list(lock["/Fields"]) == ["Answers_a"]
    assert list(fields["Trustee_b"]["/Lock"]["/Fields"]) == ["Answers_b"]
    font = str(answers["/DA"]).split()[0]
    form = PdfFileReader(io.BytesIO(prepared())).root["/AcroForm"]
    assert font in form["/DR"]["/Font"]


def test_prepare_wants_both_answers_fields_or_neither() -> None:
    with pytest.raises(PrepareError, match="go together"):
        prepare_fields(
            blank_pdf(),
            [FieldRequest(name="T", page=0, box=(0, 0, 10, 10), answers_name="A")],
        )
    with pytest.raises(PrepareError, match="repeat"):
        prepare_fields(
            blank_pdf(),
            [
                FieldRequest(
                    name="T", page=0, box=(0, 0, 10, 10), answers_name="T", answers_box=(0, 20, 10, 30)
                )
            ],
        )


def test_fill_sets_the_value_and_a_visible_appearance() -> None:
    pdf = prepared()
    filled = fill_answers(pdf, "Answers_a", ANSWERS_A)
    assert filled.startswith(pdf)
    answers = fields_by_name(filled)["Answers_a"]
    assert str(answers["/V"]) == ANSWERS_A
    appearance = answers["/AP"]["/N"]
    content = appearance.data
    # One text line per answer; the colon is written as an octal escape.
    assert b"(Resolution 1\\072 assents) Tj T* (Resolution 2\\072 objects) Tj" in content
    assert b"/F1 7 Tf" in content


def test_fill_is_deterministic_so_concurrent_fills_store_the_same_copy(pki: Pki) -> None:
    pdf = prepared()
    filled = fill_answers(pdf, "Answers_a", ANSWERS_A)
    # A second apart, so a /ModDate of now would show.
    time.sleep(1.1)
    assert fill_answers(pdf, "Answers_a", ANSWERS_A) == filled
    assert fill_answers(pdf, "Answers_a", ANSWERS_B) != filled
    assert fill_answers(pdf, "Answers_b", ANSWERS_A) != filled
    original_id, _ = PdfFileReader(io.BytesIO(pdf)).document_id
    permanent_id, changing_id = PdfFileReader(io.BytesIO(filled)).document_id
    assert permanent_id == original_id
    assert changing_id != original_id

    report = validate_pdf(remote_sign(filled, pki, "Trustee_a"), settings(pki))
    assert report["status"] == "valid"
    assert report["textFields"]["Answers_a"] == ANSWERS_A


def appearance(pdf: bytes, name: str) -> bytes:
    return fields_by_name(pdf)[name]["/AP"]["/N"].data


def test_fill_wraps_long_lines_and_steps_the_font_down() -> None:
    note = "Resolution 1: assents, with a note that runs well past the width of the box"
    content = appearance(fill_answers(prepared(), "Answers_a", note), "Answers_a")
    assert b"/F1 7 Tf" in content
    assert content.count(b" Tj") == 2

    many = "\n".join(f"Resolution {i}: objects, with a short note" for i in range(1, 13))
    content = appearance(fill_answers(prepared(), "Answers_a", many), "Answers_a")
    assert b"/F1 4 Tf" in content
    assert content.count(b" Tj") == 12

    with pytest.raises(AnswersError, match="don't fit"):
        fill_answers(prepared(), "Answers_a", "\n".join(["Resolution"] * 20))


def test_fill_refuses_a_filled_unknown_or_wrong_field(pki: Pki) -> None:
    filled = fill_answers(prepared(), "Answers_a", ANSWERS_A)
    with pytest.raises(AnswersError, match="already filled"):
        fill_answers(filled, "Answers_a", "Resolution 1: objects")
    with pytest.raises(AnswersError, match="no text field"):
        fill_answers(filled, "Answers_z", ANSWERS_A)
    with pytest.raises(AnswersError, match="not a text field"):
        fill_answers(filled, "Trustee_a", ANSWERS_A)
    with pytest.raises(AnswersError, match="ASCII"):
        fill_answers(filled, "Answers_b", "Résolution 1: assents")
    with pytest.raises(AnswersError, match="longer than"):
        fill_answers(filled, "Answers_b", "x" * 2001)
    with pytest.raises(AnswersError, match="No answers"):
        fill_answers(filled, "Answers_b", "  ")


def test_each_trustee_fills_then_signs_and_both_stay_valid(pki: Pki) -> None:
    first = remote_sign(fill_answers(prepared(), "Answers_a", ANSWERS_A), pki, "Trustee_a")
    report = validate_pdf(first, settings(pki))
    assert report["status"] == "valid"
    [sig] = report["signatures"]
    assert sig["intact"] is True
    assert sig["coversWholeRevision"] is True
    assert report["textFields"] == {"Answers_a": ANSWERS_A, "Answers_b": ""}

    second = remote_sign(fill_answers(first, "Answers_b", ANSWERS_B), pki, "Trustee_b")
    report = validate_pdf(second, settings(pki))
    assert report["status"] == "valid"
    assert report["textFields"] == {"Answers_a": ANSWERS_A, "Answers_b": ANSWERS_B}
    first_sig, second_sig = report["signatures"]
    assert [first_sig["intact"], second_sig["intact"]] == [True, True]
    assert first_sig["modificationLevel"] == "FORM_FILLING"
    assert second_sig["modificationLevel"] == "NONE"
    assert second_sig["coversWholeRevision"] is True


def change_value(pdf: bytes, name: str, value: str) -> bytes:
    """What a tamperer would do: rewrite a field's value in a later revision."""
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    for ref in writer.root["/AcroForm"]["/Fields"]:
        field = ref.get_object()
        if field["/T"] == name:
            field["/V"] = generic.TextStringObject(value)
            writer.mark_update(ref)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_changing_signed_answers_later_is_invalid(pki: Pki) -> None:
    first = remote_sign(fill_answers(prepared(), "Answers_a", ANSWERS_A), pki, "Trustee_a")
    tampered = change_value(first, "Answers_a", "Resolution 1: objects\nResolution 2: objects")
    report = validate_pdf(tampered, settings(pki))
    assert report["status"] == "invalid"
    [sig] = report["signatures"]
    assert sig["intact"] is True
    assert sig["modificationLevel"] == "OTHER"
    assert report["textFields"]["Answers_a"].startswith("Resolution 1: objects")

    # The other trustee's answers stay open to filling after the first signs.
    filled = change_value(first, "Answers_b", ANSWERS_B)
    assert validate_pdf(filled, settings(pki))["status"] == "valid"


def test_api_prepares_and_fills(pki: Pki) -> None:
    client = TestClient(create_app(settings(pki), token="secret"))
    auth = {"Authorization": "Bearer secret"}
    field = {
        "answersBox": [48, 600, 290, 672],
        "answersName": "Answers_a",
        "box": [300, 600, 547, 672],
        "name": "Trustee_a",
        "page": -1,
    }
    prepared_pdf = client.post(
        "/prepare", headers=auth, json={"fields": [field], "pdf": b64(blank_pdf())}
    )
    assert prepared_pdf.status_code == 200
    assert "Answers_a" in fields_by_name(prepared_pdf.content)
    half = {k: v for k, v in field.items() if k != "answersBox"}
    assert (
        client.post("/prepare", headers=auth, json={"fields": [half], "pdf": b64(blank_pdf())}).status_code
        == 422
    )

    body = {"name": "Answers_a", "pdf": b64(prepared_pdf.content), "value": ANSWERS_A}
    assert client.post("/fill", json=body).status_code == 401
    filled = client.post("/fill", headers=auth, json=body)
    assert filled.status_code == 200
    assert filled.headers["content-type"] == "application/pdf"
    assert str(fields_by_name(filled.content)["Answers_a"]["/V"]) == ANSWERS_A
    again = client.post("/fill", headers=auth, json={**body, "pdf": b64(filled.content)})
    assert again.status_code == 422
    assert "already filled" in again.json()["detail"]
    assert client.post("/fill", headers=auth, json={**body, "pdf": "!!"}).status_code == 400


def sign_in(pdf: bytes, pki: Pki, field: str, rewrite_page: bytes | None = None) -> bytes:
    """Acrobat-style signing in one revision, optionally rewriting the page too."""
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    if rewrite_page is not None:
        page = writer.root["/Pages"]["/Kids"][0].get_object()
        page["/Contents"] = writer.add_object(generic.StreamObject(stream_data=rewrite_page))
        writer.update_container(page)
    out = signers.sign_pdf(
        writer, signers.PdfSignatureMetadata(field_name=field), signer=pki.signer()
    )
    return out.getvalue()


def test_signing_a_prepared_or_new_field_is_form_filling(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)
    for signed in (
        remote_sign(given, pki, "Trustee_a"),
        sign_in(given, pki, "Trustee_a"),
        # A signature in a field of its own.
        sign_in(given, pki, "Signature1"),
    ):
        report = validate_pdf(signed, settings(pki), base_length=len(given))
        assert report["status"] == "valid"
        assert report["changesSinceBase"] == "FORM_FILLING"


def test_first_signer_rewriting_the_page_is_refused(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)
    signed = sign_in(given, pki, "Trustee_a", rewrite_page=b"BT 72 700 Td (Altered) Tj ET")
    report = validate_pdf(signed, settings(pki), base_length=len(given))
    # The signature alone looks fine: nothing comes after it.
    assert report["status"] == "valid"
    assert report["changesSinceBase"] == "OTHER"


def sign_new_field(pdf: bytes, pki: Pki, name: str, box: tuple[int, int, int, int]) -> bytes:
    """A signature in a field of the signer's own, drawn where they like."""
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    out = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name=name),
        signer=pki.signer(),
        new_field_spec=fields.SigFieldSpec(sig_field_name=name, on_page=0, box=box),
    )
    return out.getvalue()


def test_a_signatures_lock_and_certification_are_reported(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)
    # The prepared field locks only the trustee's own answers.
    for signed in (remote_sign(given, pki, "Trustee_a"), sign_in(given, pki, "Trustee_a")):
        [sig] = validate_pdf(signed, settings(pki))["signatures"]
        assert sig["certifies"] is False
        assert sig["locks"]
        assert all(lock == {"action": "include", "fields": ["Answers_a"]} for lock in sig["locks"])
    # A field of the signer's own may lock the whole form, which later
    # trustees' signatures would break.
    writer = IncrementalPdfFileWriter(io.BytesIO(given))
    locked_all = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name="Signature1"),
        signer=pki.signer(),
        new_field_spec=fields.SigFieldSpec(
            sig_field_name="Signature1",
            on_page=0,
            box=(300, 300, 500, 360),
            field_mdp_spec=fields.FieldMDPSpec(action=fields.FieldMDPAction.ALL),
        ),
    ).getvalue()
    [sig] = validate_pdf(locked_all, settings(pki))["signatures"]
    assert {"action": "all", "fields": []} in sig["locks"]
    assert sig["certifies"] is False
    # Unlocked, in a field of its own.
    [sig] = validate_pdf(sign_in(given, pki, "Signature1"), settings(pki))["signatures"]
    assert sig["locks"] == []
    # A certification signature limits what every later signature may change.
    writer = IncrementalPdfFileWriter(io.BytesIO(given))
    certified = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name="Trustee_a", certify=True),
        signer=pki.signer(),
    ).getvalue()
    [sig] = validate_pdf(certified, settings(pki))["signatures"]
    assert sig["certifies"] is True


def test_a_new_fields_widget_is_reported_for_the_caller_to_judge(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)
    for box in ((0, 0, 595, 842), (300, 300, 500, 360)):
        report = validate_pdf(
            sign_new_field(given, pki, "Signature1", box), settings(pki), base_length=len(given)
        )
        # pyHanko counts a new signature field, whatever it covers, as form filling.
        assert report["changesSinceBase"] == "FORM_FILLING"
        assert report["pageCount"] == 1
        assert {"field": "Signature1", "page": 0, "rect": [float(v) for v in box]} in report[
            "widgets"
        ]
        assert {"field": "Trustee_a", "page": 0, "rect": [300.0, 600.0, 547.0, 672.0]} in report[
            "widgets"
        ]


def new_appearance(writer: IncrementalPdfFileWriter) -> generic.IndirectObject:
    return writer.add_object(
        generic.StreamObject(
            {
                generic.NameObject("/Type"): generic.NameObject("/XObject"),
                generic.NameObject("/Subtype"): generic.NameObject("/Form"),
                generic.NameObject("/BBox"): generic.ArrayObject(
                    [generic.NumberObject(v) for v in (0, 0, 242, 72)]
                ),
            },
            stream_data=b"0 0 1 rg 0 0 242 72 re f",
        )
    )


def edit_then_sign(pdf: bytes, pki: Pki, edit) -> bytes:
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    for ref in writer.root["/AcroForm"]["/Fields"]:
        field = ref.get_object()
        if edit(writer, str(field["/T"]), field):
            writer.mark_update(ref)
    out = signers.sign_pdf(
        writer, signers.PdfSignatureMetadata(field_name="Trustee_a"), signer=pki.signer()
    )
    return out.getvalue()


def test_changing_another_widget_or_adding_a_field_is_refused(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)

    def redraw(name: str):
        def edit(writer, field_name, field) -> bool:
            if field_name != name:
                return False
            field["/AP"] = generic.DictionaryObject({generic.NameObject("/N"): new_appearance(writer)})
            return True

        return edit

    def move_own_box(writer, field_name, field) -> bool:
        if field_name != "Trustee_a":
            return False
        field["/Rect"] = generic.ArrayObject([generic.NumberObject(v) for v in (0, 0, 595, 842)])
        return True

    extra = IncrementalPdfFileWriter(io.BytesIO(given))
    fields.append_signature_field(
        extra, fields.SigFieldSpec(sig_field_name="Extra", on_page=0, box=(0, 0, 595, 842))
    )
    with_extra = signers.sign_pdf(
        extra, signers.PdfSignatureMetadata(field_name="Trustee_a"), signer=pki.signer()
    ).getvalue()

    for signed in (
        # Another trustee's empty answers box, which pyHanko lets anyone fill.
        edit_then_sign(given, pki, redraw("Answers_b")),
        # The signer's own answers, drawn to say something else.
        edit_then_sign(given, pki, redraw("Answers_a")),
        edit_then_sign(given, pki, move_own_box),
        # An empty field drawn over the page alongside the signature.
        with_extra,
    ):
        report = validate_pdf(signed, settings(pki), base_length=len(given))
        assert report["changesSinceBase"] == "OTHER"


def test_hiding_or_restyling_a_widget_is_refused(pki: Pki) -> None:
    given = fill_answers(prepared(), "Answers_a", ANSWERS_A)

    def setting(name: str, key: str, value: generic.PdfObject):
        def edit(writer, field_name, field) -> bool:
            if field_name != name:
                return False
            field[generic.NameObject(key)] = value
            return True

        return edit

    for edit in (
        # Hidden, then NoView: the answers still read the same, but no viewer shows them.
        setting("Answers_a", "/F", generic.NumberObject(2)),
        setting("Answers_a", "/F", generic.NumberObject(4 | 32)),
        setting("Answers_b", "/F", generic.NumberObject(2)),
        setting("Answers_a", "/DA", generic.pdf_string("/Cour 0 Tf 1 g")),
        setting(
            "Answers_a",
            "/MK",
            generic.DictionaryObject({generic.NameObject("/BG"): generic.ArrayObject([generic.NumberObject(1)])}),
        ),
        # No longer read-only.
        setting("Answers_a", "/Ff", generic.NumberObject(1 << 12)),
        setting("Trustee_a", "/F", generic.NumberObject(2)),
    ):
        report = validate_pdf(edit_then_sign(given, pki, edit), settings(pki), base_length=len(given))
        assert report["changesSinceBase"] == "OTHER"
