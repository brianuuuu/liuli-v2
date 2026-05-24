from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from invest_assistant.modules.basic.job_center.models import JobRunRequest
from invest_assistant.modules.market_radar.models import Tag
from invest_assistant.shared.db_types import dumps_json
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


def enqueue_tag_backfill(db: Session, tag: Tag) -> None:
    params = {
        "tag_type": tag.type,
        "tag_id": tag.id,
        "overwrite": False,
    }
    start_time = default_start_time_for_tag(tag)
    if start_time is not None:
        params["start_time"] = start_time.isoformat()
    db.add(JobRunRequest(job_name=BACKFILL_JOB_NAME, params_json=dumps_json(params), requested_by=None))
