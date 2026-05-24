from typing import Optional, List
from sqlalchemy.orm import Session

from app.models import Memo


def upsert_memo(db: Session, quiz_id: int, student_id: int, content: str) -> Memo:
    memo = db.query(Memo).filter(
        Memo.quiz_id == quiz_id,
        Memo.student_id == student_id
    ).first()

    if memo:
        memo.content = content
    else:
        memo = Memo(quiz_id=quiz_id, student_id=student_id, content=content)
        db.add(memo)

    db.commit()
    db.refresh(memo)
    return memo


def get_memo(db: Session, quiz_id: int, student_id: int) -> Optional[Memo]:
    return db.query(Memo).filter(
        Memo.quiz_id == quiz_id,
        Memo.student_id == student_id
    ).first()


def get_memos_by_student_and_lecture(db: Session, student_id: int, lecture_id: int) -> List[Memo]:
    from app.models import Quiz
    return db.query(Memo).join(
        Quiz, Memo.quiz_id == Quiz.id
    ).filter(
        Memo.student_id == student_id,
        Quiz.lecture_id == lecture_id
    ).all()


def save_memo(db: Session, memo: Memo) -> Memo:
    db.commit()
    db.refresh(memo)
    return memo


def rollback(db: Session):
    db.rollback()
