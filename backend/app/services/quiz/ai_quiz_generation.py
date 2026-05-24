import ast
import json
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

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
from app.services.quiz.quiz_validation import (
    SUPPORTED_GENERATED_QUIZ_TYPES,
    validate_generated_quiz_dict,
)


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
            "EASY: 학생이 핵심 용어와 기본 설명을 이해했는지 확인한다. "
            "너무 꼬지 말고 원문 근거가 명확한 문제를 만든다."
        )

    if normalized == "HARD":
        return (
            "HARD: 단순 용어 암기보다 개념 간 관계, 비교, 원인과 결과, 적용 상황을 묻는다. "
            "단, 반드시 제공된 source_sentences와 keywords 안에서만 출제한다."
        )

    return (
        "MEDIUM: 핵심 개념의 의미와 관련 개념과의 차이를 확인한다. "
        "단순 빈칸 암기보다 수업 내용을 이해했는지 묻는다."
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

    # AI에 꼭 필요한 정보만 전달해 토큰을 줄입니다.
    compact_payload = {
        "concept_name": source_payload.get("concept_name"),
        "original_concept_name": source_payload.get("original_concept_name"),
        "page_num": source_payload.get("page_num"),
        "keywords": source_payload.get("keywords") or [],
        # Groq gpt-oss-20b의 TPM과 출력 안정성을 위해 단건 개선에는 핵심 근거만 짧게 전달합니다.
        "source_sentences": [
            str(sentence)[:220]
            for sentence in (source_payload.get("source_sentences") or [])[:3]
        ],
        "draft_quiz": {
            "quiz_type": draft.get("quiz_type"),
            "question": draft.get("question"),
            "options": draft.get("options"),
            "answer": draft.get("answer"),
            "source_sentence": draft.get("source_sentence"),
        },
    }

    if reason:
        compact_payload["regenerate_reason"] = normalize_ai_text(reason)

    output_schema = {
        "quiz_type": "DEFINITION",
        "question": "문제 내용",
        "options": ["보기1", "보기2", "보기3", "보기4"],
        "answer": "보기 중 정답과 완전히 같은 문자열",
        "explanation": "해설",
        "source_sentence": "source_sentences 중 정답의 직접 근거 문장 1개",
    }
    difficulty_instruction = (
        source_payload.get("difficulty_instruction")
        or get_difficulty_instruction(difficulty)
    )

    system_message = (
        "너는 대학 강의 PDF 기반 한국어 객관식 퀴즈 생성기다. "
        "제공된 JSON의 concept_name, keywords, source_sentences 정보만 사용한다. "
        "외부 지식, 추측, 원문에 없는 사실은 금지한다. "
        "반드시 JSON 객체 하나만 반환한다. JSON 앞뒤에 설명, 생각 과정, Markdown을 절대 붙이지 않는다. "
        "출력의 첫 글자는 반드시 { 이고 마지막 글자는 반드시 } 이다."
    )

    user_message = (
        "concept_name에 대한 이해도 확인용 퀴즈 1개를 생성하거나 개선하라.\n\n"
        f"난이도 지침: {difficulty_instruction}\n\n"
        "규칙:\n"
        "- quiz_type은 BLANK, DEFINITION, KEYWORD_CHOICE, OX 중 하나다.\n"
        "- draft_quiz.quiz_type을 우선하되, 부적절하면 더 자연스러운 유형으로 바꿔도 된다.\n"
        f"- OX는 options가 정확히 [\"O\", \"X\"], 그 외 유형은 options가 정확히 {option_count}개다.\n"
        "- answer는 반드시 options 중 하나와 완전히 같은 문자열이어야 한다.\n"
        "- question에 answer를 그대로 노출하지 마라. 단, BLANK는 정답 위치를 ___로 가린다.\n"
        "- source_sentence는 source_sentences 중 정답의 직접 근거가 되는 문장 1개를 그대로 사용하라.\n"
        "- source_sentences 안에 정답의 근거가 없으면 draft_quiz.source_sentence를 사용하지 말고, source_sentences 안에서 만들 수 있는 다른 문제로 바꿔라.\n"
        "- KEYWORD_CHOICE 정답은 핵심어/짧은 명사구만 허용한다. 긴 문장 전체를 정답으로 쓰지 마라.\n"
        "- DEFINITION 보기는 완전한 설명 문장이어야 하며, 중간에서 끊긴 원문 조각을 쓰지 마라.\n"
        "- '가위', '바위', '보', '초기', '확인', '방울', '경우', '과정', '방법', '결과', '상태' 같은 일반 단어/예시 단어를 정답으로 쓰지 마라.\n"
        "- 오답은 같은 주제 범위 안에서 그럴듯하지만 명확히 틀리게 만들어라.\n"
        "- question은 concept_name과 직접 관련된 내용을 물어야 한다.\n"
        "- explanation은 왜 정답인지 1~2문장으로 짧게 작성하라.\n"
        "- Markdown 코드블록 없이 JSON만 반환하라. 첫 글자는 {, 마지막 글자는 } 이어야 한다.\n"
        "- JSON 문자열 값 안에서는 큰따옴표를 쓰지 말고 작은따옴표를 사용하라.\n\n"
        "- 숫자/수량이 정답이면 source_sentence에도 같은 숫자/수량이 반드시 들어 있어야 한다.\n"
        "- OX 문제는 참/거짓 판단 가능한 완전한 명제로만 만들고, 제목이나 'A vs B' 형태만으로 만들지 마라.\n"
        "- BLANK는 문장 맨 앞/맨 끝을 빈칸으로 만들지 말고, 핵심 개념어만 ___로 가려라.\n"
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

    if quiz_type == "BLANK":
        return False

    return compact_text(answer).lower() in compact_text(question).lower()


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
    AI 단건 응답을 내부 퀴즈 형식으로 보정하고 저장 전 검증을 수행합니다.
    """
    source_sentences = [
        normalize_ai_text(sentence)
        for sentence in (source_sentences or [])
        if normalize_ai_text(sentence)
    ]

    fallback_quiz_type = normalize_ai_text(
        fallback_quiz.get("quiz_type") or "DEFINITION"
    ).upper()

    quiz_type = normalize_ai_text(data.get("quiz_type") or fallback_quiz_type).upper()
    if quiz_type not in SUPPORTED_GENERATED_QUIZ_TYPES:
        quiz_type = fallback_quiz_type

    if quiz_type not in SUPPORTED_GENERATED_QUIZ_TYPES:
        quiz_type = "DEFINITION"

    question = normalize_ai_text(data.get("question") or fallback_quiz.get("question"))
    answer = normalize_ai_text(data.get("answer") or fallback_quiz.get("answer"))
    explanation = normalize_ai_text(data.get("explanation") or fallback_quiz.get("explanation"))

    source_sentence = select_source_sentence(
        requested_source_sentence=data.get("source_sentence"),
        fallback_quiz=fallback_quiz,
        source_sentences=source_sentences,
    )

    raw_options = data.get("options")
    options = normalize_options(raw_options)

    fallback_options = normalize_options(fallback_quiz.get("options") or [])

    if quiz_type == "OX":
        options = ["O", "X"]
        if answer not in options:
            answer = "O"
    else:
        if not answer:
            raise AIQuizGenerationError("AI가 생성한 answer가 비어 있습니다.")

        options = fill_options_from_fallback(
            options=options,
            answer=answer,
            fallback_options=fallback_options,
            option_count=option_count,
        )

        if answer not in options:
            options = [answer] + [option for option in options if option != answer]
            options = options[:option_count]

    if not explanation:
        explanation = f"원문 근거: {source_sentence}"

    source_sentence = select_stronger_source_sentence(
        requested_source_sentence=source_sentence,
        allowed_sources=source_sentences,
    )

    if quiz_type == "OX":
        statement = question.split("\n\n")[-1].strip()
        if not is_valid_ox_statement(statement):
            raise AIQuizGenerationError("OX 문제가 참/거짓 판단 가능한 명제가 아닙니다.")

    if quiz_type == "BLANK" and is_bad_blank_question_shape(question):
        raise AIQuizGenerationError("BLANK 문제가 원문 조각 맞추기 형태입니다.")

    if is_cut_or_dangling_text(source_sentence):
        raise AIQuizGenerationError("source_sentence가 중간에서 잘린 원문 조각입니다.")

    if quiz_type == "DEFINITION" and not is_definition_answer_quality(answer, source_sentence):
        raise AIQuizGenerationError("DEFINITION 정답이 완전한 설명 문장이 아니거나 source_sentence와 맞지 않습니다.")
    
    if quiz_type != "OX" and not is_answer_grounded_in_source(answer, source_sentence):
        raise AIQuizGenerationError("정답과 source_sentence의 근거가 일치하지 않습니다.")
    
    if quiz_type == "KEYWORD_CHOICE" and not is_good_short_answer(answer):
        raise AIQuizGenerationError("KEYWORD_CHOICE 정답이 핵심어/짧은 명사구가 아닙니다.")

    if quiz_type == "BLANK" and not is_good_blank_answer(answer):
        raise AIQuizGenerationError("BLANK 정답이 핵심 개념어로 적절하지 않습니다.")
    
    if any(is_cut_or_dangling_text(option) for option in options):
        raise AIQuizGenerationError("options에 중간에서 잘린 원문 조각이 포함되어 있습니다.")
    
    cleaned_quiz = {
        **fallback_quiz,
        "quiz_type": quiz_type,
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": explanation,
        "source_sentence": source_sentence,
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

        compact_materials.append({
            "concept_id": material.get("concept_id"),
            "page_num": material.get("page_num"),
            "concept_label": material.get("concept_label"),
            "keywords": material.get("keywords") or [],
            "source_sentences": source_sentences,
            "preferred_quiz_type": material.get("preferred_quiz_type") or "DEFINITION",
        })

    output_schema = {
        "quizzes": [
            {
                "concept_id": 1,
                "quiz_type": "DEFINITION",
                "question": "문제 내용",
                "options": ["보기1", "보기2", "보기3", "보기4"],
                "answer": "options 중 정답과 완전히 같은 문자열",
                "explanation": "해설",
                "source_sentence": "source_sentences 중 가장 직접적인 근거 문장 1개",
            }
        ]
    }

    system_message = (
        "너는 대학 강의 PDF 기반 한국어 객관식 퀴즈 생성기다. "
        "반드시 입력 JSON의 source_sentences 안의 정보만 사용한다. "
        "외부 지식, 추측, 원문에 없는 사실은 금지한다. "
        "반드시 JSON 객체 하나만 반환한다."
    )

    user_message = (
        "각 item마다 학생 이해도 확인용 퀴즈를 정확히 1개씩 생성하라.\n\n"
        f"난이도 지침: {get_difficulty_instruction(difficulty)}\n\n"
        "규칙:\n"
        "- quizzes 개수는 입력 items 개수와 같아야 하며, 어떤 item도 생략하지 마라.\n"
        "- 각 quiz에는 해당 item의 concept_id를 그대로 넣어라.\n"
        "- quiz_type은 BLANK, DEFINITION, KEYWORD_CHOICE, OX 중 하나다.\n"
        "- preferred_quiz_type을 우선 따르되, 불안정하면 DEFINITION 또는 KEYWORD_CHOICE로 바꿔도 된다.\n"
        "- 여러 item이 있으면 가능한 범위에서 DEFINITION, KEYWORD_CHOICE, BLANK를 섞어라.\n"
        "- OX는 원문 사실 판단이 명확할 때만 사용하라.\n"
        f"- OX는 options가 정확히 [\"O\", \"X\"], 그 외 유형은 options가 정확히 {option_count}개다.\n"
        "- answer는 반드시 options 중 하나와 완전히 같은 문자열이어야 한다.\n"
        "- KEYWORD_CHOICE의 answer는 긴 문장/설명문이 아니라 핵심어 또는 짧은 명사구여야 한다.\n"
        "- DEFINITION의 answer/options는 완전한 설명 문장이어야 하며, 중간에서 끊긴 원문 조각은 금지한다.\n"
        "- BLANK의 answer는 핵심 개념어 또는 명사구여야 하며, '합리적으로', '독립적으로', '무의식적으로' 같은 단순 부사/수식어는 금지한다.\n"
        "- '가위', '바위', '보', '초기', '확인', '방울', '경우', '과정', '방법', '결과', '상태' 같은 일반 단어/예시 단어를 정답으로 쓰지 마라.\n"
        "- question에 answer를 그대로 노출하지 마라. 단, BLANK는 정답 위치를 ___로 가린다.\n"
        "- 부정형 문제, 예: '옳지 않은 것은?', '관련 없는 것은?'은 만들지 마라.\n"
        "- question은 concept_label과 직접 관련된 내용을 물어야 한다.\n"
        "- source_sentences가 짧거나 문장이 끊겨 있으면, 같은 item의 source_sentences 전체를 함께 읽고 문제와 해설을 만들어라.\n"
        "- source_sentence에는 해당 item의 source_sentences 중 가장 직접적인 근거 문장 1개를 그대로 넣어라.\n"
        "- 오답은 같은 주제 범위 안에서 그럴듯하지만 명확히 틀리게 만들어라.\n"
        "- explanation은 왜 정답인지 1~2문장으로 짧게 작성하라.\n"
        "- Markdown 코드블록 없이 JSON만 반환하라.\n\n"
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


def extract_focus_terms(value: str) -> List[str]:
    terms = re.split(r"[^0-9A-Za-z가-힣]+", str(value or ""))
    return unique_keep_order([
        term
        for term in terms
        if len(normalize_for_ai_match(term)) >= 2
    ])


def is_quiz_focused_on_material(
    question: str,
    answer: str,
    material: Dict[str, Any],
) -> bool:
    """
    AI가 엉뚱한 source_sentence의 세부 예시만 묻고,
    실제 concept_label과 무관한 문제를 만드는 경우를 차단합니다.
    """
    concept_label = normalize_ai_text(material.get("concept_label"))
    keywords = [
        normalize_ai_text(keyword)
        for keyword in material.get("keywords") or []
        if normalize_ai_text(keyword)
    ]

    focus_terms = extract_focus_terms(concept_label)

    # label이 'RNA-DNA/단백질 위임'이면 RNA, DNA, 단백질, 위임 중 일부가 문제/정답에 드러나도 허용합니다.
    target_text = normalize_for_ai_match(f"{question} {answer}")

    if focus_terms:
        matched_count = sum(
            1
            for term in focus_terms
            if normalize_for_ai_match(term) in target_text
        )

        if matched_count > 0:
            return True

    # concept_label이 짧거나 분해가 어려운 경우 keyword로 보조 판단합니다.
    for keyword in keywords:
        normalized_keyword = normalize_for_ai_match(keyword)
        if len(normalized_keyword) >= 3 and normalized_keyword in target_text:
            return True

    return False


def clean_batch_ai_quiz(
    raw_quiz: Dict[str, Any],
    material_map: Dict[int, Dict[str, Any]],
    option_count: int,
) -> Optional[Dict]:
    """
    AI batch 응답 한 건을 material과 대조해 유효한 퀴즈만 반환합니다.
    """
    try:
        concept_id = int(raw_quiz.get("concept_id"))
    except Exception:
        return None

    material = material_map.get(concept_id)
    if not material:
        return None

    quiz_type = normalize_ai_text(raw_quiz.get("quiz_type") or "DEFINITION").upper()
    if quiz_type not in SUPPORTED_GENERATED_QUIZ_TYPES:
        quiz_type = "DEFINITION"

    question = normalize_ai_text(raw_quiz.get("question"))
    answer = normalize_ai_text(raw_quiz.get("answer"))
    explanation = normalize_ai_text(raw_quiz.get("explanation"))
    source_sentence = normalize_ai_text(raw_quiz.get("source_sentence"))

    allowed_sources = [
        normalize_ai_text(sentence)
        for sentence in material.get("source_sentences") or []
        if normalize_ai_text(sentence)
    ]

    if source_sentence not in allowed_sources:
        source_sentence = normalize_ai_text(material.get("best_source_sentence"))

    if source_sentence not in allowed_sources and allowed_sources:
        source_sentence = allowed_sources[0]

    source_sentence = select_stronger_source_sentence(
        requested_source_sentence=source_sentence,
        allowed_sources=allowed_sources,
    )

    if quiz_type == "OX":
        statement = question.split("\n\n")[-1].strip()
        if not is_valid_ox_statement(statement):
            raise AIQuizGenerationError("OX 문제가 참/거짓 판단 가능한 명제가 아닙니다.")

    if quiz_type == "BLANK" and is_bad_blank_question_shape(question):
        raise AIQuizGenerationError("BLANK 문제가 원문 조각 맞추기 형태입니다.")

    if quiz_type != "OX" and not is_answer_grounded_in_source(answer, source_sentence):
        raise AIQuizGenerationError("정답과 source_sentence의 근거가 일치하지 않습니다.")
    
    options = normalize_ai_quiz_options(raw_quiz.get("options"))

    if quiz_type == "OX":
        options = ["O", "X"]
        if answer not in options:
            answer = "O"
    else:
        if len(options) != option_count:
            return None

        if answer not in options:
            return None

    if not is_quiz_focused_on_material(
        question=question,
        answer=answer,
        material=material,
    ):
        return None

    if not question or not answer or not source_sentence:
        return None

    if quiz_type == "KEYWORD_CHOICE" and not is_good_short_answer(answer):
        return None

    if quiz_type == "BLANK" and not is_good_blank_answer(answer):
        return None

    if any(is_cut_or_dangling_text(option) for option in options):
        return None
    
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
    }

    validation_error = validate_generated_quiz_dict(
        cleaned_quiz,
        option_count=option_count,
    )
    if validation_error:
        return None

    if is_answer_exposed_in_question(quiz_type, question, answer):
        return None

    return cleaned_quiz


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

        cleaned = clean_batch_ai_quiz(
            raw_quiz=raw_quiz,
            material_map=material_map,
            option_count=option_count,
        )

        if not cleaned:
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
) -> List[Dict]:
    generated_quizzes = []

    for batch_index, batch in enumerate(chunk_list(materials, batch_size), start=1):
        try:
            print(
                "[AI_QUIZ_BATCH_REQUEST] "
                f"batch={batch_index}, input={len(batch)}"
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
                f"batch={batch_index}, output={len(batch_quizzes)}"
            )

            generated_quizzes.extend(batch_quizzes)

        except Exception as exc:
            if is_ai_quota_exceeded_error(exc):
                print(
                    "[AI_QUIZ_BATCH_QUOTA_EXCEEDED] "
                    f"{type(exc).__name__}: {exc}"
                )
                break

            print(
                "[AI_QUIZ_BATCH_FALLBACK] "
                f"batch={batch_index}, {type(exc).__name__}: {exc}"
            )
            continue

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
        provider=provider
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
