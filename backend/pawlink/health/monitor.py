from __future__ import annotations

import asyncio
import logging
from typing import Callable

from pawlink.health.latency_probe import LatencyProbeService
from pawlink.models.profile import EndpointProfile, ProtocolType
from pawlink.models.state import HealthLevel, NodeHealthStatus

logger = logging.getLogger(__name__)

# Mihomo sometimes returns 0–3 ms junk during reload / cache; real VPN RTT is higher.
MIN_CONTROLLER_LATENCY_MS = 5.0
# Cap concurrent URL-tests so mihomo/TUN is not flooded at startup.
PROBE_CONCURRENCY = 6
# Non-active nodes probed each light cycle (round-robin + stale/RED priority).
BACKGROUND_BATCH = 6


class NodeHealthMonitor:
    """Background health monitoring with low overhead (active node + round-robin)."""

    def __init__(
        self,
        probe: LatencyProbeService | None = None,
        *,
        active_interval_s: float = 12.0,
    ) -> None:
        self._probe = probe or LatencyProbeService()
        self._active_interval_s = active_interval_s
        self._statuses: dict[str, NodeHealthStatus] = {}
        self._profiles: list[EndpointProfile] = []
        self._active_id: str | None = None
        self._task: asyncio.Task | None = None
        self._controller_url: str | None = None
        self._on_update: Callable[[dict[str, NodeHealthStatus]], None] | None = None
        self._background_index = 0
        self._epoch = 0
        self._paused = False
        self._scan_lock = asyncio.Lock()

    @property
    def statuses(self) -> dict[str, NodeHealthStatus]:
        return dict(self._statuses)

    def set_profiles(self, profiles: list[EndpointProfile]) -> None:
        self._profiles = profiles
        alive = {p.id for p in profiles}
        stale = [pid for pid in self._statuses if pid not in alive]
        for pid in stale:
            self._statuses.pop(pid, None)
        if stale and self._on_update:
            self._on_update(self.statuses)

    def set_active(self, profile_id: str | None) -> None:
        self._active_id = profile_id

    def drop(self, profile_id: str) -> None:
        self._statuses.pop(profile_id, None)

    def set_controller_url(self, url: str | None) -> None:
        """When set, latency uses mihomo URL-test (Koala/Hiddify style) under blocks."""
        self._controller_url = url

    def begin_reload(self) -> None:
        """Pause probing while mihomo is restarted (node switch / failover)."""
        self._epoch += 1
        self._paused = True
        self._controller_url = None

    def end_reload(self, url: str | None) -> None:
        """Resume probing after core is ready; bump epoch to drop in-flight results."""
        self._epoch += 1
        self._paused = False
        self._controller_url = url

    def on_update(self, callback: Callable[[dict[str, NodeHealthStatus]], None]) -> None:
        self._on_update = callback

    async def _measure(
        self,
        profile: EndpointProfile,
        *,
        fast: bool = False,
        samples: int | None = None,
    ) -> tuple[float | None, float]:
        """
        Hybrid latency (Koala Clash / Hiddify):

        - VPN/core ON: mihomo ``/proxies/{name}/delay`` URL-test through each node
          (works when direct access to server IPs is blocked). Failures and
          near-zero junk stay as unreachable — never fall back to TCP while the
          core is up (TUN/fake-ip makes TCP look like 0–1 ms).
        - VPN/core OFF: TCP connect from PC to host:port.
        """
        if profile.protocol == ProtocolType.HYSTERIA2:
            return None, 0.0

        if self._controller_url:
            latency, loss = await self._probe.probe_via_controller(
                self._controller_url,
                profile.name,
                fast=fast,
                samples=samples,
            )
            # Ignore timeout (0) and near-zero junk from mihomo during reload.
            if latency is not None and latency >= MIN_CONTROLLER_LATENCY_MS:
                return latency, loss
            return None, 1.0

        return await self._probe.probe_direct(profile.host, profile.port, fast=fast)

    def _commit_status(self, profile_id: str, status: NodeHealthStatus, epoch: int) -> bool:
        if self._paused or epoch != self._epoch:
            return False
        self._statuses[profile_id] = status
        if self._on_update:
            self._on_update(self.statuses)
        return True

    async def _probe_and_commit(
        self,
        profile: EndpointProfile,
        *,
        epoch: int,
        fast: bool,
        samples: int | None,
        semaphore: asyncio.Semaphore | None = None,
    ) -> None:
        async def _run() -> None:
            latency, loss = await self._measure(profile, fast=fast, samples=samples)
            status = self._probe.build_status(
                profile,
                latency,
                loss,
                is_active=profile.id == self._active_id,
            )
            self._commit_status(profile.id, status, epoch)

        if semaphore is None:
            await _run()
            return
        async with semaphore:
            await _run()

    async def check_all(
        self,
        *,
        fast: bool = False,
        prefer_direct: bool = False,
    ) -> dict[str, NodeHealthStatus]:
        del prefer_direct  # always direct from PC; kept for call-site compatibility

        if self._paused:
            return self.statuses

        profiles = list(self._profiles)
        if not profiles:
            return self.statuses

        if self._scan_lock.locked():
            # Another full scan is already in flight — avoid stacking storms.
            return self.statuses

        async with self._scan_lock:
            if self._paused:
                return self.statuses
            epoch = self._epoch
            active = next((p for p in profiles if p.id == self._active_id), None)
            others = [p for p in profiles if active is None or p.id != active.id]

            # Active first (2 samples median) so UI updates quickly and fairly.
            if active is not None:
                await self._probe_and_commit(
                    active,
                    epoch=epoch,
                    fast=False,
                    samples=2,
                )

            if others:
                semaphore = asyncio.Semaphore(PROBE_CONCURRENCY)
                await asyncio.gather(
                    *(
                        self._probe_and_commit(
                            profile,
                            epoch=epoch,
                            fast=fast,
                            samples=1,
                            semaphore=semaphore,
                        )
                        for profile in others
                    ),
                    return_exceptions=True,
                )

        return self.statuses

    async def check_one(
        self,
        profile: EndpointProfile,
        *,
        fast: bool = False,
        prefer_direct: bool = False,
    ) -> NodeHealthStatus:
        del prefer_direct
        if self._paused:
            existing = self._statuses.get(profile.id)
            if existing is not None:
                return existing
            return self._probe.build_status(
                profile,
                None,
                1.0,
                is_active=profile.id == self._active_id,
            )

        epoch = self._epoch
        is_active = profile.id == self._active_id
        latency, loss = await self._measure(
            profile,
            fast=fast and not is_active,
            samples=2 if is_active else (1 if fast else 2),
        )
        status = self._probe.build_status(
            profile,
            latency,
            loss,
            is_active=is_active,
        )
        if not self._commit_status(profile.id, status, epoch):
            existing = self._statuses.get(profile.id)
            if existing is not None:
                return existing
        return status

    def best_profile_id(self) -> str | None:
        candidates = [
            (pid, s)
            for pid, s in self._statuses.items()
            if s.health != HealthLevel.RED and s.latency_ms is not None
        ]
        if not candidates:
            candidates = [(pid, s) for pid, s in self._statuses.items() if s.health != HealthLevel.RED]
        if not candidates:
            return None
        order = {HealthLevel.GREEN: 0, HealthLevel.YELLOW: 1, HealthLevel.RED: 2}
        candidates.sort(key=lambda x: (order[x[1].health], x[1].latency_ms or 9999))
        return candidates[0][0]

    async def _check_light(self) -> None:
        """Keep probing ALL nodes — not only the active one.

        Active is checked every cycle. A batch of others is probed in parallel,
        prioritizing never-checked / RED / stale statuses so a country we left
        does not look permanently dead.
        """
        if self._paused:
            return
        profiles = list(self._profiles)
        if not profiles:
            return

        active = next((p for p in profiles if p.id == self._active_id), None)
        if active:
            await self.check_one(active, fast=True)

        others = [p for p in profiles if p.id != self._active_id]
        if not others:
            return

        def priority_key(profile: EndpointProfile) -> tuple[int, float]:
            status = self._statuses.get(profile.id)
            if status is None:
                return (0, 0.0)
            checked = float(status.last_checked or 0.0)
            if status.health == HealthLevel.RED or status.latency_ms is None:
                return (1, checked)
            return (2, checked)

        batch_size = min(BACKGROUND_BATCH, len(others))
        batch: list[EndpointProfile] = []
        seen: set[str] = set()

        for profile in sorted(others, key=priority_key):
            if len(batch) >= max(1, batch_size // 2):
                break
            batch.append(profile)
            seen.add(profile.id)

        while len(batch) < batch_size:
            profile = others[self._background_index % len(others)]
            self._background_index += 1
            if profile.id in seen:
                if len(seen) >= len(others):
                    break
                continue
            batch.append(profile)
            seen.add(profile.id)

        if batch:
            await asyncio.gather(
                *(self.check_one(profile, fast=True) for profile in batch),
                return_exceptions=True,
            )

    async def _loop(self) -> None:
        # Let the service-owned full scan finish first (avoid racing at startup).
        await asyncio.sleep(self._active_interval_s)
        while True:
            try:
                await self._check_light()
            except Exception:
                logger.exception("Health check cycle failed")
            await asyncio.sleep(self._active_interval_s)

    def start(self) -> None:
        # Background loop only — full scans are triggered by the service.
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
