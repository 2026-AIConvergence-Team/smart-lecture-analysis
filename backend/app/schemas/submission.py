from datetime import datetime
from typing import List

from pydantic import BaseModel, ConfigDict


class AnswerItem(BaseModel):
    quiz_id: int
    selected: str


class SubmissionCreate(BaseModel):
    set_id: int
    student_id: int
    answers: List[AnswerItem]


class QuizSetSubmissionCreate(BaseModel):
    answers: List[AnswerItem]


class SubmissionAnswerResponse(BaseModel):
    id: int
    submission_id: int
    quiz_id: int
    selected: str
    is_correct: bool

    model_config = ConfigDict(from_attributes=True)


class SubmissionResponse(BaseModel):
    id: int
    set_id: int
    lecture_id: int | None = None
    student_id: int
    submitted_at: datetime
    answers: List[SubmissionAnswerResponse] = []
    total_count: int = 0
    correct_count: int = 0

    model_config = ConfigDict(from_attributes=True)
