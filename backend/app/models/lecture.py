from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Integer, String, Time

from app.db.session import Base


class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    class_code = Column(String, nullable=True)  # 초기값 null
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # 파트 1 비동기 파이프라인 상태 관리용 컬럼
    extract_status = Column(String, default="pending", nullable=False)  # pending | extracting | completed | failed
    analyze_status = Column(String, default="pending", nullable=False)  # pending | analyzing | completed | failed
    total_pages = Column(Integer, default=0, nullable=False)
    file_name = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)