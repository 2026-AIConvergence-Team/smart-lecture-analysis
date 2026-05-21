from sqlalchemy.orm import Session

import app.models as models


def get_lecture_by_id(db: Session, lecture_id: int):
    return db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()


def create_lecture(db: Session, lecture: models.Lecture):
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return lecture


def save_lecture(db: Session, lecture: models.Lecture):
    db.commit()
    db.refresh(lecture)
    return lecture


def commit(db: Session):
    db.commit()


def rollback(db: Session):
    db.rollback()
