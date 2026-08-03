from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FakeIpRange:
    ipv4: str = "198.18.0.1/16"
    ipv6: str = "fc00::/18"


class FakeIpPool:
    """Local Fake-IP map configuration for the core router engine."""

    DEFAULT = FakeIpRange()

    @classmethod
    def to_mihomo_config(cls, pool: FakeIpRange | None = None) -> dict:
        pool = pool or cls.DEFAULT
        return {
            "enable": True,
            "fake-ip-range": pool.ipv4,
            "fake-ip-filter": [
                "*.lan",
                "*.local",
                "*.localhost",
                "*.home.arpa",
            ],
            "fake-ip-filter-mode": "blacklist",
        }
