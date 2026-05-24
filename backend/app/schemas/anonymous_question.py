from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AnonymousQuestionCreate(BaseModel):
    lecture_id: int
    content: str


class AnonymousQuestionResponse(BaseModel):
    id: int
    lecture_id: int
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
