from typing import Optional, List
from sqlalchemy.orm import Session

from app.models import Submission


def create_submission(db: Session, set_id: int, student_id: int) -> Submission:
    submission = Submission(set_id=set_id, student_id=student_id)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


def get_submission_by_id(db: Session, submission_id: int) -> Optional[Submission]:
    return db.query(Submission).filter(Submission.id == submission_id).first()


def get_submissions_by_set(db: Session, set_id: int) -> List[Submission]:
    return db.query(Submission).filter(Submission.set_id == set_id).all()


def get_submission_by_set_and_student(db: Session, set_id: int, student_id: int) -> Optional[Submission]:
    return db.query(Submission).filter(
        Submission.set_id == set_id,
        Submission.student_id == student_id
    ).first()
