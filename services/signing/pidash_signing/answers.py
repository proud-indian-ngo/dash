"""A trustee's per-resolution answers: a read-only text field next to their
signature field, filled just before they sign so the signature covers it."""

from __future__ import annotations

import hashlib
import io
import json
import textwrap

from pyhanko.pdf_utils import generic, layout
from pyhanko.pdf_utils.form_tools import (
    TextFieldContent,
    annot_width_height,
    enumerate_fields_in,
    get_single_field_annot,
)
from pyhanko.pdf_utils.generic import pdf_name, pdf_string
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.misc import FormFillingError
from pyhanko.pdf_utils.text import TextBoxStyle

MAX_VALUE = 2000
FONT_SIZE = 7
#: Long answers step the font down to this before they're refused.
MIN_FONT_SIZE = 4
MARGIN = 2
#: Courier advances every glyph by 600/1000 of the font size.
COURIER_ADVANCE = 0.6
#: The form's default font for the empty field, so viewers can render it.
DA_FONT = "/Cour"


class AnswersError(ValueError):
    pass


class _DeterministicWriter(IncrementalPdfFileWriter):
    """An incremental writer whose bytes depend only on the input and the edits.

    The web app checks a signed upload starts with the exact filled copy it
    stored, so two fills of the same input must match byte for byte. pyHanko has
    no public hook for either source of randomness it adds to an update.
    """

    def __init__(self, pdf: bytes, seed: bytes):
        super().__init__(io.BytesIO(pdf))
        # pyHanko draws the changing second /ID from os.urandom; derive it from
        # the inputs instead. The first, permanent ID stays the original's
        # (ISO 32000 14.4); a file without one gets the seed for both, as for a
        # newly written file.
        changing = generic.ByteStringObject(seed)
        permanent = self._document_id[0] if "/ID" in self.prev.trailer_view else changing
        self._document_id = generic.ArrayObject([permanent, changing])

    def _update_meta(self) -> None:
        # Leave /Info and XMP alone: pyHanko would stamp /ModDate with the
        # current time. Signing the copy later updates them anyway.
        pass


def add_answers_field(
    writer: IncrementalPdfFileWriter,
    name: str,
    page_ref: generic.IndirectObject,
    box: tuple[float, float, float, float],
) -> None:
    """Adds an empty read-only text field on the page. The form must exist."""
    form = writer.root["/AcroForm"]
    if "/DR" not in form:
        form["/DR"] = generic.DictionaryObject()
    resources = form["/DR"]
    if "/Font" not in resources:
        resources["/Font"] = generic.DictionaryObject()
    fonts = resources["/Font"]
    if DA_FONT not in fonts:
        fonts[pdf_name(DA_FONT)] = writer.add_object(
            generic.DictionaryObject(
                {
                    pdf_name("/Type"): pdf_name("/Font"),
                    pdf_name("/Subtype"): pdf_name("/Type1"),
                    pdf_name("/BaseFont"): pdf_name("/Courier"),
                    pdf_name("/Encoding"): pdf_name("/WinAnsiEncoding"),
                }
            )
        )
    for container in (form, resources, fonts):
        writer.update_container(container)

    field_ref = writer.add_object(
        generic.DictionaryObject(
            {
                pdf_name("/FT"): pdf_name("/Tx"),
                pdf_name("/T"): pdf_string(name),
                # Read-only, multiline.
                pdf_name("/Ff"): generic.NumberObject(1 | 1 << 12),
                pdf_name("/DA"): pdf_string(f"{DA_FONT} {FONT_SIZE} Tf 0 g"),
                pdf_name("/Type"): pdf_name("/Annot"),
                pdf_name("/Subtype"): pdf_name("/Widget"),
                # Printable.
                pdf_name("/F"): generic.NumberObject(4),
                pdf_name("/Rect"): generic.ArrayObject(
                    [generic.FloatObject(v) for v in box]
                ),
                pdf_name("/P"): page_ref,
            }
        )
    )
    fields = form["/Fields"]
    fields.append(field_ref)
    writer.update_container(fields)
    writer.register_annotation(page_ref, field_ref)


def _wrap(value: str, width: float, font_size: int) -> list[str]:
    per_line = max(1, int((width - 2 * MARGIN) // (COURIER_ADVANCE * font_size)))
    lines: list[str] = []
    for paragraph in value.split("\n"):
        lines.extend(textwrap.wrap(paragraph, per_line) or [""])
    return lines


def _fit(value: str, width: float, height: float) -> tuple[int, str]:
    """The largest font size whose wrapped lines fit the box, and those lines."""
    for font_size in range(FONT_SIZE, MIN_FONT_SIZE - 1, -1):
        lines = _wrap(value, width, font_size)
        if len(lines) * (font_size + 1) <= height - 2 * MARGIN:
            return font_size, "\n".join(lines)
    raise AnswersError("The answers don't fit the field")


def fill_answers(pdf: bytes, name: str, value: str) -> bytes:
    """Sets the empty text field's value and appearance as one incremental update."""
    if not value.strip():
        raise AnswersError("No answers")
    if len(value) > MAX_VALUE:
        raise AnswersError(f"Answers are longer than {MAX_VALUE} characters")
    if not all(c == "\n" or " " <= c <= "~" for c in value):
        raise AnswersError("Answers must be plain ASCII text")
    inputs = hashlib.sha256(pdf)
    inputs.update(json.dumps([name, value]).encode())
    try:
        writer = _DeterministicWriter(pdf, inputs.digest()[:16])
        fields = writer.root["/AcroForm"]["/Fields"]
    except Exception as error:  # noqa: BLE001
        raise AnswersError("Not a readable PDF with a form") from error
    try:
        found = next(
            enumerate_fields_in(
                fields, with_name=name, refs_seen=set(), target_field_type="/Tx"
            ),
            None,
        )
    except FormFillingError as error:
        raise AnswersError(f"{name} is not a text field") from error
    if found is None:
        raise AnswersError(f"The PDF has no text field {name}")
    _, current, field_ref = found
    if current:
        raise AnswersError(f"{name} is already filled")

    field = field_ref.get_object()
    annot = get_single_field_annot(field)
    width, height = annot_width_height(annot)
    font_size, text = _fit(value, width, height)
    # Sized by `_fit`, not by pyHanko's shrink-to-fit, which misplaces the lines.
    style = TextBoxStyle(
        font_size=font_size,
        leading=font_size + 1,
        box_layout_rule=layout.SimpleBoxLayoutRule(
            x_align=layout.AxisAlignment.ALIGN_MIN,
            y_align=layout.AxisAlignment.ALIGN_MAX,
            margins=layout.Margins.uniform(MARGIN),
            inner_content_scaling=layout.InnerScaling.NO_SCALING,
        ),
    )
    TextFieldContent(
        writer,
        text,
        style,
        box=layout.BoxConstraints(width=round(width), height=round(height)),
    ).apply_appearance(annot)
    field[pdf_name("/V")] = generic.TextStringObject(value)
    writer.mark_update(field_ref)
    writer.update_container(annot)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
