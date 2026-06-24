from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class AlertRuleCreate(BaseModel):
    name: str
    rule_type: str
    target_type: str
    target_id: int | None = None
    condition_json: str
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("name is required")
        return name


class AlertRuleRead(AlertRuleCreate):
    id: int
    user_id: int | None = None
    status: str
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
