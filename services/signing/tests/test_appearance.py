from __future__ import annotations

from datetime import UTC, datetime

from pidash_signing.appearance import signed_on, two_lines


def test_names_split_into_two_even_lines() -> None:
    assert two_lines("Somasundaram Ayyappan") == "Somasundaram\nAyyappan"
    assert two_lines("Chenthil Kumar S") == "Chenthil\nKumar S"
    assert two_lines("SARJUN H HAJATHULLA") == "SARJUN H\nHAJATHULLA"
    assert two_lines("Madonna") == "Madonna"


def test_dates_show_in_india_time() -> None:
    at = datetime(2026, 10, 20, 4, 35, 25, tzinfo=UTC)
    assert signed_on(at) == "2026.10.20 10:05:25 +05'30'"
