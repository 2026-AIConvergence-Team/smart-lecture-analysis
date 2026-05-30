import base64
import time
import io
import json
import os
import urllib.error
import urllib.request
from collections import Counter

import fitz
import pytesseract
from PIL import Image
from sqlalchemy.orm import Session

import app.models as models
from app.core.config import settings
import app.repositories.concept_repository as concept_repository
import app.repositories.lecture_repository as lecture_repository
import app.repositories.page_content_repository as page_content_repository
from app.services.lecture.text_processing import (
    extract_key_sentences,
    extract_keywords_tfidf,
    extract_page_title,
    remove_headers,
)

# Tesseract 경로 설정 (Windows 기본 설치 경로)
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# 이미지 최소 크기 (너무 작은 아이콘/로고 제외)
MIN_IMAGE_WIDTH = 100
MIN_IMAGE_HEIGHT = 100

# Vision AI에 넘길 주변 텍스트 최대 길이
MAX_CONTEXT_CHARS = 1500


class LectureTextExtractionError(Exception):
    pass


class LectureConceptAnalysisError(Exception):
    pass


def _detect_common_headers(doc: fitz.Document) -> set[str]:
    """모든 페이지에서 공통으로 나타나는 짧은 줄을 헤더로 자동 감지"""
    line_counter = Counter()
    total_pages = doc.page_count

    for page_idx in range(total_pages):
        page = doc.load_page(page_idx)
        text = page.get_text()
        lines = set(
            line.strip()
            for line in text.split('\n')
            if 2 <= len(line.strip()) <= 50
        )
        for line in lines:
            line_counter[line] += 1

    # 전체 페이지의 50% 이상 등장하는 줄을 헤더로 판단
    threshold = total_pages * 0.5
    return {line for line, count in line_counter.items() if count >= threshold}


def _extract_text_from_page(page: fitz.Page, common_headers: set[str] = None) -> str:
    """
    페이지에서 텍스트 추출.
    글자 좌표 기반으로 띄어쓰기 복원.
    공통 헤더 제거.
    텍스트 레이어가 없거나 빈 경우 OCR fallback 사용.
    """
    if common_headers is None:
        common_headers = set()

    try:
        blocks = page.get_text('rawdict')['blocks']
        lines = []

        for block in blocks:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                line_text = ''
                prev_x2 = None
                for span in line['spans']:
                    for char in span['chars']:
                        x1 = char['bbox'][0]
                        x2 = char['bbox'][2]
                        c = char['c']
                        if prev_x2 is not None:
                            gap = x1 - prev_x2
                            if gap > 3:
                                line_text += ' '
                        line_text += c
                        prev_x2 = x2

                stripped = line_text.strip()
                if stripped and stripped not in common_headers:
                    lines.append(stripped)

        text = '\n'.join(lines)
        if text.strip():
            return text
    except Exception:
        pass

    # OCR fallback
    try:
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))
        ocr_text = pytesseract.image_to_string(img, lang="kor+eng")
        return ocr_text
    except Exception:
        return ""


def _extract_images_from_page(
    page: fitz.Page,
    doc: fitz.Document,
    lecture_id: int,
    page_num: int,
) -> list[str]:
    """
    페이지에서 삽입 이미지를 추출하고 파일로 저장.
    저장된 이미지 경로 리스트 반환.
    """
    image_paths = []

    try:
        image_list = page.get_images(full=True)
        if not image_list:
            return []

        image_dir = os.path.join(settings.UPLOAD_DIR, "lectures", str(lecture_id), "images")
        os.makedirs(image_dir, exist_ok=True)

        img_idx = 1
        for img_info in image_list:
            xref = img_info[0]

            try:
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                img_ext = base_image["ext"]

                img = Image.open(io.BytesIO(img_bytes))
                width, height = img.size
                if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
                    continue

                img_filename = f"page_{page_num}_img_{img_idx}.{img_ext}"
                img_path = os.path.join(image_dir, img_filename)

                with open(img_path, "wb") as f:
                    f.write(img_bytes)

                relative_path = os.path.join(
                    settings.UPLOAD_DIR, "lectures", str(lecture_id), "images", img_filename
                ).replace("\\", "/")

                image_paths.append(relative_path)
                img_idx += 1

            except Exception:
                continue

    except Exception:
        pass

    return image_paths


def _build_context_text(page_num: int, all_page_texts: dict[int, str]) -> str:
    """
    현재 페이지 기준 앞뒤 1페이지 텍스트를 합쳐서 Vision AI 컨텍스트 생성.
    """
    parts = []

    for pn in [page_num - 1, page_num, page_num + 1]:
        text = all_page_texts.get(pn, "")
        cleaned = remove_headers(text).strip()
        if cleaned:
            parts.append(f"[{pn}페이지]\n{cleaned}")

    combined = "\n\n".join(parts)
    return combined[:MAX_CONTEXT_CHARS]


def _get_vision_ai_config() -> dict:
    """AI_QUIZ_PROVIDER 설정에 따라 Vision AI 설정 반환"""
    provider = getattr(settings, "AI_QUIZ_PROVIDER", "gemini").lower()

    if provider == "groq":
        return {
            "provider": "groq",
            "api_key": getattr(settings, "GROQ_API_KEY", None),
            "base_url": getattr(
                settings, "GROQ_BASE_URL", "https://api.groq.com/openai/v1"
            ).rstrip("/"),
            "model": getattr(
                settings, "GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"
            ),
        }

    return {
        "provider": "gemini",
        "api_key": (
            getattr(settings, "GEMINI_API_KEY", None)
            or getattr(settings, "AI_QUIZ_API_KEY", None)
        ),
        "base_url": getattr(
            settings,
            "GEMINI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai",
        ).rstrip("/"),
        "model": getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash-lite"),
    }


def _describe_single_image(
    image_path: str,
    context_text: str,
    config: dict,
) -> str:
    """이미지 1개에 대한 Vision AI 설명 생성. 429 시 재시도. 실패 시 빈 문자열 반환."""
    api_key = config["api_key"]
    base_url = config["base_url"]
    model = config["model"]
    provider = config["provider"]

    try:
        with open(image_path, "rb") as f:
            img_bytes = f.read()
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
    except Exception as e:
        print(f"[IMAGE_DESCRIPTION] 이미지 파일 읽기 실패: {e}")
        return ""

    ext = image_path.rsplit(".", 1)[-1].lower()
    media_type_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif", "webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "image/png")
    url = f"{base_url}/chat/completions"

    messages = [
        {
            "role": "system",
            "content": (
                "너는 대학 강의 슬라이드 이미지 분석기다. "
                "제공된 주변 페이지 텍스트를 참고해서, "
                "이미지가 강의에서 어떤 개념을 설명하는지 한국어로 서술해라. "
                "2~3문장으로 간결하게 작성하고, 강의 내용과 무관한 설명은 하지 마라."
            ),
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"아래는 이 이미지가 있는 페이지 주변의 강의 텍스트입니다.\n\n"
                        f"{context_text}\n\n"
                        "위 내용을 참고해서 이미지가 무엇을 설명하는지 서술해줘."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{img_b64}"},
                },
            ],
        },
    ]

    max_tokens = getattr(settings, "IMAGE_DESCRIPTION_MAX_TOKENS", 512)
    payload = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": 0.0}

    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
        method="POST",
    )

    timeout = getattr(settings, "AI_QUIZ_TIMEOUT_SECONDS", 30)
    max_retries = 3

    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                response_data = json.loads(response.read().decode("utf-8"))

            description = response_data["choices"][0]["message"]["content"].strip()
            print(f"[IMAGE_DESCRIPTION] 생성 완료 ({provider}): {image_path}")
            return description

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="ignore")
            if e.code == 429:
                wait_sec = 10 * (attempt + 1)
                print(f"[IMAGE_DESCRIPTION] Rate limit (429), {wait_sec}초 후 재시도 ({attempt + 1}/{max_retries})")
                time.sleep(wait_sec)
                continue
            print(f"[IMAGE_DESCRIPTION] HTTP 오류: {e.code} {error_body}")
            return ""
        except Exception as e:
            print(f"[IMAGE_DESCRIPTION] Vision AI 호출 실패: {e}")
            return ""

    print(f"[IMAGE_DESCRIPTION] 최대 재시도 횟수 초과: {image_path}")
    return ""


def _describe_images_with_vision_ai(
    image_paths: list[str],
    context_text: str,
) -> list[str]:
    """
    페이지의 모든 이미지에 대해 Vision AI 설명 생성.
    이미지 간 5초 대기로 Rate limit 방지.
    """
    if not getattr(settings, "IMAGE_DESCRIPTION_ENABLED", False):
        return []

    config = _get_vision_ai_config()
    if not config["api_key"]:
        print(f"[IMAGE_DESCRIPTION] {config['provider']} API KEY가 설정되지 않아 이미지 설명을 건너뜁니다.")
        return []

    descriptions = []
    for i, image_path in enumerate(image_paths):
        description = _describe_single_image(image_path, context_text, config)
        descriptions.append(description)
        if i < len(image_paths) - 1:
            time.sleep(5)

    return descriptions


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

        common_headers = _detect_common_headers(doc)

        for page_idx in range(doc.page_count):
            page = doc.load_page(page_idx)
            page_num = page_idx + 1

            text_content = _extract_text_from_page(page, common_headers)
            image_paths = _extract_images_from_page(page, doc, lecture_id, page_num)

            new_page_content = models.PageContent(
                lecture_id=lecture_id,
                page_num=page_num,
                text_content=text_content if text_content.strip() else "[텍스트가 없는 페이지입니다.]",
                image_paths=json.dumps(image_paths, ensure_ascii=False) if image_paths else None
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
                valid_pages[pc.page_num] = {
                    "text": pc.text_content,
                    "image_paths": json.loads(pc.image_paths) if pc.image_paths else []
                }

        if not valid_pages:
            lecture.analyze_status = "completed"
            lecture_repository.commit(db)
            return "분석할 수 있는 유효한 텍스트 페이지가 존재하지 않습니다."

        all_page_texts = {pn: data["text"] for pn, data in valid_pages.items()}
        all_texts_list = [data["text"] for data in valid_pages.values()]

        # 개념명 사용 횟수 카운터
        concept_name_counter: dict[str, int] = {}

        for page_num, page_data in valid_pages.items():
            text = page_data["text"]
            image_paths = page_data["image_paths"]

            # 1. 페이지 제목 추출 (키워드 가중치에 활용)
            title = extract_page_title(remove_headers(text))

            # 2. TF-IDF + 제목 가중치로 키워드 추출
            keywords = extract_keywords_tfidf(text, all_texts_list, top_n=10, page_title=title)

            if not keywords:
                continue

            # 3. 개념명 결정 — 제목 없으면 키워드 1위로 대체
            base_name = (title if title else keywords[0])[:30]

            if not base_name:
                continue

            # 중복 개념명에 번호 붙이기 (예: "자기 복제 기계의 진화사 (2)")
            count = concept_name_counter.get(base_name, 0) + 1
            concept_name_counter[base_name] = count
            concept_name = base_name if count == 1 else f"{base_name} ({count})"

            # 4. 핵심 문장 추출
            original_text = remove_headers(text)
            sentences = extract_key_sentences(original_text, keywords, top_k=2)

            # 5. 이미지가 있는 경우 Vision AI로 설명 생성
            image_descriptions = []
            if image_paths:
                context_text = _build_context_text(page_num, all_page_texts)
                image_descriptions = _describe_images_with_vision_ai(
                    image_paths=image_paths,
                    context_text=context_text,
                )

            new_concept = models.Concept(
                lecture_id=lecture_id,
                concept_name=concept_name,
                page_num=page_num,
                keywords=",".join(keywords[:5]),
                sentences=json.dumps(sentences, ensure_ascii=False),
                image_paths=json.dumps(image_paths, ensure_ascii=False) if image_paths else None,
                image_descriptions=json.dumps(image_descriptions, ensure_ascii=False) if image_descriptions else None,
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