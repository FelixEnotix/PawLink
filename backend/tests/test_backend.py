from __future__ import annotations

import asyncio

import httpx
import pytest

from pawlink.api import app
from pawlink.config.aggregator import ConfigAggregator
from pawlink.routing.rule_sanitizer import RuleSanitizer


class TestConfigAggregator:
    def setup_method(self) -> None:
        self.aggregator = ConfigAggregator()

    def test_parse_vless_uri(self) -> None:
        raw = "vless://uuid-here@example.com:443?security=tls&sni=example.com#TestNode"
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "example.com"
        assert profiles[0].port == 443
        assert profiles[0].tls_sni == "example.com"

    def test_parse_clash_yaml(self) -> None:
        raw = """
proxies:
  - name: test-ss
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: secret
"""
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "1.2.3.4"
        assert profiles[0].password == "secret"

    def test_skip_cert_verify_false_does_not_enable_tls(self) -> None:
        raw = """
proxies:
  - name: plain-ss
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: secret
    skip-cert-verify: false
"""
        profiles = self.aggregator.parse_raw(raw)

        assert profiles[0].tls_enabled is False

    def test_parse_hysteria2_uri(self) -> None:
        raw = "hysteria2://auth@hy2.example.com:443?sni=hy2.example.com#Hy2Node"
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "hy2.example.com"

    def test_parse_ss_sip002_base64(self) -> None:
        import base64

        userinfo = base64.urlsafe_b64encode(b"aes-256-gcm:secretpass").decode().rstrip("=")
        raw = f"ss://{userinfo}@1.2.3.4:8388#SS-Node"
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "1.2.3.4"
        assert profiles[0].port == 8388
        assert profiles[0].password == "secretpass"
        assert profiles[0].extra["method"] == "aes-256-gcm"

    def test_parse_ss_plain_userinfo(self) -> None:
        raw = "ss://method-test:plainpass@5.6.7.8:9999#Plain"
        profiles = self.aggregator.parse_raw(raw)
        assert profiles[0].password == "plainpass"
        assert profiles[0].extra["method"] == "method-test"

    def test_base64_bundle_of_uris(self) -> None:
        import base64

        bundle = "vless://uid@a.com:443?security=tls#A\nhysteria2://auth@b.com:443#B"
        encoded = base64.b64encode(bundle.encode()).decode()
        profiles = self.aggregator.parse_raw(encoded)
        assert len(profiles) == 2
        hosts = {p.host for p in profiles}
        assert hosts == {"a.com", "b.com"}


class TestRuleSanitizer:
    def setup_method(self) -> None:
        self.sanitizer = RuleSanitizer()

    def test_url_to_domain(self) -> None:
        rule = self.sanitizer.sanitize("https://www.example.com/path?q=1")
        assert rule.rule_type.value == "domain_suffix"
        assert rule.value == "example.com"  # www. stripped for DOMAIN-SUFFIX

    def test_keyword(self) -> None:
        rule = self.sanitizer.sanitize("google")
        assert rule.rule_type.value == "domain_keyword"
        assert rule.value == "google"

    def test_fqdn(self) -> None:
        rule = self.sanitizer.sanitize("cdn.example.org")
        assert rule.rule_type.value == "domain_suffix"
        assert rule.value == "cdn.example.org"

    def test_wildcard_keyword(self) -> None:
        rule = self.sanitizer.sanitize("*.netflix.com")
        assert rule.rule_type.value == "domain_keyword"
        assert rule.value == "netflix.com"

    def test_exe_process_rule(self) -> None:
        rule = self.sanitizer.sanitize("chrome.exe", "DIRECT")
        assert rule.rule_type.value == "process"
        assert rule.value == "chrome.exe"
        assert rule.action == "DIRECT"


class TestHiddifyStyleImport:
    """Any pasted link or bundle must import directly, like in Hiddify."""

    def setup_method(self) -> None:
        self.aggregator = ConfigAggregator()

    def test_mixed_multiline_uri_list(self) -> None:
        import base64

        ss_userinfo = base64.urlsafe_b64encode(b"aes-256-gcm:pw").decode().rstrip("=")
        raw = "\n".join(
            [
                "vless://uid@a.com:443?security=tls#A",
                f"ss://{ss_userinfo}@b.com:8388#B",
                "trojan://pass@c.com:443?sni=c.com#C",
                "hy2://auth@d.com:443#D",
            ]
        )
        profiles = self.aggregator.parse_raw(raw)
        assert {p.host for p in profiles} == {"a.com", "b.com", "c.com", "d.com"}

    def test_vmess_uri(self) -> None:
        import base64
        import json

        payload = {
            "v": "2",
            "ps": "VM-Node",
            "add": "e.com",
            "port": "443",
            "id": "uuid-1",
            "aid": "0",
            "net": "ws",
            "host": "cdn.e.com",
            "path": "/ws",
            "tls": "tls",
        }
        raw = "vmess://" + base64.b64encode(json.dumps(payload).encode()).decode()
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "e.com"
        assert profiles[0].uuid == "uuid-1"
        assert profiles[0].network == "ws"
        assert profiles[0].tls_enabled is True

    def test_line_wrapped_base64_subscription(self) -> None:
        import base64

        bundle = (
            "vless://uid@a.com:443?security=tls#A\n"
            "vless://uid@b.com:443?security=tls#B"
        )
        encoded = base64.b64encode(bundle.encode()).decode()
        wrapped = "\n".join(encoded[i : i + 16] for i in range(0, len(encoded), 16))
        profiles = self.aggregator.parse_raw(wrapped)
        assert len(profiles) == 2

    def test_same_name_different_endpoints_get_unique_ids(self) -> None:
        raw = "vless://u@a.com:443?security=tls#Node\nvless://u@b.com:443?security=tls#Node"
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 2
        assert profiles[0].id != profiles[1].id

    def test_broken_line_does_not_fail_whole_import(self) -> None:
        raw = "vless://u@a.com:443?security=tls#OK\nvmess://%%%not-base64%%%"
        profiles = self.aggregator.parse_raw(raw)
        assert len(profiles) == 1
        assert profiles[0].host == "a.com"


class TestCoreConfigFixes:
    def test_ss_from_clash_yaml_keeps_cipher(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder

        raw = """
proxies:
  - name: test-ss
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: secret
"""
        profiles = ConfigAggregator().parse_raw(raw)
        config = CoreConfigBuilder(tmp_path).build(profiles)
        proxy = config["proxies"][0]
        assert proxy["cipher"] == "aes-256-gcm"
        assert proxy["password"] == "secret"

    def test_vless_ws_transport_options_carried_over(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder

        raw = "vless://uid@a.com:443?security=tls&type=ws&path=%2Fws&host=cdn.a.com#WS"
        profiles = ConfigAggregator().parse_raw(raw)
        config = CoreConfigBuilder(tmp_path).build(profiles)
        proxy = config["proxies"][0]
        assert proxy["network"] == "ws"
        assert proxy["ws-opts"]["path"] == "/ws"
        assert proxy["ws-opts"]["headers"]["Host"] == "cdn.a.com"

    def test_reality_gets_client_fingerprint(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder

        raw = "vless://uid@a.com:443?security=reality&pbk=key&sid=abc&fp=firefox#R"
        profiles = ConfigAggregator().parse_raw(raw)
        config = CoreConfigBuilder(tmp_path).build(profiles)
        proxy = config["proxies"][0]
        assert proxy["reality-opts"]["public-key"] == "key"
        assert proxy["client-fingerprint"] == "firefox"

    def test_tun_disabled_falls_back_to_mixed_port(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder

        config = CoreConfigBuilder(tmp_path).build([], tun_enabled=False)
        assert "tun" not in config
        assert config["mixed-port"] == 7890

    def test_global_mode_uses_match_proxy(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder
        from pawlink.models.profile import EndpointProfile, ProtocolType

        profiles = [
            EndpointProfile(
                id="node-1",
                name="Node-1",
                protocol=ProtocolType.VLESS,
                host="1.2.3.4",
                port=443,
            )
        ]
        config = CoreConfigBuilder(tmp_path).build(profiles, routing_mode="global")
        assert config["mode"] == "rule"
        assert config["find-process-mode"] == "always"
        assert config["rules"] == [
            "IP-CIDR,1.2.3.4/32,DIRECT,no-resolve",
            "GEOIP,private,DIRECT,no-resolve",
            "MATCH,PROXY",
        ]
        assert config["tun"]["enable"] is True
        assert config["tun"]["strict-route"] is True
        assert "include-process" not in config["tun"]

    def test_rule_mode_only_routes_explicit_rules(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder
        from pawlink.models.profile import RoutingRule, RuleType
        from pawlink.process_tunnel.enumerator import ProcessTunnelConfigBuilder, ProcessTunnelMode

        rules = [
            RoutingRule(rule_type=RuleType.DOMAIN_SUFFIX, value="youtube.com", action="PROXY"),
        ]
        pt = ProcessTunnelConfigBuilder()
        pt.add("discord.exe", ProcessTunnelMode.INCLUDE)
        config = CoreConfigBuilder(tmp_path).build(
            [],
            routing_mode="rule",
            custom_rules=rules,
            process_tunnel=pt,
        )
        assert config["find-process-mode"] == "always"
        assert config["rules"][0] == "PROCESS-NAME,discord.exe,PROXY"
        assert "GEOSITE,youtube,PROXY" in config["rules"]
        assert "DOMAIN-SUFFIX,youtube.com,PROXY" in config["rules"]
        assert config["rules"][-2:] == [
            "GEOIP,private,DIRECT,no-resolve",
            "MATCH,DIRECT",
        ]
        # Windows app split is PROCESS-NAME rules, not tun.include-process
        # (mihomo only has Android include-package).
        assert "include-process" not in config["tun"]
        assert config["tun"]["enable"] is True
        assert config["dns"]["fake-ip-filter-mode"] == "blacklist"

        global_cfg = CoreConfigBuilder(tmp_path).build(
            [],
            routing_mode="global",
            custom_rules=rules,
            process_tunnel=pt,
        )
        # Global: full TUN, no domain custom rules, MATCH,PROXY.
        assert "include-process" not in global_cfg.get("tun", {})
        assert global_cfg["tun"]["enable"] is True
        assert "DOMAIN-SUFFIX,youtube.com,PROXY" not in global_cfg["rules"]
        assert global_cfg["rules"][-1] == "MATCH,PROXY"

    def test_kill_switch_rule_mode_proxy_becomes_reject(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder
        from pawlink.models.profile import EndpointProfile, ProtocolType, RoutingRule, RuleType

        profiles = [
            EndpointProfile(
                id="node-1",
                name="Node-1",
                protocol=ProtocolType.VLESS,
                host="1.2.3.4",
                port=443,
            )
        ]
        rules = [
            RoutingRule(rule_type=RuleType.DOMAIN_SUFFIX, value="youtube.com", action="PROXY"),
        ]
        config = CoreConfigBuilder(tmp_path).build(
            profiles,
            routing_mode="rule",
            custom_rules=rules,
            kill_switch_engaged=True,
        )
        proxy_group = next(g for g in config["proxy-groups"] if g["name"] == "PROXY")
        assert proxy_group["proxies"] == ["REJECT"]
        assert "MATCH,DIRECT" in config["rules"]
        assert config["rules"][-1] == "MATCH,DIRECT"
        assert "IP-CIDR,1.2.3.4/32,DIRECT,no-resolve" in config["rules"]

    def test_kill_switch_global_mode_match_reject(self, tmp_path) -> None:
        from pawlink.core.config_builder import CoreConfigBuilder
        from pawlink.models.profile import EndpointProfile, ProtocolType

        profiles = [
            EndpointProfile(
                id="node-1",
                name="Node-1",
                protocol=ProtocolType.VLESS,
                host="1.2.3.4",
                port=443,
            )
        ]
        config = CoreConfigBuilder(tmp_path).build(
            profiles,
            routing_mode="global",
            kill_switch_engaged=True,
        )
        assert config["rules"][-1] == "MATCH,REJECT"
        assert "GEOIP,private,DIRECT,no-resolve" in config["rules"]
        assert "IP-CIDR,1.2.3.4/32,DIRECT,no-resolve" in config["rules"]


def test_connection_phase_mapping() -> None:
    from pawlink.models.state import ApplicationState, HealthLevel, NodeHealthStatus
    from pawlink.service import PawLinkService

    def _supervisor(*, recovering: bool = False, paused: bool = False):
        return type(
            "S",
            (),
            {"_recovering": recovering, "recovery_paused": paused},
        )()

    svc = PawLinkService.__new__(PawLinkService)
    svc.state = ApplicationState()
    svc._vpn_desired = False
    svc._core_restarting = False
    svc._core_supervisor = _supervisor()

    svc.state.core_running = False
    svc.state.core_starting = False
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "disconnected"

    svc.state.core_starting = True
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "connecting"

    svc.state.core_starting = False
    svc.state.core_running = True
    svc.state.active_profile_id = "n1"
    svc.state.health_statuses = {}
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "connecting"

    svc.state.health_statuses = {
        "n1": NodeHealthStatus(
            profile_id="n1",
            latency_ms=80.0,
            packet_loss=0.0,
            health=HealthLevel.GREEN,
            last_checked=1.0,
        )
    }
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "connected"

    svc.state.kill_switch_engaged = True
    svc.state.kill_switch_enabled = True
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "no_link"

    # Disabled KS must not force no_link from a stale engaged flag.
    svc.state.kill_switch_enabled = False
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "connected"

    svc.state.kill_switch_enabled = True
    svc.state.kill_switch_engaged = False
    svc.state.health_statuses["n1"] = NodeHealthStatus(
        profile_id="n1",
        latency_ms=None,
        packet_loss=1.0,
        health=HealthLevel.RED,
        last_checked=2.0,
    )
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "no_link"

    svc._core_supervisor = _supervisor(recovering=True)
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "reconnecting"

    # VPN desired but core crashed — show reconnecting, not "disconnected".
    svc._core_supervisor = _supervisor()
    svc._vpn_desired = True
    svc.state.core_running = False
    svc.state.core_starting = False
    svc.state.kill_switch_engaged = False
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "reconnecting"

    # Auto-recovery rate-limit hit — honest no_link until cooldown / user retry.
    svc._core_supervisor = _supervisor(paused=True)
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "no_link"

    # Pause wins even if core_running is still true (stale / hung process).
    svc.state.core_running = True
    svc._refresh_connection_phase()
    assert svc.state.connection_phase == "no_link"


def test_api_token_protects_local_backend(monkeypatch) -> None:
    monkeypatch.setenv("PAWLINK_API_TOKEN", "test-secret")

    async def exercise_api() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            unauthorized = await client.get("/api/health")
            authorized = await client.get(
                "/api/health",
                headers={"X-PawLink-Token": "test-secret"},
            )
            arbitrary_file = await client.post(
                "/api/config/import",
                headers={"X-PawLink-Token": "test-secret"},
                json={"file_path": "C:\\Windows\\System32\\drivers\\etc\\hosts"},
            )
            invalid_action = await client.post(
                "/api/rules",
                headers={"X-PawLink-Token": "test-secret"},
                json={"input": "example.com", "action": "INVALID"},
            )

        assert unauthorized.status_code == 401
        assert authorized.status_code == 200
        assert arbitrary_file.status_code == 422
        assert invalid_action.status_code == 422

    asyncio.run(exercise_api())
