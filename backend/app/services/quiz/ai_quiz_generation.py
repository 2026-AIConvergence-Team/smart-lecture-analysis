import ast
import json
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple
import time

import app.models as models
from app.core.config import settings
from app.services.quiz.quiz_generation import (
    compact_text,
    deserialize_options,
    is_answer_grounded_in_source,
    is_bad_blank_question_shape,
    is_good_blank_answer,
    is_good_short_answer,
    is_valid_ox_statement,
    normalize_text_item,
    parse_keywords,
    parse_sentences,
    unique_keep_order,
    get_refined_concept_label_for_ai,
    get_safe_keywords_for_ai,
    is_cut_or_dangling_text,
    is_definition_answer_quality,
    select_source_sentences_for_ai,
)
from app.services.quiz.quiz_validation import validate_generated_quiz_dict


class AIQuizGenerationError(Exception):
    pass


class AIQuotaExceededError(AIQuizGenerationError):
    pass


def can_use_ai(request_use_ai: bool, provider: Optional[str] = None) -> bool:
    if not request_use_ai or not getattr(settings, "AI_QUIZ_ENABLED", False):
        return False

    try:
        provider_config = get_ai_provider_config(provider)
    except AIQuizGenerationError as exc:
        print(f"[AI_QUIZ_PROVIDER_ERROR] {exc}")
        return False

    return bool(
        provider_config.get("api_key")
        and provider_config.get("model")
        and provider_config.get("base_url")
    )


def is_ai_quota_exceeded_error(exc: Exception) -> bool:
    message = str(exc).lower()

    quota_markers = [
        "429",
        "quota exceeded",
        "resource_exhausted",
        "generate_content_free_tier_requests",
        "generaterequestsperdayperprojectpermodel-freetier",
    ]

    return any(marker.lower() in message for marker in quota_markers)

def extract_retry_after_seconds(exc: Exception, default_seconds: float = 12.0) -> float:
    """
    Groq 429 메시지의 'Please try again in 14.715s'에서 대기 시간을 추출합니다.
    추출 실패 시 기본값을 사용합니다.
    """
    message = str(exc)

    match = re.search(r"try again in\s+([0-9.]+)s", message, flags=re.IGNORECASE)
    if match:
        try:
            return min(30.0, max(3.0, float(match.group(1)) + 1.0))
        except Exception:
            pass

    return default_seconds

def normalize_ai_text(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())

def normalize_ai_provider(provider: Optional[str] = None) -> str:
    selected_provider = normalize_ai_text(
        provider or getattr(settings, "AI_QUIZ_PROVIDER", "gemini")
    ).lower()

    if selected_provider in {"gemini", "google"}:
        return "gemini"

    if selected_provider in {"groq", "gpt-oss", "gpt_oss"}:
        return "groq"

    raise AIQuizGenerationError(
        "지원하지 않는 AI 제공자입니다. ai_provider는 gemini 또는 groq만 사용할 수 있습니다."
    )


def get_ai_provider_config(provider: Optional[str] = None) -> Dict[str, Optional[str]]:
    normalized_provider = normalize_ai_provider(provider)

    if normalized_provider == "groq":
        return {
            "provider": "groq",
            "api_key": getattr(settings, "GROQ_API_KEY", None),
            "base_url": getattr(settings, "GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "model": getattr(settings, "GROQ_MODEL", "openai/gpt-oss-20b"),
        }

    return {
        "provider": "gemini",
        "api_key": (
            getattr(settings, "GEMINI_API_KEY", None)
            or getattr(settings, "AI_QUIZ_API_KEY", None)
        ),
        "base_url": (
            getattr(settings, "GEMINI_BASE_URL", None)
            or getattr(settings, "AI_QUIZ_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai")
        ),
        "model": (
            getattr(settings, "GEMINI_MODEL", None)
            or getattr(settings, "AI_QUIZ_MODEL", "gemini-2.5-flash-lite")
        ),
    }

MIN_STRONG_SOURCE_SENTENCE_COMPACT_LENGTH = 18

AI_GENERATED_QUIZ_TYPES = {
    "MULTIPLE_CHOICE",
    "OX",
    "SHORT_ANSWER",
    "SUBJECTIVE",
}

LEGACY_AI_QUIZ_TYPE_ALIASES = {
    "DEFINITION": "MULTIPLE_CHOICE",
    "KEYWORD_CHOICE": "MULTIPLE_CHOICE",
    "BLANK": "SHORT_ANSWER",
    "TRUE_FALSE": "OX",
}


def canonicalize_ai_quiz_type(
    quiz_type: Optional[str],
    default: str = "MULTIPLE_CHOICE",
) -> str:
    """
    기존 퀴즈 타입을 새 퀴즈 타입으로 변환합니다.

    기존:
    - DEFINITION, KEYWORD_CHOICE -> MULTIPLE_CHOICE
    - BLANK -> SHORT_ANSWER
    - OX -> OX

    신규:
    - MULTIPLE_CHOICE
    - OX
    - SHORT_ANSWER
    - SUBJECTIVE
    """
    normalized = normalize_ai_text(quiz_type).upper()

    if not normalized or normalized == "MIXED":
        return default

    normalized = LEGACY_AI_QUIZ_TYPE_ALIASES.get(normalized, normalized)

    if normalized in AI_GENERATED_QUIZ_TYPES:
        return normalized

    return default


def normalize_string_list(raw_items: Any, max_items: int = 6) -> List[str]:
    if not isinstance(raw_items, list):
        return []

    return unique_keep_order([
        normalize_ai_text(item)
        for item in raw_items
        if normalize_ai_text(item)
    ])[:max_items]


def format_subjective_explanation(
    explanation: str,
    rubric: List[str],
    grading_keywords: List[str],
) -> str:
    """
    현재 Quiz 모델에 rubric/grading_keywords 전용 컬럼이 없다면,
    주관식 채점 기준을 explanation에 함께 저장합니다.
    """
    parts = []

    if normalize_ai_text(explanation):
        parts.append(normalize_ai_text(explanation))

    if rubric:
        rubric_text = " / ".join(rubric)
        parts.append(f"채점 기준: {rubric_text}")

    if grading_keywords:
        keyword_text = ", ".join(grading_keywords)
        parts.append(f"핵심 키워드: {keyword_text}")

    return "\n".join(parts).strip()


def is_short_answer_grounded_in_source(answer: str, source_sentence: str) -> bool:
    """
    SHORT_ANSWER는 학생이 직접 입력하는 빈칸형이므로,
    정답 핵심어가 source_sentence에 실제로 등장해야 안전합니다.
    """
    normalized_answer = normalize_for_ai_match(answer)
    normalized_source = normalize_for_ai_match(source_sentence)

    if not normalized_answer or not normalized_source:
        return False

    return normalized_answer in normalized_source


def select_stronger_source_sentence(
    requested_source_sentence: str,
    allowed_sources: List[str],
) -> str:
    """
    AI가 너무 짧거나 끊긴 source_sentence를 고른 경우,
    같은 item의 source_sentences 중 더 정보량이 많은 문장으로 보정합니다.
    """
    requested = normalize_ai_text(requested_source_sentence)

    sources = unique_keep_order([
        normalize_ai_text(source)
        for source in allowed_sources
        if normalize_ai_text(source)
    ])

    if (
        requested
        and requested in sources
        and len(compact_text(requested)) >= MIN_STRONG_SOURCE_SENTENCE_COMPACT_LENGTH
    ):
        return requested

    if not sources:
        return requested

    # 너무 짧은 문장보다 정보량이 많은 문장을 우선합니다.
    sources.sort(
        key=lambda sentence: (
            len(compact_text(sentence)) >= MIN_STRONG_SOURCE_SENTENCE_COMPACT_LENGTH,
            len(compact_text(sentence)),
        ),
        reverse=True,
    )

    return sources[0]


def preview_ai_text(text: str, limit: int = 500) -> str:
    cleaned = " ".join(str(text or "").replace("\r", " ").replace("\n", " ").split())
    if len(cleaned) > limit:
        return cleaned[:limit] + "..."
    return cleaned


def strip_markdown_code_fence(text: str) -> str:
    cleaned = str(text or "").strip()

    if not cleaned.startswith("```"):
        return cleaned

    cleaned = re.sub(r"^```(?:json|JSON)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def find_balanced_json_object(text: str) -> Optional[str]:
    """
    응답 앞뒤에 설명/추론이 섞여도 첫 번째 완성된 JSON 객체만 잘라냅니다.
    단순 정규식 {.*}은 문자열 안의 중괄호나 뒤쪽 설명까지 먹어서 JSONDecodeError가 나기 쉽습니다.
    """
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False

    for index in range(start, len(text)):
        char = text[index]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]

    return None


def normalize_json_candidate(candidate: str) -> str:
    """
    LLM이 자주 만드는 가벼운 JSON 실수를 일부 보정합니다.
    - trailing comma 제거
    - 제어문자 제거
    """
    cleaned = str(candidate or "").strip()
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", cleaned)
    return cleaned


def extract_json_object(text: str) -> Dict:
    """
    Markdown 코드블록, 부가 설명, reasoning 텍스트가 섞인 AI 응답에서 JSON 객체만 복원합니다.

    Groq gpt-oss-20b는 가끔 JSON 대신 Python dict 스타일 문자열을 반환하거나,
    앞쪽에 reasoning 문장을 붙이는 경우가 있어 json.loads와 ast.literal_eval을 순서대로 시도합니다.
    단, 응답이 max_tokens에 잘려서 닫는 따옴표/중괄호가 없는 경우는 안전하게 fallback합니다.
    """
    cleaned = strip_markdown_code_fence(text)

    candidates = []

    balanced = find_balanced_json_object(cleaned)
    if balanced:
        candidates.append(balanced)

    if cleaned not in candidates:
        candidates.append(cleaned)

    last_error = None

    for candidate in candidates:
        normalized = normalize_json_candidate(candidate)
        if not normalized:
            continue

        try:
            data = json.loads(normalized)
            if isinstance(data, dict):
                return data
        except Exception as exc:
            last_error = exc

        try:
            data = ast.literal_eval(normalized)
            if isinstance(data, dict):
                return data
        except Exception as exc:
            last_error = exc

    preview = preview_ai_text(cleaned)
    if "{" not in cleaned:
        raise AIQuizGenerationError(f"AI 응답에서 JSON 객체를 찾지 못했습니다. preview={preview}")

    if cleaned.lstrip().startswith("{") and find_balanced_json_object(cleaned) is None:
        raise AIQuizGenerationError(
            f"AI 응답 JSON이 중간에 잘렸습니다. AI_QUIZ_MAX_TOKENS를 늘리거나 출력 필드를 줄여야 합니다. preview={preview}"
        )

    raise AIQuizGenerationError(f"AI 응답 JSON 파싱 실패: {last_error}. preview={preview}")



def call_chat_completion(
    messages: List[Dict[str, str]],
    provider: Optional[str] = None,
) -> str:
    provider_config = get_ai_provider_config(provider)

    base_url = str(provider_config.get("base_url") or "").rstrip("/")
    if not base_url:
        raise AIQuizGenerationError("AI provider base_url이 설정되어 있지 않습니다.")

    api_key = provider_config.get("api_key")
    if not api_key:
        raise AIQuizGenerationError(
            f"{provider_config.get('provider')} API key가 설정되어 있지 않습니다."
        )

    url = f"{base_url}/chat/completions"
    model_name = str(provider_config.get("model") or "")

    payload = {
        "model": provider_config["model"],
        "messages": messages,
        "temperature": 0.0,
    }

    # Gemini는 JSON mode가 안정적입니다.
    # Groq gpt-oss-20b는 batch JSON mode에서 json_validate_failed가 자주 발생해서
    # 프롬프트 + 후처리 파서 방식으로 처리합니다.
    if "gpt-oss" in model_name:
        # GPT-OSS는 reasoning 모델이므로 reasoning 토큰을 낮추고, reasoning 본문은 응답에서 제외합니다.
        payload["include_reasoning"] = False
        payload["reasoning_effort"] = "low"
    else:
        payload["response_format"] = {"type": "json_object"}

    max_tokens = getattr(settings, "AI_QUIZ_MAX_TOKENS", None)
    if max_tokens:
        # 800 이하에서는 한국어 JSON이 source/explanation 중간에서 잘리는 사례가 많아
        # gpt-oss 단건 개선 호출만 최소 1200으로 올립니다.
        if "gpt-oss" in model_name:
            payload["max_tokens"] = max(int(max_tokens), 1200)
        else:
            payload["max_tokens"] = max_tokens

    request = urllib.request.Request(
        url=url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=getattr(settings, "AI_QUIZ_TIMEOUT_SECONDS", 20),
        ) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise AIQuizGenerationError(f"AI API HTTP 오류: {exc.code} {error_body}") from exc
    except Exception as exc:
        raise AIQuizGenerationError(f"AI API 호출 실패: {str(exc)}") from exc

    try:
        message = response_data["choices"][0]["message"]
        content = message.get("content") or ""

        # 일부 reasoning 계열 모델은 reasoning 필드에 답을 섞어 반환하는 경우가 있어 보조적으로 확인합니다.
        if not normalize_ai_text(content):
            content = message.get("reasoning") or message.get("reasoning_content") or ""

        if not normalize_ai_text(content):
            raise AIQuizGenerationError(
                f"AI API 응답 content가 비어 있습니다. message_keys={list(message.keys())}"
            )

        return content
    except AIQuizGenerationError:
        raise
    except Exception as exc:
        raise AIQuizGenerationError("AI API 응답 형식이 예상과 다릅니다.") from exc



def get_difficulty_instruction(difficulty: str) -> str:
    normalized = normalize_ai_text(difficulty).upper()

    if normalized == "EASY":
        return (
            "EASY: 핵심 개념의 기본 의미를 확인한다. "
            "단, 단순 용어 맞히기만 만들지 말고 개념의 역할이나 결과를 함께 묻는다."
        )

    if normalized == "HARD":
        return (
            "HARD: 단순 암기보다 개념 간 관계, 비교, 원인과 결과, 적용 상황, "
            "오개념 구분을 묻는다. 반드시 제공된 source_sentences 안에서만 출제한다."
        )

    return (
        "MEDIUM: 핵심 개념의 의미뿐 아니라 관련 개념과의 차이, "
        "왜 그런 결과가 나오는지, 어떤 상황에 적용되는지를 확인한다."
    )

def select_representative_concept_name(concept: models.Concept) -> str:
    concept_name = normalize_ai_text(concept.concept_name)

    if 0 < len(concept_name) <= 35:
        return concept_name

    for keyword in parse_keywords(concept.keywords):
        cleaned = normalize_ai_text(keyword)
        if 0 < len(cleaned) <= 35:
            return cleaned

    return concept_name[:35].strip()


def build_source_payload(
    draft_quiz: Dict,
    concept: models.Concept,
    difficulty: str,
    option_count: int,
    reason: Optional[str] = None,
) -> Dict:
    # Groq 단건 개선도 원본 concept_name이 아니라 정제된 concept_label을 기준으로 보냅니다.
    sentences = select_source_sentences_for_ai(concept)
    concept_label = get_refined_concept_label_for_ai(
        concept=concept,
        source_sentences=sentences,
    )

    if not concept_label:
        concept_label = select_representative_concept_name(concept)

    keywords = get_safe_keywords_for_ai(concept)

    return {
        "concept_name": concept_label,
        "concept_label": concept_label,
        "original_concept_name": normalize_ai_text(concept.concept_name),
        "page_num": concept.page_num,
        "keywords": keywords[:6],
        "source_sentences": sentences[:4],
        "draft_quiz": {
            "quiz_type": draft_quiz.get("quiz_type"),
            "question": draft_quiz.get("question"),
            "options": draft_quiz.get("options"),
            "answer": draft_quiz.get("answer"),
            "explanation": draft_quiz.get("explanation"),
            "source_sentence": draft_quiz.get("source_sentence"),
        },
        "difficulty": normalize_ai_text(difficulty).upper(),
        "difficulty_instruction": get_difficulty_instruction(difficulty),
        "option_count": option_count,
        "regenerate_reason": reason,
    }


def build_ai_messages(
    draft_quiz: Dict,
    concept: models.Concept,
    difficulty: str,
    option_count: int,
    reason: Optional[str] = None,
) -> List[Dict[str, str]]:
    source_payload = build_source_payload(
        draft_quiz=draft_quiz,
        concept=concept,
        difficulty=difficulty,
        option_count=option_count,
        reason=reason,
    )

    draft = source_payload.get("draft_quiz") or {}

    preferred_quiz_type = canonicalize_ai_quiz_type(
        draft.get("quiz_type"),
        default="MULTIPLE_CHOICE",
    )

    compact_payload = {
        "concept_name": source_payload.get("concept_name"),
        "original_concept_name": source_payload.get("original_concept_name"),
        "page_num": source_payload.get("page_num"),
        "keywords": source_payload.get("keywords") or [],
        "source_sentences": [
            str(sentence)[:260]
            for sentence in (source_payload.get("source_sentences") or [])[:4]
        ],
        "preferred_quiz_type": preferred_quiz_type,
        "draft_quiz": {
            "quiz_type": preferred_quiz_type,
            "question": draft.get("question"),
            "options": draft.get("options"),
            "answer": draft.get("answer"),
            "source_sentence": draft.get("source_sentence"),
        },
    }

    if reason:
        compact_payload["regenerate_reason"] = normalize_ai_text(reason)

    output_schema = {
        "quiz_type": "MULTIPLE_CHOICE | OX | SHORT_ANSWER | SUBJECTIVE",
        "question": "문제 내용",
        "options": ["객관식 보기1", "객관식 보기2", "객관식 보기3", "객관식 보기4"],
        "answer": "정답 또는 모범답안",
        "explanation": "해설 또는 채점 기준 요약",
        "source_sentence": "source_sentences 중 가장 직접적인 근거 문장 1개",
        "accepted_answers": ["SHORT_ANSWER에서 허용할 유사 정답"],
        "grading_keywords": ["SUBJECTIVE 채점 핵심어"],
        "rubric": ["SUBJECTIVE 채점 기준"],
    }

    difficulty_instruction = (
        source_payload.get("difficulty_instruction")
        or get_difficulty_instruction(difficulty)
    )

    system_message = (
        "너는 대학 강의 PDF 기반 한국어 이해도 평가 퀴즈 생성기다. "
        "반드시 제공된 JSON의 concept_name, keywords, source_sentences 정보만 사용한다. "
        "외부 지식, 추측, 원문에 없는 사실은 금지한다. "
        "학생의 단순 암기가 아니라 개념 이해도를 측정하는 문제를 만든다. "
        "반드시 JSON 객체 하나만 반환한다. "
        "JSON 앞뒤에 설명, 생각 과정, Markdown 코드블록을 절대 붙이지 않는다. "
        "출력의 첫 글자는 반드시 { 이고 마지막 글자는 반드시 } 이다."
    )

    user_message = (
        "concept_name에 대한 이해도 확인용 퀴즈 1개를 생성하라.\n\n"
        f"난이도 지침: {difficulty_instruction}\n\n"
        "허용 quiz_type:\n"
        "- MULTIPLE_CHOICE: 객관식\n"
        "- OX: O/X\n"
        "- SHORT_ANSWER: 단답형 빈칸\n"
        "- SUBJECTIVE: 주관식\n\n"
        "공통 규칙:\n"
        "- quiz_type은 반드시 MULTIPLE_CHOICE, OX, SHORT_ANSWER, SUBJECTIVE 중 하나만 사용한다.\n"
        "- BLANK, DEFINITION, KEYWORD_CHOICE는 절대 사용하지 마라.\n"
        "- preferred_quiz_type을 우선 따르되, source_sentences가 부족하면 더 적합한 새 타입으로 바꿔도 된다.\n"
        "- source_sentence는 반드시 입력 source_sentences 중 하나를 그대로 사용한다.\n"
        "- source_sentences 안에서 직접 근거를 찾을 수 없는 내용은 출제하지 마라.\n"
        "- question은 concept_name과 직접 관련된 내용을 물어야 한다.\n"
        "- explanation은 왜 정답인지 또는 어떻게 채점해야 하는지 1~3문장으로 작성한다.\n"
        "- Markdown 코드블록 없이 JSON만 반환한다.\n"
        "- JSON 문자열 값 안에서는 큰따옴표를 쓰지 말고 작은따옴표를 사용한다.\n\n"
        "MULTIPLE_CHOICE 규칙:\n"
        f"- options는 정확히 {option_count}개다.\n"
        "- answer는 반드시 options 중 하나와 완전히 같은 문자열이다.\n"
        "- 단순히 '다음 설명에 해당하는 핵심 개념은?'처럼 용어만 고르게 만들지 마라.\n"
        "- 정답과 오답은 모두 설명형 보기로 만든다.\n"
        "- 좋은 문제 유형: 개념의 원인/결과, 개념 간 비교, 적용 상황, 오개념 구분.\n"
        "- 오답은 같은 주제 안에서 그럴듯하지만 source_sentence 기준으로 명확히 틀려야 한다.\n"
        "- question에 answer 전체를 그대로 노출하지 마라.\n\n"
        "OX 규칙:\n"
        "- options는 정확히 [\"O\", \"X\"]다.\n"
        "- answer는 O 또는 X다.\n"
        "- O 문항만 만들지 말고, 거짓 명제가 자연스러우면 X 문항도 만들 수 있다.\n"
        "- X 문항은 source_sentence의 핵심 관계 하나만 바꿔 만든다.\n"
        "- question은 참/거짓 판단 가능한 완전한 명제여야 한다.\n"
        "- 제목, 단어 나열, 'A vs B' 형태는 금지한다.\n\n"
        "SHORT_ANSWER 규칙:\n"
        "- options는 반드시 빈 배열 []이다.\n"
        "- question에는 반드시 ___가 포함되어야 한다.\n"
        "- ___는 문장 맨 앞이나 맨 끝에 두지 말고 핵심 개념어 위치에 둔다.\n"
        "- answer는 source_sentence에 실제로 등장하는 핵심 개념어 또는 짧은 명사구다.\n"
        "- answer에 '초기', '확인', '방울', '경우', '과정', '방법', '결과', '상태' 같은 일반 단어를 쓰지 마라.\n"
        "- accepted_answers에는 띄어쓰기 차이 등 허용 가능한 유사 정답을 넣어도 된다.\n\n"
        "SUBJECTIVE 규칙:\n"
        "- options는 반드시 빈 배열 []이다.\n"
        "- answer는 학생 답안이 아니라 모범답안이다.\n"
        "- question은 설명, 비교, 이유, 적용을 요구해야 한다.\n"
        "- rubric 또는 grading_keywords를 반드시 제공한다.\n"
        "- rubric은 2~4개 기준으로 작성한다.\n"
        "- 원문에 없는 확장 지식으로 채점 기준을 만들지 마라.\n\n"
        f"출력 형식: {json.dumps(output_schema, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"입력: {json.dumps(compact_payload, ensure_ascii=False, separators=(',', ':'))}"
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def normalize_options(raw_options) -> List[str]:
    if not isinstance(raw_options, list):
        return []

    return unique_keep_order([
        normalize_ai_text(option)
        for option in raw_options
        if normalize_ai_text(option)
    ])


def fill_options_from_fallback(
    options: List[str],
    answer: str,
    fallback_options: List[str],
    option_count: int,
) -> List[str]:
    result = unique_keep_order([answer] + options)

    for option in fallback_options:
        cleaned = normalize_ai_text(option)
        if not cleaned:
            continue

        if cleaned == answer:
            continue

        if cleaned not in result:
            result.append(cleaned)

        if len(result) >= option_count:
            break

    return result[:option_count]


def is_answer_exposed_in_question(
    quiz_type: str,
    question: str,
    answer: str,
) -> bool:
    if not question or not answer:
        return False

    canonical_type = canonicalize_ai_quiz_type(quiz_type)

    # OX의 answer는 O/X라서 문제 본문 노출 검사 대상이 아닙니다.
    if canonical_type == "OX":
        return False

    # 주관식은 모범답안 전체가 문제에 그대로 들어간 경우만 막습니다.
    if canonical_type == "SUBJECTIVE":
        return normalize_for_ai_match(question) == normalize_for_ai_match(answer)

    normalized_answer = normalize_for_ai_match(answer)
    normalized_question = normalize_for_ai_match(question.replace("___", ""))

    if not normalized_answer:
        return False

    return normalized_answer in normalized_question

def select_source_sentence(
    requested_source_sentence: str,
    fallback_quiz: Dict,
    source_sentences: List[str],
) -> str:
    requested = normalize_ai_text(requested_source_sentence)

    if requested and requested in source_sentences:
        return requested

    fallback_source = normalize_ai_text(fallback_quiz.get("source_sentence"))
    if fallback_source:
        return fallback_source

    if source_sentences:
        return source_sentences[0]

    return requested


def clean_ai_quiz_payload(
    data: Dict,
    fallback_quiz: Dict,
    option_count: int,
    source_sentences: Optional[List[str]] = None,
) -> Dict:
    """
    AI 단건 응답을 새 퀴즈 타입 기준으로 정리하고 저장 전 검증합니다.

    이 함수는 더 이상 KEYWORD_CHOICE/DEFINITION/BLANK를 최종 타입으로 저장하지 않습니다.
    기존 타입이 들어오면 새 타입으로 canonicalize합니다.
    """
    source_sentences = [
        normalize_ai_text(sentence)
        for sentence in (source_sentences or [])
        if normalize_ai_text(sentence)
    ]

    fallback_quiz_type = canonicalize_ai_quiz_type(
        fallback_quiz.get("quiz_type"),
        default="MULTIPLE_CHOICE",
    )

    quiz_type = canonicalize_ai_quiz_type(
        data.get("quiz_type"),
        default=fallback_quiz_type,
    )

    question = normalize_ai_text(data.get("question") or fallback_quiz.get("question"))
    answer = normalize_ai_text(data.get("answer") or fallback_quiz.get("answer"))
    explanation = normalize_ai_text(data.get("explanation") or fallback_quiz.get("explanation"))

    source_sentence = select_source_sentence(
        requested_source_sentence=data.get("source_sentence"),
        fallback_quiz=fallback_quiz,
        source_sentences=source_sentences,
    )

    source_sentence = select_stronger_source_sentence(
        requested_source_sentence=source_sentence,
        allowed_sources=source_sentences,
    )

    if not question:
        raise AIQuizGenerationError("AI가 생성한 question이 비어 있습니다.")

    if not answer:
        raise AIQuizGenerationError("AI가 생성한 answer가 비어 있습니다.")

    if not source_sentence:
        raise AIQuizGenerationError("AI가 생성한 source_sentence가 비어 있습니다.")

    if source_sentences and source_sentence not in source_sentences:
        raise AIQuizGenerationError("source_sentence가 입력 source_sentences에 포함되어 있지 않습니다.")

    if is_cut_or_dangling_text(source_sentence):
        raise AIQuizGenerationError("source_sentence가 중간에서 잘린 원문 조각입니다.")

    raw_options = data.get("options")
    options = normalize_options(raw_options)

    accepted_answers = normalize_string_list(data.get("accepted_answers"), max_items=5)
    grading_keywords = normalize_string_list(data.get("grading_keywords"), max_items=6)
    rubric = normalize_string_list(data.get("rubric") or data.get("grading_rubric"), max_items=5)

    if quiz_type == "MULTIPLE_CHOICE":
        if len(options) != option_count:
            raise AIQuizGenerationError(
                f"MULTIPLE_CHOICE options 개수가 {option_count}개가 아닙니다."
            )

        if answer not in options:
            raise AIQuizGenerationError("MULTIPLE_CHOICE answer가 options 안에 없습니다.")

        if any(is_cut_or_dangling_text(option) for option in options):
            raise AIQuizGenerationError("MULTIPLE_CHOICE options에 잘린 원문 조각이 포함되어 있습니다.")

        if is_answer_exposed_in_question(quiz_type, question, answer):
            raise AIQuizGenerationError("MULTIPLE_CHOICE question에 answer가 그대로 노출되어 있습니다.")

    elif quiz_type == "OX":
        options = ["O", "X"]

        if answer not in options:
            raise AIQuizGenerationError("OX answer는 O 또는 X여야 합니다.")

        statement = question.split("\n\n")[-1].strip()
        if not is_valid_ox_statement(statement):
            raise AIQuizGenerationError("OX 문제가 참/거짓 판단 가능한 명제가 아닙니다.")

    elif quiz_type == "SHORT_ANSWER":
        options = []

        if "___" not in question:
            raise AIQuizGenerationError("SHORT_ANSWER question에는 ___가 포함되어야 합니다.")

        if is_bad_blank_question_shape(question):
            raise AIQuizGenerationError("SHORT_ANSWER 문제가 원문 조각 맞추기 형태입니다.")

        if not is_good_blank_answer(answer):
            raise AIQuizGenerationError("SHORT_ANSWER answer가 핵심 개념어로 적절하지 않습니다.")

        if not is_short_answer_grounded_in_source(answer, source_sentence):
            raise AIQuizGenerationError("SHORT_ANSWER answer가 source_sentence에 직접 등장하지 않습니다.")

        if is_answer_exposed_in_question(quiz_type, question, answer):
            raise AIQuizGenerationError("SHORT_ANSWER question에 answer가 그대로 노출되어 있습니다.")

    elif quiz_type == "SUBJECTIVE":
        options = []

        if len(compact_text(answer)) < 12:
            raise AIQuizGenerationError("SUBJECTIVE 모범답안이 너무 짧습니다.")

        if is_cut_or_dangling_text(answer):
            raise AIQuizGenerationError("SUBJECTIVE 모범답안이 중간에서 잘린 원문 조각입니다.")

        if not explanation and not rubric and not grading_keywords:
            raise AIQuizGenerationError(
                "SUBJECTIVE는 explanation, rubric, grading_keywords 중 하나가 필요합니다."
            )

        explanation = format_subjective_explanation(
            explanation=explanation,
            rubric=rubric,
            grading_keywords=grading_keywords,
        )

    else:
        raise AIQuizGenerationError(f"지원하지 않는 quiz_type입니다: {quiz_type}")

    if not explanation:
        explanation = f"원문 근거: {source_sentence}"

    cleaned_quiz = {
        **fallback_quiz,
        "quiz_type": quiz_type,
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "source_sentence": source_sentence,
        "source_sentences": source_sentences,
        "accepted_answers": accepted_answers,
        "grading_keywords": grading_keywords,
        "rubric": rubric,
    }

    validation_error = validate_generated_quiz_dict(
        cleaned_quiz,
        option_count=option_count,
    )
    if validation_error:
        raise AIQuizGenerationError(f"AI가 생성한 퀴즈가 유효하지 않습니다: {validation_error}")

    if is_answer_exposed_in_question(quiz_type, question, answer):
        raise AIQuizGenerationError("AI가 생성한 퀴즈의 question에 answer가 그대로 노출되어 있습니다.")

    return cleaned_quiz


def enhance_quiz_with_ai(
    draft_quiz: Dict,
    concept: models.Concept,
    difficulty: str,
    option_count: int,
    use_ai: bool,
    reason: Optional[str] = None,
    stop_on_quota_error: bool = False,
    provider: Optional[str] = None,
) -> Tuple[Dict, bool]:
    """
    AI 보강에 실패하면 기존 draft를 반환해 퀴즈 생성 흐름을 유지합니다.
    """
    if not can_use_ai(use_ai, provider=provider):
        return draft_quiz, False

    try:
        source_sentences = [
            normalize_ai_text(sentence)
            for sentence in parse_sentences(concept.sentences)
            if normalize_ai_text(sentence)
        ]

        messages = build_ai_messages(
            draft_quiz=draft_quiz,
            concept=concept,
            difficulty=difficulty,
            option_count=option_count,
            reason=reason,
        )

        content = call_chat_completion(messages, provider=provider)
        data = extract_json_object(content)

        return clean_ai_quiz_payload(
            data=data,
            fallback_quiz=draft_quiz,
            option_count=option_count,
            source_sentences=source_sentences,
        ), True

    except Exception as exc:
        if is_ai_quota_exceeded_error(exc):
            print(f"[AI_QUIZ_QUOTA_EXCEEDED] {type(exc).__name__}: {exc}")

            if stop_on_quota_error:
                raise AIQuotaExceededError(str(exc)) from exc

            return draft_quiz, False

        print(f"[AI_QUIZ_FALLBACK] {type(exc).__name__}: {exc}")
        return draft_quiz, False


def enhance_quizzes_with_ai(
    quizzes: List[Dict],
    concept_map: Dict[int, models.Concept],
    difficulty: str,
    option_count: int,
    use_ai: bool,
) -> Tuple[List[Dict], int]:
    enhanced_quizzes = []
    enhanced_count = 0

    # quota 초과가 발생하면 이번 실행의 남은 항목은 모두 draft로 fallback합니다.
    ai_disabled_for_this_run = False

    for quiz_data in quizzes:
        concept = concept_map.get(quiz_data.get("concept_id"))
        if not concept:
            enhanced_quizzes.append(quiz_data)
            continue

        if ai_disabled_for_this_run:
            enhanced_quizzes.append(quiz_data)
            continue

        try:
            enhanced_quiz, ai_used = enhance_quiz_with_ai(
                draft_quiz=quiz_data,
                concept=concept,
                difficulty=difficulty,
                option_count=option_count,
                use_ai=use_ai,
                stop_on_quota_error=True,
            )

        except AIQuotaExceededError:
            ai_disabled_for_this_run = True
            print(
                "[AI_QUIZ_SKIP_REMAINING] "
                "AI quota가 초과되어 이번 퀴즈 생성 실행의 남은 문항은 AI 호출 없이 fallback합니다."
            )
            enhanced_quizzes.append(quiz_data)
            continue

        enhanced_quizzes.append(enhanced_quiz)

        if ai_used:
            enhanced_count += 1

    return enhanced_quizzes, enhanced_count


def chunk_list(items: List[Dict[str, Any]], size: int) -> List[List[Dict[str, Any]]]:
    if size <= 0:
        size = 5

    return [
        items[index:index + size]
        for index in range(0, len(items), size)
    ]


def build_batch_ai_messages(
    materials: List[Dict[str, Any]],
    difficulty: str,
    option_count: int,
) -> List[Dict[str, str]]:
    compact_materials = []

    for material in materials:
        source_sentences = [
            normalize_ai_text(sentence)
            for sentence in (material.get("source_sentences") or [])
            if normalize_ai_text(sentence)
        ]

        preferred_quiz_type = canonicalize_ai_quiz_type(
            material.get("preferred_quiz_type"),
            default="MULTIPLE_CHOICE",
        )

        compact_materials.append({
            "concept_id": material.get("concept_id"),
            "page_num": material.get("page_num"),
            "concept_label": material.get("concept_label"),
            "original_concept_name": material.get("original_concept_name"),
            "keywords": material.get("keywords") or [],
            "source_sentences": source_sentences,
            "preferred_quiz_type": preferred_quiz_type,
            "domain_hint": "게임이론/사회적 의사결정 문맥에서는 선수(player)를 스포츠 선수가 아니라 의사결정 주체로 해석한다.",
        })

    output_schema = {
        "quizzes": [
            {
                "concept_id": 1,
                "quiz_type": "MULTIPLE_CHOICE | OX | SHORT_ANSWER | SUBJECTIVE",
                "question": "문제 내용",
                "options": ["객관식 보기1", "객관식 보기2", "객관식 보기3", "객관식 보기4"],
                "answer": "정답 또는 모범답안",
                "explanation": "해설 또는 채점 기준 요약",
                "source_sentence": "source_sentences 중 가장 직접적인 근거 문장 1개",
                "accepted_answers": ["SHORT_ANSWER 허용 정답"],
                "grading_keywords": ["SUBJECTIVE 채점 핵심어"],
                "rubric": ["SUBJECTIVE 채점 기준"],
            }
        ]
    }

    system_message = (
        "너는 대학 강의 PDF 기반 한국어 이해도 평가 퀴즈 생성기다. "
        "반드시 입력 JSON의 source_sentences 안의 정보만 사용한다. "
        "외부 지식, 추측, 원문에 없는 사실은 금지한다. "
        "학생의 단순 암기가 아니라 개념 이해도를 측정하는 문제를 만든다. "
        "반드시 JSON 객체 하나만 반환한다."
    )

    user_message = (
        "각 item마다 학생 이해도 확인용 퀴즈를 정확히 1개씩 생성하라.\n\n"
        f"난이도 지침: {get_difficulty_instruction(difficulty)}\n\n"
        "허용 quiz_type:\n"
        "- MULTIPLE_CHOICE: 객관식\n"
        "- OX: O/X\n"
        "- SHORT_ANSWER: 단답형 빈칸\n"
        "- SUBJECTIVE: 주관식\n\n"
        "공통 규칙:\n"
        "- quizzes 개수는 입력 items 개수와 같아야 하며, 어떤 item도 생략하지 마라.\n"
        "- 각 quiz에는 해당 item의 concept_id를 그대로 넣어라.\n"
        "- quiz_type은 반드시 MULTIPLE_CHOICE, OX, SHORT_ANSWER, SUBJECTIVE 중 하나다.\n"
        "- BLANK, DEFINITION, KEYWORD_CHOICE는 절대 사용하지 마라.\n"
        "- preferred_quiz_type을 우선 따르되, source_sentences에 더 적합한 유형이 있으면 새 타입 안에서 변경해도 된다.\n"
        "- source_sentence는 반드시 해당 item의 source_sentences 중 하나를 그대로 넣어라.\n"
        "- source_sentences 안에서 직접 근거를 찾을 수 없는 내용은 출제하지 마라.\n"
        "- question은 concept_label과 직접 관련된 내용을 물어야 한다.\n"
        "- source_sentences가 짧거나 문장이 끊겨 있으면 같은 item의 source_sentences 전체를 함께 읽고 문제와 해설을 만들어라.\n"
        "- explanation은 왜 정답인지 또는 어떻게 채점해야 하는지 1~3문장으로 작성한다.\n"
        "- 부정형 문제, 예: '옳지 않은 것은?', '관련 없는 것은?'은 만들지 마라.\n"
        "- 강의 문맥이 게임이론이면 '선수(player)'는 스포츠 선수가 아니라 의사결정의 주체를 뜻한다.\n"
        "- '전략(strategy)'은 경기 전술, 팀 훈련, 수비 패턴, 피드백 모임이 아니라 각 의사결정 주체가 선택하는 내용을 뜻한다.\n"
        "- source_sentences에 스포츠 경기 문맥이 없으면 '경기 중', '팀 전체', '상대 팀', '수비 패턴', '연습 계획', '피드백 모임' 같은 표현을 절대 쓰지 마라.\n"
        "- source_sentences가 짧더라도 함께 제공된 주변 문장을 이용해 같은 page의 개념 관계를 반영하라.\n"
        "- Markdown 코드블록 없이 JSON만 반환하라.\n\n"
        "MULTIPLE_CHOICE 규칙:\n"
        f"- options는 정확히 {option_count}개다.\n"
        "- answer는 반드시 options 중 하나와 완전히 같은 문자열이다.\n"
        "- 단순히 핵심어/개념명만 고르는 KEYWORD_CHOICE식 문제는 금지한다.\n"
        "- 정답과 오답은 모두 설명형 보기로 만든다.\n"
        "- 좋은 문제 유형: 원인-결과, 개념 비교, 적용 상황, 실험 결과 해석, 오개념 구분.\n"
        "- 오답은 같은 주제 범위 안에서 그럴듯하지만 source_sentence 기준으로 명확히 틀려야 한다.\n"
        "- question에 answer 전체를 그대로 노출하지 마라.\n"
        "- MEDIUM 이상에서는 가능하면 '무엇인가?' 정의형보다 '왜 그런가?', '어떤 차이가 있는가?', '어떤 상황에 해당하는가?' 형태를 우선한다.\n"
        "- 오답은 원문에 없는 임의 상황을 만들지 말고, 같은 page의 다른 개념과 헷갈릴 수 있는 선택지로 만든다.\n"
        "- 보기에는 source_sentences의 용어를 자연스럽게 풀어 쓰되, 원문 의미를 바꾸지 마라.\n"
        "- 오개념 구분 문항을 만들 때는 '어떤 오해인가?', '잘못된 해석은?'처럼 틀린 보기 하나를 고르게 만들지 마라.\n"
        "- 오개념 구분 문항은 '왜 잘못된 해석인가?', '원문 흐름과 어긋나는 이유는 무엇인가?'처럼 이유를 고르게 만들어라.\n"
        "- 보기들이 모두 오해처럼 보이는 선택지는 만들지 마라. 정답은 원문 근거와 직접 연결된 이유여야 한다.\n\n"
        "OX 규칙:\n"
        "- options는 정확히 [\"O\", \"X\"]다.\n"
        "- answer는 O 또는 X다.\n"
        "- O만 반복하지 마라. 거짓 명제를 안전하게 만들 수 있으면 X도 사용하라.\n"
        "- X 문항은 source_sentence의 핵심 관계 하나만 바꿔 만든다.\n"
        "- 참/거짓 판단 가능한 완전한 명제로 작성한다.\n"
        "- 제목, 단어 나열, 'A vs B' 형태는 금지한다.\n\n"
        "SHORT_ANSWER 규칙:\n"
        "- options는 반드시 빈 배열 []이다.\n"
        "- question에는 반드시 ___가 포함되어야 한다.\n"
        "- ___는 문장 맨 앞이나 맨 끝이 아니라 핵심 개념어 위치에 둔다.\n"
        "- answer는 source_sentence에 실제로 등장하는 핵심 개념어 또는 짧은 명사구다.\n"
        "- answer에 '초기', '확인', '방울', '경우', '과정', '방법', '결과', '상태' 같은 일반 단어를 쓰지 마라.\n"
        "- accepted_answers에는 띄어쓰기 차이 등 허용 가능한 유사 정답을 넣어도 된다.\n\n"
        "SUBJECTIVE 규칙:\n"
        "- options는 반드시 빈 배열 []이다.\n"
        "- answer는 학생 답안이 아니라 모범답안이다.\n"
        "- question은 설명, 비교, 이유, 적용을 요구해야 한다.\n"
        "- rubric 또는 grading_keywords를 반드시 제공한다.\n"
        "- rubric은 2~4개 기준으로 작성한다.\n"
        "- 원문에 없는 확장 지식으로 채점 기준을 만들지 마라.\n\n"
        f"출력 형식: {json.dumps(output_schema, ensure_ascii=False, separators=(',', ':'))}\n\n"
        f"입력 items: {json.dumps(compact_materials, ensure_ascii=False, separators=(',', ':'))}"
    )

    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def extract_json_payload(text: str) -> Dict:
    data = extract_json_object(text)

    if not isinstance(data, dict):
        raise AIQuizGenerationError("AI 응답 JSON이 객체가 아닙니다.")

    return data


def normalize_ai_quiz_options(raw_options: Any) -> List[str]:
    if not isinstance(raw_options, list):
        return []

    return unique_keep_order([
        normalize_ai_text(option)
        for option in raw_options
        if normalize_ai_text(option)
    ])

def normalize_for_ai_match(value: str) -> str:
    return re.sub(
        r"[^0-9A-Za-z가-힣]",
        "",
        str(value or "").lower(),
    )

def is_keyword_choice_like_multiple_choice_answer(
    answer: str,
    material: Dict[str, Any],
) -> bool:
    """
    객관식 정답이 단순 개념명/키워드만 고르는 KEYWORD_CHOICE 형태인지 판단합니다.

    짧다는 이유만으로 탈락시키지 않습니다.
    실제 concept_label 또는 keyword와 거의 동일할 때만 탈락시킵니다.
    """
    normalized_answer = normalize_for_ai_match(answer)

    if not normalized_answer:
        return True

    concept_label = normalize_ai_text(material.get("concept_label"))
    original_concept_name = normalize_ai_text(material.get("original_concept_name"))

    keyword_like_items = [
        concept_label,
        original_concept_name,
        *(material.get("keywords") or []),
    ]

    normalized_keyword_items = {
        normalize_for_ai_match(item)
        for item in keyword_like_items
        if normalize_for_ai_match(item)
    }

    if normalized_answer in normalized_keyword_items:
        return True

    # 너무 짧고 조사/설명 구조가 없는 단어형 답만 차단합니다.
    if len(normalized_answer) <= 4:
        return True

    return False


def extract_focus_terms(value: str) -> List[str]:
    terms = re.split(r"[^0-9A-Za-z가-힣]+", str(value or ""))
    return unique_keep_order([
        term
        for term in terms
        if len(normalize_for_ai_match(term)) >= 2
    ])


SEMANTIC_FOCUS_MARKERS = (
    "의사결정",
    "사회적",
    "선택",
    "영향",
    "예측",
    "게임이론",
    "게임",
    "전략",
    "최상의대응",
    "최적의전략",
    "순수전략",
    "혼합전략",
    "내시",
    "내시균형",
    "죄수의딜레마",
    "자백",
    "부인",
    "침묵",
    "협동",
    "변절",
    "성과행렬",
    "효용",
    "일회성",
    "반복적",
    "맞대응",
    "파블로프",
    "강화학습",
    "공공재",
    "무임승차",
    "처벌",
    "명성",
    "마음이론",
    "재귀적",
    "사회적지능",
)

WEAK_FOCUS_TERMS = {
    "내용",
    "경우",
    "과정",
    "방법",
    "결과",
    "상태",
    "선택",
    "설명",
    "문제",
    "부분",
    "활동",
    "수준",
}


def extract_material_focus_markers(material: Dict[str, Any]) -> List[str]:
    """
    concept_label이 잘못 추출된 경우에도 source_sentences 기반으로
    문제 초점 검증을 할 수 있게 핵심 표지를 추출합니다.
    """
    texts = []

    for key in ("concept_label", "original_concept_name", "best_source_sentence"):
        value = normalize_ai_text(material.get(key))
        if value:
            texts.append(value)

    for keyword in material.get("keywords") or []:
        value = normalize_ai_text(keyword)
        if value:
            texts.append(value)

    for sentence in material.get("source_sentences") or []:
        value = normalize_ai_text(sentence)
        if value:
            texts.append(value)

    material_blob = normalize_for_ai_match(" ".join(texts))
    markers = []

    for marker in SEMANTIC_FOCUS_MARKERS:
        normalized_marker = normalize_for_ai_match(marker)
        if normalized_marker and normalized_marker in material_blob:
            markers.append(marker)

    for text in texts:
        for term in extract_focus_terms(text):
            normalized_term = normalize_for_ai_match(term)

            if len(normalized_term) < 3:
                continue

            if normalized_term in {
                normalize_for_ai_match(item)
                for item in WEAK_FOCUS_TERMS
            }:
                continue

            # 너무 긴 문장 조각은 focus term으로 쓰지 않습니다.
            if len(normalized_term) > 20:
                continue

            markers.append(term)

    return unique_keep_order(markers)


def is_quiz_focused_on_material(
    question: str,
    answer: str,
    material: Dict[str, Any],
) -> bool:
    """
    AI가 만든 문제가 해당 material과 관련 있는지 확인합니다.

    기존 방식은 concept_label/keywords만 봐서,
    concept_label이 '선택해야함 어려움'처럼 잘못 추출되면
    정상적인 문제도 탈락시키는 문제가 있었습니다.

    이제 source_sentences에서 추출한 핵심 표지까지 함께 사용합니다.
    """
    target_text = normalize_for_ai_match(f"{question} {answer}")

    if not target_text:
        return False

    markers = extract_material_focus_markers(material)

    # marker를 만들 수 없으면 source_sentence 검증에 맡기고 통과시킵니다.
    # 이미 clean_batch_ai_quiz에서 source_sentence가 allowed_sources 안에 있는지 확인합니다.
    if not markers:
        return True

    for marker in markers:
        normalized_marker = normalize_for_ai_match(marker)

        if len(normalized_marker) < 2:
            continue

        if normalized_marker in target_text:
            return True

    return False


def is_ambiguous_misconception_multiple_choice_for_ai(
    quiz_type: str,
    question: str,
    options: List[str],
) -> bool:
    if quiz_type != "MULTIPLE_CHOICE":
        return False

    normalized_question = normalize_for_ai_match(question)

    ambiguous_question_markers = (
        "어떤오해인가",
        "무엇이오해인가",
        "어떤오해",
        "잘못된해석은",
        "잘못된관점은",
        "틀린해석은",
        "옳지않은것은",
        "관련없는것은",
    )

    if any(marker in normalized_question for marker in ambiguous_question_markers):
        return True

    normalized_options = [
        normalize_for_ai_match(option)
        for option in options
    ]

    misconception_like_count = 0
    for option in normalized_options:
        if any(
            marker in option
            for marker in (
                "의미한다",
                "보장한다",
                "유도한다",
                "정당화한다",
                "완전히설명한다",
                "설계되었다",
            )
        ):
            misconception_like_count += 1

    return misconception_like_count >= 3

def get_best_response_optimal_strategy_reject_reason(
    question: str,
    answer: str,
    options: List[str],
    explanation: str,
    source_sentences: List[str],
) -> Optional[str]:
    """
    '최상의 대응'과 '최적의 전략'의 관계를 원문과 다르게 설명하는 문항을 차단합니다.
    """
    output_text = " ".join([question, answer, explanation, *options])
    output = normalize_for_ai_match(output_text)

    has_best_or_optimal = (
        "최상의대응" in output
        or "bestresponse" in output
        or "최적의전략" in output
        or "optimalstrategy" in output
    )

    if not has_best_or_optimal:
        return None

    bad_optimal_strategy_patterns = (
        "최적의전략은모든가능한상대전략",
        "최적의전략은모든경우",
        "최적의전략은기대효용",
        "모든가능한상대전략에대해기대효용",
        "모든상대전략에대해기대효용",
        "모든가능한전략에대해기대효용",
        "기대효용을최대화하는전략",
    )

    if any(pattern in output for pattern in bad_optimal_strategy_patterns):
        correct_output_markers = (
            "모든선수가동시에최상의대응",
            "동시에최상의대응을선택",
            "최상의대응을선택할때주어지는전략",
        )

        if not any(marker in output for marker in correct_output_markers):
            return (
                "최적의 전략을 원문 정의와 다르게 "
                "'모든 가능한 상대 전략에 대한 기대효용 최대화'로 설명했습니다."
            )

    bad_best_response_patterns = (
        "최상의대응은모든상대전략",
        "최상의대응은상대전략을무시",
        "최상의대응은무작위전략",
    )

    if any(pattern in output for pattern in bad_best_response_patterns):
        return "최상의 대응의 의미를 원문과 다르게 설명했습니다."

    return None


def has_nash_misconception_correction_context(text: str) -> bool:
    normalized = normalize_for_ai_match(text)

    correction_markers = (
        "왜잘못",
        "잘못된가",
        "잘못된해석",
        "잘못된관점",
        "오해",
        "아니다",
        "아니며",
        "정당화한다고보는관점",
        "정당화한다고보는것",
        "보장한다고보는관점",
        "게임이론의예상이빗나",
        "가정이잘못",
    )

    return any(marker in normalized for marker in correction_markers)


def get_semantic_quality_reject_reason(
    quiz_type: str,
    question: str,
    answer: str,
    options: List[str],
    explanation: str,
    source_sentences: List[str],
) -> Optional[str]:
    """
    형식은 맞지만 원문 의미를 왜곡하는 문항을 차단합니다.
    오개념을 교정하는 질문은 허용하고, 오개념을 사실처럼 단정하는 질문만 차단합니다.
    """
    combined_text = " ".join([
        question,
        answer,
        explanation,
        *options,
    ])

    combined = normalize_for_ai_match(combined_text)
    question_norm = normalize_for_ai_match(question)
    answer_norm = normalize_for_ai_match(answer)
    source_blob = normalize_for_ai_match(" ".join(source_sentences))

    best_optimal_reject_reason = get_best_response_optimal_strategy_reject_reason(
        question=question,
        answer=answer,
        options=options,
        explanation=explanation,
        source_sentences=source_sentences,
    )
    if best_optimal_reject_reason:
        return best_optimal_reject_reason

    bad_nash_cooperation_patterns = (
        "협동이내시균형",
        "협동은내시균형",
        "협동을내시균형",
        "협동이내쉬균형",
        "협동은내쉬균형",
        "내시균형으로협동",
        "내쉬균형으로협동",
        "내시균형이협동을정당화",
        "내쉬균형이협동을정당화",
        "내시균형때문에협동",
        "내쉬균형때문에협동",
        "내시균형이협동을보장",
        "내쉬균형이협동을보장",
    )

    if any(pattern in combined for pattern in bad_nash_cooperation_patterns):
        if not has_nash_misconception_correction_context(combined_text):
            return "내시 균형과 협동의 관계를 원문 흐름과 다르게 왜곡했습니다."

    if "파블로프" in source_blob or "pavlov" in source_blob:
        unsupported_pavlov_patterns = (
            "상대방행동을예측",
            "상대행동을예측",
            "상대방의행동을예측",
            "상대의행동을예측",
            "상대행동예측",
            "보상을조정",
            "보상조정",
            "보상수준조정",
            "보상에따라상대",
        )

        if any(pattern in combined for pattern in unsupported_pavlov_patterns) and not any(
            pattern in source_blob
            for pattern in unsupported_pavlov_patterns
        ):
            return "파블로프 전략 설명에 source에 없는 상대 행동 예측/보상 조정 내용을 추가했습니다."

    is_prisoners_dilemma_context = (
        "죄수의딜레마" in source_blob
        or "두죄수" in source_blob
        or "자백" in source_blob
        or "부인" in source_blob
    )

    shallow_fact_patterns = (
        "모두징역1년",
        "모두죄를부인하면징역1년",
        "모두부인하면징역1년",
        "두죄수가모두죄를부인",
    )

    shallow_question_markers = (
        "몇년",
        "얼마",
        "형량",
        "결과는무엇",
        "어떻게되는가",
    )

    understanding_markers = (
        "왜",
        "어째서",
        "딜레마가발생",
        "충돌",
        "개인최적",
        "공동최적",
        "최상의대응",
        "내시균형",
        "내쉬균형",
        "협동",
        "변절",
        "비교",
        "관계",
    )

    if is_prisoners_dilemma_context and quiz_type == "MULTIPLE_CHOICE":
        fact_only = any(pattern in f"{question_norm}{answer_norm}" for pattern in shallow_fact_patterns)
        shallow_ask = any(marker in question_norm for marker in shallow_question_markers)
        has_understanding_goal = any(marker in question_norm for marker in understanding_markers)

        if fact_only and shallow_ask and not has_understanding_goal:
            return "죄수의 딜레마를 형량 사실 확인으로만 묻고 있어 이해도 체크 목적에 약합니다."

    return None

def clean_batch_ai_quiz(
    raw_quiz: Dict[str, Any],
    material_map: Dict[int, Dict[str, Any]],
    option_count: int,
) -> Tuple[Optional[Dict], Optional[str]]:
    """
    AI batch 응답 한 건을 material과 대조해 유효한 퀴즈만 반환합니다.

    핵심 정책:
    - AI가 최종 문제를 생성한다.
    - 알고리즘은 형식/근거/환각/정답 노출 검증만 수행한다.
    - 기존 BLANK/DEFINITION/KEYWORD_CHOICE는 최종 타입으로 저장하지 않는다.
    """

    def reject(reason: str) -> Tuple[None, str]:
        return None, reason

    try:
        concept_id = int(raw_quiz.get("concept_id"))
    except Exception:
        return reject("concept_id를 int로 변환할 수 없습니다.")

    material = material_map.get(concept_id)
    if not material:
        return reject("material_map에서 concept_id를 찾지 못했습니다.")

    quiz_type = canonicalize_ai_quiz_type(
        raw_quiz.get("quiz_type"),
        default=canonicalize_ai_quiz_type(
            material.get("preferred_quiz_type"),
            default="MULTIPLE_CHOICE",
        ),
    )

    question = normalize_ai_text(raw_quiz.get("question"))
    answer = normalize_ai_text(raw_quiz.get("answer"))
    explanation = normalize_ai_text(raw_quiz.get("explanation"))
    source_sentence = normalize_ai_text(raw_quiz.get("source_sentence"))

    accepted_answers = normalize_string_list(raw_quiz.get("accepted_answers"), max_items=5)
    grading_keywords = normalize_string_list(raw_quiz.get("grading_keywords"), max_items=6)
    rubric = normalize_string_list(raw_quiz.get("rubric") or raw_quiz.get("grading_rubric"), max_items=5)

    allowed_sources = [
        normalize_ai_text(sentence)
        for sentence in material.get("source_sentences") or []
        if normalize_ai_text(sentence)
    ]

    if not allowed_sources:
        return reject("material에 허용된 source_sentences가 없습니다.")

    if source_sentence not in allowed_sources:
        source_sentence = normalize_ai_text(material.get("best_source_sentence"))

    if source_sentence not in allowed_sources:
        source_sentence = allowed_sources[0]

    source_sentence = select_stronger_source_sentence(
        requested_source_sentence=source_sentence,
        allowed_sources=allowed_sources,
    )

    if not question:
        return reject("question이 비어 있습니다.")

    if not answer:
        return reject("answer가 비어 있습니다.")

    if not source_sentence:
        return reject("source_sentence가 비어 있습니다.")

    if source_sentence not in allowed_sources:
        return reject("source_sentence가 허용된 material source_sentences 안에 없습니다.")

    if is_cut_or_dangling_text(source_sentence):
        return reject("source_sentence가 잘린 문장 또는 불완전한 문장입니다.")

    options = normalize_ai_quiz_options(raw_quiz.get("options"))

    if quiz_type == "MULTIPLE_CHOICE":
        if len(options) != option_count:
            return reject(
                f"MULTIPLE_CHOICE options 개수가 option_count와 다릅니다. "
                f"options_count={len(options)}, option_count={option_count}"
            )

        if answer not in options:
            return reject("MULTIPLE_CHOICE answer가 options 안에 없습니다.")

        if is_ambiguous_misconception_multiple_choice_for_ai(
            quiz_type=quiz_type,
            question=question,
            options=options,
        ):
            return reject(
                "객관식에서 모호한 오해/잘못된 해석 고르기 형태입니다. 이유를 묻는 문항으로 바꿔야 합니다."
            )

        if is_answer_exposed_in_question(quiz_type, question, answer):
            return reject("question에 answer가 그대로 노출되어 있습니다.")

        if any(is_cut_or_dangling_text(option) for option in options):
            return reject("MULTIPLE_CHOICE options 중 잘린 문장 또는 불완전한 문장이 있습니다.")

        # 객관식 정답이 너무 짧은 핵심어 하나면 KEYWORD_CHOICE가 되므로 제외합니다.
        if is_keyword_choice_like_multiple_choice_answer(answer, material):
            return reject("MULTIPLE_CHOICE 정답이 단순 핵심어만 고르는 KEYWORD_CHOICE 형태입니다.")

    elif quiz_type == "OX":
        options = ["O", "X"]

        if answer not in options:
            return reject("OX answer가 O 또는 X가 아닙니다.")

        statement = question.split("\n\n")[-1].strip()
        if not is_valid_ox_statement(statement):
            return reject("OX 문제가 참/거짓 판단 가능한 완전한 명제가 아닙니다.")

    elif quiz_type == "SHORT_ANSWER":
        options = []

        if "___" not in question:
            return reject("SHORT_ANSWER question에 빈칸 표시 ___가 없습니다.")

        if is_bad_blank_question_shape(question):
            return reject("SHORT_ANSWER question의 빈칸 형태가 적절하지 않습니다.")

        if not is_good_blank_answer(answer):
            return reject("SHORT_ANSWER answer가 핵심 개념어로 적절하지 않습니다.")

        if not is_short_answer_grounded_in_source(answer, source_sentence):
            return reject("SHORT_ANSWER answer가 source_sentence에 충분히 근거하지 않습니다.")

        if is_answer_exposed_in_question(quiz_type, question, answer):
            return reject("question에 answer가 그대로 노출되어 있습니다.")

    elif quiz_type == "SUBJECTIVE":
        options = []

        if len(compact_text(answer)) < 12:
            return reject("SUBJECTIVE answer가 너무 짧습니다.")

        if is_cut_or_dangling_text(answer):
            return reject("SUBJECTIVE answer가 잘린 문장 또는 불완전한 문장입니다.")

        if not explanation and not rubric and not grading_keywords:
            return reject("SUBJECTIVE에 explanation, rubric, grading_keywords가 모두 없습니다.")

        explanation = format_subjective_explanation(
            explanation=explanation,
            rubric=rubric,
            grading_keywords=grading_keywords,
        )

    else:
        return reject(f"지원하지 않는 quiz_type입니다. quiz_type={quiz_type}")

    if not is_quiz_focused_on_material(
        question=question,
        answer=answer,
        material=material,
    ):
        return reject("문제/정답이 material의 concept_label, keyword, source_sentence와 충분히 관련되지 않습니다.")

    semantic_reject_reason = get_semantic_quality_reject_reason(
        quiz_type=quiz_type,
        question=question,
        answer=answer,
        options=options,
        explanation=explanation,
        source_sentences=allowed_sources,
    )
    if semantic_reject_reason:
        return reject(semantic_reject_reason)

    if not explanation:
        explanation = f"원문 근거: {source_sentence}"

    concept_label = normalize_ai_text(material.get("concept_label"))
    original_concept_name = normalize_ai_text(material.get("original_concept_name"))

    cleaned_quiz = {
        "lecture_id": material.get("lecture_id"),
        "concept_id": concept_id,
        "concept_name": concept_label or original_concept_name,
        "concept_label": concept_label,
        "original_concept_name": original_concept_name,
        "concept_keywords": material.get("keywords") or [],
        "page_num": material.get("page_num"),
        "quiz_type": quiz_type,
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "source_sentence": source_sentence,
        "source_sentences": allowed_sources,
        "accepted_answers": accepted_answers,
        "grading_keywords": grading_keywords,
        "rubric": rubric,
    }

    validation_error = validate_generated_quiz_dict(
        cleaned_quiz,
        option_count=option_count,
    )
    if validation_error:
        return reject(f"validate_generated_quiz_dict 실패: {validation_error}")

    if is_answer_exposed_in_question(quiz_type, question, answer):
        return reject("question에 answer가 그대로 노출되어 있습니다.")

    return cleaned_quiz, None


def parse_batch_ai_quizzes(
    payload: Dict,
    materials: List[Dict[str, Any]],
    option_count: int,
) -> List[Dict]:
    raw_quizzes = payload.get("quizzes")

    if not isinstance(raw_quizzes, list):
        raise AIQuizGenerationError("AI batch 응답에 quizzes 배열이 없습니다.")

    material_map = {
        int(material["concept_id"]): material
        for material in materials
        if material.get("concept_id") is not None
    }

    cleaned_quizzes = []
    seen_concept_ids = set()

    for raw_quiz in raw_quizzes:
        if not isinstance(raw_quiz, dict):
            continue

        cleaned, reject_reason = clean_batch_ai_quiz(
            raw_quiz=raw_quiz,
            material_map=material_map,
            option_count=option_count,
        )

        if not cleaned:
            print(
                "[AI_QUIZ_CLEAN_REJECT] "
                f"reason={reject_reason}, "
                f"concept_id={raw_quiz.get('concept_id')}, "
                f"quiz_type={raw_quiz.get('quiz_type')}, "
                f"question={str(raw_quiz.get('question') or '')[:120]}, "
                f"answer={str(raw_quiz.get('answer') or '')[:120]}, "
                f"options_count={len(raw_quiz.get('options') or []) if isinstance(raw_quiz.get('options'), list) else 'not_list'}, "
                f"source_sentence={str(raw_quiz.get('source_sentence') or '')[:120]}"
            )
            continue

        concept_id = cleaned["concept_id"]
        if concept_id in seen_concept_ids:
            continue

        seen_concept_ids.add(concept_id)
        cleaned_quizzes.append(cleaned)

    return cleaned_quizzes


def get_generated_concept_ids(quizzes: List[Dict]) -> set[int]:
    concept_ids = set()

    for quiz in quizzes:
        try:
            concept_ids.add(int(quiz.get("concept_id")))
        except Exception:
            continue

    return concept_ids


def get_missing_materials(
    materials: List[Dict[str, Any]],
    generated_quizzes: List[Dict],
) -> List[Dict[str, Any]]:
    generated_concept_ids = get_generated_concept_ids(generated_quizzes)

    missing = []

    for material in materials:
        try:
            concept_id = int(material.get("concept_id"))
        except Exception:
            continue

        if concept_id not in generated_concept_ids:
            missing.append(material)

    return missing


def generate_quizzes_with_ai_batch_once(
    materials: List[Dict[str, Any]],
    difficulty: str,
    option_count: int,
    batch_size: int,
    provider: Optional[str] = None,
    quota_retry_count: int = 1,
    request_delay_seconds: float = 0.0,
) -> List[Dict]:
    generated_quizzes = []

    for batch_index, batch in enumerate(chunk_list(materials, batch_size), start=1):
        attempt = 0

        while True:
            try:
                if request_delay_seconds > 0 and not (batch_index == 1 and attempt == 0):
                    time.sleep(request_delay_seconds)

                print(
                    "[AI_QUIZ_BATCH_REQUEST] "
                    f"batch={batch_index}, "
                    f"attempt={attempt + 1}, "
                    f"input={len(batch)}"
                )

                messages = build_batch_ai_messages(
                    materials=batch,
                    difficulty=difficulty,
                    option_count=option_count,
                )

                content = call_chat_completion(messages, provider=provider)
                payload = extract_json_payload(content)

                batch_quizzes = parse_batch_ai_quizzes(
                    payload=payload,
                    materials=batch,
                    option_count=option_count,
                )

                print(
                    "[AI_QUIZ_BATCH_RESPONSE] "
                    f"batch={batch_index}, "
                    f"attempt={attempt + 1}, "
                    f"output={len(batch_quizzes)}"
                )

                generated_quizzes.extend(batch_quizzes)
                break

            except Exception as exc:
                if is_ai_quota_exceeded_error(exc):
                    if attempt < quota_retry_count:
                        sleep_seconds = extract_retry_after_seconds(exc)
                        print(
                            "[AI_QUIZ_BATCH_QUOTA_RETRY] "
                            f"batch={batch_index}, "
                            f"attempt={attempt + 1}, "
                            f"sleep={sleep_seconds:.1f}, "
                            f"error={type(exc).__name__}: {exc}"
                        )
                        time.sleep(sleep_seconds)
                        attempt += 1
                        continue

                    print(
                        "[AI_QUIZ_BATCH_QUOTA_EXCEEDED] "
                        f"batch={batch_index}, "
                        f"attempt={attempt + 1}, "
                        f"{type(exc).__name__}: {exc}"
                    )
                    break

                print(
                    "[AI_QUIZ_BATCH_FALLBACK] "
                    f"batch={batch_index}, "
                    f"attempt={attempt + 1}, "
                    f"{type(exc).__name__}: {exc}"
                )
                break

    return generated_quizzes


def generate_quizzes_with_ai_batch(
    materials: List[Dict[str, Any]],
    difficulty: str,
    option_count: int,
    use_ai: bool,
    batch_size: int = 5,
    target_min: int = 8,
    target_max: int = 12,
    retry_missing_once: bool = True,
    provider: Optional[str] = None,
    quota_retry_count: int = 1,
    request_delay_seconds: float = 0.0,
) -> Tuple[List[Dict], int]:
    """
    material을 AI batch로 생성하고, 부족한 항목은 누락분만 한 번 재시도합니다.
    """
    if not materials:
        return [], 0

    if not can_use_ai(use_ai, provider=provider):
        return [], 0

    selected_materials = materials[:target_max]

    print(
        "[AI_QUIZ_BATCH_START] "
        f"materials={len(materials)}, "
        f"selected={len(selected_materials)}, "
        f"target_min={target_min}, "
        f"target_max={target_max}, "
        f"batch_size={batch_size}"
    )

    generated_quizzes = generate_quizzes_with_ai_batch_once(
        materials=selected_materials,
        difficulty=difficulty,
        option_count=option_count,
        batch_size=batch_size,
        provider=provider,
        quota_retry_count=quota_retry_count,
        request_delay_seconds=request_delay_seconds,
    )

    # AI 응답 중복은 concept_id 기준으로 제거합니다.
    unique_quizzes = []
    seen_concept_ids = set()

    for quiz in generated_quizzes:
        try:
            concept_id = int(quiz.get("concept_id"))
        except Exception:
            continue

        if concept_id in seen_concept_ids:
            continue

        seen_concept_ids.add(concept_id)
        unique_quizzes.append(quiz)

    generated_quizzes = unique_quizzes

    # 목표 수량에 못 미치면 누락된 material만 재요청합니다.
    if retry_missing_once and len(generated_quizzes) < target_min:
        missing_materials = get_missing_materials(
            materials=selected_materials,
            generated_quizzes=generated_quizzes,
        )

        if missing_materials:
            print(
                "[AI_QUIZ_BATCH_RETRY_MISSING] "
                f"current={len(generated_quizzes)}, "
                f"missing={len(missing_materials)}"
            )

            retry_quizzes = generate_quizzes_with_ai_batch_once(
                materials=missing_materials,
                difficulty=difficulty,
                option_count=option_count,
                batch_size=batch_size,
                provider=provider,
                quota_retry_count=quota_retry_count,
                request_delay_seconds=request_delay_seconds,
            )

            generated_concept_ids = get_generated_concept_ids(generated_quizzes)

            for quiz in retry_quizzes:
                try:
                    concept_id = int(quiz.get("concept_id"))
                except Exception:
                    continue

                if concept_id in generated_concept_ids:
                    continue

                generated_concept_ids.add(concept_id)
                generated_quizzes.append(quiz)

                if len(generated_quizzes) >= target_max:
                    break

    generated_quizzes = generated_quizzes[:target_max]

    print(
        "[AI_QUIZ_BATCH_DONE] "
        f"generated={len(generated_quizzes)}"
    )

    return generated_quizzes, len(generated_quizzes)


def quiz_model_to_draft_dict(quiz: models.Quiz) -> Dict:
    return {
        "lecture_id": quiz.lecture_id,
        "concept_id": quiz.concept_id,
        "quiz_type": quiz.quiz_type,
        "question": quiz.question,
        "options": deserialize_options(quiz.options),
        "answer": quiz.answer,
        "explanation": quiz.explanation,
        "source_sentence": quiz.source_sentence,
        "page_num": quiz.page_num,
    }
