from typing import List
from sqlalchemy.orm import Session

from app.models import AnonymousQuestion, User


def create_question(
    db: Session,
    lecture_id: int,
    user_id: int,
    content: str,
) -> AnonymousQuestion:
    question = AnonymousQuestion(
        lecture_id=lecture_id,
        user_id=user_id,
        content=content,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def get_questions_by_lecture(
    db: Session,
    lecture_id: int,
) -> List[tuple[AnonymousQuestion, User | None]]:
    return (
        db.query(AnonymousQuestion, User)
        .outerjoin(User, AnonymousQuestion.user_id == User.id)
        .filter(AnonymousQuestion.lecture_id == lecture_id)
        .order_by(AnonymousQuestion.created_at.desc(), AnonymousQuestion.id.desc())
        .all()
    )


def rollback(db: Session):
    db.rollback()
