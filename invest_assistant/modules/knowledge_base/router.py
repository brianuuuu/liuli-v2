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
    KnowledgeNoteGroupCreate,
    KnowledgeNoteGroupRead,
    KnowledgeNotePage,
    KnowledgeNoteRead,
    KnowledgePromptCreate,
    KnowledgePromptRead,
    KnowledgeSkillCreate,
    KnowledgeSkillRead,
)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge_base"], dependencies=[Depends(get_current_user)])


@router.get("/notes", response_model=KnowledgeNotePage)
def list_notes(
    status: str | None = "active",
    group_id: int | None = None,
    tag_id: int | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    return service.list_notes(db, status=status, group_id=group_id, tag_id=tag_id, q=q, limit=limit, offset=offset)


@router.post("/notes", response_model=KnowledgeNoteRead)
def create_note(payload: KnowledgeNoteCreate, db: Session = Depends(get_db)):
    try:
        return service.read_note(db, service.create_note(db, payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/notes/{note_id}", response_model=KnowledgeNoteRead)
def get_note(note_id: int, db: Session = Depends(get_db)):
    item = service.get_note(db, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    return service.read_note(db, item)


@router.put("/notes/{note_id}", response_model=KnowledgeNoteRead)
def update_note(note_id: int, payload: KnowledgeNoteCreate, db: Session = Depends(get_db)):
    item = service.get_note(db, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    try:
        return service.read_note(db, service.update_note(db, item, payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/notes/{note_id}", response_model=KnowledgeNoteRead)
def delete_note(note_id: int, db: Session = Depends(get_db)):
    item = service.get_note(db, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    return service.read_note(db, service.delete_note(db, item))


@router.post("/notes/{note_id}/archive", response_model=KnowledgeNoteRead)
def archive_note(note_id: int, db: Session = Depends(get_db)):
    item = service.get_note(db, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    return service.read_note(db, service.archive_note(db, item))


@router.post("/notes/{note_id}/restore", response_model=KnowledgeNoteRead)
def restore_note(note_id: int, db: Session = Depends(get_db)):
    item = service.get_note(db, note_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note not found")
    return service.read_note(db, service.restore_note(db, item))


@router.get("/note-groups", response_model=list[KnowledgeNoteGroupRead])
def list_note_groups(status: str | None = "active", db: Session = Depends(get_db)) -> list:
    return service.list_note_groups(db, status=status)


@router.post("/note-groups", response_model=KnowledgeNoteGroupRead)
def create_note_group(payload: KnowledgeNoteGroupCreate, db: Session = Depends(get_db)):
    return service.create_note_group(db, payload)


@router.put("/note-groups/{group_id}", response_model=KnowledgeNoteGroupRead)
def update_note_group(group_id: int, payload: KnowledgeNoteGroupCreate, db: Session = Depends(get_db)):
    item = service.get_note_group(db, group_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note group not found")
    return service.update_note_group(db, item, payload)


@router.post("/note-groups/{group_id}/archive", response_model=KnowledgeNoteGroupRead)
def archive_note_group(group_id: int, db: Session = Depends(get_db)):
    item = service.get_note_group(db, group_id)
    if item is None:
        raise HTTPException(status_code=404, detail="note group not found")
    return service.archive_note_group(db, item)


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
