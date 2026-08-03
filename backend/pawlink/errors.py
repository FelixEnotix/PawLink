from __future__ import annotations

# Connection pipeline stages (stable API values for the UI).
STAGE_PRECHECK = "precheck"
STAGE_BINARIES = "binaries"
STAGE_PORTS = "ports"
STAGE_CONFIG = "config"
STAGE_MIHOMO_START = "mihomo_start"
STAGE_MIHOMO_READY = "mihomo_ready"
STAGE_CAPTURE = "capture"
STAGE_UNKNOWN = "unknown"


class ConnectError(RuntimeError):
    """VPN connect failed at a specific pipeline stage."""

    def __init__(self, stage: str, message: str) -> None:
        self.stage = stage
        self.message = message
        super().__init__(message)

    def as_dict(self) -> dict[str, str]:
        return {"stage": self.stage, "message": self.message}
