from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# === 교수 리포트 스키마 ===

class ConceptScore(BaseModel):
    concept_id: int
    concept_name: str
    correct_rate: float  # 0~100
    is_weak: bool  # correct_rate < 60


class QuizResult(BaseModel):
    quiz_id: int
    question: str
    correct_rate: float
    top_wrong_answer: Optional[str] = None  # 가장 많이 선택된 오답 선지 텍스트


class SetResult(BaseModel):
    set_id: int
    set_number: int
    page_start: int
    page_end: int
    avg_correct_rate: float
    quiz_results: list[QuizResult]


class AnonymousQuestionItem(BaseModel):
    id: int
    content: str
    created_at: datetime


class TeacherReportResponse(BaseModel):
    lecture_id: int
    summary: dict  # {student_count, set_count, total_quiz_count, avg_correct_rate, anon_q_count}
    concept_scores: list[ConceptScore]
    set_results: list[SetResult]
    anonymous_questions: list[AnonymousQuestionItem]


# === 학생 복습 리포트 스키마 ===

class MySetScore(BaseModel):
    set_id: int
    set_number: int
    correct_count: int
    total_count: int
    correct_rate: float
    class_avg_rate: float  # 해당 세트 전체 학생 평균


class QuizReview(BaseModel):
    quiz_id: int
    question: str
    options: list[str]
    answer: str
    explanation: Optional[str] = None
    my_answer: Optional[str] = None  # 미제출이면 None
    is_correct: Optional[bool] = None
    wrong_rate: float  # 전체 학생 오답률
    memo: Optional[str] = None  # 학생 메모


class SetReview(BaseModel):
    set_id: int
    set_number: int
    quizzes: list[QuizReview]


class StudentReviewResponse(BaseModel):
    lecture_id: int
    my_scores: list[MySetScore]
    quiz_reviews: list[SetReview]
