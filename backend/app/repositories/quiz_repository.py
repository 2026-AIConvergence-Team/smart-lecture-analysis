from typing import Optional

from sqlalchemy.orm import Session

import app.models as models


def get_quiz_by_id(db: Session, quiz_id: int):
    return db.query(models.Quiz).filter(models.Quiz.id == quiz_id).first()


def get_latest_job_quizzes_query(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
    quiz_set: models.QuizSet | None = None,
):
    query = db.query(models.Quiz).filter(
        models.Quiz.lecture_id == lecture_id,
        models.Quiz.status != "DELETED",
    )

    if quiz_set:
        return query.filter(models.Quiz.set_id == quiz_set.id)

    return query.filter(models.Quiz.generation_job_id == latest_job.id)


def get_latest_job_quizzes(
    db: Session,
    lecture_id: int,
    latest_job: models.QuizGenerationJob,
    quiz_set: models.QuizSet | None = None,
) -> list[models.Quiz]:
    quiz_query = get_latest_job_quizzes_query(
        db=db,
        lecture_id=lecture_id,
        latest_job=latest_job,
        quiz_set=quiz_set,
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
    set_id: Optional[int] = None,
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

    if set_id is not None:
        query = query.filter(models.Quiz.set_id == set_id)

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
