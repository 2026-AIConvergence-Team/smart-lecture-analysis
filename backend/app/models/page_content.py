from sqlalchemy import Column, ForeignKey, Integer, Text

from app.db.session import Base


class PageContent(Base):
    __tablename__ = "page_contents"

    id = Column(Integer, primary_key=True, index=True)
    # 데이터베이스 레벨에서 강의가 삭제되면 연관된 텍스트 데이터도 함께 지워지도록 CASCADE 설정을 적용했습니다.
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    page_num = Column(Integer, nullable=False)  # 1부터 시작하는 페이지 번호
    text_content = Column(Text, nullable=False)
    # 페이지에서 추출한 이미지 경로 리스트 (JSON 문자열로 저장)
    # 예: '["uploads/lectures/1/images/page_3_img_1.png", ...]'
    # 이미지가 없는 페이지는 null
    image_paths = Column(Text, nullable=True)