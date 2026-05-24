from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemoCreate(BaseModel):
    quiz_id: int
    student_id: int
    content: str


class MemoResponse(BaseModel):
    id: int
    quiz_id: int
    student_id: int
    content: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
