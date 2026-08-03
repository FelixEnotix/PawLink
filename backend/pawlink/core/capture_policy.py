from __future__ import annotations

from dataclasses import dataclass

from pawlink.models.state import RoutingMode


@dataclass(frozen=True)
class CapturePlan:
    """How Windows traffic reaches mihomo for the active routing mode."""

    tun_enabled: bool
    system_proxy: bool
    tun_include_process: tuple[str, ...] = ()


def build_capture_plan(
    routing_mode: RoutingMode,
    *,
    is_admin: bool,
    wintun_available: bool,
    include_apps: list[str],
) -> CapturePlan:
    """Single source of truth for TUN vs system-proxy capture.

    Matches koala / clash-verge: TUN and system proxy are mutually exclusive.
    Running both at once double-captures browser traffic and commonly freezes
    Windows networking after the first ~100–200 KB.

    - direct: no capture
    - with admin+wintun: TUN only (PROCESS-NAME / MATCH rules decide PROXY)
    - without TUN: system proxy fallback (browsers only)
    """
    if routing_mode == "direct":
        return CapturePlan(tun_enabled=False, system_proxy=False)

    can_tun = is_admin and wintun_available
    apps = tuple(include_apps) if include_apps else ()

    if routing_mode == "global":
        return CapturePlan(
            tun_enabled=can_tun,
            system_proxy=not can_tun,
            tun_include_process=(),
        )

    return CapturePlan(
        tun_enabled=can_tun,
        system_proxy=not can_tun,
        tun_include_process=apps,
    )
