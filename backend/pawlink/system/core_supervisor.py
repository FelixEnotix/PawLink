from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pawlink.service import PawLinkService

logger = logging.getLogger(__name__)

# Interval between health probes while VPN should be running.
CHECK_INTERVAL_S = 5.0
# Consecutive failed probes before recovery (5s × 4 = 20s minimum — ignores one-off slowness).
HANG_FAILURES_REQUIRED = 4
# Max auto-restarts in a window — prevents loops on weak PCs or broken configs.
MAX_RESTARTS_IN_WINDOW = 3
RESTART_WINDOW_S = 600.0
COOLDOWN_AFTER_CAP_S = 300.0
# After a successful recovery, ignore failures briefly (slow post-restart warm-up).
POST_RECOVERY_GRACE_S = 30.0


class CoreSupervisor:
    """
    Restarts mihomo when it crashes or stops responding.

    Uses consecutive failure counts (not single slow responses) and restart
    rate limits so slow machines do not enter a restart loop.
    """

    def __init__(self, service: PawLinkService) -> None:
        self._service = service
        self._task: asyncio.Task | None = None
        self._running = False
        self._consecutive_failures = 0
        self._restart_times: list[float] = []
        self._cooldown_until = 0.0
        self._grace_until = 0.0
        self._recovery_paused = False
        self._recovering = False

    @property
    def recovery_paused(self) -> bool:
        return self._recovery_paused

    def notify_user_stop(self) -> None:
        """User turned VPN off — reset rate-limit so the next connect gets a fresh budget."""
        self._consecutive_failures = 0
        self._grace_until = 0.0
        self._recovery_paused = False
        self._cooldown_until = 0.0
        self._restart_times.clear()
        self._recovering = False

    def notify_user_reconnect(self) -> None:
        """User explicitly clicked Connect — allow auto-recovery again immediately."""
        self._recovery_paused = False
        self._cooldown_until = 0.0
        self._restart_times.clear()
        self._consecutive_failures = 0
        self._recovering = False

    def notify_starting(self) -> None:
        self._consecutive_failures = 0
        self._grace_until = time.time() + POST_RECOVERY_GRACE_S

    def notify_running(self) -> None:
        self._consecutive_failures = 0
        self._grace_until = time.time() + POST_RECOVERY_GRACE_S
        self._recovering = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="PawLinkCoreSupervisor")
        logger.info("Core supervisor started")

    def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None

    async def _loop(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(CHECK_INTERVAL_S)
                await self._tick()
        except asyncio.CancelledError:
            pass

    def _vpn_should_run(self) -> bool:
        svc = self._service
        return bool(getattr(svc, "_vpn_desired", False))

    async def _tick(self) -> None:
        if not self._vpn_should_run():
            self._consecutive_failures = 0
            return

        state = self._service.state
        if state.core_starting or self._recovering:
            return

        now = time.time()
        if now < self._grace_until:
            return

        if self._recovery_paused:
            if now >= self._cooldown_until:
                self._recovery_paused = False
                self._restart_times.clear()
                self._consecutive_failures = 0
                logger.info("Core auto-recovery cooldown ended — monitoring resumed")
                self._service._refresh_connection_phase()
            else:
                return

        process_up = self._service._proxy_manager.is_running
        controller_alive = False
        if process_up:
            controller_alive = await self._service.core_controller.is_alive()

        healthy = process_up and controller_alive and state.core_running

        if healthy:
            self._consecutive_failures = 0
            return

        if not state.core_running and process_up:
            # Stale process while UI thinks VPN is off — terminate our mihomo only.
            await self._service._stop_orphan_core()
            return

        if not self._vpn_should_run():
            return

        self._consecutive_failures += 1
        logger.warning(
            "Core health probe failed (%s/%s): process=%s controller=%s core_running=%s",
            self._consecutive_failures,
            HANG_FAILURES_REQUIRED,
            process_up,
            controller_alive,
            state.core_running,
        )

        if self._consecutive_failures < HANG_FAILURES_REQUIRED:
            return

        await self._attempt_recovery(
            "process stopped"
            if not process_up
            else "controller not responding"
        )

    async def _attempt_recovery(self, reason: str) -> None:
        now = time.time()
        self._restart_times = [t for t in self._restart_times if now - t < RESTART_WINDOW_S]

        if len(self._restart_times) >= MAX_RESTARTS_IN_WINDOW:
            self._recovery_paused = True
            self._cooldown_until = now + COOLDOWN_AFTER_CAP_S
            self._consecutive_failures = 0
            self._recovering = False
            logger.error(
                "Core auto-recovery paused for %ss after %s restarts (%s)",
                int(COOLDOWN_AFTER_CAP_S),
                MAX_RESTARTS_IN_WINDOW,
                reason,
            )
            self._service._refresh_connection_phase()
            return

        self._restart_times.append(now)
        self._consecutive_failures = 0
        self._recovering = True
        self._service._refresh_connection_phase()
        logger.warning(
            "Core auto-recovery (%s/%s in %ss): %s",
            len(self._restart_times),
            MAX_RESTARTS_IN_WINDOW,
            int(RESTART_WINDOW_S),
            reason,
        )

        try:
            await self._service._recover_core_after_failure()
        except Exception:
            logger.exception("Core auto-recovery failed")
            self._recovering = False
            self._service._refresh_connection_phase()
        else:
            self._service._refresh_connection_phase()
