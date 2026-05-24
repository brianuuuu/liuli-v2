from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.knowledge_base import service
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeAgentCreate,
    KnowledgeAgentRead,
    KnowledgeFeedbackLogRead,
    KnowledgeNoteCreate,
    KnowledgeNoteRead,
    KnowledgePromptCreate,
    KnowledgePromptRead,
    KnowledgeSkillCreate,
    KnowledgeSkillRead,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge_base"], dependencies=[Depends(get_current_user)])


@router.get("/notes", response_model=list[KnowledgeNoteRead])
def list_notes(db: Session = Depends(get_db)) -> list:
    return service.list_notes(db)


@router.post("/notes", response_model=KnowledgeNoteRead)
def create_note(payload: KnowledgeNoteCreate, db: Session = Depends(get_db)):
    return service.create_note(db, payload)


@router.get("/notes/{note_id}", response_model=KnowledgeNoteRead)
def get_note(note_id: int, db: Session = Depends(get_db)):
    item = db.get(service.KnowledgeNote, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    return item


@router.put("/notes/{note_id}", response_model=KnowledgeNoteRead)
def update_note(note_id: int, payload: KnowledgeNoteCreate, db: Session = Depends(get_db)):
    item = db.get(service.KnowledgeNote, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/notes/{note_id}", response_model=KnowledgeNoteRead)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    item = db.get(service.KnowledgeNote, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    item.status = "archived"
    db.commit()
    db.refresh(item)
    return item


@router.get("/skills", response_model=list[KnowledgeSkillRead])
def list_skills(db: Session = Depends(get_db)) -> list:
    return service.list_skills(db)


@router.post("/skills", response_model=KnowledgeSkillRead)
def create_skill(payload: KnowledgeSkillCreate, db: Session = Depends(get_db)):
    return service.create_skill(db, payload)


@router.put("/skills/{skill_id}", response_model=KnowledgeSkillRead)
def update_skill(skill_id: int, payload: KnowledgeSkillCreate, db: Session = Depends(get_db)):
    item = db.get(service.KnowledgeSkill, skill_id)
    if item is None:
        raise HTTPException(status_code=404, detail="skill not found")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.get("/agents", response_model=list[KnowledgeAgentRead])
def list_agents(db: Session = Depends(get_db)) -> list:
    return service.list_agents(db)


@router.post("/agents", response_model=KnowledgeAgentRead)
def create_agent(payload: KnowledgeAgentCreate, db: Session = Depends(get_db)):
    return service.create_agent(db, payload)


@router.put("/agents/{agent_id}", response_model=KnowledgeAgentRead)
def update_agent(agent_id: int, payload: KnowledgeAgentCreate, db: Session = Depends(get_db)):
    item = service.get_agent(db, agent_id)
    if item is None:
        raise HTTPException(status_code=404, detail="agent not found")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.get("/prompts", response_model=list[KnowledgePromptRead])
def list_prompts(db: Session = Depends(get_db)) -> list:
    return service.list_prompts(db)


@router.post("/prompts", response_model=KnowledgePromptRead)
def create_prompt(payload: KnowledgePromptCreate, db: Session = Depends(get_db)):
    return service.create_prompt(db, payload)


@router.put("/prompts/{prompt_id}", response_model=KnowledgePromptRead)
def update_prompt(prompt_id: int, payload: KnowledgePromptCreate, db: Session = Depends(get_db)):
    item = service.get_prompt(db, prompt_id)
    if item is None:
        raise HTTPException(status_code=404, detail="prompt not found")
    return service.update_prompt(db, item, payload)


@router.delete("/prompts/{prompt_id}", response_model=KnowledgePromptRead)
def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    item = service.get_prompt(db, prompt_id)
    if item is None:
        raise HTTPException(status_code=404, detail="prompt not found")
    return service.delete_prompt(db, item)


@router.post("/agents/{agent_id}/run", response_model=KnowledgeFeedbackLogRead)
def run_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = service.get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return service.run_agent(db, agent)


@router.get("/feedback-logs", response_model=list[KnowledgeFeedbackLogRead])
def feedback_logs(db: Session = Depends(get_db)) -> list:
    return service.list_feedback_logs(db)
