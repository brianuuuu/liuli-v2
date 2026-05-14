from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertRuleCreate(BaseModel):
    rule_type: str
    target_type: str
    target_id: int | None = None
    condition_json: str
    enabled: bool = True


class AlertRuleRead(AlertRuleCreate):
    id: int
    user_id: int | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AlertEventCreate(BaseModel):
    rule_id: int | None = None
    event_level: str = "info"
    title: str
    message: str
    status: str = "unread"


class AlertEventRead(AlertEventCreate):
    id: int
    event_time: datetime
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
