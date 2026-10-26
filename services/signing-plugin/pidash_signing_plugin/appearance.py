"""The `proud-indian` stamp: the service's built-in one, dated in India time,
with the Proud Indian symbol drawn faintly behind it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from pyhanko.pdf_utils import content, generic, layout
from pyhanko.pdf_utils.writer import BasePdfFileWriter
from keyseal_service.appearance import NAME_SHARE, SignedByStamp, SignedByStampStyle

IST = timezone(timedelta(hours=5, minutes=30), "IST")

# The Proud Indian symbol from the lockup in packages/pdf/src/proud-indian-lockup.tsx
# (@proudindian/design v0.3.4), copied verbatim: re-copy it when the logo changes.
# It is drawn faintly behind the signature, centred on the column break.
SYMBOL_BODY = (
    "M20 36L34.5 36Q43.003 36 54.286 42.947Q62.494 48 67.5 48L82 48Q82.739 48"
    " 83.463 48.144Q84.188 48.288 84.87 48.571Q85.553 48.854 86.167 49.264Q86"
    ".781 49.674 87.303 50.197Q87.826 50.719 88.236 51.333Q88.646 51.947 88.9"
    "29 52.63Q89.212 53.312 89.356 54.037Q89.5 54.761 89.5 55.5Q89.5 56.239 8"
    "9.356 56.963Q89.212 57.688 88.929 58.37Q88.646 59.053 88.236 59.667Q87.8"
    "26 60.281 87.303 60.803Q86.781 61.326 86.167 61.736Q85.553 62.146 84.87 "
    "62.429Q84.188 62.712 83.463 62.856Q82.739 63 82 63L79.5 63L79.5 99C79.5 "
    "101.209 77.709 103 75.5 103L67.5 103C65.291 103 63.5 101.209 63.5 99L63."
    "5 62.679Q55.763 61.471 46.422 55.72Q41.856 52.909 38.5 51.772L38.5 99C38"
    ".5 101.209 36.709 103 34.5 103L26.5 103C24.291 103 22.5 101.209 22.5 99L"
    "22.5 51L20 51Q19.261 51 18.537 50.856Q17.812 50.712 17.13 50.429Q16.447 "
    "50.146 15.833 49.736Q15.219 49.326 14.697 48.803Q14.174 48.281 13.764 47"
    ".667Q13.354 47.053 13.071 46.37Q12.788 45.688 12.644 44.963Q12.5 44.239 "
    "12.5 43.5Q12.5 42.761 12.644 42.037Q12.788 41.312 13.071 40.63Q13.354 39"
    ".947 13.764 39.333Q14.174 38.719 14.697 38.197Q15.219 37.674 15.833 37.2"
    "64Q16.447 36.854 17.13 36.571Q17.812 36.288 18.537 36.144Q19.261 36 20 3"
    "6Z"
)
SYMBOL_DOTS = ((30.5, 16, 10, "ink"), (71.5, 29.5, 8.5, "accent"))
SYMBOL_BOUNDS = (12.5, 6, 89.5, 103)  # min x, min y, max x, max y
COLOURS = {"ink": (0x0F, 0x1B, 0x24), "accent": (0x0B, 0x7F, 0xAE)}
SYMBOL_OPACITY = 0.12
#: The symbol's height as a share of the box's.
SYMBOL_HEIGHT = 0.9


def _op(name: str, *values: float) -> str:
    return " ".join(f"{v:.2f}" for v in values) + f" {name}"


def _symbol(height: float, centre_x: float, centre_y: float) -> bytes:
    """PDF drawing operators for the symbol, its height given in points."""
    min_x, min_y, max_x, max_y = SYMBOL_BOUNDS
    k = height / (max_y - min_y)
    left = centre_x - (max_x - min_x) * k / 2
    bottom = centre_y - height / 2

    def at(x: float, y: float) -> tuple[float, float]:
        # SVG's y runs down, PDF's up.
        return left + (x - min_x) * k, bottom + (max_y - y) * k

    def fill(colour: str) -> str:
        return _op("rg", *(c / 255 for c in COLOURS[colour]))

    ops = [fill("ink")]
    arity = {"M": 2, "L": 2, "Q": 4, "C": 6, "Z": 0}
    tokens = re.findall(r"[MLQCZ]|-?\d*\.?\d+", SYMBOL_BODY)
    current = (0.0, 0.0)
    i = 0
    while i < len(tokens):
        command = tokens[i]
        v = [float(t) for t in tokens[i + 1 : i + 1 + arity[command]]]
        i += 1 + arity[command]
        if command == "Z":
            ops.append("h")
        elif command == "Q":
            # PDF has no quadratic curve: draw the equivalent cubic.
            (sx, sy), (qx, qy), (ex, ey) = current, v[:2], v[2:]
            c1 = (sx + 2 / 3 * (qx - sx), sy + 2 / 3 * (qy - sy))
            c2 = (ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey))
            ops.append(_op("c", *at(*c1), *at(*c2), *at(ex, ey)))
            current = (ex, ey)
        elif command == "C":
            ops.append(_op("c", *at(*v[:2]), *at(*v[2:4]), *at(*v[4:])))
            current = (v[4], v[5])
        else:
            current = (v[0], v[1])
            ops.append(_op("m" if command == "M" else "l", *at(*current)))
    ops.append("f")
    arc = 0.5523  # control distance for a quarter circle
    for cx, cy, r, colour in SYMBOL_DOTS:
        x, y = at(cx, cy)
        r *= k
        d = r * arc
        ops += [
            fill(colour),
            _op("m", x + r, y),
            _op("c", x + r, y + d, x + d, y + r, x, y + r),
            _op("c", x - d, y + r, x - r, y + d, x - r, y),
            _op("c", x - r, y - d, x - d, y - r, x, y - r),
            _op("c", x + d, y - r, x + r, y - d, x + r, y),
            "f",
        ]
    return " ".join(ops).encode()


@dataclass(frozen=True)
class ProudIndianStampStyle(SignedByStampStyle):
    def create_stamp(
        self,
        writer: BasePdfFileWriter,
        box: layout.BoxConstraints,
        text_params: dict,
    ) -> ProudIndianStamp:
        return ProudIndianStamp(
            writer=writer,
            style=self,
            box=box,
            signer=text_params.get("signer") or "",
            reason=text_params.get("reason") or "",
            at=datetime.now(IST),
        )


class ProudIndianStamp(SignedByStamp):
    def _render_symbol(self, centre_x: float) -> list[bytes]:
        opacity = generic.FloatObject(SYMBOL_OPACITY)
        self.set_resource(
            category=content.ResourceType.EXT_G_STATE,
            name=generic.pdf_name("/SymbolGS"),
            value=generic.DictionaryObject(
                {generic.pdf_name("/CA"): opacity, generic.pdf_name("/ca"): opacity}
            ),
        )
        height = self.box.height * SYMBOL_HEIGHT
        symbol = _symbol(height, centre_x, self.box.height / 2)
        return [b"q /SymbolGS gs", symbol, b"Q"]

    def _render_inner_content(self):
        return [
            *self._render_symbol(self.box.width * NAME_SHARE),
            *super()._render_inner_content(),
        ]
