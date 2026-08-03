from __future__ import annotations

from typing import Any

from pydantic import model_validator

from pawlink.models.state import ApplicationState, AutoSelectSettings
from pawlink.health.country import expand_regions, normalize_country_codes

BACKUP_FORMAT = "pawlink-backup"
BACKUP_VERSION = 2

PERSISTED_BACKUP_FIELDS = {
    "profiles",
    "subscriptions",
    "active_profile_id",
    "custom_rules",
    "process_tunnels",
    "auto_select_enabled",
    "auto_select",
    "auto_select_in_fallback",
    "blocked_servers",
    "connect_on_startup",
    "routing_mode",
    "kill_switch_enabled",
    "subscription_traffic",
}


def _flat_state(data: dict[str, Any]) -> dict[str, Any]:
    """Merge v2 sections into a flat ApplicationState-compatible dict."""
    if "servers" in data and "settings" in data:
        servers = data.get("servers") or {}
        routing = data.get("routing") or {}
        settings = data.get("settings") or {}
        return {
            "profiles": servers.get("profiles", []),
            "subscriptions": servers.get("subscriptions", []),
            "active_profile_id": servers.get("active_profile_id"),
            "subscription_traffic": servers.get("subscription_traffic", {}),
            "routing_mode": routing.get("routing_mode", "rule"),
            "custom_rules": routing.get("custom_rules", []),
            "process_tunnels": routing.get("process_tunnels", []),
            "connect_on_startup": settings.get("connect_on_startup", False),
            "auto_select_enabled": settings.get("auto_select_enabled", False),
            "auto_select": settings.get("auto_select") or AutoSelectSettings().model_dump(),
            "auto_select_in_fallback": settings.get("auto_select_in_fallback", False),
            "blocked_servers": settings.get("blocked_servers", []),
            "kill_switch_enabled": settings.get("kill_switch_enabled", True),
        }
    return data


def normalize_backup_data(payload: dict[str, Any]) -> dict[str, Any]:
    """Accept v1 (flat) or v2 (sectioned) backup files."""
    raw = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(raw, dict):
        raise ValueError("Некорректный файл резервной копии")

    if "servers" in raw and "settings" in raw:
        return {
            "servers": raw.get("servers") or {},
            "routing": raw.get("routing") or {},
            "settings": raw.get("settings") or {},
        }

    flat = _flat_state(raw)
    return {
        "servers": {
            "profiles": flat.get("profiles", []),
            "subscriptions": flat.get("subscriptions", []),
            "active_profile_id": flat.get("active_profile_id"),
            "subscription_traffic": flat.get("subscription_traffic", {}),
        },
        "routing": {
            "routing_mode": flat.get("routing_mode", "rule"),
            "custom_rules": flat.get("custom_rules", []),
            "process_tunnels": flat.get("process_tunnels", []),
        },
        "settings": {
            "connect_on_startup": flat.get("connect_on_startup", False),
            "auto_select_enabled": flat.get("auto_select_enabled", False),
            "auto_select": flat.get("auto_select") or AutoSelectSettings().model_dump(),
            "auto_select_in_fallback": flat.get("auto_select_in_fallback", False),
            "blocked_servers": flat.get("blocked_servers", []),
            "kill_switch_enabled": flat.get("kill_switch_enabled", True),
        },
    }


def export_state_sections(state: ApplicationState) -> dict[str, Any]:
    """Build v2 backup sections from application state."""
    dumped = state.model_dump(mode="json", include=PERSISTED_BACKUP_FIELDS)
    return {
        "servers": {
            "profiles": dumped["profiles"],
            "subscriptions": dumped["subscriptions"],
            "active_profile_id": dumped.get("active_profile_id"),
            "subscription_traffic": dumped.get("subscription_traffic", {}),
        },
        "routing": {
            "routing_mode": dumped.get("routing_mode", "rule"),
            "custom_rules": dumped.get("custom_rules", []),
            "process_tunnels": dumped.get("process_tunnels", []),
        },
        "settings": {
            "connect_on_startup": dumped.get("connect_on_startup", False),
            "auto_select_enabled": dumped.get("auto_select_enabled", False),
            "auto_select": dumped.get("auto_select") or AutoSelectSettings().model_dump(),
            "auto_select_in_fallback": dumped.get("auto_select_in_fallback", False),
            "blocked_servers": dumped.get("blocked_servers", []),
            "kill_switch_enabled": dumped.get("kill_switch_enabled", True),
        },
    }


def migrate_auto_select_settings(raw: dict[str, Any] | None) -> AutoSelectSettings:
    """Normalize legacy auto_select (regions / keywords) to the current schema."""
    base = AutoSelectSettings().model_dump()
    if not isinstance(raw, dict):
        return AutoSelectSettings()

    for key in ("ping_min_ms", "ping_max_ms", "countries", "allow_fallback", "auto_return"):
        if key in raw and raw[key] is not None:
            base[key] = raw[key]

    regions = raw.get("regions")
    countries = base.get("countries") or []
    if not isinstance(countries, list):
        countries = []

    if isinstance(regions, list) and regions:
        base["countries"] = sorted(expand_regions(regions, countries))
    elif countries:
        base["countries"] = normalize_country_codes(countries)

    return AutoSelectSettings.model_validate(base)


def validate_settings_section(settings: dict[str, Any]) -> AutoSelectSettings:
    raw = settings.get("auto_select")
    if isinstance(raw, dict):
        return migrate_auto_select_settings(raw)
    return AutoSelectSettings()
