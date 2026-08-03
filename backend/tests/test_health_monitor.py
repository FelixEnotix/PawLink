from __future__ import annotations

import asyncio

from pawlink.health.latency_probe import LatencyProbeService
from pawlink.health.monitor import NodeHealthMonitor
from pawlink.models.profile import EndpointProfile, ProtocolType


def test_core_running_uses_mihomo_url_test(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)
    monitor.set_controller_url("http://127.0.0.1:9090")

    calls: list[str] = []

    async def fake_controller(_url, name, *, fast=False, samples=None):
        calls.append(name)
        return 142.0, 0.0

    async def fake_direct(_host, _port, *, fast=False):
        raise AssertionError("direct should not run when URL-test succeeds")

    monkeypatch.setattr(probe, "probe_via_controller", fake_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )
    monitor.set_profiles([profile])

    status = asyncio.run(monitor.check_one(profile))

    assert calls == ["Node-DE"]
    assert status.latency_ms == 142.0


def test_vpn_off_uses_direct_tcp(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)

    async def fake_controller(*_args, **_kwargs):
        raise AssertionError("controller should not run when core is off")

    async def fake_direct(_host, _port, *, fast=False):
        return 88.0, 0.0

    monkeypatch.setattr(probe, "probe_via_controller", fake_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )

    status = asyncio.run(monitor.check_one(profile))

    assert status.latency_ms == 88.0


def test_controller_timeout_does_not_fall_back_to_direct(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)
    monitor.set_controller_url("http://127.0.0.1:9090")

    async def fake_controller(*_args, **_kwargs):
        return None, 1.0

    async def fake_direct(_host, _port, *, fast=False):
        raise AssertionError("direct must not run while controller URL is set")

    monkeypatch.setattr(probe, "probe_via_controller", fake_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )

    status = asyncio.run(monitor.check_one(profile))

    assert status.latency_ms is None
    assert status.packet_loss == 1.0


def test_controller_zero_delay_does_not_fall_back_to_direct(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)
    monitor.set_controller_url("http://127.0.0.1:9090")

    async def fake_controller(*_args, **_kwargs):
        return 0.0, 1.0

    async def fake_direct(_host, _port, *, fast=False):
        raise AssertionError("direct must not run while controller URL is set")

    monkeypatch.setattr(probe, "probe_via_controller", fake_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )

    status = asyncio.run(monitor.check_one(profile))

    assert status.latency_ms is None
    assert status.packet_loss == 1.0


def test_controller_near_zero_delay_treated_as_unreachable(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)
    monitor.set_controller_url("http://127.0.0.1:9090")

    async def fake_controller(*_args, **_kwargs):
        return 2.0, 0.0

    async def fake_direct(_host, _port, *, fast=False):
        raise AssertionError("direct must not run while controller URL is set")

    monkeypatch.setattr(probe, "probe_via_controller", fake_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )

    status = asyncio.run(monitor.check_one(profile))

    assert status.latency_ms is None
    assert status.packet_loss == 1.0


def test_reload_discards_stale_probe(monkeypatch) -> None:
    probe = LatencyProbeService()
    monitor = NodeHealthMonitor(probe)
    monitor.set_controller_url("http://127.0.0.1:9090")

    profile = EndpointProfile(
        id="n1",
        name="Node-DE",
        protocol=ProtocolType.VLESS,
        host="203.0.113.10",
        port=443,
    )
    monitor.set_profiles([profile])
    monitor.set_active(profile.id)

    gate = asyncio.Event()

    async def slow_controller(*_args, **_kwargs):
        await gate.wait()
        return 999.0, 0.0

    async def fake_direct(*_args, **_kwargs):
        return 50.0, 0.0

    monkeypatch.setattr(probe, "probe_via_controller", slow_controller)
    monkeypatch.setattr(probe, "probe_direct", fake_direct)

    async def scenario() -> None:
        task = asyncio.create_task(monitor.check_one(profile, fast=True))
        await asyncio.sleep(0)
        monitor.begin_reload()
        gate.set()
        status = await task
        # Stale 999 ms must not be committed while paused / after epoch bump.
        assert monitor.statuses.get(profile.id) is None or monitor.statuses[profile.id].latency_ms != 999.0
        monitor.end_reload("http://127.0.0.1:9090")
        assert status.latency_ms != 999.0 or profile.id not in monitor.statuses

    asyncio.run(scenario())


def test_set_profiles_prunes_stale_health_statuses() -> None:
    monitor = NodeHealthMonitor()
    old = EndpointProfile(
        id="old",
        name="Old",
        protocol=ProtocolType.VLESS,
        host="203.0.113.1",
        port=443,
    )
    new = EndpointProfile(
        id="new",
        name="New",
        protocol=ProtocolType.VLESS,
        host="203.0.113.2",
        port=443,
    )
    monitor.set_profiles([old])
    from pawlink.models.state import HealthLevel, NodeHealthStatus

    monitor._statuses["old"] = NodeHealthStatus(
        profile_id="old",
        latency_ms=40.0,
        packet_loss=0.0,
        health=HealthLevel.GREEN,
    )
    monitor._statuses["gone"] = NodeHealthStatus(
        profile_id="gone",
        latency_ms=90.0,
        packet_loss=0.0,
        health=HealthLevel.YELLOW,
    )
    monitor.set_profiles([new])
    assert "old" not in monitor.statuses
    assert "gone" not in monitor.statuses
    assert monitor.statuses == {}
