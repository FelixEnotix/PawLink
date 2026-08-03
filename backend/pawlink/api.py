from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
import hmac
import os
import signal
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from pawlink.service import PawLinkService
from pawlink.errors import ConnectError

_service: PawLinkService | None = None


def get_service() -> PawLinkService:
    if _service is None:
        raise RuntimeError("PawLink service not initialized")
    return _service


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _service
    _service = PawLinkService()
    await _service.initialize(require_elevation=False)
    yield
    await _service.shutdown()


app = FastAPI(title="PawLink Backend", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def require_api_token(request: Request, call_next):
    expected_token = os.environ.get("PAWLINK_API_TOKEN")
    if (
        expected_token
        and request.url.path.startswith("/api/")
        and request.method != "OPTIONS"
    ):
        supplied_token = request.headers.get("X-PawLink-Token", "")
        if not hmac.compare_digest(supplied_token, expected_token):
            return JSONResponse(status_code=401, content={"detail": "Invalid API token"})
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImportConfigRequest(BaseModel):
    raw: str | None = Field(default=None, max_length=10_000_000)
    subscription_url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def require_source(self) -> "ImportConfigRequest":
        if not self.raw and not self.subscription_url:
            raise ValueError("Configuration text or subscription URL is required")
        return self


class AddRuleRequest(BaseModel):
    input: str
    action: Literal["PROXY", "DIRECT", "REJECT"] = "PROXY"


class ApplyRuleListRequest(BaseModel):
    replace: bool = False


class ImportRuleListRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    content: str = Field(min_length=1, max_length=5_000_000)


class DownloadRuleListRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    url: str = Field(min_length=8, max_length=2048)


class ProcessTunnelRequest(BaseModel):
    executable: str
    mode: str = Field(default="include", pattern="^(include|exclude)$")


class SwitchNodeRequest(BaseModel):
    profile_id: str


class RefreshSubscriptionsRequest(BaseModel):
    url: str | None = None


class RemoveSubscriptionGroupRequest(BaseModel):
    source: str = Field(min_length=1)


class RoutingModeRequest(BaseModel):
    mode: Literal["rule", "global", "direct"]


class AutoSelectToggleRequest(BaseModel):
    enabled: bool


class AutoSelectRequest(BaseModel):
    force_fallback: bool = False


class AutoSelectSettingsPatch(BaseModel):
    ping_min_ms: int | None = Field(default=None, ge=0, le=10_000)
    ping_max_ms: int | None = Field(default=None, ge=0, le=10_000)
    countries: list[str] | None = None
    allow_fallback: bool | None = None
    auto_return: bool | None = None

    model_config = {"extra": "ignore"}


class BlockedServerInput(BaseModel):
    id: str
    name: str
    host: str
    port: int
    profile_id: str | None = None
    added_at: float = 0.0


class BlockedServersUpdateRequest(BaseModel):
    blocked_servers: list[BlockedServerInput]


class SettingsUpdateRequest(BaseModel):
    connect_on_startup: bool | None = None
    auto_select_enabled: bool | None = None
    auto_select: AutoSelectSettingsPatch | None = None
    kill_switch_enabled: bool | None = None


class BackupImportRequest(BaseModel):
    raw: str = Field(min_length=2, max_length=20_000_000)
    with_servers: bool = True
    with_rules: bool = True
    with_settings: bool = True


class FactoryResetRequest(BaseModel):
    """wipe_data=False keeps subscriptions/rules/apps; True clears everything user-owned."""

    wipe_data: bool = False


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "product": "PawLink"}


@app.get("/api/state")
async def get_state() -> dict[str, Any]:
    svc = get_service()
    svc._sync_runtime_state()
    svc._refresh_connection_phase()
    payload = svc.state.model_dump()
    payload["last_connect_error"] = svc.last_connect_error
    return payload


@app.get("/api/system/status")
async def get_system_status() -> dict[str, Any]:
    return get_service().get_system_status()


@app.get("/api/settings")
async def get_settings() -> dict[str, Any]:
    return get_service().get_settings()


@app.patch("/api/settings")
async def update_settings(body: SettingsUpdateRequest) -> dict[str, Any]:
    auto_select_patch = body.auto_select.model_dump(exclude_none=True) if body.auto_select else None
    try:
        return await get_service().update_settings(
            connect_on_startup=body.connect_on_startup,
            auto_select_enabled=body.auto_select_enabled,
            auto_select=auto_select_patch,
            kill_switch_enabled=body.kill_switch_enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/auto-select/blocked")
async def set_blocked_servers(body: BlockedServersUpdateRequest) -> dict[str, Any]:
    try:
        blocked = await get_service().set_blocked_servers(
            [item.model_dump() for item in body.blocked_servers]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"blocked_servers": blocked}


@app.post("/api/routing/mode")
async def set_routing_mode(body: RoutingModeRequest) -> dict[str, str]:
    await get_service().set_routing_mode(body.mode)
    return {"routing_mode": body.mode}


@app.post("/api/config/import")
async def import_config(body: ImportConfigRequest) -> dict[str, Any]:
    svc = get_service()
    try:
        profiles = await svc.import_config(
            raw=body.raw,
            subscription_url=body.subscription_url,
        )
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # network / parse failures from subscription
        raise HTTPException(status_code=502, detail=f"Import failed: {exc}") from exc
    return {"count": len(profiles), "profiles": [p.model_dump() for p in profiles]}


@app.get("/api/backup/export")
async def export_backup() -> dict[str, Any]:
    return get_service().export_backup()


@app.post("/api/backup/import")
async def import_backup(body: BackupImportRequest) -> dict[str, Any]:
    try:
        payload = json.loads(body.raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Файл должен быть JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Некорректный файл резервной копии")
    try:
        return await get_service().import_backup(
            payload,
            with_servers=body.with_servers,
            with_rules=body.with_rules,
            with_settings=body.with_settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/factory-reset")
async def factory_reset(body: FactoryResetRequest) -> dict[str, Any]:
    return await get_service().factory_reset(wipe_data=body.wipe_data)


@app.post("/api/rules")
async def add_rule(body: AddRuleRequest) -> dict[str, Any]:
    try:
        rule = await get_service().add_custom_rule(body.input, body.action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return rule.model_dump()


@app.get("/api/rules")
async def list_rules() -> list[dict[str, Any]]:
    return [r.model_dump() for r in get_service().state.custom_rules]


@app.delete("/api/rules")
async def clear_rules() -> dict[str, Any]:
    removed = await get_service().clear_custom_rules()
    return {"ok": True, "removed": removed}


@app.delete("/api/rules/{index}")
async def delete_rule(index: int) -> list[dict[str, Any]]:
    svc = get_service()
    removed = await svc.remove_custom_rule(index)
    if not removed:
        raise HTTPException(status_code=404, detail="Rule not found")
    return [r.model_dump() for r in svc.state.custom_rules]


@app.get("/api/rule-lists")
async def list_rule_lists() -> list[dict[str, Any]]:
    return get_service().list_rule_lists()


@app.get("/api/rule-lists/directory")
async def rule_lists_directory() -> dict[str, Any]:
    return {"path": get_service().rule_lists_directory()}


@app.post("/api/rule-lists/open-directory")
async def open_rule_lists_directory() -> dict[str, Any]:
    try:
        path = get_service().open_rule_lists_directory()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Не удалось открыть папку: {exc}") from exc
    return {"ok": True, "path": path}


@app.post("/api/rule-lists/{name}/apply")
async def apply_rule_list(
    name: str,
    body: ApplyRuleListRequest = ApplyRuleListRequest(),
) -> dict[str, Any]:
    try:
        return await get_service().apply_rule_list(name, replace=body.replace)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/rule-lists/import")
async def import_rule_list(body: ImportRuleListRequest) -> dict[str, Any]:
    try:
        return await get_service().import_rule_list(body.name, body.content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/rule-lists/download")
async def download_rule_list(body: DownloadRuleListRequest) -> dict[str, Any]:
    try:
        return await get_service().download_rule_list(body.name, body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}") from exc


@app.delete("/api/rule-lists/{name}")
async def delete_rule_list(name: str) -> dict[str, Any]:
    removed = await get_service().delete_rule_list(name)
    if not removed:
        raise HTTPException(status_code=404, detail="Список не найден")
    return {"ok": True, "name": name}


@app.get("/api/nodes/health")
async def nodes_health() -> dict[str, Any]:
    return await get_service().get_health()


@app.post("/api/nodes/health/refresh")
async def refresh_nodes_health() -> dict[str, Any]:
    return await get_service().refresh_health()


@app.post("/api/nodes/auto-select")
async def auto_select(body: AutoSelectRequest | None = None) -> dict[str, Any]:
    force_fallback = body.force_fallback if body else False
    return await get_service().auto_select(force_fallback=force_fallback)


@app.get("/api/auto-select/blocked")
async def get_blocked_servers() -> dict[str, Any]:
    svc = get_service()
    return {
        "blocked_servers": [item.model_dump() for item in svc.state.blocked_servers],
    }


@app.post("/api/nodes/auto-select/toggle")
async def toggle_auto_select(body: AutoSelectToggleRequest) -> dict[str, Any]:
    await get_service().set_auto_select_enabled(body.enabled)
    svc = get_service()
    return {
        "auto_select_enabled": svc.state.auto_select_enabled,
        "active_profile_id": svc.state.active_profile_id,
    }


@app.post("/api/nodes/switch")
async def switch_node(body: SwitchNodeRequest) -> dict[str, Any]:
    ok = await get_service().switch_node(body.profile_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"active_profile_id": body.profile_id}


@app.delete("/api/nodes/{profile_id}")
async def remove_node(profile_id: str) -> dict[str, Any]:
    svc = get_service()
    removed = await svc.remove_node(profile_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {
        "profiles": [p.model_dump() for p in svc.state.profiles],
        "active_profile_id": svc.state.active_profile_id,
    }


@app.post("/api/subscriptions/refresh")
async def refresh_subscriptions(body: RefreshSubscriptionsRequest | None = None) -> dict[str, Any]:
    url = body.url if body else None
    return await get_service().refresh_subscriptions(url)


@app.delete("/api/subscriptions")
async def remove_subscription_group(body: RemoveSubscriptionGroupRequest) -> dict[str, Any]:
    result = await get_service().remove_source_group(body.source)
    if result["removed"] == 0:
        raise HTTPException(status_code=404, detail="Group not found or already empty")
    svc = get_service()
    return {
        **result,
        "profiles": [p.model_dump() for p in svc.state.profiles],
        "subscriptions": [s.model_dump() for s in svc.state.subscriptions],
        "active_profile_id": svc.state.active_profile_id,
    }


@app.get("/api/traffic/stats")
async def traffic_stats() -> dict[str, Any]:
    return get_service().get_traffic_stats()


@app.get("/api/apps/installed")
async def list_installed_apps() -> list[dict[str, Any]]:
    return await asyncio.to_thread(get_service().list_installed_apps)


@app.get("/api/processes")
async def list_processes() -> list[dict[str, Any]]:
    return await asyncio.to_thread(get_service().list_processes)


@app.post("/api/process-tunnel")
async def add_process_tunnel(body: ProcessTunnelRequest) -> dict[str, Any]:
    svc = get_service()
    await svc.add_process_tunnel(body.executable, body.mode)
    return {"entries": [e.model_dump() for e in svc.process_tunnel.entries]}


@app.delete("/api/process-tunnel/{executable}")
async def remove_process_tunnel(executable: str) -> dict[str, Any]:
    svc = get_service()
    removed = await svc.remove_process_tunnel(executable)
    if not removed:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"entries": [e.model_dump() for e in svc.process_tunnel.entries]}


@app.get("/api/process-tunnel")
async def get_process_tunnel() -> list[dict[str, Any]]:
    return [e.model_dump() for e in get_service().process_tunnel.entries]


@app.get("/api/core/status")
async def get_core_status(detailed: bool = False) -> dict[str, Any]:
    return await get_service().get_core_status(detailed=detailed)


@app.post("/api/core/start")
async def start_core() -> dict[str, bool]:
    try:
        await get_service().start_core()
    except ConnectError as exc:
        raise HTTPException(status_code=503, detail=exc.as_dict()) from exc
    except (OSError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"running": True}


@app.post("/api/core/stop")
async def stop_core() -> dict[str, bool]:
    await get_service().stop_core()
    return {"running": False}


@app.post("/api/geo/sync")
async def sync_geo() -> dict[str, str]:
    return await get_service().geo_sync.sync()


@app.post("/api/shutdown")
async def shutdown_backend(background_tasks: BackgroundTasks) -> dict[str, str]:
    """Graceful shutdown: stop mihomo, restore proxy/network, then exit the server."""
    await get_service().shutdown()
    # Exit only after the HTTP response is sent — no fixed delay timers.
    background_tasks.add_task(_request_server_exit)
    return {"status": "shutting-down"}


def _request_server_exit() -> None:
    signal.raise_signal(signal.SIGINT)
