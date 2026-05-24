from sqlalchemy import func
from sqlalchemy.orm import Session

import app.models as models


def get_quiz_set_by_id(db: Session, set_id: int):
    return db.query(models.QuizSet).filter(models.QuizSet.id == set_id).first()


def get_quiz_set_by_job_id(db: Session, job_id: int):
    return db.query(models.QuizSet).filter(
        models.QuizSet.generation_job_id == job_id,
    ).first()


def get_quiz_sets_by_lecture(
    db: Session,
    lecture_id: int,
    set_status: str | None = None,
) -> list[models.QuizSet]:
    query = db.query(models.QuizSet).filter(models.QuizSet.lecture_id == lecture_id)

    if set_status:
        query = query.filter(models.QuizSet.status == set_status)

    return query.order_by(
        models.QuizSet.set_number.asc(),
        models.QuizSet.id.asc(),
    ).all()


def get_next_set_number(db: Session, lecture_id: int) -> int:
    current_max = db.query(func.max(models.QuizSet.set_number)).filter(
        models.QuizSet.lecture_id == lecture_id,
    ).scalar()

    return int(current_max or 0) + 1


def create_quiz_set(db: Session, quiz_set: models.QuizSet):
    db.add(quiz_set)
    db.commit()
    db.refresh(quiz_set)
    return quiz_set


def save_quiz_set(db: Session, quiz_set: models.QuizSet):
    db.commit()
    db.refresh(quiz_set)
    return quiz_set
