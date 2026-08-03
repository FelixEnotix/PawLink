from __future__ import annotations

from pydantic import BaseModel, Field


class BlockedServer(BaseModel):
    """Persisted server block — survives subscription removal."""

    id: str
    name: str
    host: str
    port: int
    profile_id: str | None = None
    added_at: float = 0.0
