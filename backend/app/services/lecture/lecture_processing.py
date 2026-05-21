import json

import fitz
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlalchemy.orm import Session

import app.models as models
from app.repositories import (
    concept_repository,
    lecture_repository,
    page_content_repository,
)
from app.services.lecture.text_processing import (
    extract_key_sentences,
    extract_pure_tokens,
    remove_headers,
)


class LectureTextExtractionError(Exception):
    pass


class LectureConceptAnalysisError(Exception):
    pass


def extract_pdf_text_to_page_contents(
    db: Session,
    lecture: models.Lecture,
    lecture_id: int,
    file_path: str,
) -> str:
    try:
        lecture.extract_status = "extracting"
        lecture_repository.commit(db)

        doc = fitz.open(file_path)
        page_content_repository.delete_page_contents_by_lecture(db, lecture_id)

        for page_idx in range(doc.page_count):
            page = doc.load_page(page_idx)
            text_content = page.get_text()

            new_page_content = models.PageContent(
                lecture_id=lecture_id,
                page_num=page_idx + 1,
                text_content=text_content if text_content.strip() else "[텍스트가 없는 페이지입니다.]"
            )
            page_content_repository.add_page_content(db, new_page_content)

        lecture.extract_status = "completed"
        lecture_repository.commit(db)
        doc.close()

        return "텍스트 추출 및 데이터베이스 저장이 완료되었습니다."
    except Exception as e:
        lecture_repository.rollback(db)
        lecture.extract_status = "failed"
        lecture_repository.commit(db)
        raise LectureTextExtractionError(str(e)) from e


def analyze_page_contents_to_concepts(
    db: Session,
    lecture: models.Lecture,
    lecture_id: int,
    page_contents: list[models.PageContent],
) -> str:
    try:
        lecture.analyze_status = "analyzing"
        lecture_repository.commit(db)

        concept_repository.delete_concepts_by_lecture(db, lecture_id)

        valid_pages = {}
        for pc in page_contents:
            cleaned_text = remove_headers(pc.text_content)
            if pc.text_content.strip() and len(cleaned_text.strip()) >= 50:
                valid_pages[pc.page_num] = pc.text_content

        if not valid_pages:
            lecture.analyze_status = "completed"
            lecture_repository.commit(db)
            return "분석할 수 있는 유효한 텍스트 페이지가 존재하지 않습니다."

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
            concept_repository.add_concept(db, new_concept)

        lecture.analyze_status = "completed"
        lecture_repository.commit(db)

        return "개념 추출 알고리즘 연산이 완수되었습니다."

    except Exception as e:
        lecture_repository.rollback(db)
        lecture.analyze_status = "failed"
        lecture_repository.commit(db)
        raise LectureConceptAnalysisError(str(e)) from e
