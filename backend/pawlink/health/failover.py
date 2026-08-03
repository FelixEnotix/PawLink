from __future__ import annotations

import asyncio
import logging
from typing import Callable

from pawlink.health.monitor import NodeHealthMonitor
from pawlink.health.selection import NodeSelector, SelectionResult
from pawlink.models.profile import EndpointProfile
from pawlink.models.state import AutoSelectSettings, HealthLevel

logger = logging.getLogger(__name__)

PACKET_LOSS_FAILOVER_THRESHOLD = 0.3
# ~30s at default 5s poll — ignore brief ping spikes above max.
BAD_PING_STREAK_REQUIRED = 6
# Require two bad hard-fail probes before switching (~10s).
HARD_FAIL_STREAK_REQUIRED = 2


class FailoverOrchestrator:
    """
    Continuous transport health monitoring with hitless failover.

    Uses smart selection criteria when auto-select is enabled, with fallback
    mode and automatic return to preferred servers when they become available.
    Stays on the current server unless degradation persists.
    """

    def __init__(
        self,
        monitor: NodeHealthMonitor,
        selector: NodeSelector,
        *,
        loss_threshold: float = PACKET_LOSS_FAILOVER_THRESHOLD,
        poll_interval_s: float = 5.0,
        bad_ping_streak_required: int = BAD_PING_STREAK_REQUIRED,
        hard_fail_streak_required: int = HARD_FAIL_STREAK_REQUIRED,
    ) -> None:
        self._monitor = monitor
        self._selector = selector
        self._loss_threshold = loss_threshold
        self._poll_interval_s = poll_interval_s
        self._bad_ping_streak_required = bad_ping_streak_required
        self._hard_fail_streak_required = hard_fail_streak_required
        self._active_id: str | None = None
        self._profiles: dict[str, EndpointProfile] = {}
        self._task: asyncio.Task | None = None
        self._on_failover: Callable[[str, str], None] | None = None
        self._auto_select_enabled: Callable[[], bool] = lambda: False
        self._criteria_getter: Callable[[], AutoSelectSettings] = AutoSelectSettings
        self._in_fallback_getter: Callable[[], bool] = lambda: False
        self._in_fallback_setter: Callable[[bool], None] = lambda _v: None
        self._blocked_getter: Callable[[], list] = lambda: []
        self._switch_gate: Callable[[], bool] = lambda: True
        self._lock = asyncio.Lock()
        self._bad_ping_streak = 0
        self._hard_fail_streak = 0

    def set_auto_select_checker(self, checker: Callable[[], bool]) -> None:
        self._auto_select_enabled = checker

    def set_switch_gate(self, gate: Callable[[], bool]) -> None:
        """When False, skip automatic failover / auto-return switches."""
        self._switch_gate = gate

    def set_policy(
        self,
        *,
        criteria_getter: Callable[[], AutoSelectSettings],
        in_fallback_getter: Callable[[], bool],
        in_fallback_setter: Callable[[bool], None],
        blocked_getter: Callable[[], list] | None = None,
    ) -> None:
        self._criteria_getter = criteria_getter
        self._in_fallback_getter = in_fallback_getter
        self._in_fallback_setter = in_fallback_setter
        if blocked_getter is not None:
            self._blocked_getter = blocked_getter

    @property
    def active_profile_id(self) -> str | None:
        return self._active_id

    def configure(
        self,
        profiles: list[EndpointProfile],
        active_id: str | None = None,
    ) -> None:
        self._profiles = {p.id: p for p in profiles}
        self._active_id = active_id
        self._monitor.set_profiles(profiles)
        self._monitor.set_active(active_id)
        self._bad_ping_streak = 0
        self._hard_fail_streak = 0

    def on_failover(self, callback: Callable[[str, str], None]) -> None:
        self._on_failover = callback

    def _pick(self, *, force_fallback: bool, prefer_profile_id: str | None = None) -> SelectionResult:
        return self._selector.select(
            list(self._profiles.values()),
            self._monitor.statuses,
            self._criteria_getter(),
            self._blocked_getter(),
            force_fallback=force_fallback,
            prefer_profile_id=prefer_profile_id,
        )

    async def select_optimal(
        self,
        *,
        force_fallback: bool = False,
        stick_to_active: bool = True,
    ) -> str | None:
        await self._monitor.check_all(fast=True)
        sticky = self._active_id if stick_to_active else None
        result = self._pick(force_fallback=force_fallback, prefer_profile_id=sticky)
        profile_id = result.profile_id
        if profile_id:
            async with self._lock:
                self._active_id = profile_id
                self._monitor.set_active(profile_id)
            self._in_fallback_setter(result.in_fallback)
            self._bad_ping_streak = 0
            self._hard_fail_streak = 0
        return profile_id

    async def _try_auto_return(self) -> bool:
        settings = self._criteria_getter()
        if not self._in_fallback_getter() or not settings.auto_return:
            return False
        if not self._switch_gate():
            return False

        preferred = self._pick(force_fallback=False, prefer_profile_id=None)
        if (
            not preferred.profile_id
            or preferred.needs_fallback_prompt
            or preferred.profile_id == self._active_id
        ):
            return False

        previous = self._active_id or ""
        async with self._lock:
            self._active_id = preferred.profile_id
            self._monitor.set_active(preferred.profile_id)
        self._in_fallback_setter(False)
        self._bad_ping_streak = 0
        self._hard_fail_streak = 0
        logger.info(
            "Auto-return to preferred server: %s -> %s",
            previous,
            preferred.profile_id,
        )
        if self._on_failover:
            self._on_failover(previous, preferred.profile_id)
        return True

    async def _evaluate_failover(self) -> None:
        if not self._auto_select_enabled():
            return
        if not self._switch_gate():
            return

        if await self._try_auto_return():
            return

        if not self._active_id or self._active_id not in self._profiles:
            if not self._switch_gate():
                return
            await self.select_optimal(force_fallback=self._in_fallback_getter())
            return

        active = self._profiles[self._active_id]
        status = await self._monitor.check_one(active)
        settings = self._criteria_getter()

        hard_fail = (
            status.packet_loss >= self._loss_threshold
            or status.health == HealthLevel.RED
        )
        latency = status.latency_ms
        soft_fail = (
            latency is not None
            and latency > settings.ping_max_ms
            and not hard_fail
        )

        if hard_fail:
            self._hard_fail_streak += 1
            self._bad_ping_streak = 0
            if self._hard_fail_streak < self._hard_fail_streak_required:
                return
        elif soft_fail:
            self._hard_fail_streak = 0
            self._bad_ping_streak += 1
            if self._bad_ping_streak < self._bad_ping_streak_required:
                return
        else:
            self._hard_fail_streak = 0
            self._bad_ping_streak = 0
            return

        if not self._switch_gate():
            return

        previous = self._active_id
        in_fallback = self._in_fallback_getter()
        # Current is degraded — do not prefer it when picking a replacement.
        result = self._pick(force_fallback=True, prefer_profile_id=None)
        new_id = result.profile_id

        if not new_id or new_id == previous:
            return

        async with self._lock:
            self._active_id = new_id
            self._monitor.set_active(new_id)
        self._in_fallback_setter(result.in_fallback or in_fallback or not result.matched_criteria)
        self._bad_ping_streak = 0
        self._hard_fail_streak = 0
        logger.warning(
            "Failover: %s -> %s (loss=%.2f, health=%s, latency=%s, fallback=%s)",
            previous,
            new_id,
            status.packet_loss,
            status.health.value,
            latency,
            self._in_fallback_getter(),
        )
        if self._on_failover:
            self._on_failover(previous, new_id)

    async def _loop(self) -> None:
        while True:
            try:
                await self._evaluate_failover()
            except Exception:
                logger.exception("Failover evaluation failed")
            await asyncio.sleep(self._poll_interval_s)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def force_switch(self, profile_id: str) -> bool:
        if profile_id not in self._profiles:
            return False
        async with self._lock:
            self._active_id = profile_id
            self._monitor.set_active(profile_id)
        self._bad_ping_streak = 0
        self._hard_fail_streak = 0
        return True
