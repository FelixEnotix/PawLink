from __future__ import annotations

from pawlink.dns.fake_ip import FakeIpPool
from pawlink.dns.sniffing import SniffingHandler
from pawlink.models.profile import RoutingRule


class DnsPolicyManager:
    """Zero-configuration DNS policy (Module 2) — koala-style fake-ip under TUN."""

    LOCAL_DOMAINS = [
        "localhost",
        "*.local",
        "*.lan",
        "*.home.arpa",
        "*.internal",
    ]

    DEFAULT_REMOTE_DNS = ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"]
    DEFAULT_DIRECT_DNS = ["system", "223.5.5.5", "119.29.29.29"]

    def __init__(
        self,
        remote_dns: list[str] | None = None,
        direct_dns: list[str] | None = None,
    ) -> None:
        self._remote_dns = remote_dns or self.DEFAULT_REMOTE_DNS
        self._direct_dns = direct_dns or self.DEFAULT_DIRECT_DNS

    def build_mihomo_dns_section(
        self,
        *,
        routing_mode: str = "rule",
        tun_enabled: bool = True,
        custom_rules: list[RoutingRule] | None = None,
    ) -> dict:
        _ = custom_rules
        fake_ip = FakeIpPool.to_mihomo_config()
        use_tun_fake_ip = tun_enabled and routing_mode in {"rule", "global"}

        dns: dict = {
            "enable": True,
            "ipv6": False,
            "default-nameserver": ["223.5.5.5", "119.29.29.29"],
            "proxy-server-nameserver": self._remote_dns,
            "direct-nameserver": self._direct_dns,
            "nameserver-policy": {
                domain: self._direct_dns[0] if self._direct_dns else "system"
                for domain in self.LOCAL_DOMAINS
            },
        }

        if use_tun_fake_ip:
            dns["enhanced-mode"] = "fake-ip"
            dns["fake-ip-range"] = fake_ip["fake-ip-range"]
            dns["fake-ip-filter"] = fake_ip["fake-ip-filter"]
            dns["fake-ip-filter-mode"] = fake_ip["fake-ip-filter-mode"]
            dns["nameserver"] = self._remote_dns
            dns["fallback"] = self._remote_dns
            dns["fallback-filter"] = {
                "geoip": True,
                "geoip-code": "CN",
                "ipcidr": ["240.0.0.0/4", "0.0.0.0/32"],
            }
        else:
            dns["enhanced-mode"] = "redir-host"
            dns["nameserver"] = self._direct_dns

        section: dict = {"dns": dns}
        section.update(SniffingHandler.to_mihomo_sniffing(tun_enabled=tun_enabled))
        return section

    def build_singbox_dns_section(self) -> dict:
        return {
            "dns": {
                "servers": [
                    {"tag": "remote", "address": addr, "detour": "proxy"}
                    for addr in self._remote_dns
                ]
                + [
                    {"tag": "direct", "address": addr, "detour": "direct"}
                    for addr in self._direct_dns
                    if addr != "system"
                ],
                "rules": [
                    {"domain_suffix": [".local", ".lan", ".home.arpa"], "server": "direct"},
                ],
                "final": "remote",
                "strategy": "prefer_ipv4",
            }
        }
