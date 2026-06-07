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
    title: str
    content: str
    note_type: str
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


class KnowledgeSkillCreate(BaseModel):
    title: str
    skill_type: str
    principle: str
    description: str | None = None
    input_schema: str | None = None
    output_schema: str | None = None
    prompt_template: str | None = None
    status: str = "active"


class KnowledgeSkillRead(KnowledgeSkillCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class KnowledgeAgentCreate(BaseModel):
    name: str
    target_module: str
    description: str | None = None
    skills_json: str = "[]"
    workflow_json: str = "[]"
    status: str = "active"


class KnowledgeAgentRead(KnowledgeAgentCreate):
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


class KnowledgeFeedbackLogRead(BaseModel):
    id: int
    agent_id: int | None = None
    target_module: str
    target_id: int | None = None
    feedback_type: str
    result_summary: str | None = None
    effectiveness: float | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
