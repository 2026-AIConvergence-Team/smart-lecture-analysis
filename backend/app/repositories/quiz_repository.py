from typing import Optional

from sqlalchemy.orm import Session

import app.models as models


def get_quiz_by_id(db: Session, quiz_id: int):
    return db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()


def get_latest_job_quizzes_query(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
    supports_generation_job_id: bool,
):
    """
    generation_job_id가 없던 배포본에서는 생성 시점과 요청 범위로 최신 작업 결과를 좁힙니다.
    """
    query = db.query(models.Quiz).filter(
        models.Quiz.lecture_id == lecture_id,
        models.Quiz.status != "DELETED",
    )

    if supports_generation_job_id:
        return query.filter(models.Quiz.generation_job_id == latest_job.id)

    query = query.filter(
        models.Quiz.page_num >= latest_job.page_start,
        models.Quiz.page_num <= latest_job.page_end,
    )

    if latest_job.created_at:
        query = query.filter(models.Quiz.created_at >= latest_job.created_at)

    if latest_job.quiz_type != "MIXED":
        query = query.filter(models.Quiz.quiz_type == latest_job.quiz_type)

    return query


def get_latest_job_quizzes(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
    supports_generation_job_id: bool,
) -> list[models.Quiz]:
    quiz_query = get_latest_job_quizzes_query(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        supports_generation_job_id=supports_generation_job_id,
    )

    return quiz_query.order_by(
        models.Quiz.id.asc(),
    ).all()


def get_lecture_quizzes(
    db: Session,
    lecture_id: int,
    quiz_status: Optional[str] = None,
    page_start: Optional[int] = None,
    page_end: Optional[int] = None,
    concept_id: Optional[int] = None,
    generation_job_id: Optional[int] = None,
) -> list[models.Quiz]:
    query = db.query(models.Quiz).filter(models.Quiz.lecture_id == lecture_id)

    if quiz_status:
        query = query.filter(models.Quiz.status == quiz_status)
    else:
        query = query.filter(models.Quiz.status != "DELETED")

    if page_start is not None:
        query = query.filter(models.Quiz.page_num >= page_start)

    if page_end is not None:
        query = query.filter(models.Quiz.page_num <= page_end)

    if concept_id is not None:
        query = query.filter(models.Quiz.concept_id == concept_id)

    if generation_job_id is not None:
        query = query.filter(models.Quiz.generation_job_id == generation_job_id)

    return query.order_by(
        models.Quiz.id.asc(),
    ).all()


def save_generated_quizzes(
    db: Session,
    quizzes: list[models.Quiz],
) -> list[models.Quiz]:
    for quiz in quizzes:
        db.add(quiz)

    db.commit()

    for quiz in quizzes:
        db.refresh(quiz)

    return quizzes


def create_quiz(db: Session, quiz: models.Quiz):
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


def save_quiz(db: Session, quiz: models.Quiz):
    db.commit()
    db.refresh(quiz)
    return quiz


def rollback(db: Session):
    db.rollback()
