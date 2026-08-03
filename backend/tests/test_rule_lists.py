from __future__ import annotations

from pathlib import Path

from pawlink.models.profile import RuleType
from pawlink.routing.rule_lists import RuleListManager
from pawlink.service import PawLinkService
import asyncio


SAMPLE = """
prepend:
  - 'DOMAIN-SUFFIX,youtube.com,VPN'
  - 'PROCESS-NAME,Discord.exe,VPN'
  - 'GEOIP,RU,DIRECT'
  - 'DOMAIN-KEYWORD,telegram,PROXY'
"""


def test_parse_yaml_prepend_maps_vpn_to_proxy() -> None:
    rules = RuleListManager.parse_text(SAMPLE)
    assert len(rules) == 4
    by_value = {r.value: r for r in rules}
    assert by_value["youtube.com"].action == "PROXY"
    assert by_value["youtube.com"].rule_type == RuleType.DOMAIN_SUFFIX
    assert by_value["discord.exe"].rule_type == RuleType.PROCESS
    assert by_value["RU"].rule_type == RuleType.GEOIP
    assert by_value["RU"].action == "DIRECT"


def test_parse_plain_lines() -> None:
    text = "DOMAIN-SUFFIX,example.com,DIRECT\n# comment\nGEOSITE,youtube,VPN\n"
    rules = RuleListManager.parse_text(text)
    assert [(r.rule_type, r.value, r.action) for r in rules] == [
        (RuleType.DOMAIN_SUFFIX, "example.com", "DIRECT"),
        (RuleType.GEOSITE, "youtube", "PROXY"),
    ]


def test_seed_and_apply_ru(tmp_path: Path) -> None:
    mgr = RuleListManager(tmp_path)
    mgr.ensure_bundled()
    lists = mgr.list_lists()
    assert any(item.name == "RU" for item in lists)
    rules = mgr.parse_named("RU")
    assert len(rules) >= 50
    assert any(r.rule_type == RuleType.GEOIP and r.value == "RU" for r in rules)


def test_service_apply_merge_and_replace(tmp_path: Path) -> None:
    svc = PawLinkService(data_dir=tmp_path)
    svc.rule_lists.ensure_bundled()
    svc._rebuild_and_reload = lambda: asyncio.sleep(0)  # type: ignore[method-assign]

    async def run() -> None:
        merged = await svc.apply_rule_list("RU", replace=False)
        assert merged["added"] > 0
        total = merged["total"]
        again = await svc.apply_rule_list("RU", replace=False)
        assert again["added"] == 0
        assert again["total"] == total
        replaced = await svc.apply_rule_list("RU", replace=True)
        assert replaced["total"] == total
        assert len(svc.state.custom_rules) == total

    asyncio.run(run())


def test_import_custom_list(tmp_path: Path) -> None:
    mgr = RuleListManager(tmp_path)
    info = mgr.save_content("EU", "DOMAIN-SUFFIX,example.eu,VPN\n")
    assert info.name == "EU"
    assert info.rule_count == 1
    assert (tmp_path / "rule-lists" / "EU.txt").exists()


def test_add_custom_rule_deduplicates(tmp_path: Path) -> None:
    svc = PawLinkService(data_dir=tmp_path)
    svc._rebuild_and_reload = lambda: asyncio.sleep(0)  # type: ignore[method-assign]

    async def run() -> None:
        first = await svc.add_custom_rule("youtube.com", "PROXY")
        second = await svc.add_custom_rule("https://www.youtube.com", "PROXY")
        assert first.value == second.value
        assert len(svc.state.custom_rules) == 1
        updated = await svc.add_custom_rule("youtube.com", "DIRECT")
        assert updated.action == "DIRECT"
        assert len(svc.state.custom_rules) == 1

    asyncio.run(run())
