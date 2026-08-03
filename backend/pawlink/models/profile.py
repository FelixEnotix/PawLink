from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProtocolType(str, Enum):
    VLESS = "vless"
    SHADOWSOCKS = "shadowsocks"
    HYSTERIA2 = "hysteria2"
    TROJAN = "trojan"
    VMess = "vmess"
    UNKNOWN = "unknown"


class EndpointProfile(BaseModel):
    """Unified internal endpoint profile aggregated from any input format."""

    id: str
    name: str
    protocol: ProtocolType
    host: str
    port: int
    uuid: str | None = None
    password: str | None = None
    tls_sni: str | None = None
    tls_enabled: bool = False
    reality_public_key: str | None = None
    reality_short_id: str | None = None
    network: str | None = None
    flow: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)
    source: str | None = None


class RuleType(str, Enum):
    DOMAIN = "domain"
    DOMAIN_SUFFIX = "domain_suffix"
    DOMAIN_KEYWORD = "domain_keyword"
    DOMAIN_REGEX = "domain_regex"
    GEOIP = "geoip"
    GEOSITE = "geosite"
    IP_CIDR = "ip_cidr"
    PROCESS = "process"


class RoutingRule(BaseModel):
    rule_type: RuleType
    value: str
    action: str = "PROXY"
    priority: int = 0


class ProcessTunnelMode(str, Enum):
    INCLUDE = "include"
    EXCLUDE = "exclude"


class ProcessTunnelEntry(BaseModel):
    executable: str
    mode: ProcessTunnelMode
