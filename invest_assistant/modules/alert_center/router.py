from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.alert_center import service
from invest_assistant.modules.alert_center.schemas import AlertEventCreate, AlertEventRead, AlertRuleCreate, AlertRuleRead
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.basic.auth.models import UserAccount
from invest_assistant.shared.pagination import Page

router = APIRouter(prefix="/api/alerts", tags=["alert_center"], dependencies=[Depends(get_current_user)])


@router.get("/rules", response_model=list[AlertRuleRead])
def list_rules(db: Session = Depends(get_db)) -> list:
    return service.list_rules(db)


@router.post("/rules", response_model=AlertRuleRead)
def create_rule(payload: AlertRuleCreate, db: Session = Depends(get_db), user: UserAccount = Depends(get_current_user)):
    return service.create_rule(db, payload, user.id)


@router.put("/rules/{rule_id}", response_model=AlertRuleRead)
def update_rule(rule_id: int, payload: AlertRuleCreate, db: Session = Depends(get_db), user: UserAccount = Depends(get_current_user)):
    rule = db.get(service.AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    for key, value in payload.model_dump().items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", response_model=AlertRuleRead)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(service.AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="rule not found")
    rule.enabled = False
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/events", response_model=Page[AlertEventRead])
def list_events(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> Page[AlertEventRead]:
    return service.list_events_page(db, limit=limit, offset=offset)


@router.get("/events/stats")
def event_stats(db: Session = Depends(get_db)) -> dict[str, int]:
    return service.event_stats(db)


@router.post("/events", response_model=AlertEventRead)
def create_event(payload: AlertEventCreate, db: Session = Depends(get_db)):
    return service.create_event(db, payload)


@router.get("/events/{event_id}", response_model=AlertEventRead)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = service.get_event(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return event


@router.post("/events/{event_id}/read", response_model=AlertEventRead)
def read_event(event_id: int, db: Session = Depends(get_db)):
    event = service.get_event(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return service.mark_event(db, event, "read")


@router.post("/events/{event_id}/handle", response_model=AlertEventRead)
def handle_event(event_id: int, db: Session = Depends(get_db)):
    event = service.get_event(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="event not found")
    return service.mark_event(db, event, "handled")
