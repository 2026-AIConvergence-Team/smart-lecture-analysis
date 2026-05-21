from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from app.db.session import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)

    lecture_id = Column(
        Integer,
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    concept_id = Column(
        Integer,
        ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    quiz_type = Column(String, nullable=False)  # BLANK | DEFINITION | KEYWORD_CHOICE | OX
    question = Column(Text, nullable=False)

    # SQLite 호환을 위해 JSON 문자열로 저장합니다.
    # 예: ["LIFO", "FIFO", "push", "pop"]
    options = Column(Text, nullable=False)

    answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    source_sentence = Column(Text, nullable=True)

    page_num = Column(Integer, nullable=False)

    # DRAFT | READY | DELETED
    status = Column(String, default="DRAFT", nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )