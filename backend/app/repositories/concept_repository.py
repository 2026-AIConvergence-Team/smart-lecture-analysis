from typing import Optional

from sqlalchemy.orm import Session

import app.models as models


def get_concept_by_id(db: Session, concept_id: int):
    return db.query(models.Concept).filter(
        models.Concept.id == concept_id,
    ).first()


def get_concept_by_id_and_lecture(
    db: Session,
    concept_id: int,
    lecture_id: int,
):
    return db.query(models.Concept).filter(
        models.Concept.id == concept_id,
        models.Concept.lecture_id == lecture_id,
    ).first()


def get_concepts_by_ids(db: Session, concept_ids: list[int]):
    return db.query(models.Concept).filter(
        models.Concept.id.in_(concept_ids),
    ).all()


def lecture_has_concepts(db: Session, lecture_id: int) -> bool:
    return db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id,
    ).first() is not None


def get_concepts_by_lecture(db: Session, lecture_id: int) -> list[models.Concept]:
    return db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id
    ).order_by(models.Concept.page_num, models.Concept.id).all()


def delete_concepts_by_lecture(db: Session, lecture_id: int):
    return db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id
    ).delete()


def add_concept(db: Session, concept: models.Concept):
    db.add(concept)
    return concept


def get_concepts_for_quiz_generation(
    db: Session,
    lecture_id: int,
    page_start: int,
    page_end: int,
    concept_ids: Optional[list[int]] = None,
) -> list[models.Concept]:
    query = db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id,
        models.Concept.page_num >= page_start,
        models.Concept.page_num <= page_end,
    )

    if concept_ids:
        query = query.filter(models.Concept.id.in_(concept_ids))

    return query.order_by(
        models.Concept.page_num,
        models.Concept.id,
    ).all()


def get_nearby_concepts_for_regeneration(
    db: Session,
    lecture_id: int,
    page_num: int,
) -> list[models.Concept]:
    return db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id,
        models.Concept.page_num >= max(1, page_num - 1),
        models.Concept.page_num <= page_num + 1,
    ).order_by(
        models.Concept.page_num,
        models.Concept.id,
    ).all()
