from __future__ import annotations

from dataclasses import dataclass

from pawlink.health.country import resolve_country_code
from pawlink.models.blocked import BlockedServer
from pawlink.models.profile import EndpointProfile
from pawlink.models.state import AutoSelectSettings, HealthLevel, NodeHealthStatus


@dataclass
class SelectionResult:
    profile_id: str | None = None
    profile_name: str | None = None
    matched_criteria: bool = False
    needs_fallback_prompt: bool = False
    fallback_profile_id: str | None = None
    fallback_profile_name: str | None = None
    in_fallback: bool = False
    reason: str = ""


@dataclass
class _Candidate:
    profile: EndpointProfile
    status: NodeHealthStatus


def is_profile_blocked(profile: EndpointProfile, blocked: list[BlockedServer]) -> bool:
    name_key = profile.name.strip().casefold()
    for entry in blocked:
        if entry.profile_id and entry.profile_id == profile.id:
            return True
        if entry.host == profile.host and entry.port == profile.port:
            return True
        if entry.name.strip().casefold() == name_key:
            return True
    return False


class NodeSelector:
    """Smart server selection with ping bounds, country filter, blocked list and fallback."""

    def select(
        self,
        profiles: list[EndpointProfile],
        statuses: dict[str, NodeHealthStatus],
        settings: AutoSelectSettings,
        blocked_servers: list[BlockedServer],
        *,
        force_fallback: bool = False,
        prefer_profile_id: str | None = None,
    ) -> SelectionResult:
        available = self._available_candidates(profiles, statuses, blocked_servers)
        if not available:
            return SelectionResult(reason="no_available_servers")

        preferred = self._apply_geo_and_ping(available, settings)
        if preferred:
            best = self._pick_best(preferred, prefer_profile_id=prefer_profile_id)
            return SelectionResult(
                profile_id=best.profile.id,
                profile_name=best.profile.name,
                matched_criteria=True,
                in_fallback=False,
                reason="keep_current" if prefer_profile_id == best.profile.id else "matched_criteria",
            )

        fallback_best = self._pick_best(available, prefer_profile_id=prefer_profile_id)
        if fallback_best is None:
            return SelectionResult(reason="no_available_servers")

        if not force_fallback and settings.allow_fallback:
            return SelectionResult(
                needs_fallback_prompt=True,
                fallback_profile_id=fallback_best.profile.id,
                fallback_profile_name=fallback_best.profile.name,
                reason="no_criteria_match",
            )

        if not settings.allow_fallback:
            return SelectionResult(reason="no_criteria_match")

        return SelectionResult(
            profile_id=fallback_best.profile.id,
            profile_name=fallback_best.profile.name,
            matched_criteria=False,
            in_fallback=True,
            reason="fallback_any",
        )

    def matches_criteria(
        self,
        profile: EndpointProfile,
        status: NodeHealthStatus | None,
        settings: AutoSelectSettings,
        blocked_servers: list[BlockedServer],
    ) -> bool:
        if status is None or status.health == HealthLevel.RED:
            return False
        if is_profile_blocked(profile, blocked_servers):
            return False
        return bool(self._apply_geo_and_ping([_Candidate(profile=profile, status=status)], settings))

    def _available_candidates(
        self,
        profiles: list[EndpointProfile],
        statuses: dict[str, NodeHealthStatus],
        blocked_servers: list[BlockedServer],
    ) -> list[_Candidate]:
        out: list[_Candidate] = []
        for profile in profiles:
            if is_profile_blocked(profile, blocked_servers):
                continue
            status = statuses.get(profile.id)
            if status is None or status.health == HealthLevel.RED:
                continue
            out.append(_Candidate(profile=profile, status=status))
        return out

    @staticmethod
    def _apply_geo_and_ping(
        candidates: list[_Candidate],
        settings: AutoSelectSettings,
    ) -> list[_Candidate]:
        allowed = {code.strip().upper() for code in settings.countries if code.strip()}
        filtered: list[_Candidate] = []
        for candidate in candidates:
            if allowed:
                code = resolve_country_code(candidate.profile.name)
                if code is None or code not in allowed:
                    continue
            latency = candidate.status.latency_ms
            if latency is None:
                continue
            if latency < settings.ping_min_ms or latency > settings.ping_max_ms:
                continue
            filtered.append(candidate)
        return filtered

    @staticmethod
    def _pick_best(
        candidates: list[_Candidate],
        *,
        prefer_profile_id: str | None = None,
    ) -> _Candidate | None:
        if not candidates:
            return None
        if prefer_profile_id:
            for item in candidates:
                if item.profile.id == prefer_profile_id:
                    return item
        order = {HealthLevel.GREEN: 0, HealthLevel.YELLOW: 1, HealthLevel.RED: 2}

        def sort_key(item: _Candidate) -> tuple[int, float]:
            health_rank = order.get(item.status.health, 2)
            latency = item.status.latency_ms if item.status.latency_ms is not None else 99999.0
            return health_rank, latency

        return sorted(candidates, key=sort_key)[0]
