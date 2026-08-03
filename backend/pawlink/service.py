from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from pawlink.config.aggregator import ConfigAggregator
from pawlink.core.capture_policy import CapturePlan, build_capture_plan
from pawlink.core.config_builder import CoreConfigBuilder
from pawlink.core.controller import MihomoController
from pawlink.core.downloader import CoreDownloadService
from pawlink.health.failover import FailoverOrchestrator
from pawlink.health.latency_probe import LatencyProbeService
from pawlink.health.monitor import NodeHealthMonitor
from pawlink.health.selection import NodeSelector, SelectionResult, is_profile_blocked
from pawlink.models.profile import EndpointProfile, ProcessTunnelEntry, ProcessTunnelMode, RoutingRule
from pawlink.models.state import (
    ApplicationState,
    AutoSelectSettings,
    HealthLevel,
    RoutingMode,
    Subscription,
    SubscriptionTrafficStats,
)
from pawlink.health.traffic_monitor import TrafficMonitor
from pawlink.process_tunnel.enumerator import ProcessEnumerator, ProcessTunnelConfigBuilder
from pawlink.process_tunnel.installed_apps import InstalledAppEnumerator
from pawlink.routing.geo_sync import GeoDatabaseSyncService
from pawlink.routing.rule_lists import RuleListManager
from pawlink.routing.rule_sanitizer import RuleSanitizer
from pawlink.system.elevation import PrivilegeElevationService
from pawlink.system.port_cleanup import wait_until_port_free
from pawlink.system.core_supervisor import CoreSupervisor
from pawlink.system.network_recovery import NetworkRecoveryService
from pawlink.system.runtime_ports import (
    prepare_mihomo_ports,
    release_session_mihomo_ports,
)
from pawlink.system.system_proxy import SystemProxyManager
from pawlink.system.watchdog import ProxyProcessManager, WatchdogService
from pawlink.system.wintun import WintunManager
from pawlink.backup import (
    BACKUP_FORMAT,
    BACKUP_VERSION,
    export_state_sections,
    migrate_auto_select_settings,
    normalize_backup_data,
    validate_settings_section,
)
from pawlink.errors import (
    ConnectError,
    STAGE_BINARIES,
    STAGE_CAPTURE,
    STAGE_CONFIG,
    STAGE_MIHOMO_READY,
    STAGE_MIHOMO_START,
    STAGE_PORTS,
    STAGE_PRECHECK,
    STAGE_UNKNOWN,
)

logger = logging.getLogger(__name__)

DEFAULT_DATA_DIR = Path.home() / ".pawlink"

# Fields of ApplicationState that survive restarts (runtime-only ones excluded).
PERSISTED_STATE_FIELDS = {
    "profiles",
    "subscriptions",
    "active_profile_id",
    "custom_rules",
    "process_tunnels",
    "auto_select_enabled",
    "auto_select",
    "auto_select_in_fallback",
    "blocked_servers",
    "connect_on_startup",
    "routing_mode",
    "kill_switch_enabled",
    "subscription_traffic",
}

# Consecutive failed active-node probes before engaging soft kill switch.
LINK_FAIL_STREAK_REQUIRED = 2


class PawLinkService:
    """Central backend orchestrator wiring all modules together."""

    def __init__(
        self,
        data_dir: str | Path | None = None,
        core_binary: str | Path | None = None,
    ) -> None:
        self._data_dir = Path(data_dir or DEFAULT_DATA_DIR)
        self._data_dir.mkdir(parents=True, exist_ok=True)

        self.state = ApplicationState()
        self.aggregator = ConfigAggregator()
        self.config_builder = CoreConfigBuilder(self._data_dir)
        self.core_controller = MihomoController(self.config_builder.controller_url)
        self.geo_sync = GeoDatabaseSyncService(self._data_dir)
        self.rule_sanitizer = RuleSanitizer()
        self.rule_lists = RuleListManager(self._data_dir)
        self.process_enumerator = ProcessEnumerator()
        self.installed_apps = InstalledAppEnumerator()
        self.process_tunnel = ProcessTunnelConfigBuilder()
        self.probe = LatencyProbeService()
        self.monitor = NodeHealthMonitor(self.probe)
        self.traffic = TrafficMonitor()
        self.selector = NodeSelector()
        self.failover = FailoverOrchestrator(self.monitor, self.selector)
        self.elevation = PrivilegeElevationService()
        self.wintun = WintunManager(self._data_dir / "bin" / "wintun.dll")
        self.system_proxy = SystemProxyManager()
        self.network_recovery = NetworkRecoveryService(self._data_dir / "snapshots")

        binary = Path(core_binary) if core_binary else self._data_dir / "bin" / "mihomo.exe"
        self._core_binary = binary
        self.downloader = CoreDownloadService(self._data_dir / "bin")
        self._config_path = self._data_dir / "config.yaml"
        self._proxy_manager = ProxyProcessManager(
            str(binary),
            str(self._config_path),
            work_dir=str(self._data_dir),
        )
        self._proxy_manager.on_exit(self._on_proxy_exit)
        self._watchdog = WatchdogService(self._proxy_manager.terminate)
        self._rebuild_lock = asyncio.Lock()
        self._watchdog.on_recovery(self.network_recovery.restore)

        self.failover.on_failover(self._on_failover)
        self.failover.set_auto_select_checker(lambda: self.state.auto_select_enabled)
        self.failover.set_policy(
            criteria_getter=lambda: self.state.auto_select,
            in_fallback_getter=lambda: self.state.auto_select_in_fallback,
            in_fallback_setter=self._set_auto_select_fallback,
            blocked_getter=lambda: self.state.blocked_servers,
        )
        self.traffic.set_subscription_resolver(self._active_subscription_id)
        self.traffic.set_bytes_handler(self._record_traffic_bytes)
        self.monitor.on_update(self._on_health_update)
        self._health_refresh_task: asyncio.Task | None = None
        self._bootstrap_ready = asyncio.Event()
        self._vpn_desired = False
        self._ports_auto_selected = False
        self._core_supervisor = CoreSupervisor(self)
        self._last_connect_error: dict[str, str | float] | None = None
        self._traffic_persist_at = 0.0
        self._link_fail_streak = 0
        self._transport_guard_lock = asyncio.Lock()
        self._last_active_health_sig: tuple | None = None
        self._core_restarting = False
        self._loop: asyncio.AbstractEventLoop | None = None
        # Serializes start/stop so click-storms and tray+UI races cannot interleave.
        self._connect_op_lock = asyncio.Lock()
        self._transport_guard_task: asyncio.Task | None = None
        self._transport_guard_pending = False
        self._failover_reload_task: asyncio.Task | None = None
        self._post_connect_probe_task: asyncio.Task | None = None
        self._load_state()
        self._refresh_connection_phase()
        self.failover.set_switch_gate(self._failover_switch_allowed)

    @property
    def last_connect_error(self) -> dict[str, str | float] | None:
        return self._last_connect_error

    @property
    def _state_path(self) -> Path:
        return self._data_dir / "state.json"

    def _persist_state(self) -> None:
        try:
            payload = self.state.model_dump(mode="json", include=PERSISTED_STATE_FIELDS)
            self._state_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            logger.warning("Failed to persist application state", exc_info=True)

    def _load_state(self) -> None:
        if not self._state_path.exists():
            return
        try:
            data = json.loads(self._state_path.read_text(encoding="utf-8"))
            if isinstance(data.get("auto_select"), dict):
                data["auto_select"] = migrate_auto_select_settings(data["auto_select"]).model_dump()
            restored = ApplicationState.model_validate(data)
        except (OSError, ValueError):
            logger.warning("Failed to load persisted state, starting clean", exc_info=True)
            return
        self.state.profiles = restored.profiles
        self.state.subscriptions = restored.subscriptions
        self.state.active_profile_id = restored.active_profile_id
        self.state.custom_rules = self._unique_rules(restored.custom_rules)
        self.state.process_tunnels = restored.process_tunnels
        self.state.auto_select_enabled = restored.auto_select_enabled
        self.state.auto_select = restored.auto_select
        self.state.auto_select_in_fallback = restored.auto_select_in_fallback
        self.state.blocked_servers = restored.blocked_servers
        self.state.connect_on_startup = restored.connect_on_startup
        self.state.routing_mode = restored.routing_mode
        self.state.kill_switch_enabled = restored.kill_switch_enabled
        self.state.kill_switch_engaged = False
        self.state.subscription_traffic = restored.subscription_traffic
        self.process_tunnel = ProcessTunnelConfigBuilder(restored.process_tunnels)
        self.failover.configure(self.state.profiles, self.state.active_profile_id)
        self.monitor.set_profiles(self.state.profiles)
        self.monitor.set_active(self.state.active_profile_id)
        self._sync_subscriptions_from_profiles()
        if len(self.state.custom_rules) != len(restored.custom_rules):
            self._persist_state()
        logger.info(
            "Restored state: %d profiles, %d rules, %d tunnel entries",
            len(self.state.profiles),
            len(self.state.custom_rules),
            len(self.state.process_tunnels),
        )

    def _capture_plan(self) -> CapturePlan:
        return build_capture_plan(
            self.state.routing_mode,
            is_admin=self.elevation.is_admin(),
            wintun_available=self.wintun.is_available,
            include_apps=self.process_tunnel.include_list(),
        )

    def _tun_enabled(self) -> bool:
        return self._capture_plan().tun_enabled

    @staticmethod
    def _subscription_id(url: str) -> str:
        return hashlib.sha1(url.encode()).hexdigest()[:12]

    @staticmethod
    def _subscription_name(url: str) -> str:
        host = urlparse(url).hostname or "subscription"
        return host[:48]

    def _active_subscription_id(self) -> str | None:
        profile_id = self.state.active_profile_id
        if not profile_id:
            return None
        profile = next((p for p in self.state.profiles if p.id == profile_id), None)
        if not profile:
            return None
        source = profile.source
        if source and source.startswith(("http://", "https://")):
            return self._subscription_id(source)
        return "__manual__"

    def _record_traffic_bytes(self, up: int, down: int, subscription_id: str | None) -> None:
        if not subscription_id:
            return
        stats = self.state.subscription_traffic.get(subscription_id)
        if stats is None:
            stats = SubscriptionTrafficStats()
            self.state.subscription_traffic[subscription_id] = stats
        stats.total_up += up
        stats.total_down += down
        # Throttle disk writes — traffic ticks every ~1.5s; no need to rewrite state.json that often.
        now = time.time()
        if now - self._traffic_persist_at >= 30.0:
            self._traffic_persist_at = now
            self._persist_state()

    def _subscription_traffic_totals(self) -> dict[str, dict[str, int]]:
        totals: dict[str, dict[str, int]] = {}
        for sub in self.state.subscriptions:
            stats = self.state.subscription_traffic.get(sub.id, SubscriptionTrafficStats())
            totals[sub.id] = {
                "name": sub.name,
                "total_up": stats.total_up,
                "total_down": stats.total_down,
            }
        manual = self.state.subscription_traffic.get("__manual__")
        if manual and (manual.total_up or manual.total_down):
            totals["__manual__"] = {
                "name": "Ручной импорт",
                "total_up": manual.total_up,
                "total_down": manual.total_down,
            }
        return totals

    def get_traffic_stats(self) -> dict:
        self._sync_runtime_state()
        return {
            "core_running": self.state.core_running,
            "core_connected_at": self.state.core_connected_at,
            **self.traffic.get_stats(subscription_totals=self._subscription_traffic_totals()),
        }

    def list_installed_apps(self) -> list[dict]:
        return [
            {
                "name": app.name,
                "executable": app.executable,
                "icon_path": app.icon_path,
                "install_path": app.install_path,
            }
            for app in self.installed_apps.list_installed()
        ]

    def _register_subscription(self, url: str) -> None:
        sub_id = self._subscription_id(url)
        for sub in self.state.subscriptions:
            if sub.id == sub_id or sub.url == url:
                sub.last_refreshed = time.time()
                return
        self.state.subscriptions.append(
            Subscription(
                id=sub_id,
                url=url,
                name=self._subscription_name(url),
                added_at=time.time(),
                last_refreshed=time.time(),
            )
        )

    def _prune_subscriptions(self) -> None:
        active_urls = {
            p.source
            for p in self.state.profiles
            if p.source and p.source.startswith(("http://", "https://"))
        }
        self.state.subscriptions = [
            s for s in self.state.subscriptions if s.url in active_urls
        ]
        alive_ids = {s.id for s in self.state.subscriptions}
        alive_ids.add("__manual__")
        orphan_traffic = [sid for sid in self.state.subscription_traffic if sid not in alive_ids]
        for sid in orphan_traffic:
            self.state.subscription_traffic.pop(sid, None)

    def _sync_subscriptions_from_profiles(self) -> None:
        """Backfill subscription records for profiles imported before grouping existed."""
        known = {s.url for s in self.state.subscriptions}
        for profile in self.state.profiles:
            src = profile.source
            if src and src.startswith(("http://", "https://")) and src not in known:
                self.state.subscriptions.append(
                    Subscription(
                        id=self._subscription_id(src),
                        url=src,
                        name=self._subscription_name(src),
                        added_at=time.time(),
                    )
                )
                known.add(src)

    def get_system_status(self) -> dict:
        self._sync_runtime_state()
        tun_ready = self.wintun.is_available and self.elevation.is_admin()
        traffic_mode = "off"
        if self.state.core_running:
            if self.state.tun_active and self.state.system_proxy_active:
                traffic_mode = "tun+proxy"
            elif self.state.tun_active:
                traffic_mode = "tun"
            elif self.state.system_proxy_active:
                traffic_mode = "system_proxy"
        return {
            "is_admin": self.elevation.is_admin(),
            "wintun_available": self.wintun.is_available,
            "tun_ready": tun_ready,
            "tun_active": self.state.tun_active and self.state.core_running,
            "system_proxy_active": self.state.system_proxy_active,
            "traffic_mode": traffic_mode,
            "mixed_port": self.config_builder.mixed_port,
            "controller_port": self.config_builder.controller_port,
            "ports_auto_selected": self._ports_auto_selected,
            "core_auto_recovery_paused": self._core_supervisor.recovery_paused,
            "routing_mode": self.state.routing_mode,
            "browser_captured": self.state.core_running
            and (self.state.tun_active or self.state.system_proxy_active),
            "core_binary_present": self._core_binary.is_file(),
            "core_process_alive": self._proxy_manager.is_running,
        }

    async def set_routing_mode(self, mode: RoutingMode) -> None:
        self.state.routing_mode = mode
        self._persist_state()
        if mode == "direct":
            if self.state.core_running:
                await self.stop_core()
            return
        if self.state.core_running:
            await self._restart_core()

    def _set_auto_select_fallback(self, value: bool) -> None:
        self.state.auto_select_in_fallback = value
        self._persist_state()

    def get_settings(self) -> dict:
        return {
            "connect_on_startup": self.state.connect_on_startup,
            "auto_select_enabled": self.state.auto_select_enabled,
            "auto_select": self.state.auto_select.model_dump(),
            "kill_switch_enabled": self.state.kill_switch_enabled,
        }

    async def factory_reset(self, *, wipe_data: bool = False) -> dict:
        """Reset preferences-like backend state. Optionally wipe subscriptions/rules/nodes."""
        if self.state.core_running or self.state.core_starting:
            try:
                await self.stop_core()
            except Exception:  # noqa: BLE001 — reset must continue
                self.logger.exception("factory_reset: stop_core failed")

        if wipe_data:
            self.state.profiles = []
            self.state.subscriptions = []
            self.state.custom_rules = []
            self.state.process_tunnels = []
            self.state.subscription_traffic = {}
            self.state.active_profile_id = None
            self.state.health_statuses = {}
            self.process_tunnel = ProcessTunnelConfigBuilder([])
            self.monitor.set_profiles([])
            self.monitor.set_active(None)

        self.state.blocked_servers = []
        self.state.connect_on_startup = False
        self.state.auto_select_enabled = False
        self.state.auto_select = AutoSelectSettings()
        self.state.auto_select_in_fallback = False
        self.state.kill_switch_enabled = True
        if self.state.kill_switch_engaged:
            self.state.kill_switch_engaged = False
        self.state.routing_mode = "rule"
        self.failover.set_auto_select_checker(lambda: self.state.auto_select_enabled)
        self._refresh_connection_phase()
        self._persist_state()
        return {
            "ok": True,
            "wipe_data": wipe_data,
            "settings": self.get_settings(),
        }

    async def update_settings(
        self,
        *,
        connect_on_startup: bool | None = None,
        auto_select_enabled: bool | None = None,
        auto_select: AutoSelectSettings | dict | None = None,
        kill_switch_enabled: bool | None = None,
    ) -> dict:
        prev_enabled = self.state.auto_select_enabled
        if connect_on_startup is not None:
            self.state.connect_on_startup = connect_on_startup
        settings_changed = False
        if auto_select is not None:
            if isinstance(auto_select, dict):
                merged = self.state.auto_select.model_dump()
                merged.update({k: v for k, v in auto_select.items() if v is not None})
                self.state.auto_select = migrate_auto_select_settings(merged)
            else:
                self.state.auto_select = auto_select
            settings_changed = True
        if auto_select_enabled is not None:
            self.state.auto_select_enabled = auto_select_enabled
            self.failover.set_auto_select_checker(lambda: self.state.auto_select_enabled)
        ks_turned_on = False
        if kill_switch_enabled is not None:
            prev_ks = self.state.kill_switch_enabled
            self.state.kill_switch_enabled = kill_switch_enabled
            if not kill_switch_enabled and self.state.kill_switch_engaged:
                await self._set_kill_switch_engaged(False)
            ks_turned_on = bool(kill_switch_enabled and not prev_ks)
            self._refresh_connection_phase()
        self._persist_state()
        enabled_turned_on = (
            auto_select_enabled is True
            and not prev_enabled
            and self.state.auto_select_enabled
        )
        if enabled_turned_on or (settings_changed and self.state.auto_select_enabled):
            await self._reselect_after_auto_select_change()
        if ks_turned_on and self.state.core_running:
            await self._evaluate_transport_guard()
        return self.get_settings()

    async def _reselect_after_auto_select_change(self) -> None:
        if not self.state.core_running:
            return
        result = self._select_server(force_fallback=self.state.auto_select_in_fallback)
        if result.profile_id and not result.needs_fallback_prompt:
            await self._apply_selection(result)

    async def _reselect_if_active_blocked(self) -> None:
        if not self.state.active_profile_id:
            return
        active = next(
            (profile for profile in self.state.profiles if profile.id == self.state.active_profile_id),
            None,
        )
        if active is None or not is_profile_blocked(active, self.state.blocked_servers):
            return
        result = self._select_server(force_fallback=True)
        if result.profile_id and not result.needs_fallback_prompt:
            await self._apply_selection(result)

    def _select_server(self, *, force_fallback: bool = False) -> SelectionResult:
        return self.selector.select(
            self.state.profiles,
            self.monitor.statuses,
            self.state.auto_select,
            self.state.blocked_servers,
            force_fallback=force_fallback,
        )

    async def set_blocked_servers(self, entries: list) -> list:
        from pydantic import ValidationError

        from pawlink.models.blocked import BlockedServer

        try:
            self.state.blocked_servers = [BlockedServer.model_validate(item) for item in entries]
        except ValidationError as exc:
            raise ValueError(str(exc)) from exc
        self._persist_state()
        await self._reselect_if_active_blocked()
        return [item.model_dump() for item in self.state.blocked_servers]

    async def _apply_selection(self, result: SelectionResult) -> None:
        if not result.profile_id:
            return
        self.state.active_profile_id = result.profile_id
        self.state.auto_select_in_fallback = result.in_fallback
        self._persist_state()
        await self.failover.force_switch(result.profile_id)
        if self.state.core_running:
            await self._rebuild_and_reload()

    def _selection_payload(self, result: SelectionResult) -> dict:
        return {
            "active_profile_id": result.profile_id,
            "profile_name": result.profile_name,
            "matched_criteria": result.matched_criteria,
            "needs_fallback_prompt": result.needs_fallback_prompt,
            "fallback_profile_id": result.fallback_profile_id,
            "fallback_profile_name": result.fallback_profile_name,
            "in_fallback": result.in_fallback,
            "reason": result.reason,
        }

    async def get_core_status(self, *, detailed: bool = False) -> dict:
        self._sync_runtime_state()
        tun_enabled = self._tun_enabled()
        self._refresh_connection_phase()
        result: dict = {
            "core_running": self.state.core_running,
            "core_starting": self.state.core_starting,
            "routing_mode": self.state.routing_mode,
            "tun_active": self.state.tun_active,
            "system_proxy_active": self.state.system_proxy_active,
            "custom_rules_count": len(self.state.custom_rules),
            "config_path": str(self._config_path),
            "controller_url": self.config_builder.controller_url,
            "tun_planned": tun_enabled,
            "controller_alive": False,
            "runtime_mode": None,
            "mixed_port": self.config_builder.mixed_port,
            "controller_port": self.config_builder.controller_port,
            "ports_auto_selected": self._ports_auto_selected,
            "core_auto_recovery_paused": self._core_supervisor.recovery_paused,
            "connection_phase": self.state.connection_phase,
            "kill_switch_enabled": self.state.kill_switch_enabled,
            "kill_switch_engaged": self.state.kill_switch_engaged,
        }
        if not detailed:
            return result

        runtime_mode = None
        controller_alive = False
        if self.state.core_running:
            controller_alive = await self.core_controller.is_alive()
            if controller_alive:
                runtime_mode = await self.core_controller.get_runtime_mode()
        preview = await asyncio.to_thread(
            lambda: self.config_builder.build(
                self.state.profiles,
                active_profile_id=self.state.active_profile_id,
                custom_rules=self.state.custom_rules,
                process_tunnel=self.process_tunnel,
                tun_enabled=tun_enabled,
                routing_mode=self.state.routing_mode,
                subscriptions=self.state.subscriptions,
                kill_switch_engaged=self.state.kill_switch_engaged and self.state.kill_switch_enabled,
            )
        )
        result.update(
            {
                "controller_alive": controller_alive,
                "runtime_mode": runtime_mode,
                "config_rules_count": len(preview.get("rules", [])),
                "config_rules_preview": preview.get("rules", [])[:12],
            }
        )
        return result

    def _cleanup_stale_log_files(self) -> None:
        """Remove leftover log files from older builds (no disk logs by design)."""
        for name in ("mihomo.log", "backend.log"):
            path = self._data_dir / name
            try:
                if path.is_file():
                    path.unlink()
            except OSError:
                logger.debug("Could not remove stale log file %s", path)

    def _cleanup_stale_tmp_files(self) -> None:
        """Remove interrupted download leftovers in bin/."""
        bin_dir = self._data_dir / "bin"
        if not bin_dir.is_dir():
            return
        for path in bin_dir.glob("*.tmp"):
            try:
                path.unlink()
            except OSError:
                logger.debug("Could not remove temp file %s", path)

    def _cancel_session_tasks(self) -> None:
        """Cancel fire-and-forget work tied to an active VPN session."""
        for attr in (
            "_transport_guard_task",
            "_failover_reload_task",
            "_post_connect_probe_task",
            "_health_refresh_task",
        ):
            task = getattr(self, attr, None)
            if task is not None and not task.done():
                task.cancel()
            setattr(self, attr, None)
        self._transport_guard_pending = False

    def _schedule_transport_guard(self) -> None:
        """Coalesce transport-guard runs — never pile up one task per health tick."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._loop = loop
        task = self._transport_guard_task
        if task is not None and not task.done():
            self._transport_guard_pending = True
            return
        self._transport_guard_pending = False

        async def runner() -> None:
            try:
                while True:
                    await self._evaluate_transport_guard()
                    if not self._transport_guard_pending:
                        return
                    self._transport_guard_pending = False
            except asyncio.CancelledError:
                raise

        self._transport_guard_task = loop.create_task(runner(), name="PawLinkTransportGuard")

    async def initialize(self, *, require_elevation: bool = True) -> None:
        self._loop = asyncio.get_running_loop()
        self._cleanup_stale_log_files()
        self._cleanup_stale_tmp_files()
        if require_elevation and not self.elevation.is_admin():
            logger.warning(
                "Running without administrator privileges; TUN/Wintun unavailable "
                "(system proxy fallback). Relaunch elevated for full capture."
            )

        # Keep startup lean: cleanup / seed / snapshot in background after API is up.
        # Delay health probes until bootstrap finishes — early pings are inflated.
        self.wintun.load()
        self.failover.start()
        self._watchdog.start()
        self.geo_sync.start()
        self._core_supervisor.start()
        asyncio.create_task(self._post_initialize_bootstrap())
        if self.state.connect_on_startup and self.state.profiles:
            asyncio.create_task(self._auto_connect_on_startup())
        logger.info(
            "PawLink backend initialized (admin=%s, wintun=%s)",
            self.elevation.is_admin(),
            self.wintun.is_available,
        )

    async def _post_initialize_bootstrap(self) -> None:
        try:
            await asyncio.to_thread(self._cleanup_stale_runtime)
            await asyncio.to_thread(self.network_recovery.capture_snapshot)
            await asyncio.to_thread(self.rule_lists.ensure_bundled)
            await self._provision_wintun_if_admin()
            if self.elevation.is_admin():
                await asyncio.to_thread(self.wintun.cleanup_stale_adapters)
        except Exception:
            logger.exception("Post-initialize bootstrap failed")
        finally:
            self._bootstrap_ready.set()
            # Start ping only after runtime is settled (VPN connect is independent).
            asyncio.create_task(self._start_health_monitoring())

    async def _auto_connect_on_startup(self) -> None:
        await self._bootstrap_ready.wait()
        if self.state.core_running or self.state.core_starting:
            return
        try:
            await self.start_core()
            logger.info("Auto-connected VPN on startup")
        except ConnectError as exc:
            logger.error(
                "Auto-connect on startup failed at stage=%s: %s",
                exc.stage,
                exc.message,
            )
        except Exception:
            logger.exception("Auto-connect on startup failed")

    async def _start_health_monitoring(self) -> None:
        """Begin background latency checks after app/runtime settle."""
        try:
            await asyncio.sleep(2.0)
            if self.state.core_starting:
                # Wait for connect — full URL-test scan runs in _probe_health_after_connect.
                for _ in range(40):
                    if not self.state.core_starting:
                        break
                    await asyncio.sleep(0.25)
            self.monitor.start()
            # Only scan here when VPN is off (TCP). Avoid triple URL-test storms on connect.
            if self.state.profiles and not self.state.core_running and not self.state.core_starting:
                await self.monitor.check_all(fast=True)
                self.state.health_statuses = self.monitor.statuses
        except Exception:
            logger.debug("Delayed health monitoring start failed", exc_info=True)

    async def _probe_health_after_connect(self) -> None:
        """Single URL-test pass after core is ready (skip TUN/fake-ip TCP junk)."""
        try:
            await asyncio.sleep(0.8)
            if not self.state.core_running or not self.state.profiles:
                return
            await self.monitor.check_all(fast=True)
            self.state.health_statuses = self.monitor.statuses
        except Exception:
            logger.debug("Post-connect health probe failed", exc_info=True)

    def _sync_runtime_state(self) -> None:
        """Drop stale 'connected' state when mihomo died but UI still shows on."""
        if not self.state.core_running:
            return
        if self._proxy_manager.is_running:
            return
        # During intentional restart / recovery the core is briefly down —
        # never wipe session timer / connected state from background polls.
        if (
            self._rebuild_lock.locked()
            or self.state.core_starting
            or getattr(self._core_supervisor, "_recovering", False)
            or self._proxy_manager.intentional_stop
        ):
            return
        self._reset_connection_state("Proxy core is not running; resetting connection state")

    def _on_proxy_exit(self) -> None:
        """Called from the process-exit watcher thread — marshal onto the event loop."""
        loop = self._loop
        if loop is not None and loop.is_running():
            loop.call_soon_threadsafe(self._handle_proxy_exit)
            return
        self._handle_proxy_exit()

    def _handle_proxy_exit(self) -> None:
        if not self.state.core_running:
            return
        # Intentional stop already skipped by ProxyProcessManager; keep a guard.
        if self._rebuild_lock.locked() or getattr(self._core_supervisor, "_recovering", False):
            return
        if self._core_restarting:
            return
        self._reset_connection_state("Proxy core exited unexpectedly")

    def _reset_connection_state(self, reason: str) -> None:
        logger.warning(reason)
        self.state.core_running = False
        self.state.core_connected_at = None
        self.state.tun_active = False
        self.state.system_proxy_active = False
        # Keep KS engaged across crash when VPN should stay on — recovery rebuilds
        # with REJECT so we do not silently open PROXY after mihomo comes back.
        if not (self._vpn_desired and self.state.kill_switch_enabled):
            self.state.kill_switch_engaged = False
            self._link_fail_streak = 0
        self.system_proxy.clear_if_points_to(self.config_builder.mixed_port)
        self.monitor.set_controller_url(None)
        self.traffic.set_controller_url(None)
        self.traffic.stop()
        self._refresh_connection_phase()

    def _cleanup_stale_runtime(self) -> None:
        """Recover from a previous crash: orphan PawLink mihomo + stale system proxy."""
        self.state.core_running = False
        self.state.tun_active = False
        self.state.system_proxy_active = False
        self._vpn_desired = False
        if self._proxy_manager.is_running:
            self._proxy_manager.stop()
        release_session_mihomo_ports(
            self._data_dir,
            config_path=self._config_path,
            binary_path=self._core_binary,
        )
        self.system_proxy.clear_if_points_to(self.config_builder.mixed_port)

    def _apply_runtime_ports(self, mixed: int, controller: int) -> None:
        self.config_builder.set_runtime_ports(mixed_port=mixed, controller_port=controller)
        self.core_controller = MihomoController(self.config_builder.controller_url)

    async def _prepare_core_ports(self) -> None:
        mixed, ctrl, auto = await asyncio.to_thread(
            prepare_mihomo_ports,
            self._data_dir,
            config_path=self._config_path,
            binary_path=self._core_binary,
        )
        self._ports_auto_selected = auto
        self._apply_runtime_ports(mixed, ctrl)

    def _release_own_ports(self) -> None:
        release_session_mihomo_ports(
            self._data_dir,
            config_path=self._config_path,
            binary_path=self._core_binary,
            mixed_port=self.config_builder.mixed_port,
            controller_port=self.config_builder.controller_port,
        )

    async def _stop_orphan_core(self) -> None:
        await asyncio.to_thread(self._proxy_manager.stop)
        await asyncio.to_thread(self._release_own_ports)

    async def _recover_core_after_failure(self) -> None:
        if not self._vpn_desired:
            self._core_supervisor._recovering = False
            self._refresh_connection_phase()
            return
        self.state.core_starting = True
        self._refresh_connection_phase()
        self._core_supervisor.notify_starting()
        try:
            async with self._rebuild_lock:
                if self._proxy_manager.is_running:
                    await asyncio.to_thread(self._proxy_manager.stop)
                    await self._wait_ports_released()
                await self._prepare_core_ports()
                plan = await self._build_and_write_config()
                await self._start_core_process(plan)
                self.state.core_running = True
                if self.state.core_connected_at is None:
                    self.state.core_connected_at = time.time()
                await self._sync_traffic_capture(plan)
            self.monitor.set_controller_url(self.config_builder.controller_url)
            self.traffic.set_controller_url(self.config_builder.controller_url)
            self.traffic.start()
            self._core_supervisor.notify_running()
        except Exception:
            self.state.core_running = False
            self._core_supervisor._recovering = False
            raise
        finally:
            self.state.core_starting = False
            self._refresh_connection_phase()

    async def _ensure_core_alive(self) -> None:
        await self.core_controller.wait_until_alive(
            is_process_running=lambda: self._proxy_manager.is_running,
        )

    async def _wait_ports_released(self) -> None:
        mixed = self.config_builder.mixed_port
        ctrl = self.config_builder.controller_port
        await asyncio.to_thread(wait_until_port_free, mixed)
        await asyncio.to_thread(wait_until_port_free, ctrl)

    async def _provision_wintun_if_admin(self) -> None:
        """Download wintun.dll in the background so TUN is ready before connect."""
        if not self.elevation.is_admin() or self.wintun.is_available:
            return
        try:
            downloaded = await self.downloader.ensure_wintun()
            if downloaded:
                self.wintun.load()
        except Exception:
            logger.exception("Background wintun provisioning failed")

    async def _sync_traffic_capture(self, plan: CapturePlan) -> None:
        """Apply Windows capture according to the active routing mode."""
        if not self.state.core_running:
            return
        self.state.tun_active = plan.tun_enabled
        if plan.system_proxy:
            enabled = await asyncio.to_thread(
                self.system_proxy.enable,
                "127.0.0.1",
                self.config_builder.mixed_port,
            )
            self.state.system_proxy_active = enabled
            logger.info(
                "System proxy capture on :%s (TUN off); mode=%s",
                self.config_builder.mixed_port,
                self.state.routing_mode,
            )
        else:
            await asyncio.to_thread(self.system_proxy.disable)
            self.state.system_proxy_active = False
            if plan.tun_enabled:
                logger.info(
                    "TUN-only capture (no system proxy); mode=%s",
                    self.state.routing_mode,
                )

    async def shutdown(self) -> None:
        if getattr(self, "_shutdown_complete", False):
            return
        self._vpn_desired = False
        self._cancel_session_tasks()
        self._core_supervisor.stop()
        self.monitor.stop()
        await self.traffic.stop_async()
        self.failover.stop()
        self.geo_sync.stop()
        self._watchdog.stop()
        self._proxy_manager.stop()
        await asyncio.to_thread(self._release_own_ports)
        self.system_proxy.disable()
        self.network_recovery.restore()
        self.state.core_running = False
        self.state.core_connected_at = None
        self.state.tun_active = False
        self.state.system_proxy_active = False
        self._persist_state()
        self._shutdown_complete = True
        logger.info("PawLink backend shut down")

    async def import_config(
        self,
        *,
        raw: str | None = None,
        file_path: str | None = None,
        subscription_url: str | None = None,
    ) -> list[EndpointProfile]:
        profiles: list[EndpointProfile] = []
        if raw:
            profiles.extend(self.aggregator.parse_raw(raw))
        if file_path:
            profiles.extend(self.aggregator.parse_file(file_path))
        if subscription_url:
            profiles.extend(await self.aggregator.fetch_subscription(subscription_url))
            self._register_subscription(subscription_url)

        existing_ids = {p.id for p in self.state.profiles}
        used_names = {p.name for p in self.state.profiles}
        merged = list(self.state.profiles)
        added: list[EndpointProfile] = []
        for profile in profiles:
            if profile.id in existing_ids:
                continue
            # Mihomo requires unique proxy names within a config.
            base_name = profile.name
            suffix = 2
            while profile.name in used_names:
                profile.name = f"{base_name} ({suffix})"
                suffix += 1
            used_names.add(profile.name)
            existing_ids.add(profile.id)
            merged.append(profile)
            added.append(profile)

        self.state.profiles = merged
        if self.state.active_profile_id is None and merged:
            self.state.active_profile_id = merged[0].id
        self.failover.configure(merged, self.state.active_profile_id)
        self.monitor.set_profiles(merged)
        self._persist_state()
        await self._rebuild_and_reload()
        return added

    async def remove_node(self, profile_id: str) -> bool:
        before = len(self.state.profiles)
        self.state.profiles = [p for p in self.state.profiles if p.id != profile_id]
        if len(self.state.profiles) == before:
            return False
        self.state.health_statuses.pop(profile_id, None)
        self.monitor.drop(profile_id)
        if self.state.active_profile_id == profile_id:
            self.state.active_profile_id = (
                self.state.profiles[0].id if self.state.profiles else None
            )
        self.failover.configure(self.state.profiles, self.state.active_profile_id)
        self.monitor.set_profiles(self.state.profiles)
        self._prune_subscriptions()
        self._persist_state()
        await self._rebuild_and_reload()
        return True

    def _is_http_source(self, source: str | None) -> bool:
        return bool(source and source.startswith(("http://", "https://")))

    async def remove_source_group(self, source: str) -> dict:
        """Remove a whole subscription/manual group and its profiles."""
        source = (source or "").strip()
        if not source:
            return {"removed": 0, "profiles": len(self.state.profiles)}

        if source == "__manual__":
            keep = [p for p in self.state.profiles if self._is_http_source(p.source)]
            removed_profiles = [p for p in self.state.profiles if not self._is_http_source(p.source)]
        else:
            keep = [p for p in self.state.profiles if p.source != source]
            removed_profiles = [p for p in self.state.profiles if p.source == source]
            self.state.subscriptions = [s for s in self.state.subscriptions if s.url != source]
            sub_id = self._subscription_id(source)
            self.state.subscription_traffic.pop(sub_id, None)

        if not removed_profiles:
            return {"removed": 0, "profiles": len(self.state.profiles)}

        for profile in removed_profiles:
            self.state.health_statuses.pop(profile.id, None)
            self.monitor.drop(profile.id)

        removed_ids = {p.id for p in removed_profiles}
        self.state.profiles = keep
        if self.state.active_profile_id in removed_ids:
            self.state.active_profile_id = keep[0].id if keep else None
        self.failover.configure(self.state.profiles, self.state.active_profile_id)
        self.monitor.set_profiles(self.state.profiles)
        self._prune_subscriptions()
        self._persist_state()
        await self._rebuild_and_reload()
        return {"removed": len(removed_profiles), "profiles": len(self.state.profiles)}

    async def refresh_subscriptions(self, url: str | None = None) -> dict:
        """Re-fetch subscription source(s) and replace their nodes.

        Manually added nodes and nodes from sources that failed to refresh
        are kept untouched. Pass ``url`` to refresh a single subscription.
        """
        if url:
            sources = [url.strip()]
        else:
            sources = sorted(
                {
                    *(
                        p.source
                        for p in self.state.profiles
                        if self._is_http_source(p.source)
                    ),
                    *(s.url for s in self.state.subscriptions),
                }
            )
        if not sources or (url and not sources[0]):
            return {"sources": 0, "profiles": len(self.state.profiles), "errors": {}}

        fetched: list[EndpointProfile] = []
        refreshed_sources: set[str] = set()
        errors: dict[str, str] = {}
        for source_url in sources:
            try:
                fetched.extend(await self.aggregator.fetch_subscription(source_url))
                refreshed_sources.add(source_url)
                self._register_subscription(source_url)
            except Exception as exc:
                logger.warning("Subscription refresh failed for %s: %s", source_url, exc)
                errors[source_url] = str(exc)

        merged = [p for p in self.state.profiles if p.source not in refreshed_sources]
        used_names = {p.name for p in merged}
        known_ids = {p.id for p in merged}
        for profile in fetched:
            if profile.id in known_ids:
                continue
            base_name = profile.name
            suffix = 2
            while profile.name in used_names:
                profile.name = f"{base_name} ({suffix})"
                suffix += 1
            used_names.add(profile.name)
            known_ids.add(profile.id)
            merged.append(profile)

        self.state.profiles = merged
        if self.state.active_profile_id not in known_ids:
            self.state.active_profile_id = merged[0].id if merged else None
        self.failover.configure(merged, self.state.active_profile_id)
        self.monitor.set_profiles(merged)
        self.state.health_statuses = self.monitor.statuses
        self._prune_subscriptions()
        self._persist_state()
        await self._rebuild_and_reload()
        return {"sources": len(refreshed_sources), "profiles": len(merged), "errors": errors}

    @staticmethod
    def _rule_key(rule: RoutingRule) -> tuple[str, str]:
        return (rule.rule_type.value, rule.value.lower())

    @classmethod
    def _unique_rules(cls, rules: list[RoutingRule]) -> list[RoutingRule]:
        """Keep one rule per (type, value); later entries win on action conflict."""
        seen: dict[tuple[str, str], int] = {}
        unique: list[RoutingRule] = []
        for rule in rules:
            key = cls._rule_key(rule)
            if key in seen:
                unique[seen[key]] = rule
            else:
                seen[key] = len(unique)
                unique.append(rule)
        return unique

    async def add_custom_rule(self, raw_input: str, action: str = "PROXY") -> RoutingRule:
        rule = self.rule_sanitizer.sanitize(raw_input, action)
        key = self._rule_key(rule)
        for index, existing in enumerate(self.state.custom_rules):
            if self._rule_key(existing) != key:
                continue
            if existing.action == rule.action:
                return existing
            self.state.custom_rules[index] = rule
            self._persist_state()
            await self._rebuild_and_reload()
            return rule
        self.state.custom_rules.append(rule)
        self._persist_state()
        await self._rebuild_and_reload()
        return rule

    async def remove_custom_rule(self, index: int) -> bool:
        if index < 0 or index >= len(self.state.custom_rules):
            return False
        self.state.custom_rules.pop(index)
        self._persist_state()
        await self._rebuild_and_reload()
        return True

    async def clear_custom_rules(self) -> int:
        count = len(self.state.custom_rules)
        if count == 0:
            return 0
        self.state.custom_rules = []
        self._persist_state()
        await self._rebuild_and_reload()
        return count

    def rule_lists_directory(self) -> str:
        self.rule_lists.ensure_bundled()
        return str(self.rule_lists.directory.resolve())

    def open_rule_lists_directory(self) -> str:
        path = Path(self.rule_lists_directory())
        path.mkdir(parents=True, exist_ok=True)
        resolved = str(path)
        if sys.platform == "win32":
            os.startfile(resolved)  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", resolved], close_fds=True)  # noqa: S603
        else:
            subprocess.Popen(["xdg-open", resolved], close_fds=True)  # noqa: S603
        return resolved

    def list_rule_lists(self) -> list[dict]:
        return [
            {
                "name": item.name,
                "rule_count": item.rule_count,
                "path": item.path,
                "bundled": item.bundled,
            }
            for item in self.rule_lists.list_lists()
        ]

    async def apply_rule_list(self, name: str, *, replace: bool = False) -> dict:
        incoming = await asyncio.to_thread(self.rule_lists.parse_named, name)
        if not incoming:
            raise ValueError(f"Список «{name}» пуст или не распознан")

        if replace:
            unique = self._unique_rules(incoming)
            self.state.custom_rules = unique
            added = len(unique)
            updated = 0
        else:
            index = {
                self._rule_key(r): i
                for i, r in enumerate(self.state.custom_rules)
            }
            added = 0
            updated = 0
            for rule in incoming:
                key = self._rule_key(rule)
                if key in index:
                    existing = self.state.custom_rules[index[key]]
                    if existing.action != rule.action:
                        self.state.custom_rules[index[key]] = rule
                        updated += 1
                else:
                    index[key] = len(self.state.custom_rules)
                    self.state.custom_rules.append(rule)
                    added += 1

        self._persist_state()
        await self._rebuild_and_reload()
        return {
            "name": name,
            "added": added,
            "updated": updated if not replace else 0,
            "total": len(self.state.custom_rules),
            "replace": replace,
        }

    async def import_rule_list(self, name: str, content: str) -> dict:
        info = await asyncio.to_thread(self.rule_lists.save_content, name, content)
        return {
            "name": info.name,
            "rule_count": info.rule_count,
            "path": info.path,
            "bundled": info.bundled,
        }

    async def download_rule_list(self, name: str, url: str) -> dict:
        info = await self.rule_lists.download(name, url)
        return {
            "name": info.name,
            "rule_count": info.rule_count,
            "path": info.path,
            "bundled": info.bundled,
        }

    async def delete_rule_list(self, name: str) -> bool:
        return await asyncio.to_thread(self.rule_lists.delete, name)

    def export_backup(self) -> dict:
        """Export persisted settings/profiles/rules for file backup (v2 sections)."""
        return {
            "format": BACKUP_FORMAT,
            "version": BACKUP_VERSION,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "data": export_state_sections(self.state),
        }

    async def import_backup(
        self,
        payload: dict,
        *,
        with_servers: bool = True,
        with_rules: bool = True,
        with_settings: bool = True,
    ) -> dict[str, int | bool]:
        """Restore a previously exported backup (v1 flat or v2 sectioned).

        ``with_servers`` — profiles/subscriptions/traffic.
        ``with_rules`` — routing mode, custom rules, process tunnels.
        ``with_settings`` — VPN startup, auto-failover, smart-route criteria.
        """
        if not with_servers and not with_rules and not with_settings:
            raise ValueError("Выберите хотя бы один тип данных для импорта")

        try:
            sections = normalize_backup_data(payload)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc

        servers = 0
        rules = 0
        tunnels = 0
        settings_applied = False

        if with_servers:
            server_data = sections["servers"]
            try:
                self.state.profiles = [
                    EndpointProfile.model_validate(item)
                    for item in server_data.get("profiles", [])
                ]
                self.state.subscriptions = [
                    Subscription.model_validate(item)
                    for item in server_data.get("subscriptions", [])
                ]
            except ValueError as exc:
                raise ValueError(f"Не удалось прочитать серверы: {exc}") from exc

            self.state.active_profile_id = server_data.get("active_profile_id")
            self.state.subscription_traffic = server_data.get("subscription_traffic", {})
            servers = len(self.state.profiles)
            self._sync_subscriptions_from_profiles()
            self.failover.configure(self.state.profiles, self.state.active_profile_id)
            self.monitor.set_profiles(self.state.profiles)
            self.monitor.set_active(self.state.active_profile_id)

        if with_rules:
            routing = sections["routing"]
            try:
                rules = [
                    RoutingRule.model_validate(item)
                    for item in routing.get("custom_rules", [])
                ]
                tunnels = [
                    ProcessTunnelEntry.model_validate(item)
                    for item in routing.get("process_tunnels", [])
                ]
            except ValueError as exc:
                raise ValueError(f"Не удалось прочитать правила: {exc}") from exc

            self.state.custom_rules = self._unique_rules(rules)
            self.state.process_tunnels = tunnels
            routing_mode = routing.get("routing_mode", "rule")
            if routing_mode in ("rule", "global", "direct"):
                self.state.routing_mode = routing_mode
            self.process_tunnel = ProcessTunnelConfigBuilder(self.state.process_tunnels)
            rules = len(self.state.custom_rules)
            tunnels = len(self.state.process_tunnels)

        if with_settings:
            settings = sections["settings"]
            self.state.connect_on_startup = bool(settings.get("connect_on_startup", False))
            self.state.auto_select_enabled = bool(settings.get("auto_select_enabled", False))
            self.state.auto_select = validate_settings_section(settings)
            self.state.auto_select_in_fallback = bool(
                settings.get("auto_select_in_fallback", False)
            )
            from pydantic import ValidationError

            from pawlink.models.blocked import BlockedServer

            blocked: list = []
            for item in settings.get("blocked_servers", []):
                try:
                    blocked.append(BlockedServer.model_validate(item))
                except ValidationError as exc:
                    raise ValueError(f"Некорректный список blocked_servers: {exc}") from exc
            self.state.blocked_servers = blocked
            self.state.kill_switch_enabled = bool(settings.get("kill_switch_enabled", True))
            if not self.state.kill_switch_enabled:
                self.state.kill_switch_engaged = False
                self._link_fail_streak = 0
            self.failover.set_auto_select_checker(lambda: self.state.auto_select_enabled)
            settings_applied = True

        self._persist_state()
        self._refresh_connection_phase()
        await self._rebuild_and_reload()
        return {
            "servers": servers,
            "rules": rules,
            "tunnels": tunnels,
            "settings": settings_applied,
            "with_servers": with_servers,
            "with_rules": with_rules,
            "with_settings": with_settings,
        }

    async def add_process_tunnel(self, executable: str, mode: str) -> None:
        tunnel_mode = ProcessTunnelMode.INCLUDE if mode == "include" else ProcessTunnelMode.EXCLUDE
        self.process_tunnel.add(executable, tunnel_mode)
        self.state.process_tunnels = self.process_tunnel.entries
        self._persist_state()
        await self._rebuild_and_reload()

    async def remove_process_tunnel(self, executable: str) -> bool:
        removed = self.process_tunnel.remove(executable)
        self.state.process_tunnels = self.process_tunnel.entries
        if removed:
            self._persist_state()
            await self._rebuild_and_reload()
        return removed

    async def _ensure_runtime_binaries(self) -> None:
        """Auto-provision mihomo (and wintun when possible) on first start."""
        if not self._core_binary.is_file() and self._core_binary == self.downloader.core_path:
            logger.info("Proxy core not found, downloading latest mihomo release")
            await self.downloader.ensure_core()
        if not self.wintun.is_available and self.elevation.is_admin():
            downloaded = await self.downloader.ensure_wintun()
            if downloaded:
                self.wintun.load()

    async def _build_and_write_config(self) -> CapturePlan:
        plan = self._capture_plan()
        ks = self.state.kill_switch_engaged and self.state.kill_switch_enabled
        config = self.config_builder.build(
            self.state.profiles,
            active_profile_id=self.state.active_profile_id,
            custom_rules=self.state.custom_rules,
            process_tunnel=self.process_tunnel,
            tun_enabled=plan.tun_enabled,
            routing_mode=self.state.routing_mode,
            subscriptions=self.state.subscriptions,
            kill_switch_engaged=ks,
        )
        self.config_builder.write(config, self._config_path)
        logger.info(
            "Config: mode=%s tun=%s proxy=%s ks=%s find-process=%s process_rules=%d domain_rules=%d tail=%s",
            self.state.routing_mode,
            plan.tun_enabled,
            plan.system_proxy,
            ks,
            config.get("find-process-mode"),
            len(self.process_tunnel.include_list()),
            len(self.state.custom_rules) if self.state.routing_mode == "rule" else 0,
            (config.get("rules") or [])[-1:],
        )
        return plan

    def _record_connect_failure(self, exc: ConnectError) -> None:
        self._last_connect_error = {**exc.as_dict(), "at": time.time()}
        logger.error("VPN connect failed at stage=%s: %s", exc.stage, exc.message)

    async def _rollback_failed_start(self) -> None:
        self._vpn_desired = False
        self._core_supervisor.notify_user_stop()
        self.state.core_running = False
        self.state.core_connected_at = None
        self.state.tun_active = False
        self.state.system_proxy_active = False
        self.state.kill_switch_engaged = False
        self._link_fail_streak = 0
        self.monitor.set_controller_url(None)
        self.traffic.set_controller_url(None)
        self.traffic.stop()
        try:
            if self._proxy_manager.is_running:
                await asyncio.to_thread(self._proxy_manager.stop)
            await asyncio.to_thread(self._release_own_ports)
            await asyncio.to_thread(self.system_proxy.disable)
        except Exception:
            logger.exception("Rollback after connect failure failed")
        self._refresh_connection_phase()

    @staticmethod
    def _connect_error_message(exc: BaseException) -> str:
        if isinstance(exc, ConnectError):
            return exc.message
        return str(exc) or type(exc).__name__

    async def _start_core_process(self, plan: CapturePlan) -> None:
        await asyncio.to_thread(self._proxy_manager.start)
        await self._ensure_core_alive()

    async def _restart_core(self) -> None:
        """Restart mihomo after node switch / failover and rebind monitors."""
        self._core_restarting = True
        self._refresh_connection_phase()
        try:
            async with self._rebuild_lock:
                # Pause probes so in-flight delay tests cannot write stale pings.
                self.monitor.begin_reload()
                self.traffic.set_controller_url(None)
                self.traffic.stop()
                try:
                    if self._proxy_manager.is_running:
                        await asyncio.to_thread(self._proxy_manager.stop)
                        await self._wait_ports_released()
                    await self._prepare_core_ports()
                    plan = await self._build_and_write_config()
                    await self._start_core_process(plan)
                    self.state.core_running = True
                    # Keep original session start; only seed if somehow cleared mid-restart.
                    if self.state.core_connected_at is None:
                        self.state.core_connected_at = time.time()
                    await self._sync_traffic_capture(plan)
                except Exception:
                    self.monitor.end_reload(None)
                    raise

                controller = self.config_builder.controller_url
                self.monitor.end_reload(controller)
                self.traffic.set_controller_url(controller)
                self.traffic.reset_session()
                self.traffic.start()
                self._core_supervisor.notify_running()
                # Fresh ping for the new active node after core is ready.
                active = next(
                    (p for p in self.state.profiles if p.id == self.state.active_profile_id),
                    None,
                )
                if active is not None:
                    asyncio.create_task(self.monitor.check_one(active, fast=True))
        finally:
            self._core_restarting = False
            self._refresh_connection_phase()

    def _start_was_cancelled(self) -> bool:
        """True when stop_core (or direct mode) asked to abort an in-flight start."""
        return not self._vpn_desired or self.state.routing_mode == "direct"

    async def _abort_cancelled_start(self) -> None:
        """Clean up a start that lost to a concurrent stop / mode change."""
        logger.info("VPN start cancelled by user action")
        self.state.core_running = False
        self.state.core_connected_at = None
        self.state.tun_active = False
        self.state.system_proxy_active = False
        self.state.kill_switch_engaged = False
        self._link_fail_streak = 0
        self.monitor.set_controller_url(None)
        self.traffic.set_controller_url(None)
        self.traffic.stop()
        try:
            if self._proxy_manager.is_running:
                await asyncio.to_thread(self._proxy_manager.stop)
            await asyncio.to_thread(self._release_own_ports)
            await asyncio.to_thread(self.system_proxy.disable)
        except Exception:
            logger.exception("Cleanup after cancelled start failed")
        self._refresh_connection_phase()

    async def start_core(self) -> None:
        async with self._connect_op_lock:
            # Idempotent: already up and still desired.
            if (
                self.state.core_running
                and self._vpn_desired
                and self._proxy_manager.is_running
                and not self.state.core_starting
            ):
                self._refresh_connection_phase()
                return

            if self.state.routing_mode == "direct":
                self.state.routing_mode = "rule"
                self._persist_state()
            if not self.state.profiles:
                raise ConnectError(
                    STAGE_PRECHECK,
                    "Нет узлов для подключения. Сначала импортируйте подписку или добавьте сервер.",
                )
            if self.state.active_profile_id is None:
                self.state.active_profile_id = self.state.profiles[0].id
                self._persist_state()

            if self.state.routing_mode == "rule" and not self.elevation.is_admin():
                raise ConnectError(
                    STAGE_PRECHECK,
                    "Режим «Правила» требует прав администратора (TUN). "
                    "Переключитесь на «Глобальный» или перезапустите PawLink от администратора.",
                )

            self.state.core_starting = True
            self.state.kill_switch_engaged = False
            self._link_fail_streak = 0
            self._vpn_desired = True
            self._core_supervisor.notify_user_reconnect()
            self._refresh_connection_phase()
            self._core_supervisor.notify_starting()
            try:
                try:
                    await self._ensure_runtime_binaries()
                except ConnectError:
                    raise
                except Exception as exc:
                    raise ConnectError(
                        STAGE_BINARIES,
                        self._connect_error_message(exc),
                    ) from exc

                if self._start_was_cancelled():
                    await self._abort_cancelled_start()
                    return

                async with self._rebuild_lock:
                    if self._start_was_cancelled():
                        await self._abort_cancelled_start()
                        return
                    try:
                        if self._proxy_manager.is_running:
                            await asyncio.to_thread(self._proxy_manager.stop)
                            await self._wait_ports_released()
                        await self._prepare_core_ports()
                    except ConnectError:
                        raise
                    except Exception as exc:
                        raise ConnectError(
                            STAGE_PORTS,
                            self._connect_error_message(exc),
                        ) from exc

                    if self._start_was_cancelled():
                        await self._abort_cancelled_start()
                        return

                    try:
                        plan = await self._build_and_write_config()
                    except ConnectError:
                        raise
                    except Exception as exc:
                        raise ConnectError(
                            STAGE_CONFIG,
                            self._connect_error_message(exc),
                        ) from exc

                    if self._start_was_cancelled():
                        await self._abort_cancelled_start()
                        return

                    try:
                        await asyncio.to_thread(self._proxy_manager.start)
                    except ConnectError:
                        raise
                    except Exception as exc:
                        raise ConnectError(
                            STAGE_MIHOMO_START,
                            self._connect_error_message(exc),
                        ) from exc

                    try:
                        await self._ensure_core_alive()
                    except ConnectError:
                        raise
                    except Exception as exc:
                        raise ConnectError(
                            STAGE_MIHOMO_READY,
                            self._connect_error_message(exc),
                        ) from exc

                    if self._start_was_cancelled():
                        await self._abort_cancelled_start()
                        return

                    self.state.core_running = True
                    self.state.core_connected_at = time.time()

                    try:
                        await self._sync_traffic_capture(plan)
                    except ConnectError:
                        raise
                    except Exception as exc:
                        raise ConnectError(
                            STAGE_CAPTURE,
                            self._connect_error_message(exc),
                        ) from exc

                if self._start_was_cancelled():
                    await self._abort_cancelled_start()
                    return

                self._last_connect_error = None
                self.monitor.set_controller_url(self.config_builder.controller_url)
                self.traffic.set_controller_url(self.config_builder.controller_url)
                self.traffic.reset_session()
                self.traffic.start()
                # Let mihomo settle before URL-test; early probes often return junk.
                if self._post_connect_probe_task and not self._post_connect_probe_task.done():
                    self._post_connect_probe_task.cancel()
                self._post_connect_probe_task = asyncio.create_task(
                    self._probe_health_after_connect(),
                    name="PawLinkPostConnectProbe",
                )
                self._core_supervisor.notify_running()
                self._refresh_connection_phase()
            except ConnectError as exc:
                self._record_connect_failure(exc)
                await self._rollback_failed_start()
                raise
            except Exception as exc:
                failure = ConnectError(STAGE_UNKNOWN, self._connect_error_message(exc))
                self._record_connect_failure(failure)
                await self._rollback_failed_start()
                raise failure from exc
            finally:
                self.state.core_starting = False
                self._refresh_connection_phase()

    async def stop_core(self) -> None:
        # Signal cancel immediately so an in-flight start aborts at the next checkpoint
        # even while it still holds _connect_op_lock.
        self._vpn_desired = False
        self._core_supervisor.notify_user_stop()
        async with self._connect_op_lock:
            self.state.core_starting = False
            self.state.kill_switch_engaged = False
            self._link_fail_streak = 0
            self._cancel_session_tasks()
            self.monitor.set_controller_url(None)
            self.traffic.set_controller_url(None)
            await self.traffic.stop_async()
            self.state.core_running = False
            self.state.core_connected_at = None
            self.state.tun_active = False
            self.state.system_proxy_active = False
            self._refresh_connection_phase()
            self._persist_state()
            async with self._rebuild_lock:
                await asyncio.gather(
                    asyncio.to_thread(self._proxy_manager.stop),
                    asyncio.to_thread(self.system_proxy.disable),
                )
                await asyncio.to_thread(self._release_own_ports)
                await asyncio.to_thread(self.network_recovery.restore)

    async def auto_select(self, *, force_fallback: bool = False) -> dict:
        """Pick the best server using smart-route criteria."""
        await self.monitor.check_all(fast=True)
        result = self._select_server(force_fallback=force_fallback)
        if result.needs_fallback_prompt and not force_fallback:
            return self._selection_payload(result)
        if result.profile_id:
            await self._apply_selection(result)
        return self._selection_payload(result)

    async def set_auto_select_enabled(self, enabled: bool) -> None:
        prev_enabled = self.state.auto_select_enabled
        self.state.auto_select_enabled = enabled
        self.failover.set_auto_select_checker(lambda: self.state.auto_select_enabled)
        self._persist_state()
        if enabled and not prev_enabled:
            await self._reselect_after_auto_select_change()

    async def switch_node(self, profile_id: str) -> bool:
        ok = await self.failover.force_switch(profile_id)
        if ok:
            self.state.active_profile_id = profile_id
            self.state.auto_select_in_fallback = False
            self._persist_state()
            await self._rebuild_and_reload(force_restart=True)
        return ok

    def _failover_switch_allowed(self) -> bool:
        return bool(
            self.state.core_running
            and not self.state.core_starting
            and not self.state.kill_switch_engaged
            and not self._core_restarting
            and not getattr(self._core_supervisor, "_recovering", False)
        )

    def _on_health_update(self, statuses: dict) -> None:
        self.state.health_statuses = statuses
        self._refresh_connection_phase()
        aid = self.state.active_profile_id
        status = statuses.get(aid) if aid else None
        if status is None:
            return
        sig = (aid, status.health, status.latency_ms, status.packet_loss, status.last_checked)
        if sig == self._last_active_health_sig:
            return
        self._last_active_health_sig = sig
        self._schedule_transport_guard()

    def _active_transport_ok(self) -> bool | None:
        """True = link OK, False = dead, None = not probed yet."""
        if not self.state.core_running:
            return False
        aid = self.state.active_profile_id
        if not aid:
            return None
        status = self.state.health_statuses.get(aid)
        if status is None or status.last_checked is None:
            return None
        if status.health == HealthLevel.RED or (
            status.latency_ms is None and status.packet_loss > 0
        ):
            return False
        # Hysteria2 (and similar) may report YELLOW with no latency — not proof of link.
        if status.latency_ms is None and status.health != HealthLevel.GREEN:
            return None
        return True

    def _refresh_connection_phase(self) -> None:
        recovering = bool(getattr(self._core_supervisor, "_recovering", False))
        recovery_paused = bool(getattr(self._core_supervisor, "recovery_paused", False))
        ks_active = bool(self.state.kill_switch_engaged and self.state.kill_switch_enabled)
        if self._core_restarting or recovering:
            self.state.connection_phase = "reconnecting"
            return
        if self.state.core_starting:
            self.state.connection_phase = "connecting"
            return
        if self._vpn_desired and recovery_paused:
            self.state.connection_phase = "no_link"
            return
        if not self.state.core_running:
            # VPN should stay on, but the core is down — never pretend we are simply "off".
            if self._vpn_desired:
                self.state.connection_phase = "reconnecting"
            else:
                self.state.connection_phase = "disconnected"
            return
        if ks_active:
            self.state.connection_phase = "no_link"
            return
        ok = self._active_transport_ok()
        if ok is False:
            self.state.connection_phase = "no_link"
        elif ok is None:
            # Core is up but active node not probed yet — don't claim "connected".
            self.state.connection_phase = "connecting"
        else:
            self.state.connection_phase = "connected"

    async def _set_kill_switch_engaged(self, engaged: bool) -> None:
        if self.state.kill_switch_engaged == engaged:
            self._refresh_connection_phase()
            return
        self.state.kill_switch_engaged = engaged
        logger.warning("Kill switch %s", "engaged" if engaged else "released")
        if self.state.core_running and not self.state.core_starting and not self._core_restarting:
            # Dead controller cannot hot-reload — force restart so KS config applies.
            controller_alive = await self.core_controller.is_alive()
            await self._rebuild_and_reload(force_restart=not controller_alive)
        self._refresh_connection_phase()

    async def _evaluate_transport_guard(self) -> None:
        async with self._transport_guard_lock:
            self._refresh_connection_phase()
            if not self.state.core_running or self.state.core_starting or self._core_restarting:
                return
            if getattr(self._core_supervisor, "_recovering", False):
                return

            if not self.state.kill_switch_enabled:
                self._link_fail_streak = 0
                if self.state.kill_switch_engaged:
                    await self._set_kill_switch_engaged(False)
                return

            ok = self._active_transport_ok()
            # Controller dead with process up = transport broken even if last ping was green.
            if ok is not False and self._proxy_manager.is_running:
                try:
                    if not await self.core_controller.is_alive():
                        ok = False
                except Exception:
                    ok = False

            if ok is True:
                self._link_fail_streak = 0
                if self.state.kill_switch_engaged:
                    await self._set_kill_switch_engaged(False)
                else:
                    self._refresh_connection_phase()
                return
            if ok is None:
                return

            self._link_fail_streak += 1
            self._refresh_connection_phase()
            if self._link_fail_streak < LINK_FAIL_STREAK_REQUIRED:
                return

            if self.state.auto_select_enabled and not self.state.kill_switch_engaged:
                previous = self.state.active_profile_id
                new_id = await self.failover.select_optimal(
                    force_fallback=self.state.auto_select_in_fallback
                )
                if new_id and new_id != previous:
                    self.state.active_profile_id = new_id
                    self._persist_state()
                    await self._rebuild_and_reload(force_restart=True)
                    self._link_fail_streak = 0
                    self._refresh_connection_phase()
                    return

            if not self.state.kill_switch_engaged:
                await self._set_kill_switch_engaged(True)

    async def get_health(self, *, force: bool = False) -> dict:
        if force:
            return await self.refresh_health()
        if not self.monitor.statuses:
            statuses = await self.monitor.check_all(fast=True)
            self.state.health_statuses = statuses
        return {k: v.model_dump() for k, v in self.monitor.statuses.items()}

    async def refresh_health(self) -> dict:
        """Probe all nodes from the PC (TCP to host:port)."""
        profiles = list(self.state.profiles)
        active = next((p for p in profiles if p.id == self.state.active_profile_id), None)
        if active:
            await self.monitor.check_one(active, fast=False)
        elif profiles:
            await self.monitor.check_one(profiles[0], fast=True)

        if self._health_refresh_task and not self._health_refresh_task.done():
            self._health_refresh_task.cancel()
        skip_id = active.id if active else None
        self._health_refresh_task = asyncio.create_task(self._refresh_remaining_health(skip_id))
        return {k: v.model_dump() for k, v in self.monitor.statuses.items()}

    async def _refresh_remaining_health(self, skip_id: str | None) -> None:
        try:
            for profile in self.state.profiles:
                if profile.id == skip_id:
                    continue
                await self.monitor.check_one(profile, fast=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Background health refresh failed")

    def list_processes(self) -> list[dict]:
        return [
            {"pid": p.pid, "executable": p.executable, "name": p.name, "exe_path": p.exe_path}
            for p in self.process_enumerator.list_running()
        ]

    def _on_failover(self, previous_id: str, new_id: str) -> None:
        if not self._failover_switch_allowed():
            logger.info(
                "Ignoring failover %s -> %s (core busy / kill switch engaged)",
                previous_id,
                new_id,
            )
            return
        self.state.active_profile_id = new_id
        self._persist_state()
        task = self._failover_reload_task
        if task is not None and not task.done():
            return
        self._failover_reload_task = asyncio.create_task(
            self._rebuild_and_reload(force_restart=True),
            name="PawLinkFailoverReload",
        )

    async def _rebuild_and_reload(self, *, force_restart: bool = False) -> None:
        """Apply config changes. Prefer hot-reload for rules; full restart when needed."""
        if not self.state.core_running:
            return
        if force_restart:
            await self._restart_core()
            return
        paused = False
        try:
            self.monitor.begin_reload()
            paused = True
            async with self._rebuild_lock:
                await self._build_and_write_config()
                self.core_controller = MihomoController(self.config_builder.controller_url)
                ok = await self.core_controller.reload_config(self._config_path)
            if ok:
                self.monitor.end_reload(self.config_builder.controller_url)
                paused = False
                return
            logger.warning("Hot-reload failed; falling back to full core restart")
        except Exception:
            logger.exception("Hot-reload failed; falling back to full core restart")
        finally:
            if paused:
                self.monitor.end_reload(None)
        await self._restart_core()
