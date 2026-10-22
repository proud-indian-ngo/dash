"""Preparing an issued resolution: one empty signature field per trustee,
optionally with an answers field that signing the signature field locks."""

from __future__ import annotations

import io
from dataclasses import dataclass

from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.fields import (
    FieldMDPAction,
    FieldMDPSpec,
    SigFieldSpec,
    append_signature_field,
)

from .answers import add_answers_field

MAX_FIELDS = 20


@dataclass(frozen=True)
class FieldRequest:
    name: str
    #: 0-based; negative counts from the last page (-1 is the last).
    page: int
    box: tuple[int, int, int, int]
    #: The trustee's answers field, on the same page; both or neither.
    answers_name: str | None = None
    answers_box: tuple[float, float, float, float] | None = None


class PrepareError(ValueError):
    pass


def prepare_fields(pdf: bytes, fields: list[FieldRequest]) -> bytes:
    """Adds the empty signature fields as one incremental update."""
    if not fields:
        raise PrepareError("No fields")
    if len(fields) > MAX_FIELDS:
        raise PrepareError("Too many fields")
    if any((f.answers_name is None) != (f.answers_box is None) for f in fields):
        raise PrepareError("answersName and answersBox go together")
    names = [f.name for f in fields] + [f.answers_name for f in fields if f.answers_name]
    if len(set(names)) != len(names):
        raise PrepareError("Field names repeat")
    try:
        page_count = int(PdfFileReader(io.BytesIO(pdf)).root["/Pages"]["/Count"])
    except Exception as error:  # noqa: BLE001
        raise PrepareError("Not a readable PDF") from error
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf))
    for field in fields:
        page = field.page if field.page >= 0 else page_count + field.page
        if not 0 <= page < page_count:
            raise PrepareError(f"No page {field.page} for {field.name}")
        append_signature_field(
            writer,
            SigFieldSpec(
                sig_field_name=field.name,
                on_page=page,
                box=tuple(int(round(v)) for v in field.box),  # type: ignore[arg-type]
                field_mdp_spec=(
                    FieldMDPSpec(action=FieldMDPAction.INCLUDE, fields=[field.answers_name])
                    if field.answers_name
                    else None
                ),
            ),
        )
        if field.answers_name and field.answers_box:
            add_answers_field(
                writer,
                field.answers_name,
                writer.find_page_for_modification(page)[0],
                field.answers_box,
            )
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
