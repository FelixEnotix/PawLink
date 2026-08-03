from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from pawlink.backup import BACKUP_VERSION, normalize_backup_data
from pawlink.models.state import AutoSelectSettings
from pawlink.service import PawLinkService


def test_normalize_v1_flat_backup() -> None:
    payload = {
        "format": "pawlink-backup",
        "version": 1,
        "data": {
            "profiles": [],
            "auto_select_enabled": True,
            "auto_select": {"ping_min_ms": 70, "ping_max_ms": 120},
        },
    }
    sections = normalize_backup_data(payload)
    assert sections["settings"]["auto_select_enabled"] is True
    assert sections["settings"]["auto_select"]["ping_min_ms"] == 70


def test_normalize_v2_sectioned_backup() -> None:
    payload = {
        "data": {
            "servers": {"profiles": [{"id": "1"}]},
            "routing": {"routing_mode": "global"},
            "settings": {
                "connect_on_startup": True,
                "auto_select": AutoSelectSettings(ping_min_ms=55).model_dump(),
            },
        }
    }
    sections = normalize_backup_data(payload)
    assert sections["routing"]["routing_mode"] == "global"
    assert sections["settings"]["auto_select"]["ping_min_ms"] == 55


def test_export_backup_v2_sections(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service.state.auto_select = AutoSelectSettings(ping_min_ms=65, ping_max_ms=105)
    service.state.auto_select_enabled = True

    backup = service.export_backup()

    assert backup["version"] == BACKUP_VERSION
    assert "servers" in backup["data"]
    assert "routing" in backup["data"]
    assert "settings" in backup["data"]
    assert backup["data"]["settings"]["auto_select"]["ping_min_ms"] == 65


def test_import_settings_only(tmp_path) -> None:
    source = PawLinkService(data_dir=tmp_path / "src")
    source.state.auto_select = AutoSelectSettings(
        ping_min_ms=80, ping_max_ms=100, countries=["US", "CA"]
    )
    source.state.connect_on_startup = True
    backup = source.export_backup()

    target = PawLinkService(data_dir=tmp_path / "dst")
    target._rebuild_and_reload = AsyncMock()
    target.state.auto_select = AutoSelectSettings()
    target.state.connect_on_startup = False

    result = asyncio.run(
        target.import_backup(backup, with_servers=False, with_rules=False, with_settings=True)
    )

    assert result["settings"] is True
    assert target.state.connect_on_startup is True
    assert target.state.auto_select.ping_min_ms == 80
    assert set(target.state.auto_select.countries) == {"US", "CA"}


def test_import_legacy_regions_in_backup(tmp_path) -> None:
    payload = {
        "data": {
            "servers": {"profiles": []},
            "routing": {"routing_mode": "rule", "custom_rules": [], "process_tunnels": []},
            "settings": {
                "auto_select": {
                    "ping_min_ms": 60,
                    "ping_max_ms": 110,
                    "regions": ["US"],
                    "allow_keywords": ["premium"],
                }
            },
        }
    }
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    asyncio.run(service.import_backup(payload, with_settings=True, with_servers=False, with_rules=False))

    assert "US" in service.state.auto_select.countries
    assert "CA" in service.state.auto_select.countries


def test_import_v1_backup_auto_select_defaults(tmp_path) -> None:
    v1 = {
        "data": {
            "profiles": [],
            "auto_select_enabled": True,
        }
    }
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    asyncio.run(service.import_backup(v1, with_settings=True, with_servers=False, with_rules=False))

    assert service.state.auto_select_enabled is True
    assert service.state.auto_select.ping_min_ms == 60
    # Legacy backups without the field keep the safe default.
    assert service.state.kill_switch_enabled is True


def test_kill_switch_backup_round_trip(tmp_path) -> None:
    source = PawLinkService(data_dir=tmp_path / "src")
    source.state.kill_switch_enabled = False
    backup = source.export_backup()
    assert backup["data"]["settings"]["kill_switch_enabled"] is False

    target = PawLinkService(data_dir=tmp_path / "dst")
    target._rebuild_and_reload = AsyncMock()
    target.state.kill_switch_enabled = True
    target.state.kill_switch_engaged = True

    asyncio.run(
        target.import_backup(backup, with_servers=False, with_rules=False, with_settings=True)
    )

    assert target.state.kill_switch_enabled is False
    assert target.state.kill_switch_engaged is False
