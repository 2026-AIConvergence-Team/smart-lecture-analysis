from datetime import datetime

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AnonymousQuestionCreate(BaseModel):
    content: str = Field(..., min_length=1)


class AnonymousQuestionResponse(BaseModel):
    id: int
    lecture_id: int
    content: str
    is_mine: bool = False
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    author_role: Optional[str] = None
    author_display_name: str = "익명"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
