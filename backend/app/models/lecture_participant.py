from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base


class LectureParticipant(Base):
    __tablename__ = "lecture_participants"
    __table_args__ = (
        UniqueConstraint("lecture_id", "user_id", name="uq_lecture_participant"),
    )

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(
        Integer,
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    lecture = relationship("Lecture", back_populates="participants")
    user = relationship("User")
