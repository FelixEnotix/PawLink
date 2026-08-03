from __future__ import annotations

import ipaddress
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import yaml
from pawlink.dns.policy import DnsPolicyManager
from pawlink.models.profile import EndpointProfile, RoutingRule
from pawlink.models.state import RoutingMode, Subscription
from pawlink.process_tunnel.enumerator import ProcessTunnelConfigBuilder
from pawlink.routing.geo_sync import GeoDatabaseSyncService
from pawlink.routing.rule_sanitizer import RuleSanitizer
from pawlink.system.wintun import WintunManager


class CoreConfigBuilder:
    """Assembles a complete Mihomo/Clash Meta configuration from backend state."""

    def __init__(
        self,
        data_dir: str | Path,
        mixed_port: int = 7890,
        external_controller: str = "127.0.0.1:9090",
    ) -> None:
        self._data_dir = Path(data_dir)
        self._mixed_port = mixed_port
        self._external_controller = external_controller
        self._dns = DnsPolicyManager()
        self._wintun = WintunManager()
        self._geo = GeoDatabaseSyncService(self._data_dir)
        self._sanitizer = RuleSanitizer()

    @property
    def mixed_port(self) -> int:
        return self._mixed_port

    @property
    def controller_url(self) -> str:
        return f"http://{self._external_controller}"

    @property
    def controller_port(self) -> int:
        host_port = self._external_controller.rsplit(":", 1)
        if len(host_port) != 2:
            return 9090
        try:
            return int(host_port[1])
        except ValueError:
            return 9090

    def set_runtime_ports(
        self,
        *,
        mixed_port: int,
        controller_port: int,
        controller_host: str = "127.0.0.1",
    ) -> None:
        self._mixed_port = mixed_port
        self._external_controller = f"{controller_host}:{controller_port}"

    def build(
        self,
        profiles: list[EndpointProfile],
        *,
        active_profile_id: str | None = None,
        custom_rules: list[RoutingRule] | None = None,
        process_tunnel: ProcessTunnelConfigBuilder | None = None,
        tun_enabled: bool = True,
        routing_mode: RoutingMode = "rule",
        subscriptions: list[Subscription] | None = None,
        kill_switch_engaged: bool = False,
    ) -> dict[str, Any]:
        proxies = [self._profile_to_proxy(p) for p in profiles]
        proxy_names = [p["name"] for p in proxies]

        selected = active_profile_id or (profiles[0].id if profiles else None)
        selected_name = next(
            (p.name for p in profiles if p.id == selected),
            proxy_names[0] if proxy_names else None,
        )

        select_proxies = list(proxy_names)
        if selected_name and selected_name in select_proxies:
            select_proxies.remove(selected_name)
            select_proxies.insert(0, selected_name)

        # Soft kill switch: PROXY outbound becomes REJECT so rule-mode DIRECT
        # (MATCH/private/EXCLUDE) keeps working while proxied traffic is blocked.
        if kill_switch_engaged:
            select_proxies = ["REJECT"]

        proxy_groups = self._build_subscription_groups(
            profiles,
            subscriptions or [],
            select_proxies,
        )

        config: dict[str, Any] = {
            "mixed-port": self._mixed_port,
            "allow-lan": False,
            # Always use rule engine so MATCH/PROXY bypass + process rules work.
            # Native mode:global would ignore bypass rules and can loop the dial.
            "mode": "rule",
            # Required for PROCESS-NAME rules (koala / FlClash / clash-verge default).
            "find-process-mode": "always",
            "log-level": "info",
            "external-controller": self._external_controller,
            "unified-delay": True,
            "tcp-concurrent": True,
            "proxies": proxies,
            "proxy-groups": proxy_groups,
        }

        dns_section = self._dns.build_mihomo_dns_section(
            routing_mode=routing_mode,
            tun_enabled=tun_enabled,
            custom_rules=custom_rules,
        )
        config.update(dns_section)

        # TUN requires wintun.dll and admin rights; without them mihomo would
        # refuse to start, so fall back to plain mixed-port proxy mode.
        # Windows process split is done via PROCESS-NAME rules — mihomo TUN has
        # no include-process (only Android include-package).
        if tun_enabled:
            config.update(self._wintun.to_mihomo_tun_config(split_tunnel=routing_mode == "rule"))

        geodata = {
            "geox-url": {
                "geosite": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
                "geoip": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
            },
            "geodata-mode": True,
        }
        config.update(geodata)

        rules: list[str] = []
        # Emit process rules whenever TUN can see OS traffic. In global mode,
        # INCLUDE is redundant with MATCH,PROXY but EXCLUDE (DIRECT) still matters.
        if process_tunnel and tun_enabled:
            rules.extend(process_tunnel.to_mihomo_process_rules())
        if routing_mode == "rule":
            for rule in custom_rules or []:
                # Expand youtube/google/… into GEOSITE so CDNs (googlevideo, ytimg)
                # follow the same PROXY path — koala-style site categories.
                rules.extend(self._sanitizer.to_mihomo_rules(rule))
        rules.extend(self._proxy_bypass_rules(profiles))
        if routing_mode == "rule":
            rules.append("GEOIP,private,DIRECT,no-resolve")
            rules.append("MATCH,DIRECT")
        elif routing_mode == "global":
            rules.append("GEOIP,private,DIRECT,no-resolve")
            # Global KS: block all non-private traffic; bypass rules above keep
            # dials to VPN servers on DIRECT so recovery stays possible.
            rules.append("MATCH,REJECT" if kill_switch_engaged else "MATCH,PROXY")
        else:
            rules.append("MATCH,DIRECT")
        config["rules"] = rules

        config["profile"] = {"store-selected": True, "store-fake-ip": True}
        return config

    @staticmethod
    def _proxy_bypass_rules(profiles: list[EndpointProfile]) -> list[str]:
        """Keep outbound connections to VPN servers on DIRECT.

        Without this, global mode (MATCH,PROXY) routes even the proxy dial
        through PROXY and breaks connectivity, delay tests (502), and traffic.
        """
        rules: list[str] = []
        seen: set[str] = set()
        for profile in profiles:
            host = (profile.host or "").strip().lower()
            if not host:
                continue
            try:
                ipaddress.ip_address(host)
                line = f"IP-CIDR,{host}/32,DIRECT,no-resolve"
            except ValueError:
                exact = f"DOMAIN,{host},DIRECT,no-resolve"
                if exact not in seen:
                    seen.add(exact)
                    rules.append(exact)
                line = f"DOMAIN-SUFFIX,{host},DIRECT,no-resolve"
            if line not in seen:
                seen.add(line)
                rules.append(line)
        return rules

    @staticmethod
    def _build_subscription_groups(
        profiles: list[EndpointProfile],
        subscriptions: list[Subscription],
        select_proxies: list[str],
    ) -> list[dict[str, Any]]:
        """One Mihomo select-group per subscription; manual imports in a separate group."""
        sub_names = {s.id: s.name for s in subscriptions}
        by_source: dict[str, list[str]] = defaultdict(list)
        for profile in profiles:
            if profile.source and profile.source.startswith(("http://", "https://")):
                sub_id = next(
                    (s.id for s in subscriptions if s.url == profile.source),
                    profile.source,
                )
                group_key = sub_id
            else:
                group_key = "__manual__"
            by_source[group_key].append(profile.name)

        groups: list[dict[str, Any]] = [
            {
                "name": "PROXY",
                "type": "select",
                "proxies": select_proxies or ["DIRECT"],
            },
            {
                "name": "Auto-Select",
                "type": "url-test",
                "proxies": [p.name for p in profiles] or ["DIRECT"],
                "url": "http://www.gstatic.com/generate_204",
                "interval": 300,
                "tolerance": 50,
            },
        ]

        for key, names in by_source.items():
            if not names:
                continue
            if key == "__manual__":
                label = "Ручной импорт"
            elif key in sub_names:
                label = sub_names[key]
            else:
                label = CoreConfigBuilder._source_label(key)
            groups.append(
                {
                    "name": label,
                    "type": "select",
                    "proxies": names,
                }
            )
        return groups

    @staticmethod
    def _source_label(source: str) -> str:
        if source.startswith(("http://", "https://")):
            host = urlparse(source).hostname or source
            return host[:48]
        return source[:48] or "Подписка"

    def write(self, config: dict[str, Any], path: str | Path) -> Path:
        dest = Path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(yaml.dump(config, allow_unicode=True, default_flow_style=False), encoding="utf-8")
        return dest

    @staticmethod
    def _profile_to_proxy(profile: EndpointProfile) -> dict[str, Any]:
        type_map = {
            "vless": "vless",
            "shadowsocks": "ss",
            "hysteria2": "hysteria2",
            "trojan": "trojan",
            "vmess": "vmess",
        }
        extra = profile.extra or {}
        params = extra.get("params") or {}
        proxy: dict[str, Any] = {
            "name": profile.name,
            "type": type_map.get(profile.protocol.value, profile.protocol.value),
            "server": profile.host,
            "port": profile.port,
            "udp": True,
        }
        if profile.uuid:
            proxy["uuid"] = profile.uuid
        if profile.password:
            proxy["password"] = profile.password
        if profile.tls_enabled:
            proxy["tls"] = True
        if profile.tls_sni:
            proxy["sni"] = profile.tls_sni
        if profile.network:
            proxy["network"] = profile.network
        if profile.flow:
            proxy["flow"] = profile.flow
        if profile.reality_public_key:
            proxy["reality-opts"] = {
                "public-key": profile.reality_public_key,
                "short-id": profile.reality_short_id or "",
            }
            # Reality connections are rejected by servers without a browser
            # TLS fingerprint; "chrome" is the de-facto safe default.
            proxy["client-fingerprint"] = (
                params.get("fp") or extra.get("client-fingerprint") or "chrome"
            )

        # Shadowsocks method: URI parsers store it as "method",
        # Clash configs as "cipher" (normalized to "method" on parse).
        method = extra.get("method") or extra.get("cipher")
        if method:
            proxy["cipher"] = method

        if profile.protocol.value == "vmess":
            proxy.setdefault("cipher", "auto")
            proxy["alterId"] = int(extra.get("alterId") or 0)

        CoreConfigBuilder._apply_transport_opts(proxy, profile, extra, params)
        return proxy

    @staticmethod
    def _apply_transport_opts(
        proxy: dict[str, Any],
        profile: EndpointProfile,
        extra: dict[str, Any],
        params: dict[str, Any],
    ) -> None:
        """Carry ws/grpc transport parameters into the mihomo proxy entry."""
        if profile.network == "ws":
            ws_opts: dict[str, Any] = {}
            existing = extra.get("ws-opts")
            if isinstance(existing, dict):
                ws_opts.update(existing)
            path = ws_opts.get("path") or params.get("path")
            if path:
                ws_opts["path"] = unquote(str(path))
            headers = dict(ws_opts.get("headers") or {})
            host_header = (
                headers.get("Host")
                or params.get("host")
                or profile.tls_sni
                or profile.host
            )
            if host_header:
                headers["Host"] = str(host_header)
                ws_opts["headers"] = headers
            if ws_opts:
                proxy["ws-opts"] = ws_opts
        elif profile.network == "grpc":
            grpc_opts: dict[str, Any] = {}
            existing = extra.get("grpc-opts")
            if isinstance(existing, dict):
                grpc_opts.update(existing)
            service_name = grpc_opts.get("grpc-service-name") or params.get("serviceName")
            if service_name:
                grpc_opts["grpc-service-name"] = unquote(str(service_name))
            if grpc_opts:
                proxy["grpc-opts"] = grpc_opts
