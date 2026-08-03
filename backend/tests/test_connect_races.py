"""Click-storm / impatient-user races around VPN start & stop."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

from pawlink.core.capture_policy import CapturePlan
from pawlink.models.profile import EndpointProfile, ProtocolType
from pawlink.service import PawLinkService


def _profile() -> EndpointProfile:
    return EndpointProfile(
        id="n1",
        name="Test",
        protocol=ProtocolType.VLESS,
        host="1.2.3.4",
        port=443,
    )


def _wire_fast_start(svc: PawLinkService, *, binaries_gate: asyncio.Event | None = None) -> dict:
    """Replace slow I/O so start_core exercises only orchestration."""
    flags = {"started": 0, "stopped": 0}

    async def binaries() -> None:
        if binaries_gate is not None:
            await binaries_gate.wait()

    async def prepare_ports() -> None:
        return None

    async def wait_ports() -> None:
        return None

    async def ensure_alive() -> None:
        return None

    async def sync_capture(_plan) -> None:
        return None

    async def build_plan() -> CapturePlan:
        return CapturePlan(tun_enabled=False, system_proxy=False)

    class FakeProxy:
        def __init__(self) -> None:
            self.is_running = False
            self.intentional_stop = False

        def start(self) -> None:
            flags["started"] += 1
            self.is_running = True

        def stop(self) -> None:
            flags["stopped"] += 1
            self.is_running = False

        def on_exit(self, _cb) -> None:
            return None

    svc._proxy_manager = FakeProxy()  # type: ignore[assignment]
    svc._ensure_runtime_binaries = binaries  # type: ignore[method-assign]
    svc._prepare_core_ports = prepare_ports  # type: ignore[method-assign]
    svc._wait_ports_released = wait_ports  # type: ignore[method-assign]
    svc._ensure_core_alive = ensure_alive  # type: ignore[method-assign]
    svc._sync_traffic_capture = sync_capture  # type: ignore[method-assign]
    svc._build_and_write_config = build_plan  # type: ignore[method-assign]
    svc._release_own_ports = lambda: None  # type: ignore[method-assign]
    svc.system_proxy.disable = lambda: None  # type: ignore[method-assign]
    svc.system_proxy.clear_if_points_to = lambda _p: None  # type: ignore[method-assign]
    svc.network_recovery.restore = lambda: None  # type: ignore[method-assign]
    svc.traffic.start = lambda: None  # type: ignore[method-assign]
    svc.traffic.stop = lambda: None  # type: ignore[method-assign]
    svc.traffic.stop_async = AsyncMock()  # type: ignore[method-assign]
    svc.traffic.reset_session = lambda: None  # type: ignore[method-assign]
    svc.traffic.set_controller_url = lambda _u: None  # type: ignore[method-assign]
    svc.monitor.set_controller_url = lambda _u: None  # type: ignore[method-assign]
    svc._probe_health_after_connect = AsyncMock()  # type: ignore[method-assign]
    svc._persist_state = lambda: None  # type: ignore[method-assign]
    svc._core_supervisor.notify_user_reconnect = lambda: None  # type: ignore[method-assign]
    svc._core_supervisor.notify_starting = lambda: None  # type: ignore[method-assign]
    svc._core_supervisor.notify_running = lambda: None  # type: ignore[method-assign]
    svc._core_supervisor.notify_user_stop = lambda: None  # type: ignore[method-assign]
    return flags


def _ready_service(tmp_path) -> PawLinkService:
    svc = PawLinkService(data_dir=tmp_path)
    svc.state.routing_mode = "global"
    svc.state.profiles = [_profile()]
    svc.state.active_profile_id = "n1"
    return svc


def test_stop_cancels_slow_start(tmp_path) -> None:
    async def scenario() -> None:
        svc = _ready_service(tmp_path)
        gate = asyncio.Event()
        flags = _wire_fast_start(svc, binaries_gate=gate)

        start_task = asyncio.create_task(svc.start_core())
        await asyncio.sleep(0.05)
        assert svc.state.core_starting is True

        stop_task = asyncio.create_task(svc.stop_core())
        await asyncio.sleep(0.05)
        assert svc._vpn_desired is False

        gate.set()
        await asyncio.gather(start_task, stop_task)

        assert svc.state.core_running is False
        assert svc.state.core_starting is False
        assert svc._vpn_desired is False
        assert svc.state.connection_phase == "disconnected"
        assert flags["started"] == 0 or flags["stopped"] >= flags["started"]
        assert svc._proxy_manager.is_running is False

    asyncio.run(scenario())


def test_double_start_is_idempotent(tmp_path) -> None:
    async def scenario() -> None:
        svc = _ready_service(tmp_path)
        flags = _wire_fast_start(svc)
        await asyncio.gather(svc.start_core(), svc.start_core())
        assert svc.state.core_running is True
        assert flags["started"] == 1
        assert svc._vpn_desired is True

    asyncio.run(scenario())


def test_start_stop_start_storm_ends_consistently(tmp_path) -> None:
    async def scenario() -> None:
        svc = _ready_service(tmp_path)
        flags = _wire_fast_start(svc)

        t1 = asyncio.create_task(svc.start_core())
        await asyncio.sleep(0)
        t2 = asyncio.create_task(svc.stop_core())
        await asyncio.sleep(0)
        t3 = asyncio.create_task(svc.start_core())
        await asyncio.gather(t1, t2, t3)

        assert svc.state.core_running is True
        assert svc._vpn_desired is True
        assert svc._proxy_manager.is_running is True
        assert flags["started"] >= 1

    asyncio.run(scenario())


def test_double_stop_is_safe(tmp_path) -> None:
    async def scenario() -> None:
        svc = _ready_service(tmp_path)
        _wire_fast_start(svc)
        await svc.start_core()
        await asyncio.gather(svc.stop_core(), svc.stop_core())
        assert svc.state.core_running is False
        assert svc._vpn_desired is False
        assert svc.state.connection_phase == "disconnected"

    asyncio.run(scenario())
