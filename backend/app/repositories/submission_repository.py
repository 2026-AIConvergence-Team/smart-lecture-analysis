from typing import Optional, List
from sqlalchemy.orm import Session

from app.models import Submission, SubmissionAnswer


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


def create_submission_with_answers(
    db: Session,
    set_id: int,
    student_id: int,
    answers: list[dict],
) -> tuple[Submission, list[SubmissionAnswer]]:
    submission = Submission(set_id=set_id, student_id=student_id)
    db.add(submission)
    db.flush()

    submission_answers = [
        SubmissionAnswer(
            submission_id=submission.id,
            quiz_id=answer["quiz_id"],
            selected=answer["selected"],
            is_correct=answer["is_correct"],
        )
        for answer in answers
    ]

    db.add_all(submission_answers)
    db.commit()
    db.refresh(submission)

    for answer in submission_answers:
        db.refresh(answer)

    return submission, submission_answers


def rollback(db: Session):
    db.rollback()
