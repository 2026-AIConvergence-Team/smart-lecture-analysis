from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class QuizGenerateRequest(BaseModel):
    page_start: int = Field(..., ge=1)
    page_end: int = Field(..., ge=1)
    concept_ids: Optional[List[int]] = None

    # BLANK | DEFINITION | KEYWORD_CHOICE | OX
    quiz_type: str = "BLANK"

    count_per_concept: int = Field(default=1, ge=1)
    option_count: int = Field(default=4, ge=2)


class QuizGenerateResponse(BaseModel):
    lecture_id: int
    status: str
    page_start: int
    page_end: int
    quiz_type: str
    generated_count: int
    failed_count: int
    message: str


class QuizItemResponse(BaseModel):
    quiz_id: int
    lecture_id: int
    concept_id: Optional[int] = None
    concept: Optional[str] = None
    page: int
    quiz_type: str
    question: str
    options: List[str]
    answer: str
    explanation: Optional[str] = None
    source_sentence: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class QuizGenerateStatusResponse(BaseModel):
    lecture_id: int
    status: str
    progress: int
    generated_count: int
    failed_count: int
    quizzes: List[QuizItemResponse]


class QuizListResponse(BaseModel):
    lecture_id: int
    total_count: int
    quizzes: List[QuizItemResponse]


class QuizUpdateRequest(BaseModel):
    question: Optional[str] = None
    options: Optional[List[str]] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None
    status: Optional[str] = None


class ManualQuizCreateRequest(BaseModel):
    concept_id: Optional[int] = None
    quiz_type: str
    question: str
    options: List[str]
    answer: str
    explanation: Optional[str] = None
    source_sentence: Optional[str] = None
    page: int
    status: str = "DRAFT"


class QuizStatusUpdateRequest(BaseModel):
    status: str