"""从追加研究记录聚合当前判断；不修改或补写任何历史快照。"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from math import isfinite
from typing import TYPE_CHECKING

from invest_assistant.modules.track_discovery.scoring import TRACK_SCORE_FIELDS
from invest_assistant.modules.track_discovery.schemas import parse_cycle_views_json

if TYPE_CHECKING:
    from invest_assistant.modules.track_discovery.models import TrackTrendSnapshot


def research_source(snapshot: "TrackTrendSnapshot | None") -> dict | None:
    if snapshot is None:
        return None
    return {"snapshot_id": snapshot.id, "report_id": snapshot.report_id, "research_date": snapshot.research_date}


@dataclass
class TrackResearchView:
    latest: "TrackTrendSnapshot | None" = None
    score: "TrackTrendSnapshot | None" = None
    cycle_views: dict = field(default_factory=dict)

    def fields(self) -> dict:
        latest, score = self.latest, self.score
        return {
            "snapshot_id": latest.id if latest else None,
            "research_date": latest.research_date if latest else None,
            "headline_cycle": latest.headline_cycle if latest else None,
            "cycle_views": self.cycle_views,
            "score_source": research_source(score),
            "overall_score": score.overall_score if score else None,
            "track_grade": score.track_grade if score else None,
            "heat_tier": score.heat_tier if score else None,
            "next_verification": latest.next_verification if latest else None,
            "next_verification_date": latest.next_verification_date if latest else None,
        }


def _cycle_views(raw: str | None) -> dict:
    try:
        return parse_cycle_views_json(raw)
    except (ValueError, TypeError):
        return {}


def _has_scores(snapshot: "TrackTrendSnapshot") -> bool:
    values = [getattr(snapshot, key) for key in (*TRACK_SCORE_FIELDS, "overall_score")]
    return all(isinstance(value, (int, float)) and isfinite(value) for value in values) and bool(snapshot.track_grade and snapshot.heat_tier)


def collect_track_reviews(snapshots: Iterable["TrackTrendSnapshot"]) -> dict[int, TrackResearchView]:
    """一次遍历选各周期和评分的真实来源，不依赖输入顺序或历史展示条数。"""
    result: dict[int, TrackResearchView] = {}
    for snapshot in snapshots:
        view = result.setdefault(snapshot.track_id, TrackResearchView())
        key = (snapshot.research_date, snapshot.id)
        if view.latest is None or key > (view.latest.research_date, view.latest.id):
            view.latest = snapshot
        if _has_scores(snapshot) and (view.score is None or key > (view.score.research_date, view.score.id)):
            view.score = snapshot
        for cycle, judgment in _cycle_views(snapshot.cycle_views_json).items():
            previous = view.cycle_views.get(cycle)
            if previous is None or key > (previous["research_date"], previous["snapshot_id"]):
                view.cycle_views[cycle] = {**judgment, **research_source(snapshot)}
    return result
