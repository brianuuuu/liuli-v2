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


class KnowledgeExternalSkillRead(BaseModel):
    slug: str
    name: str
    description: str = ""
    status: str = "active"
    version: str | None = None
    skill_path: str
    updated_at: datetime | None = None


class KnowledgeExternalSkillFileNode(BaseModel):
    name: str
    path: str
    type: str
    size: int | None = None
    updated_at: datetime | None = None
    children: list["KnowledgeExternalSkillFileNode"] = Field(default_factory=list)


class KnowledgeExternalSkillFileContent(BaseModel):
    name: str
    path: str
    content: str
    size: int
    updated_at: datetime | None = None


class KnowledgeResearcherCreate(BaseModel):
    researcher_code: str
    display_name: str
    status: str = "active"
    intro: str = ""
    soul: str = ""
    method: str = ""


class KnowledgeResearcherRead(KnowledgeResearcherCreate):
    id: int
    profile_path: str
    profile_hash: str | None = None
    profile_content: str = ""
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
    report_id: int | None = None
    report_path: str | None = None
    researcher_code: str | None = None
    skill_name: str | None = None
    business_module: str | None = None
    source: str = "mcp"
    status: str = "received"
    returned_at: datetime | None = None


class KnowledgeResearchFeedbackRead(KnowledgeResearchFeedbackCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
