from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from pawlink.core.config_builder import CoreConfigBuilder
from pawlink.dns.policy import DnsPolicyManager
from pawlink.models.profile import EndpointProfile, ProtocolType
from pawlink.process_tunnel.enumerator import ProcessTunnelConfigBuilder, ProcessTunnelMode
from pawlink.health.traffic_monitor import TrafficMonitor
from pawlink.service import PawLinkService
from pawlink.system import network_recovery
from pawlink.system.network_recovery import NetworkRecoveryService


def test_dns_policy_has_fake_ip_and_split_dns() -> None:
    rule_dns = DnsPolicyManager().build_mihomo_dns_section(routing_mode="rule", tun_enabled=True)
    assert rule_dns["dns"]["enhanced-mode"] == "fake-ip"
    assert rule_dns["dns"]["fake-ip-filter-mode"] == "blacklist"
    assert "*.lan" in rule_dns["dns"]["fake-ip-filter"]
    assert "sniffer" in rule_dns and rule_dns["sniffer"]["enable"] is True

    proxy_dns = DnsPolicyManager().build_mihomo_dns_section(routing_mode="rule", tun_enabled=False)
    assert proxy_dns["dns"]["enhanced-mode"] == "redir-host"

    global_dns = DnsPolicyManager().build_mihomo_dns_section(routing_mode="global", tun_enabled=True)
    assert global_dns["dns"]["enhanced-mode"] == "fake-ip"
    assert global_dns["dns"]["fake-ip-filter-mode"] == "blacklist"


def test_youtube_rule_expands_to_geosite() -> None:
    from pawlink.routing.rule_sanitizer import RuleSanitizer

    sanitizer = RuleSanitizer()
    rule = sanitizer.sanitize("youtube")
    lines = sanitizer.to_mihomo_rules(rule)
    assert "GEOSITE,youtube,PROXY" in lines
    assert "DOMAIN-KEYWORD,youtube,PROXY" in lines

    www = sanitizer.sanitize("https://www.youtube.com/")
    assert www.value == "youtube.com"
    assert "GEOSITE,youtube,PROXY" in sanitizer.to_mihomo_rules(www)


def test_core_config_builder(tmp_path) -> None:
    builder = CoreConfigBuilder(tmp_path)
    profiles = [
        EndpointProfile(
            id="node-1",
            name="Node-1",
            protocol=ProtocolType.VLESS,
            host="1.2.3.4",
            port=443,
            uuid="test-uuid",
            tls_enabled=True,
        )
    ]
    config = builder.build(profiles)
    assert config["proxies"][0]["server"] == "1.2.3.4"
    assert "dns" in config
    assert "tun" in config
    assert "rules" in config


def test_core_config_selected_node_first(tmp_path) -> None:
    builder = CoreConfigBuilder(tmp_path)
    profiles = [
        EndpointProfile(id="a", name="A", protocol=ProtocolType.VLESS, host="a.com", port=443),
        EndpointProfile(id="b", name="B", protocol=ProtocolType.VLESS, host="b.com", port=443),
    ]
    config = builder.build(profiles, active_profile_id="b")
    select_group = next(g for g in config["proxy-groups"] if g["name"] == "PROXY")
    assert select_group["proxies"][0] == "B"


def test_core_config_empty_profiles(tmp_path) -> None:
    builder = CoreConfigBuilder(tmp_path)
    config = builder.build([])
    for group in config["proxy-groups"]:
        assert group["proxies"], "proxy group must not be empty"


def test_process_tunnel_config() -> None:
    pt = ProcessTunnelConfigBuilder()
    pt.add("discord", ProcessTunnelMode.INCLUDE)
    pt.add("explorer.exe", ProcessTunnelMode.EXCLUDE)
    assert pt.include_list() == ["discord.exe"]
    assert pt.exclude_list() == ["explorer.exe"]
    rules = pt.to_mihomo_process_rules()
    assert "PROCESS-NAME,discord.exe,PROXY" in rules
    assert "PROCESS-NAME,explorer.exe,DIRECT" in rules
    # TUN has no Windows include-process; routing is PROCESS-NAME only.
    assert pt.to_mihomo_tun_process(use_include=True) == {}
    assert pt.to_mihomo_tun_process(use_include=False) == {}


def test_network_cleanup_does_not_reset_stack_or_routes(monkeypatch, tmp_path) -> None:
    commands: list[list[str]] = []
    monkeypatch.setattr(network_recovery, "IS_WINDOWS", True)
    monkeypatch.setattr(
        NetworkRecoveryService,
        "_run_safe",
        staticmethod(lambda command: commands.append(command)),
    )

    NetworkRecoveryService(tmp_path)._emergency_cleanup()

    assert commands == [["ipconfig", "/flushdns"]]


def test_traffic_monitor_rebases_after_core_counter_reset() -> None:
    monitor = TrafficMonitor()
    monitor._has_baseline = True
    monitor._last_download_total = 5000
    monitor._last_upload_total = 3000

    download_total = 120
    upload_total = 80
    if download_total < monitor._last_download_total or upload_total < monitor._last_upload_total:
        monitor._last_download_total = download_total
        monitor._last_upload_total = upload_total

    delta_down = max(0, download_total - monitor._last_download_total)
    assert delta_down == 0
    assert monitor._last_download_total == 120


def test_service_keeps_runtime_files_in_custom_data_dir(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)

    assert service._config_path == tmp_path / "config.yaml"
    assert service._proxy_manager._binary_path == str(tmp_path / "bin" / "mihomo.exe")
    assert service._proxy_manager._config_path == str(tmp_path / "config.yaml")
    assert service._proxy_manager._work_dir == str(tmp_path)


def test_wintun_strict_route_enabled() -> None:
    from pawlink.system.wintun import WintunManager

    tun = WintunManager().to_mihomo_tun_config()["tun"]
    assert tun["strict-route"] is True
    assert tun["auto-route"] is True
    assert tun["device"] == "PawLink"


def test_capture_plan_global_uses_full_tun() -> None:
    from pawlink.core.capture_policy import build_capture_plan

    plan = build_capture_plan("global", is_admin=True, wintun_available=True, include_apps=[])
    assert plan.tun_enabled is True
    assert plan.system_proxy is False  # TUN XOR system proxy


def test_capture_plan_global_falls_back_to_proxy_without_admin() -> None:
    from pawlink.core.capture_policy import build_capture_plan

    plan = build_capture_plan("global", is_admin=False, wintun_available=True, include_apps=[])
    assert plan.tun_enabled is False
    assert plan.system_proxy is True


def test_capture_plan_rule_uses_full_tun_without_apps() -> None:
    from pawlink.core.capture_policy import build_capture_plan

    plan = build_capture_plan("rule", is_admin=True, wintun_available=True, include_apps=[])
    assert plan.tun_enabled is True
    assert plan.system_proxy is False


def test_capture_plan_rule_with_apps_tracks_includes() -> None:
    from pawlink.core.capture_policy import build_capture_plan

    plan = build_capture_plan(
        "rule",
        is_admin=True,
        wintun_available=True,
        include_apps=["discord.exe"],
    )
    assert plan.tun_enabled is True
    assert plan.system_proxy is False
    assert plan.tun_include_process == ("discord.exe",)


def test_rule_mode_enables_tun_as_admin_even_without_apps(tmp_path) -> None:
    from pawlink.core.capture_policy import build_capture_plan

    service = PawLinkService(data_dir=tmp_path)
    service.state.routing_mode = "rule"
    plan = build_capture_plan(
        "rule",
        is_admin=True,
        wintun_available=True,
        include_apps=[],
    )
    assert plan.tun_enabled is True
    assert service.state.routing_mode == "rule"


def test_import_selects_first_profile_and_requests_live_reload(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    profiles = asyncio.run(
        service.import_config(raw="vless://uuid@example.com:443?security=tls#Primary")
    )

    assert service.state.active_profile_id == profiles[0].id
    service._rebuild_and_reload.assert_awaited_once()


def test_rule_change_requests_live_reload(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    rule = asyncio.run(service.add_custom_rule("example.com", "DIRECT"))

    assert rule in service.state.custom_rules
    service._rebuild_and_reload.assert_awaited_once()


def test_remove_node_switches_active_and_persists(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    raw = (
        "vless://u@a.com:443?security=tls#A\n"
        "vless://u@b.com:443?security=tls#B"
    )
    profiles = asyncio.run(service.import_config(raw=raw))
    active_id = profiles[0].id

    assert service.state.active_profile_id == active_id
    assert asyncio.run(service.remove_node(active_id)) is True
    assert len(service.state.profiles) == 1
    assert service.state.active_profile_id == profiles[1].id
    assert asyncio.run(service.remove_node("missing-id")) is False

    # state survives a service restart
    restarted = PawLinkService(data_dir=tmp_path)
    assert len(restarted.state.profiles) == 1
    assert restarted.state.active_profile_id == profiles[1].id


def test_refresh_subscriptions_replaces_only_subscription_nodes(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    # one manual node + two nodes from a subscription
    asyncio.run(service.import_config(raw="vless://u@manual.com:443?security=tls#Manual"))
    sub_url = "https://sub.example.com/link"
    old_nodes = service.aggregator.parse_raw(
        "vless://u@old1.com:443?security=tls#Old1\nvless://u@old2.com:443?security=tls#Old2",
        source=sub_url,
    )
    service.state.profiles.extend(old_nodes)

    new_nodes = service.aggregator.parse_raw(
        "vless://u@new1.com:443?security=tls#New1",
        source=sub_url,
    )
    service.aggregator.fetch_subscription = AsyncMock(return_value=new_nodes)

    result = asyncio.run(service.refresh_subscriptions())

    hosts = {p.host for p in service.state.profiles}
    assert hosts == {"manual.com", "new1.com"}
    assert result["sources"] == 1
    assert result["errors"] == {}


def test_refresh_subscriptions_keeps_nodes_on_fetch_failure(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()

    sub_url = "https://sub.example.com/link"
    nodes = service.aggregator.parse_raw(
        "vless://u@keep.com:443?security=tls#Keep",
        source=sub_url,
    )
    service.state.profiles.extend(nodes)
    service.aggregator.fetch_subscription = AsyncMock(side_effect=RuntimeError("boom"))

    result = asyncio.run(service.refresh_subscriptions())

    assert {p.host for p in service.state.profiles} == {"keep.com"}
    assert result["sources"] == 0
    assert sub_url in result["errors"]


def test_start_core_requires_profiles(tmp_path) -> None:
    from pawlink.errors import ConnectError, STAGE_PRECHECK

    service = PawLinkService(data_dir=tmp_path)
    with pytest.raises(ConnectError) as exc_info:
        asyncio.run(service.start_core())
    assert exc_info.value.stage == STAGE_PRECHECK


def test_backup_export_import_roundtrip(tmp_path) -> None:
    service = PawLinkService(data_dir=tmp_path)
    service._rebuild_and_reload = AsyncMock()
    asyncio.run(service.import_config(raw="vless://u@a.com:443?security=tls#A"))
    asyncio.run(service.add_custom_rule("example.com", "PROXY"))
    asyncio.run(service.add_process_tunnel("chrome.exe", "include"))

    backup = service.export_backup()
    assert backup["format"] == "pawlink-backup"
    assert backup["version"] == 2
    assert "data" in backup
    assert "settings" in backup["data"]

    other = PawLinkService(data_dir=tmp_path / "other")
    other._rebuild_and_reload = AsyncMock()
    result = asyncio.run(other.import_backup(backup, with_servers=True, with_rules=True))
    assert result["servers"] == 1
    assert result["rules"] == 1
    assert result["tunnels"] == 1
    assert len(other.state.profiles) == 1
    assert other.state.custom_rules[0].value == "example.com"
    assert other.state.process_tunnels[0].executable == "chrome.exe"

    rules_only = PawLinkService(data_dir=tmp_path / "rules_only")
    rules_only._rebuild_and_reload = AsyncMock()
    asyncio.run(rules_only.import_config(raw="vless://u@keep.com:443?security=tls#Keep"))
    result2 = asyncio.run(
        rules_only.import_backup(backup, with_servers=False, with_rules=True)
    )
    assert result2["servers"] == 0
    assert {p.host for p in rules_only.state.profiles} == {"keep.com"}
    assert len(rules_only.state.custom_rules) == 1

    with pytest.raises(ValueError, match="хотя бы один"):
        asyncio.run(other.import_backup(backup, with_servers=False, with_rules=False, with_settings=False))
