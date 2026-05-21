from fastapi import APIRouter, status, Depends, File, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import fitz 
import json
import re
from sklearn.feature_extraction.text import TfidfVectorizer

from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter(prefix="/api/lectures", tags=["Lectures"])


NOUN_TAGS = {"NNG", "NNP", "NNB", "SL"}

HEADER_PATTERNS = [
    r'Multimedia VLSI Lab\.?',
    r'^\d+$',
]

STOPWORDS = [
    "것", "수", "때", "곳", "중", "간", "점", "측", "상", "하",
    "경우", "문제", "결과", "과정", "방법", "방향", "수준", "상태",
    "이유", "기준", "조건", "관련", "내용", "의미", "사실",
    "이론", "연구", "실험", "기능", "정보", "신호", "장치",
]

def remove_headers(text: str) -> str:
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        line = line.strip()
        skip = False
        for pattern in HEADER_PATTERNS:
            if re.fullmatch(pattern, line):
                skip = True
                break
        if not skip and line:
            cleaned_lines.append(line)
    return '\n'.join(cleaned_lines)

def extract_pure_tokens(text: str) -> str:
    text = remove_headers(text)
    words = re.findall(r'[가-힣]{2,}|[a-zA-Z]{3,}', text)
    
    cleaned_words = []
    for word in words:
        word = re.sub(r'(은|는|이|가|을|를|에|의|로|으로|과|와|에서|들|면|서|고|락)$', '', word)
        word = re.sub(r'(하|되|한|된|용|적)$', '', word)
        
        if len(word) >= 2 and word not in STOPWORDS:
            cleaned_words.append(word)
            
    return ' '.join(cleaned_words)

def extract_key_sentences(text: str, keywords: list, top_k: int = 2) -> list:
    raw_sentences = re.split(r'[\n•]', text)
    sentences = [s.strip() for s in raw_sentences if len(s.strip()) >= 15]
    if not sentences:
        return []
    scored = []
    for sentence in sentences:
        score = sum(1 for kw in keywords if kw in sentence)
        scored.append((score, sentence))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored[:top_k] if score > 0]


# 1. POST /api/lectures
@router.post(
    "", 
    response_model=schemas.LectureResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Create lecture session"
)
def create_lecture(
    request_data: schemas.LectureCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not request_data.title or not request_data.title.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "title은 필수값입니다."}
        )

    new_lecture = models.Lecture(
        title=request_data.title.strip(),
        date=request_data.date,
        time=request_data.time,
        class_code=None,
        extract_status="pending",
        analyze_status="pending",
        total_pages=0
    )

    try:
        db.add(new_lecture)
        db.commit()
        db.refresh(new_lecture)
        return new_lecture
    except Exception as e:
        db.rollback()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"서버 내부 데이터베이스 오류: {str(e)}"}
        )

    
# 2. POST /api/lectures/{lecture_id}/pdf
@router.post(
    "/{lecture_id}/pdf",
    response_model=schemas.PDFUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload lecture PDF"
)
async def upload_lecture_pdf(
    lecture_id: int,
    file: UploadFile = File(..., description="PDF file to upload"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    if not file.filename.lower().endswith('.pdf'):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "PDF 파일만 업로드 가능합니다."}
        )

    try:
        upload_dir = f"uploads/lectures/{lecture_id}"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)

        file_content = await file.read()
        with open(file_path, "wb") as f:
            f.write(file_content)

        doc = fitz.open(file_path)
        total_pages = doc.page_count
        doc.close()

        lecture.file_name = file.filename
        lecture.pdf_url = f"/files/lectures/{lecture_id}/{file.filename}"
        lecture.total_pages = total_pages
        
        db.commit()
        db.refresh(lecture)

        return lecture
    except Exception as e:
        db.rollback()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"서버에서 PDF 파일을 처리하는 중 오류가 발생했습니다: {str(e)}"}
        )

    
# 3. POST /api/lectures/{lecture_id}/text-extract
@router.post(
    "/{lecture_id}/text-extract",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start PDF text extraction"
)
async def start_text_extraction(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    if not lecture.file_name:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "텍스트를 추출할 PDF 파일이 업로드되지 않았습니다."}
        )

    file_path = f"uploads/lectures/{lecture_id}/{lecture.file_name}"
    if not os.path.exists(file_path):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "서버에 저장된 PDF 파일을 물리적으로 찾을 수 없습니다."}
        )

    try:
        lecture.extract_status = "extracting"
        db.commit()

        doc = fitz.open(file_path)
        db.query(models.PageContent).filter(models.PageContent.lecture_id == lecture_id).delete()

        for page_idx in range(doc.page_count):
            page = doc.load_page(page_idx)
            text_content = page.get_text()
            
            new_page_content = models.PageContent(
                lecture_id=lecture_id,
                page_num=page_idx + 1,
                text_content=text_content if text_content.strip() else "[텍스트가 없는 페이지입니다.]"
            )
            db.add(new_page_content)

        lecture.extract_status = "completed"
        db.commit()
        doc.close()

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "텍스트 추출 및 데이터베이스 저장이 완료되었습니다."}
        )
    except Exception as e:
        db.rollback()
        lecture.extract_status = "failed"
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"텍스트 추출 중 서버 오류 발생: {str(e)}"}
        )


# 4. POST /api/lectures/{lecture_id}/concept-extract
@router.post(
    "/{lecture_id}/concept-extract",
    status_code=status.HTTP_200_OK,
    summary="Extract lecture concepts via TF-IDF"
)
def extract_lecture_concepts(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    page_contents = db.query(models.PageContent).filter(
        models.PageContent.lecture_id == lecture_id
    ).order_by(models.PageContent.page_num).all()

    if not page_contents:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "추출된 페이지 텍스트가 없습니다. 3단계를 먼저 진행해주세요."}
        )

    try:
        lecture.analyze_status = "analyzing"
        db.commit()

        db.query(models.Concept).filter(models.Concept.lecture_id == lecture_id).delete()

        valid_pages = {}
        for pc in page_contents:
            cleaned_text = remove_headers(pc.text_content)
            if pc.text_content.strip() and len(cleaned_text.strip()) >= 50:
                valid_pages[pc.page_num] = pc.text_content

        if not valid_pages:
            lecture.analyze_status = "completed"
            db.commit()
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={"message": "분석할 수 있는 유효한 텍스트 페이지가 존재하지 않습니다."}
            )

        page_nums = list(valid_pages.keys())

        tokenized_texts = []
        for page_num in page_nums:
            tokenized_texts.append(extract_pure_tokens(valid_pages[page_num]))

        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),        
            max_df=0.7,                
            min_df=1,
            token_pattern=r'[가-힣a-zA-Z]{2,}' 
        )
        
        tfidf_matrix = vectorizer.fit_transform(tokenized_texts)
        feature_names = vectorizer.get_feature_names_out()

        used_concepts = set()

        for i, page_num in enumerate(page_nums):
            scores = tfidf_matrix[i].toarray()[0]
            
            top_indices = scores.argsort()[::-1][:10]
            keywords = [feature_names[idx] for idx in top_indices if scores[idx] > 0]

            if not keywords:
                continue

            concept_name = keywords[0]
            for kw in keywords:
                if kw not in used_concepts:
                    concept_name = kw
                    break
            used_concepts.add(concept_name)
            
            original_text = remove_headers(valid_pages[page_num])
            sentences = extract_key_sentences(original_text, keywords, top_k=2)

            new_concept = models.Concept(
                lecture_id=lecture_id,
                concept_name=concept_name,
                page_num=page_num,
                keywords=",".join(keywords[:5]), 
                sentences=json.dumps(sentences, ensure_ascii=False) 
            )
            db.add(new_concept)

        lecture.analyze_status = "completed"
        db.commit()

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "개념 추출 알고리즘 연산이 완수되었습니다."}
        )

    except Exception as e:
        db.rollback()
        lecture.analyze_status = "failed"
        db.commit()
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": f"알고리즘 내부 연산 중 서버 예외 발생: {str(e)}"}
        )
    
    
# 5. GET /api/lectures/{lecture_id}
@router.get(
    "/{lecture_id}",
    response_model=schemas.LectureResponse,
    status_code=status.HTTP_200_OK,
    summary="Get lecture status and info"
)
def get_lecture_status(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )
    return lecture


# 6. GET /api/lectures/{lecture_id}/concepts
@router.get(
    "/{lecture_id}/concepts",
    status_code=status.HTTP_200_OK,
    summary="Get extracted concepts"
)
def get_lecture_concepts(
    lecture_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    lecture = db.query(models.Lecture).filter(models.Lecture.id == lecture_id).first()
    if not lecture:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"error": "해당 강의를 찾을 수 없습니다."}
        )

    concepts = db.query(models.Concept).filter(
        models.Concept.lecture_id == lecture_id
    ).order_by(models.Concept.page_num, models.Concept.id).all()

    result_list = []
    for c in concepts:
        result_list.append({
            "concept_id": c.id,
            "lecture_id": c.lecture_id,
            "concept_name": c.concept_name,
            "page_num": c.page_num,
            "keywords": c.keywords.split(",") if c.keywords else [],
            "sentences": json.loads(c.sentences) if c.sentences else []
        })

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"lecture_id": lecture_id, "concepts": result_list}
    )