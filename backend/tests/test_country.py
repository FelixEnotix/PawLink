from __future__ import annotations

from pawlink.backup import migrate_auto_select_settings
from pawlink.health.country import resolve_country_code
from pawlink.models.state import AutoSelectSettings
import pytest


def test_resolve_country_code_avoids_substring_false_positive() -> None:
    assert resolve_country_code("Australia Sydney") != "US"
    assert resolve_country_code("Singapore Premium") != "IN"
    assert resolve_country_code("US New York") == "US"


def test_moscow_name_beats_eu_flag() -> None:
    assert resolve_country_code("🇳🇱 Netherlands Moscow") == "RU"
    assert resolve_country_code("DE Frankfurt → Москва") == "RU"
    assert resolve_country_code("MSK Cascade") == "RU"


def test_cis_and_ru_region_tokens_expand() -> None:
    settings = migrate_auto_select_settings({"countries": ["CIS", "RU"]})
    assert "KZ" in settings.countries
    assert "UA" in settings.countries
    assert "RU" in settings.countries
    assert "DE" not in settings.countries


def test_migrate_regions_to_countries() -> None:
    settings = migrate_auto_select_settings(
        {"ping_min_ms": 70, "ping_max_ms": 120, "regions": ["EU"], "countries": []}
    )
    assert "DE" in settings.countries
    assert "FR" in settings.countries
    assert settings.ping_min_ms == 70


def test_migrate_expands_region_token_in_countries() -> None:
    settings = migrate_auto_select_settings({"countries": ["EU", "US"]})
    assert "DE" in settings.countries
    assert "US" in settings.countries


def test_auto_select_settings_rejects_invalid_ping_range() -> None:
    with pytest.raises(ValueError):
        AutoSelectSettings(ping_min_ms=200, ping_max_ms=60)
