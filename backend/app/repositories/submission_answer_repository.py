from typing import List
from sqlalchemy.orm import Session

from app.models import SubmissionAnswer


def add_submission_answer(db: Session, submission_id: int, quiz_id: int, selected: str, is_correct: bool) -> SubmissionAnswer:
    answer = SubmissionAnswer(
        submission_id=submission_id,
        quiz_id=quiz_id,
        selected=selected,
        is_correct=is_correct
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return answer


def get_answers_by_submission(db: Session, submission_id: int) -> List[SubmissionAnswer]:
    return db.query(SubmissionAnswer).filter(SubmissionAnswer.submission_id == submission_id).all()


def get_answers_by_quiz(db: Session, quiz_id: int) -> List[SubmissionAnswer]:
    return db.query(SubmissionAnswer).filter(SubmissionAnswer.quiz_id == quiz_id).all()
