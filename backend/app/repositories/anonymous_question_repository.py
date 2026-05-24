from typing import List
from sqlalchemy.orm import Session

from app.models import AnonymousQuestion


def create_question(db: Session, lecture_id: int, content: str) -> AnonymousQuestion:
    question = AnonymousQuestion(lecture_id=lecture_id, content=content)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def get_questions_by_lecture(db: Session, lecture_id: int) -> List[AnonymousQuestion]:
    return db.query(AnonymousQuestion).filter(
        AnonymousQuestion.lecture_id == lecture_id
    ).all()
