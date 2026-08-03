from __future__ import annotations

import asyncio
import time
from urllib.parse import quote

import httpx

from pawlink.models.profile import EndpointProfile
from pawlink.models.state import HealthLevel, NodeHealthStatus

# Lightweight HTTP URL-Test endpoints (ICMP/ping prohibited per spec)
URL_TEST_TARGETS = [
    "http://www.gstatic.com/generate_204",
    "http://cp.cloudflare.com/generate_204",
    "http://connectivitycheck.gstatic.com/generate_204",
]

GREEN_LATENCY_MS = 300
YELLOW_LATENCY_MS = 800
PROBE_TIMEOUT_S = 5.0
PROBE_TIMEOUT_FAST_S = 2.0
PROBE_SAMPLES = 3
PROBE_SAMPLES_FAST = 1


class LatencyProbeService:
    """Asynchronous HTTP URL-Test latency probing (Module 3)."""

    def __init__(self, targets: list[str] | None = None) -> None:
        self._targets = targets or URL_TEST_TARGETS

    async def probe_through_proxy(
        self,
        profile: EndpointProfile,
        proxy_url: str | None = None,
    ) -> tuple[float | None, float]:
        """
        Measure latency and packet loss ratio via HTTP probes.
        proxy_url: optional local Mihomo mixed-port proxy for per-node testing.
        """
        latencies: list[float] = []
        failures = 0

        transport_kwargs: dict = {}
        if proxy_url:
            transport_kwargs["proxy"] = proxy_url

        async with httpx.AsyncClient(
            timeout=PROBE_TIMEOUT_S,
            follow_redirects=True,
            **transport_kwargs,
        ) as client:
            for _ in range(PROBE_SAMPLES):
                target = self._targets[len(latencies) % len(self._targets)]
                start = time.perf_counter()
                try:
                    response = await client.get(target)
                    if response.status_code in (204, 200):
                        latencies.append((time.perf_counter() - start) * 1000)
                    else:
                        failures += 1
                except (httpx.HTTPError, OSError):
                    failures += 1

        packet_loss = failures / PROBE_SAMPLES
        avg_latency = sum(latencies) / len(latencies) if latencies else None
        return avg_latency, packet_loss

    async def _controller_delay_once(
        self,
        client: httpx.AsyncClient,
        controller_url: str,
        proxy_name: str,
        *,
        timeout_ms: int,
        test_url: str,
    ) -> float | None:
        try:
            response = await client.get(
                f"{controller_url.rstrip('/')}/proxies/{quote(proxy_name, safe='')}/delay",
                params={"timeout": timeout_ms, "url": test_url},
            )
            if response.status_code != 200:
                return None
            payload = response.json()
            delay = payload.get("delay")
            if delay is None:
                return None
            delay_f = float(delay)
            if delay_f <= 0:
                return None
            return delay_f
        except (httpx.HTTPError, OSError, ValueError, TypeError):
            return None

    async def probe_via_controller(
        self,
        controller_url: str,
        proxy_name: str,
        *,
        fast: bool = False,
        samples: int | None = None,
    ) -> tuple[float | None, float]:
        """
        Mihomo URL-test delay for a single proxy (Koala ``mihomoProxyDelay``).

        Valid only while the core is running; delay=0 means timeout.
        With samples>1 returns the median of successful measurements (fairer for
        the warm/active outbound that otherwise looks unrealistically fast).
        """
        timeout_ms = int((PROBE_TIMEOUT_FAST_S if fast else PROBE_TIMEOUT_S) * 1000)
        sample_count = samples if samples is not None else (1 if fast else 2)
        sample_count = max(1, sample_count)
        test_url = self._targets[0]
        delays: list[float] = []
        failures = 0

        try:
            async with httpx.AsyncClient(
                timeout=(PROBE_TIMEOUT_FAST_S if fast else PROBE_TIMEOUT_S) + 2.0,
                trust_env=False,
            ) as client:
                for _ in range(sample_count):
                    delay = await self._controller_delay_once(
                        client,
                        controller_url,
                        proxy_name,
                        timeout_ms=timeout_ms,
                        test_url=test_url,
                    )
                    if delay is None:
                        failures += 1
                    else:
                        delays.append(delay)
        except (httpx.HTTPError, OSError, ValueError, TypeError):
            return None, 1.0

        if not delays:
            return None, 1.0
        delays.sort()
        median = delays[len(delays) // 2]
        packet_loss = failures / sample_count
        return median, packet_loss

    async def probe_direct(self, host: str, port: int, *, fast: bool = False) -> tuple[float | None, float]:
        """Direct TCP connect timing as fallback when proxy context unavailable."""
        samples = PROBE_SAMPLES_FAST if fast else PROBE_SAMPLES
        timeout_s = PROBE_TIMEOUT_FAST_S if fast else PROBE_TIMEOUT_S
        latencies: list[float] = []
        failures = 0

        for _ in range(samples):
            start = time.perf_counter()
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(host, port),
                    timeout=timeout_s,
                )
                latencies.append((time.perf_counter() - start) * 1000)
                writer.close()
                await writer.wait_closed()
            except (OSError, asyncio.TimeoutError):
                failures += 1

        packet_loss = failures / samples if samples else 1.0
        avg_latency = sum(latencies) / len(latencies) if latencies else None
        return avg_latency, packet_loss

    @staticmethod
    def classify_health(latency_ms: float | None, packet_loss: float) -> HealthLevel:
        if latency_ms is None:
            # No latency with zero recorded loss means the node was not
            # probed (e.g. UDP-only protocol without a running core) —
            # treat as unknown/yellow instead of failed.
            return HealthLevel.RED if packet_loss > 0 else HealthLevel.YELLOW
        if packet_loss >= 0.5:
            return HealthLevel.RED
        if packet_loss > 0.1 or latency_ms > YELLOW_LATENCY_MS:
            return HealthLevel.YELLOW
        if latency_ms <= GREEN_LATENCY_MS:
            return HealthLevel.GREEN
        return HealthLevel.YELLOW

    def build_status(
        self,
        profile: EndpointProfile,
        latency_ms: float | None,
        packet_loss: float,
        *,
        is_active: bool = False,
    ) -> NodeHealthStatus:
        return NodeHealthStatus(
            profile_id=profile.id,
            latency_ms=round(latency_ms, 1) if latency_ms is not None else None,
            packet_loss=round(packet_loss, 3),
            health=self.classify_health(latency_ms, packet_loss),
            last_checked=time.time(),
            is_active=is_active,
        )
