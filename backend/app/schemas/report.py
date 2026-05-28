from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# === 교수 수업 리포트 스키마 (GET /api/lectures/{lecture_id}/report) ===

class ConceptStat(BaseModel):
    concept: str  # concept_name
    avg_correct_rate: float  # 0~100
    is_weak: bool  # avg_correct_rate < 50


class TeacherQuiz(BaseModel):
    quiz_id: int
    question: str
    correct_rate: float
    top_wrong_answer: Optional[str] = None
    top_wrong_rate: float = 0.0  # top_wrong 선택수 / 전체 제출수 * 100


class TeacherSet(BaseModel):
    set_id: int
    set_number: int
    page_start: int
    page_end: int
    quiz_count: int
    avg_correct_rate: float
    quizzes: list[TeacherQuiz]


class TeacherReportStats(BaseModel):
    participant_count: int
    set_count: int
    quiz_count: int
    avg_correct_rate: float
    anonymous_question_count: int


class AnonymousQuestion(BaseModel):
    question_id: int
    content: str
    created_at: datetime


class TeacherReportResponse(BaseModel):
    lecture_id: int
    week: int
    date: str  # "2026.05.13" 포맷
    stats: TeacherReportStats
    concept_stats: list[ConceptStat]
    sets: list[TeacherSet]
    anonymous_questions: list[AnonymousQuestion]


# === 학생 복습 리포트 스키마 (GET /api/lectures/{lecture_id}/review) ===

class StudentQuiz(BaseModel):
    quiz_id: int
    question: str
    options: list[str]
    answer: str
    my_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    explanation: Optional[str] = None
    memo: Optional[str] = None
    class_wrong_rate: float


class StudentSet(BaseModel):
    set_id: int
    set_number: int
    page_start: int
    page_end: int
    quiz_count: int
    my_correct_count: int
    my_correct_rate: float
    quizzes: list[StudentQuiz]


class StudentStats(BaseModel):
    total_quiz_count: int
    my_correct_count: int
    my_correct_rate: float


class StudentReviewResponse(BaseModel):
    lecture_id: int
    week: int
    date: str  # "2026.05.13" 포맷
    my_stats: StudentStats
    sets: list[StudentSet]
