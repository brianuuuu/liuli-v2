from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from invest_assistant.bootstrap.database import get_db
from invest_assistant.modules.basic.auth.dependencies import get_current_user
from invest_assistant.modules.knowledge_base import service
from invest_assistant.modules.knowledge_base.schemas import (
    KnowledgeExternalSkillFileContent,
    KnowledgeExternalSkillFileNode,
    KnowledgeExternalSkillRead,
    KnowledgeNoteCreate,
    KnowledgeNoteGroupCreate,
    KnowledgeNoteGroupRead,
    KnowledgeNotePage,
    KnowledgeNoteRead,
    KnowledgePromptCreate,
    KnowledgePromptRead,
    KnowledgeResearchFeedbackCreate,
    KnowledgeResearchFeedbackRead,
    KnowledgeResearcherCreate,
    KnowledgeResearcherRead,
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


@router.get("/external-skills", response_model=list[KnowledgeExternalSkillRead])
def list_external_skills() -> list:
    return service.scan_external_skills()


@router.get("/external-skills/files", response_model=KnowledgeExternalSkillFileNode)
def list_external_skill_files(skill_slug: str | None = None):
    try:
        return service.list_external_skill_files(skill_slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/external-skills/files/content", response_model=KnowledgeExternalSkillFileContent)
def read_external_skill_file(path: str):
    try:
        return service.read_external_skill_file(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/researchers", response_model=list[KnowledgeResearcherRead])
def list_researchers(db: Session = Depends(get_db)) -> list:
    return service.list_researchers(db)


@router.post("/researchers", response_model=KnowledgeResearcherRead)
def create_researcher(payload: KnowledgeResearcherCreate, db: Session = Depends(get_db)):
    try:
        return service.create_researcher(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/researchers/{researcher_id}", response_model=KnowledgeResearcherRead)
def update_researcher(researcher_id: int, payload: KnowledgeResearcherCreate, db: Session = Depends(get_db)):
    item = service.get_researcher(db, researcher_id)
    if item is None:
        raise HTTPException(status_code=404, detail="researcher not found")
    try:
        return service.update_researcher(db, item, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/researchers/{researcher_id}", response_model=KnowledgeResearcherRead)
def delete_researcher(researcher_id: int, db: Session = Depends(get_db)):
    item = service.get_researcher(db, researcher_id)
    if item is None:
        raise HTTPException(status_code=404, detail="researcher not found")
    try:
        return service.delete_researcher(db, item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.get("/research-feedback", response_model=list[KnowledgeResearchFeedbackRead])
def list_research_feedback(db: Session = Depends(get_db)) -> list:
    return service.list_research_feedback(db)


@router.post("/research-feedback", response_model=KnowledgeResearchFeedbackRead)
def create_research_feedback(payload: KnowledgeResearchFeedbackCreate, db: Session = Depends(get_db)):
    try:
        return service.create_research_feedback(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/research-feedback/{feedback_id}", response_model=KnowledgeResearchFeedbackRead)
def update_research_feedback(feedback_id: int, payload: KnowledgeResearchFeedbackCreate, db: Session = Depends(get_db)):
    item = service.get_research_feedback(db, feedback_id)
    if item is None:
        raise HTTPException(status_code=404, detail="research feedback not found")
    try:
        return service.update_research_feedback(db, item, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/research-feedback/{feedback_id}/import")
def import_research_feedback(feedback_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return service.import_research_feedback(db, feedback_id)
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if "not found" in detail and "未找到股票" not in detail else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
