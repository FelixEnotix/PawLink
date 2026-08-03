from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from pawlink.models.profile import EndpointProfile, ProcessTunnelEntry, RoutingRule
from pawlink.models.blocked import BlockedServer

RoutingMode = Literal["rule", "global", "direct"]
ConnectionPhase = Literal[
    "disconnected",
    "connecting",
    "connected",
    "no_link",
    "reconnecting",
]


class HealthLevel(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class NodeHealthStatus(BaseModel):
    profile_id: str
    latency_ms: float | None = None
    packet_loss: float = 0.0
    health: HealthLevel = HealthLevel.RED
    last_checked: float | None = None
    is_active: bool = False


class Subscription(BaseModel):
    """Tracked subscription URL with a stable id for UI grouping."""

    id: str
    url: str
    name: str
    added_at: float = 0.0
    last_refreshed: float | None = None


class SubscriptionTrafficStats(BaseModel):
    total_up: int = 0
    total_down: int = 0


DEFAULT_EU_COUNTRIES = [
    "DE", "FR", "NL", "GB", "FI", "SE", "PL", "IT", "ES", "CZ", "AT", "BE",
    "DK", "NO", "IE", "PT", "RO", "HU", "GR", "BG", "SK", "SI", "HR", "RS",
    "LU", "LV", "LT", "EE", "IS", "CH", "UA",
]


class AutoSelectSettings(BaseModel):
    ping_min_ms: int = 60
    ping_max_ms: int = 110
    countries: list[str] = Field(default_factory=list)
    allow_fallback: bool = True
    auto_return: bool = True

    model_config = {"extra": "ignore"}

    @model_validator(mode="after")
    def validate_ping_range(self) -> AutoSelectSettings:
        if self.ping_min_ms > self.ping_max_ms:
            raise ValueError("ping_min_ms must be less than or equal to ping_max_ms")
        return self


class ApplicationState(BaseModel):
    profiles: list[EndpointProfile] = Field(default_factory=list)
    subscriptions: list[Subscription] = Field(default_factory=list)
    active_profile_id: str | None = None
    health_statuses: dict[str, NodeHealthStatus] = Field(default_factory=dict)
    custom_rules: list[RoutingRule] = Field(default_factory=list)
    process_tunnels: list[ProcessTunnelEntry] = Field(default_factory=list)
    auto_select_enabled: bool = False
    auto_select: AutoSelectSettings = Field(default_factory=AutoSelectSettings)
    auto_select_in_fallback: bool = False
    blocked_servers: list[BlockedServer] = Field(default_factory=list)
    connect_on_startup: bool = False
    routing_mode: RoutingMode = "rule"
    kill_switch_enabled: bool = True
    kill_switch_engaged: bool = False
    connection_phase: ConnectionPhase = "disconnected"
    subscription_traffic: dict[str, SubscriptionTrafficStats] = Field(default_factory=dict)
    core_running: bool = False
    core_starting: bool = False
    tun_active: bool = False
    system_proxy_active: bool = False
    core_connected_at: float | None = None
