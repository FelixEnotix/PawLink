from __future__ import annotations

from pawlink.system.port_allocator import (
    DEFAULT_CONTROLLER_PORT,
    DEFAULT_MIXED_PORT,
    allocate_mihomo_ports,
)


def test_allocate_skips_foreign_mixed_port(monkeypatch) -> None:
    foreign_port = DEFAULT_MIXED_PORT

    def fake_free(port: int, host: str = "127.0.0.1") -> bool:
        if port == foreign_port:
            return False
        if port == DEFAULT_CONTROLLER_PORT:
            return True
        return port >= DEFAULT_MIXED_PORT + 1

    monkeypatch.setattr("pawlink.system.port_allocator._port_is_free", fake_free)
    monkeypatch.setattr(
        "pawlink.system.port_allocator.reclaim_own_listener",
        lambda *args, **kwargs: False,
    )

    mixed, ctrl, auto = allocate_mihomo_ports(
        config_path="/tmp/pawlink/config.yaml",
        binary_path="/tmp/pawlink/bin/mihomo.exe",
    )
    assert mixed == DEFAULT_MIXED_PORT + 1
    assert ctrl == DEFAULT_CONTROLLER_PORT
    assert auto is True
