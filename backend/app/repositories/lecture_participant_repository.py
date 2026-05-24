from sqlalchemy.orm import Session

import app.models as models


def get_participant(db: Session, lecture_id: int, user_id: int):
    return (
        db.query(models.LectureParticipant)
        .filter(
            models.LectureParticipant.lecture_id == lecture_id,
            models.LectureParticipant.user_id == user_id,
        )
        .first()
    )


def create_participant(db: Session, participant: models.LectureParticipant):
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def rollback(db: Session):
    db.rollback()
