from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.system_config.models import SystemConfig
from invest_assistant.modules.basic.system_config.schemas import SystemConfigCreate, SystemConfigUpdate


def list_configs(db: Session) -> list[SystemConfig]:
    return list(db.scalars(select(SystemConfig).order_by(SystemConfig.module_name.asc(), SystemConfig.config_key.asc())))


def get_config(db: Session, config_key: str) -> SystemConfig | None:
    return db.scalar(select(SystemConfig).where(SystemConfig.config_key == config_key))


def create_config(db: Session, payload: SystemConfigCreate) -> SystemConfig:
    existing = get_config(db, payload.config_key)
    if existing is not None:
        return update_config(db, existing, SystemConfigUpdate(**payload.model_dump(exclude={"config_key"})))
    item = SystemConfig(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_config(db: Session, item: SystemConfig, payload: SystemConfigUpdate) -> SystemConfig:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_config(db: Session, item: SystemConfig) -> None:
    db.delete(item)
    db.commit()
