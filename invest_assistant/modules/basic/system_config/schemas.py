from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemConfigCreate(BaseModel):
    config_key: str
    config_value: str
    config_type: str = "string"
    module_name: str | None = None
    description: str | None = None
    enabled: bool = True


class SystemConfigUpdate(BaseModel):
    config_value: str | None = None
    config_type: str | None = None
    module_name: str | None = None
    description: str | None = None
    enabled: bool | None = None


class SystemConfigRead(SystemConfigCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
