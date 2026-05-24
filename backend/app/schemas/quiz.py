from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class QuizGenerateRequest(BaseModel):
    page_start: int = Field(..., ge=1)
    page_end: int = Field(..., ge=1)
    concept_ids: Optional[List[int]] = None

    # Supported values: MIXED, BLANK, DEFINITION, KEYWORD_CHOICE, OX
    quiz_type: str = "MIXED"
    count_per_concept: int = Field(default=1, ge=1)
    option_count: int = Field(default=4, ge=2, le=6)

    use_ai: bool = True
    # Falls back to the server default provider when omitted.
    ai_provider: Optional[Literal["gemini", "groq"]] = None

    # Supported values: EASY, MEDIUM, HARD
    difficulty: str = "MEDIUM"


class QuizGenerateResponse(BaseModel):
    lecture_id: int
    job_id: int
    set_id: int
    status: str

    page_start: int
    page_end: int
    quiz_type: str

    generated_count: int
    failed_count: int
    rejected_count: int = 0

    ai_requested: bool = False
    ai_enhanced_count: int = 0
    generation_mode: str = "algorithm"  # Supported values: algorithm, hybrid

    message: str


class QuizItemResponse(BaseModel):
    quiz_id: int
    set_id: Optional[int] = None
    lecture_id: int

    concept_id: Optional[int] = None
    concept: Optional[str] = None

    # Identifies the generation job that produced this quiz.
    generation_job_id: Optional[int] = None

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
    job_id: int
    set_id: int

    status: str
    progress: int

    page_start: Optional[int] = None
    page_end: Optional[int] = None
    quiz_type: Optional[str] = None

    generated_count: int
    failed_count: int
    returned_count: int = 0

    message: Optional[str] = None

    # Indicates whether results are scoped by Quiz.generation_job_id.
    uses_generation_job_id: bool = False

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

    # Supported values: BLANK, DEFINITION, KEYWORD_CHOICE, OX
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


class QuizRegenerateRequest(BaseModel):
    quiz_type: Optional[str] = None
    option_count: int = Field(default=4, ge=2, le=6)

    use_ai: bool = True
    difficulty: str = "MEDIUM"

    # Falls back to the server default provider when omitted.
    ai_provider: Optional[Literal["gemini", "groq"]] = None
    # Optional reviewer note used to guide regeneration.
    reason: Optional[str] = None
