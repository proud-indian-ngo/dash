from __future__ import annotations

from datetime import timedelta

from pyhanko.pdf_utils import layout
from signr_service.appearance import signed_on

from pidash_signing_plugin.appearance import ProudIndianStampStyle


def test_dates_show_in_india_time() -> None:
    stamp = ProudIndianStampStyle().create_stamp(
        writer=None,  # type: ignore[arg-type]
        box=layout.BoxConstraints(width=247, height=72),
        text_params={"signer": "SARJUN H HAJATHULLA"},
    )
    assert stamp.at.utcoffset() == timedelta(hours=5, minutes=30)
    assert signed_on(stamp.at).endswith(" +05'30'")
