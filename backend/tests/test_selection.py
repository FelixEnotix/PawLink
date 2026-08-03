from __future__ import annotations

from pawlink.health.selection import NodeSelector, is_profile_blocked
from pawlink.models.blocked import BlockedServer
from pawlink.models.profile import EndpointProfile, ProtocolType
from pawlink.models.state import AutoSelectSettings, HealthLevel, NodeHealthStatus


def _profile(pid: str, name: str) -> EndpointProfile:
    return EndpointProfile(
        id=pid,
        name=name,
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )


def _status(pid: str, latency: float, health: HealthLevel = HealthLevel.GREEN) -> NodeHealthStatus:
    return NodeHealthStatus(profile_id=pid, latency_ms=latency, health=health)


def test_selects_server_in_ping_and_country() -> None:
    selector = NodeSelector()
    profiles = [
        _profile("us", "US New York"),
        _profile("de", "DE Frankfurt"),
    ]
    statuses = {
        "us": _status("us", 40.0),
        "de": _status("de", 85.0),
    }
    settings = AutoSelectSettings(ping_min_ms=60, ping_max_ms=110, countries=["DE"])

    result = selector.select(profiles, statuses, settings, [])

    assert result.profile_id == "de"
    assert result.matched_criteria is True


def test_empty_countries_allows_any_geo() -> None:
    selector = NodeSelector()
    profiles = [_profile("us", "US New York")]
    statuses = {"us": _status("us", 80.0)}
    settings = AutoSelectSettings(ping_min_ms=60, ping_max_ms=110, countries=[])

    result = selector.select(profiles, statuses, settings, [])

    assert result.profile_id == "us"


def test_blocked_server_is_excluded() -> None:
    profile = _profile("de", "DE Frankfurt")
    blocked = [
        BlockedServer(id="b1", name=profile.name, host=profile.host, port=profile.port, profile_id=profile.id)
    ]
    assert is_profile_blocked(profile, blocked) is True

    selector = NodeSelector()
    statuses = {"de": _status("de", 85.0)}
    settings = AutoSelectSettings(ping_min_ms=60, ping_max_ms=110, countries=["DE"])

    result = selector.select([profile], statuses, settings, blocked)

    assert result.profile_id is None


def test_offers_fallback_prompt_when_no_match() -> None:
    selector = NodeSelector()
    profiles = [_profile("us", "US New York")]
    statuses = {"us": _status("us", 40.0)}
    settings = AutoSelectSettings(ping_min_ms=60, ping_max_ms=110, countries=["DE"])

    result = selector.select(profiles, statuses, settings, [])

    assert result.needs_fallback_prompt is True
    assert result.fallback_profile_id == "us"
