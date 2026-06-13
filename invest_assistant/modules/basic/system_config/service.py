from sqlalchemy import select
from sqlalchemy.orm import Session

from invest_assistant.modules.basic.system_config.models import RuntimeState, SystemConfig
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


def get_runtime_state(db: Session, namespace: str, state_key: str) -> RuntimeState | None:
    return db.scalar(select(RuntimeState).where(RuntimeState.namespace == namespace, RuntimeState.state_key == state_key))


def set_runtime_state(
    db: Session,
    namespace: str,
    state_key: str,
    state_value: str,
    value_type: str = "string",
    ext: dict | None = None,
    commit: bool = True,
) -> RuntimeState:
    item = get_runtime_state(db, namespace, state_key)
    if item is None:
        item = RuntimeState(namespace=namespace, state_key=state_key, state_value=state_value, value_type=value_type)
        db.add(item)
    else:
        item.state_value = state_value
        item.value_type = value_type
    if ext is not None:
        item.ext_json = ext
    if commit:
        db.commit()
        db.refresh(item)
    else:
        db.flush()
    return item
