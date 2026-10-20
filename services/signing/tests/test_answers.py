from __future__ import annotations

import asyncio
import io
import time

import pytest
from fastapi.testclient import TestClient
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader

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
