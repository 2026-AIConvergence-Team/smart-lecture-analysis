from datetime import datetime

from sqlalchemy import Column, Integer, Text, ForeignKey, DateTime

from app.db.session import Base


class AnonymousQuestion(Base):
    __tablename__ = "anonymous_questions"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
