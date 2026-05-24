from sqlalchemy.orm import Session

import app.models as models


def get_page_contents_by_lecture(db: Session, lecture_id: int):
    return db.query(models.PageContent).filter(
        models.PageContent.lecture_id == lecture_id
    ).order_by(models.PageContent.page_num).all()


def delete_page_contents_by_lecture(db: Session, lecture_id: int):
    return db.query(models.PageContent).filter(
        models.PageContent.lecture_id == lecture_id
    ).delete()


def add_page_content(db: Session, page_content: models.PageContent):
    db.add(page_content)
    return page_content
