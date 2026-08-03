from __future__ import annotations

import json
import logging
from pathlib import Path

from pawlink.system.port_allocator import (
    DEFAULT_CONTROLLER_PORT,
    DEFAULT_MIXED_PORT,
    allocate_mihomo_ports,
    release_own_mihomo_ports,
)

logger = logging.getLogger(__name__)

_RUNTIME_PORTS_NAME = "runtime_ports.json"


def persist_runtime_ports(
    data_dir: Path,
    *,
    mixed_port: int,
    controller_port: int,
    auto_selected: bool,
) -> None:
    path = data_dir / _RUNTIME_PORTS_NAME
    payload = {
        "mixed_port": mixed_port,
        "controller_port": controller_port,
        "auto_selected": auto_selected,
    }
    try:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        logger.debug("Could not persist runtime ports to %s", path)


def load_runtime_ports(data_dir: Path) -> dict[str, int | bool] | None:
    path = data_dir / _RUNTIME_PORTS_NAME
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            "mixed_port": int(data.get("mixed_port", DEFAULT_MIXED_PORT)),
            "controller_port": int(data.get("controller_port", DEFAULT_CONTROLLER_PORT)),
            "auto_selected": bool(data.get("auto_selected", False)),
        }
    except (OSError, ValueError, TypeError):
        return None


def prepare_mihomo_ports(
    data_dir: Path,
    *,
    config_path: Path,
    binary_path: Path,
) -> tuple[int, int, bool]:
    """Pick mixed/controller ports; reclaim only PawLink's own stale mihomo."""
    mixed, ctrl, auto = allocate_mihomo_ports(
        config_path=str(config_path),
        binary_path=str(binary_path),
    )
    persist_runtime_ports(
        data_dir,
        mixed_port=mixed,
        controller_port=ctrl,
        auto_selected=auto,
    )
    if auto:
        logger.info(
            "Default ports busy — using mixed=%s controller=%s (foreign apps left running)",
            mixed,
            ctrl,
        )
    return mixed, ctrl, auto


def release_session_mihomo_ports(
    data_dir: Path,
    *,
    config_path: Path,
    binary_path: Path,
    mixed_port: int | None = None,
    controller_port: int | None = None,
) -> None:
    saved = load_runtime_ports(data_dir)
    mixed = mixed_port if mixed_port is not None else int((saved or {}).get("mixed_port", DEFAULT_MIXED_PORT))
    ctrl = controller_port if controller_port is not None else int(
        (saved or {}).get("controller_port", DEFAULT_CONTROLLER_PORT)
    )
    release_own_mihomo_ports(
        mixed_port=mixed,
        controller_port=ctrl,
        config_path=str(config_path),
        binary_path=str(binary_path),
    )
