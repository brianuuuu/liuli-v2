"""Score continuity contracts and report comparison without database writes."""

from decimal import Decimal
import json
import math
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


SCORE_FIELDS = (
    "business_moat_score", "management_score", "governance_score",
    "strategy_score", "certainty_score", "growth_score",
)
NUMERIC_FIELDS = (*SCORE_FIELDS, "total_score")
OPEN_RESULTS = {"pending", "insufficient_evidence"}
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
PositiveId = Annotated[int, Field(strict=True, gt=0)]


class ChangeReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: Literal[
        "business_moat_score", "management_score", "governance_score", "strategy_score",
        "certainty_score", "growth_score", "total_score", "investment_level", "core_logic", "primary_risk",
    ]
    type: Literal["new_evidence", "judgment_revision", "data_correction", "method_change", "risk_adjustment"]
    reason: Text
    evidence: list[Text] = Field(min_length=1)

    @model_validator(mode="after")
    def valid_type(self):
        if self.field == "total_score" and self.type not in {"data_correction", "method_change"}:
            raise ValueError("总分原因必须为计算纠错或方法变化")
        if self.type == "risk_adjustment" and self.field != "investment_level":
            raise ValueError("风险等级调整须使用 investment_level")
        return self


class PreviousCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: PositiveId
    check_id: Text
    result: Literal["supported", "weakened", "invalidated", "pending", "insufficient_evidence"]
    reason: Text
    evidence: list[Text]

    @model_validator(mode="after")
    def evidence_required(self):
        if self.result not in OPEN_RESULTS and not self.evidence:
            raise ValueError("验证结论缺少证据")
        return self


class NextCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Text
    condition: Text


class ScoreContinuity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    previous_report_id: PositiveId | None
    change_reasons: list[ChangeReason]
    previous_checks: list[PreviousCheck]
    next_checks: list[NextCheck] = Field(max_length=3)

    @model_validator(mode="after")
    def unique_checks(self):
        ids = [item.id for item in self.next_checks]
        refs = [(item.report_id, item.check_id) for item in self.previous_checks]
        if len(ids) != len(set(ids)) or len(refs) != len(set(refs)):
            raise ValueError("验证事项 ID 或历史引用重复")
        return self


def score_number(value):
    if value is None or isinstance(value, bool):
        raise ValueError("评分必须是 0–10 的有限数值，不能缺失或使用布尔值")
    try:
        result = float(value)
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValueError("评分必须是数值") from exc
    if not math.isfinite(result) or not 0 <= result <= 10:
        raise ValueError("评分必须是 0–10 的有限数值")
    return result


def parse_continuity(value) -> dict | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = json.loads(value)
    return ScoreContinuity.model_validate(value).model_dump()


def validate_score_changes(payload: dict, baseline: dict | None) -> None:
    continuity = payload.get("continuity")
    if continuity is None or baseline is None:
        return
    previous = {}
    for field in NUMERIC_FIELDS:
        try:
            number = score_number(baseline.get(field))
            previous[field] = Decimal(str(round(number, 4) if baseline.get("id") is None else number))
        except ValueError:
            continue
    reasons = {item["field"] for item in continuity["change_reasons"]}
    changed = {field for field in SCORE_FIELDS if field in previous and previous[field] != Decimal(str(payload[field]))}
    level = str(baseline.get("investment_level") or "").strip()
    if level and level != str(payload.get("investment_level") or "").strip():
        changed.add("investment_level")
    if len(previous) == len(NUMERIC_FIELDS) and not (changed & set(SCORE_FIELDS)) and previous["total_score"] != Decimal(str(payload["total_score"])):
        changed.add("total_score")
    missing = changed - reasons
    if missing:
        raise ValueError("评分变化缺少原因: " + ", ".join(sorted(missing)))


def score_comparison(current: dict, baseline: dict | None) -> dict:
    status = "recorded"
    if current.get("continuity") is None:
        status = "legacy"
    elif current["continuity"]["previous_report_id"] is None:
        status = "no_baseline"
    elif current.get("previous_snapshot_id") is None:
        status = "report_only"
    elif baseline is None:
        status = "baseline_missing"
    result = {
        "status": status, "baseline_id": current.get("previous_snapshot_id"),
        "report_time": baseline["report_time"] if baseline else None,
        "report_id": (current.get("continuity") or {}).get("previous_report_id"),
        "previous_level": baseline.get("investment_level") if baseline else None,
        "total_delta": None, "dimensions": [],
        "method_changed": any(item["type"] == "method_change" for item in (current.get("continuity") or {}).get("change_reasons", [])),
    }
    if status == "recorded" and baseline is not None:
        for field in NUMERIC_FIELDS:
            delta = float(Decimal(str(current[field])) - Decimal(str(baseline[field])))
            result["dimensions"].append({"field": field, "previous": baseline[field], "current": current[field], "delta": delta})
            if field == "total_score":
                result["total_delta"] = delta
    return result
