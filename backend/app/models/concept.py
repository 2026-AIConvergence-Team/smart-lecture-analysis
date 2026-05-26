from sqlalchemy import Column, ForeignKey, Integer, String, Text

from app.db.session import Base


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    concept_name = Column(String, nullable=False)
    page_num = Column(Integer, nullable=False)
    keywords = Column(Text, nullable=False)
    sentences = Column(Text, nullable=False)
    image_paths = Column(Text, nullable=True)
    image_descriptions = Column(Text, nullable=True)