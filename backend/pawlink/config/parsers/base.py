from __future__ import annotations

from abc import ABC, abstractmethod

from pawlink.models.profile import EndpointProfile


class ConfigParser(ABC):
    """Base parser for a single configuration input format."""

    @abstractmethod
    def can_parse(self, raw: str) -> bool:
        ...

    @abstractmethod
    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        ...
