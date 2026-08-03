from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

from pawlink.system.port_cleanup import (
    _listening_pids,
    _port_is_free,
    wait_until_port_free,
)

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"

DEFAULT_MIXED_PORT = 7890
DEFAULT_CONTROLLER_PORT = 9090
PORT_SCAN_COUNT = 48


def _kill_pid(pid: int) -> None:
    if not IS_WINDOWS:
        return
    try:
        subprocess.run(
            ["taskkill", "/F", "/PID", str(pid)],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except (subprocess.SubprocessError, OSError):
        pass


def is_our_mihomo_pid(
    pid: int,
    *,
    config_path: str,
    binary_path: str,
) -> bool:
    """True when the process is PawLink's mihomo (same config/work dir), not Clash Verge etc."""
    try:
        import psutil

        proc = psutil.Process(pid)
        cmdline = " ".join(proc.cmdline())
    except Exception:
        return False

    cfg = str(Path(config_path).resolve()).lower()
    work = str(Path(config_path).parent.resolve()).lower()
    bin_name = Path(binary_path).name.lower()
    normalized = cmdline.lower()
    if "mihomo" not in normalized and bin_name not in normalized:
        return False
    return cfg in normalized or work in normalized


def reclaim_own_listener(
    port: int,
    *,
    config_path: str,
    binary_path: str,
) -> bool:
    """Stop only PawLink mihomo on `port`. Returns True when the port is free."""
    if _port_is_free(port):
        return True

    reclaimed = False
    for pid in _listening_pids(port):
        if is_our_mihomo_pid(pid, config_path=config_path, binary_path=binary_path):
            _kill_pid(pid)
            reclaimed = True
            logger.info("Reclaimed port %s from stale PawLink mihomo (PID %s)", port, pid)

    if reclaimed:
        wait_until_port_free(port)

    return _port_is_free(port)


def find_free_port(
    start: int,
    *,
    host: str = "127.0.0.1",
    count: int = PORT_SCAN_COUNT,
    reserved: set[int] | None = None,
) -> int:
    blocked = reserved or set()
    for offset in range(count):
        port = start + offset
        if port in blocked:
            continue
        if _port_is_free(port, host):
            return port
    raise RuntimeError(
        f"Не найден свободный порт начиная с {start} (проверено {count} портов). "
        "Закройте лишние VPN-клиенты или перезагрузите ПК."
    )


def allocate_mihomo_ports(
    *,
    config_path: str,
    binary_path: str,
    preferred_mixed: int = DEFAULT_MIXED_PORT,
    preferred_controller: int = DEFAULT_CONTROLLER_PORT,
) -> tuple[int, int, bool]:
    """
    Pick ports for mihomo. Reclaims only PawLink's own listeners on defaults.
    If Clash Verge etc. holds 7890/9090, scans for the next free pair.
    Returns (mixed_port, controller_port, auto_selected).
    """
    reclaim_own_listener(
        preferred_mixed,
        config_path=config_path,
        binary_path=binary_path,
    )
    reclaim_own_listener(
        preferred_controller,
        config_path=config_path,
        binary_path=binary_path,
    )

    auto_selected = False
    if _port_is_free(preferred_mixed):
        mixed = preferred_mixed
    else:
        mixed = find_free_port(preferred_mixed + 1, reserved={preferred_controller})
        auto_selected = True
        logger.warning(
            "Mixed port %s занят другой программой — PawLink использует %s",
            preferred_mixed,
            mixed,
        )

    reserved = {mixed}
    if _port_is_free(preferred_controller):
        controller = preferred_controller
    else:
        controller = find_free_port(preferred_controller + 1, reserved=reserved)
        auto_selected = True
        logger.warning(
            "Controller port %s занят другой программой — PawLink использует %s",
            preferred_controller,
            controller,
        )

    if mixed == controller:
        controller = find_free_port(preferred_controller + 1, reserved={mixed})
        auto_selected = True

    return mixed, controller, auto_selected


def release_own_mihomo_ports(
    *,
    mixed_port: int,
    controller_port: int,
    config_path: str,
    binary_path: str,
) -> None:
    """Shutdown helper — never kills foreign VPN clients on the same port numbers."""
    for port in (mixed_port, controller_port):
        reclaim_own_listener(
            port,
            config_path=config_path,
            binary_path=binary_path,
        )
