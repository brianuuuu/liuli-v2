from datetime import datetime

from pydantic import BaseModel, ConfigDict


class KnowledgeNoteCreate(BaseModel):
    title: str
    content: str
    note_type: str
    related_module: str | None = None
    related_id: int | None = None
    tags: str | None = None
    status: str = "active"


class KnowledgeNoteRead(KnowledgeNoteCreate):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


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
