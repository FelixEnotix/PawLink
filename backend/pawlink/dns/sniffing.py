from __future__ import annotations


class SniffingHandler:
    """Realtime traffic inspection for fake-ip → domain recovery (mihomo sniffer)."""

    @staticmethod
    def to_mihomo_sniffing(*, tun_enabled: bool = False) -> dict:
        """Emit the official ``sniffer`` block (koala / clash-verge schema).

        Older PawLink used a non-existent top-level ``sniff`` key, so mihomo
        logged ``Sniffer is closed`` and fake-ip TUN destinations never recovered.
        """
        return {
            "sniffer": {
                "enable": True,
                "parse-pure-ip": True,
                "force-dns-mapping": True,
                "override-destination": bool(tun_enabled),
                "sniff": {
                    "HTTP": {
                        "ports": [80, 443],
                        "override-destination": True,
                    },
                    "TLS": {
                        "ports": [443],
                    },
                    "QUIC": {
                        "ports": [443],
                    },
                },
                "skip-domain": ["+.push.apple.com"],
            }
        }

    @staticmethod
    def to_mihomo_tun_sniff() -> dict:
        return {
            "sniff": True,
            "sniff-override-destination": True,
        }
