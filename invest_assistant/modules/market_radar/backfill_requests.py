from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.models import JobRunRequest
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.shared.db_types import dumps_json, loads_json
from invest_assistant.shared.time_utils import utc_now

BACKFILL_JOB_NAME = "market_radar.backfill_source_tags"


def default_start_time_for_tag(tag: Tag) -> datetime | None:
    if tag.type == "stock":
        return None
    if tag.type == "track":
        return utc_now() - timedelta(days=365)
    if tag.type == "hotword":
        return utc_now() - timedelta(days=30)
    return utc_now() - timedelta(days=30)


def _request_merge_matches(params: dict, tag: Tag) -> bool:
    return (
        params.get("tag_type") == tag.type
        and bool(params.get("overwrite", False)) is False
        and not params.get("source_type")
        and not params.get("end_time")
    )


def _request_tag_ids(params: dict) -> list[int]:
    tag_ids = params.get("tag_ids")
    if not isinstance(tag_ids, list):
        tag_ids = []
    if params.get("tag_id") is not None:
        tag_ids.append(params["tag_id"])
    return sorted({int(tag_id) for tag_id in tag_ids if tag_id is not None})


def _earliest_start_time(current: str | None, incoming: str | None) -> str | None:
    if current is None:
        return incoming
    if incoming is None:
        return current
    return min(current, incoming)


def _find_pending_backfill_request(db: Session, tag: Tag) -> JobRunRequest | None:
    stmt = (
        select(JobRunRequest)
        .where(
            JobRunRequest.job_name == BACKFILL_JOB_NAME,
            JobRunRequest.status == "pending",
            JobRunRequest.requested_by.is_(None),
        )
        .order_by(JobRunRequest.requested_at.asc(), JobRunRequest.id.asc())
    )
    for request in db.scalars(stmt):
        params = loads_json(request.params_json) or {}
        if _request_merge_matches(params, tag):
            return request
    return None


def enqueue_tag_backfill(db: Session, tag: Tag) -> None:
    start_time = default_start_time_for_tag(tag)
    start_time_value = start_time.isoformat() if start_time is not None else None
    request = _find_pending_backfill_request(db, tag)
    if request is not None:
        params = loads_json(request.params_json) or {}
        tag_ids = _request_tag_ids(params)
        tag_ids.append(int(tag.id))
        params["tag_ids"] = sorted(set(tag_ids))
        params.pop("tag_id", None)
        params["tag_type"] = tag.type
        params["overwrite"] = False
        start_value = _earliest_start_time(params.get("start_time"), start_time_value)
        if start_value is not None:
            params["start_time"] = start_value
        else:
            params.pop("start_time", None)
        request.params_json = dumps_json(params)
        return

    params = {
        "tag_type": tag.type,
        "tag_ids": [tag.id],
        "overwrite": False,
    }
    if start_time_value is not None:
        params["start_time"] = start_time_value
    db.add(JobRunRequest(job_name=BACKFILL_JOB_NAME, params_json=dumps_json(params), requested_by=None))
    db.flush()
