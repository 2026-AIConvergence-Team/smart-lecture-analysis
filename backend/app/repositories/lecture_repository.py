from sqlalchemy.orm import Session

import app.models as models


def get_lecture_by_id(db: Session, lecture_id: int):
    return db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()


def get_lecture_by_class_code(db: Session, class_code: str):
    return (
        db.query(models.Lecture)
        .filter(models.Lecture.class_code == class_code)
        .first()
    )


def get_lectures_by_course(db: Session, course_id: int):
    return (
        db.query(models.Lecture)
        .filter(models.Lecture.course_id == course_id)
        .order_by(models.Lecture.date.asc(), models.Lecture.time.asc(), models.Lecture.id.asc())
        .all()
    )


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
