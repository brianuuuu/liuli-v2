from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeNoteGroupCreate(BaseModel):
    name: str
    sort_order: int = 0
    status: str = "active"


class KnowledgeNoteGroupRead(KnowledgeNoteGroupCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgeNoteTagRead(BaseModel):
    id: int
    name: str
    type: str | None = None
    source: str | None = None
    status: str = "active"
    created_at: datetime | None = None
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class KnowledgeNoteCreate(BaseModel):
    title: str | None = None
    content: str
    note_type: str = ""
    group_id: int | None = None
    related_module: str | None = None
    related_id: int | None = None
    tags: str | None = None
    tag_ids: list[int] = Field(default_factory=list)
    status: str = "active"


class KnowledgeNoteRead(BaseModel):
    id: int
    title: str
    content: str
    note_type: str
    group_id: int | None = None
    related_module: str | None = None
    related_id: int | None = None
    tags_text: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    group: KnowledgeNoteGroupRead | None = None
    tags: list[KnowledgeNoteTagRead] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class KnowledgeNotePage(BaseModel):
    items: list[KnowledgeNoteRead]
    total: int
    limit: int
    offset: int
    has_more: bool


class KnowledgeExternalSkillCreate(BaseModel):
    name: str
    version: str | None = None
    content: str = ""


class KnowledgeExternalSkillRead(KnowledgeExternalSkillCreate):
    id: int
    file_path: str
    file_hash: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgeResearcherFileCreate(BaseModel):
    name: str
    version: str | None = None
    content: str = ""


class KnowledgeResearcherFileRead(KnowledgeResearcherFileCreate):
    id: int
    file_path: str
    file_hash: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgeResearcherCreate(BaseModel):
    name: str
    soul_id: int
    method_id: int
    status: str = "active"


class KnowledgeResearcherRead(KnowledgeResearcherCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgePromptCreate(BaseModel):
    prompt_key: str
    title: str
    target_task: str
    provider: str = "deepseek"
    model: str
    system_prompt: str
    user_prompt: str
    response_format: str = "json_object"
    status: str = "active"


class KnowledgePromptRead(KnowledgePromptCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgeResearchFeedbackCreate(BaseModel):
    title: str
    report_content: str | None = None
    report_path: str | None = None
    structured_conclusion: str | None = None
    valuation_assumption: str | None = None
    risk_points: str | None = None
    observation_signals: str | None = None
    data_sources_json: str | None = None
    external_skill_id: int | None = None
    researcher_id: int | None = None
    verification_result: str | None = None
    research_time: datetime | None = None
    returned_at: datetime | None = None


class KnowledgeResearchFeedbackRead(KnowledgeResearchFeedbackCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
