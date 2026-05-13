from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.system_config import service
from invest_assistant.modules.basic.system_config.schemas import (
    SystemConfigCreate,
    SystemConfigRead,
    SystemConfigUpdate,
)

router = APIRouter(prefix="/api/system-config", tags=["system_config"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[SystemConfigRead])
def list_configs(db: Session = Depends(get_db)) -> list:
    return service.list_configs(db)


@router.post("", response_model=SystemConfigRead)
def create_config(payload: SystemConfigCreate, db: Session = Depends(get_db)):
    return service.create_config(db, payload)


@router.get("/{config_key}", response_model=SystemConfigRead)
def get_config(config_key: str, db: Session = Depends(get_db)):
    item = service.get_config(db, config_key)
    if item is None:
        raise HTTPException(status_code=404, detail="config not found")
    return item


@router.put("/{config_key}", response_model=SystemConfigRead)
def update_config(config_key: str, payload: SystemConfigUpdate, db: Session = Depends(get_db)):
    item = service.get_config(db, config_key)
    if item is None:
        raise HTTPException(status_code=404, detail="config not found")
    return service.update_config(db, item, payload)
