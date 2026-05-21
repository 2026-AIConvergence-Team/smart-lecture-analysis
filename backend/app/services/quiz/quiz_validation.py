import re
from typing import List, Optional

from fastapi import status
from fastapi.responses import JSONResponse

from app.constants.quiz_constants import WEAK_BLANK_ANSWER_WORDS
from app.constants.quiz_validation_constants import (
    MAX_ANSWER_LENGTH,
    MAX_KEYWORD_CHOICE_ANSWER_LENGTH,
    MAX_OPTION_COUNT,
    MAX_OPTION_LENGTH,
    MAX_QUESTION_LENGTH,
    MIN_OPTION_COUNT,
    SENTENCE_LIKE_ANSWER_MARKERS,
    SUPPORTED_DIFFICULTIES,
    SUPPORTED_GENERATED_QUIZ_TYPES,
    SUPPORTED_QUIZ_STATUSES,
    SUPPORTED_QUIZ_TYPES,
)


def normalize_text(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().split())


def compact_text(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "").strip())


def normalize_for_match(value: str) -> str:
    return re.sub(
        r"[^0-9A-Za-z가-힣]",
        "",
        str(value or "").lower(),
    )


def is_sentence_like_answer(value: str) -> bool:
    compact = compact_text(value)

    if len(compact) <= MAX_KEYWORD_CHOICE_ANSWER_LENGTH:
        return False

    return any(marker in compact for marker in SENTENCE_LIKE_ANSWER_MARKERS)


def is_weak_blank_answer(value: str) -> bool:
    cleaned = normalize_text(value)
    compact = compact_text(cleaned)

    if not compact:
        return True

    normalized_weak_words = {
        compact_text(word)
        for word in WEAK_BLANK_ANSWER_WORDS
    }

    if compact in normalized_weak_words:
        return True

    if len(compact) <= 8 and compact.endswith(("적으로", "하게", "히")):
        return True

    if len(compact) <= 1:
        return True

    return False


def normalize_for_match(value: str) -> str:
    return re.sub(
        r"[^0-9A-Za-z가-힣]",
        "",
        str(value or "").lower(),
    )

def normalize_quiz_type(quiz_type: str) -> str:
    return normalize_text(quiz_type).upper()


def normalize_quiz_status(status_value: str) -> str:
    return normalize_text(status_value).upper()


def normalize_difficulty(difficulty: str) -> str:
    return normalize_text(difficulty).upper()


def error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": message},
    )


def clean_options(options: List[str]) -> List[str]:
    return [
        normalize_text(option)
        for option in options
        if normalize_text(option)
    ]


def has_duplicate_options(options: List[str]) -> bool:
    normalized = [option.lower() for option in options]
    return len(normalized) != len(set(normalized))


def validate_quiz_type(quiz_type: str) -> Optional[JSONResponse]:
    if normalize_quiz_type(quiz_type) not in SUPPORTED_QUIZ_TYPES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 quiz_type입니다. MIXED, BLANK, DEFINITION, KEYWORD_CHOICE, OX 중 하나를 사용하세요.",
        )
    return None


def validate_quiz_status(status_value: str) -> Optional[JSONResponse]:
    if normalize_quiz_status(status_value) not in SUPPORTED_QUIZ_STATUSES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 status입니다. DRAFT, READY, DELETED 중 하나를 사용하세요.",
        )
    return None


def validate_difficulty(difficulty: str) -> Optional[JSONResponse]:
    if normalize_difficulty(difficulty) not in SUPPORTED_DIFFICULTIES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 difficulty입니다. EASY, MEDIUM, HARD 중 하나를 사용하세요.",
        )
    return None


def validate_question_text(question: str) -> Optional[JSONResponse]:
    cleaned_question = normalize_text(question)

    if not cleaned_question:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "question은 필수값입니다.",
        )

    if cleaned_question == "___":
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "question이 빈칸만으로 구성될 수 없습니다.",
        )

    if len(cleaned_question) > MAX_QUESTION_LENGTH:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"question은 {MAX_QUESTION_LENGTH}자 이하여야 합니다.",
        )

    return None


def validate_options_and_answer(
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    """
    사용자 입력으로 들어온 객관식 보기와 정답의 기본 제약을 검증합니다.
    """
    if not isinstance(options, list):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "options는 배열이어야 합니다.",
        )

    cleaned_options = clean_options(options)
    cleaned_answer = normalize_text(answer)

    if len(cleaned_options) < MIN_OPTION_COUNT:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "객관식 선택지는 최소 2개 이상이어야 합니다.",
        )

    if len(cleaned_options) > MAX_OPTION_COUNT:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"객관식 선택지는 최대 {MAX_OPTION_COUNT}개까지 가능합니다.",
        )

    if has_duplicate_options(cleaned_options):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "객관식 선택지에 중복된 값이 있습니다.",
        )

    too_long_options = [
        option
        for option in cleaned_options
        if len(option) > MAX_OPTION_LENGTH
    ]
    if too_long_options:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"각 선택지는 {MAX_OPTION_LENGTH}자 이하여야 합니다.",
        )

    if not cleaned_answer:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "answer는 필수값입니다.",
        )

    if len(cleaned_answer) > MAX_ANSWER_LENGTH:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            f"answer는 {MAX_ANSWER_LENGTH}자 이하여야 합니다.",
        )

    if cleaned_answer not in cleaned_options:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "answer는 options 안에 포함되어야 합니다.",
        )

    return None


def validate_ready_quiz(
    question: str,
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    """
    READY 상태로 전환하기 전에 사용자에게 노출 가능한 퀴즈인지 확인합니다.
    """
    question_error = validate_question_text(question)
    if question_error:
        return question_error

    options_error = validate_options_and_answer(options, answer)
    if options_error:
        return options_error

    return None


def validate_generated_quiz_dict(
    quiz_data: dict,
    option_count: int = 4,
) -> Optional[str]:
    """
    자동 생성/AI 생성 퀴즈를 서비스 레이어에서 재사용할 수 있게 문자열 에러로 검증합니다.
    """
    quiz_type = normalize_quiz_type(quiz_data.get("quiz_type"))
    question = normalize_text(quiz_data.get("question"))
    answer = normalize_text(quiz_data.get("answer"))
    options = quiz_data.get("options") or []

    if quiz_type not in SUPPORTED_GENERATED_QUIZ_TYPES:
        return "지원하지 않는 자동 생성 quiz_type입니다."

    if not question:
        return "question이 비어 있습니다."

    if question == "___":
        return "question이 빈칸만으로 구성되어 있습니다."

    if not answer:
        return "answer가 비어 있습니다."

    if not isinstance(options, list):
        return "options는 배열이어야 합니다."

    cleaned_options = clean_options(options)

    if quiz_type == "OX":
        if cleaned_options != ["O", "X"]:
            return "OX 문제의 options는 ['O', 'X']여야 합니다."

        if answer not in ["O", "X"]:
            return "OX 문제의 answer는 O 또는 X여야 합니다."

        return None

    if len(cleaned_options) != option_count:
        return f"options 개수는 {option_count}개여야 합니다."

    if has_duplicate_options(cleaned_options):
        return "options에 중복된 값이 있습니다."

    if answer not in cleaned_options:
        return "answer는 options 안에 포함되어야 합니다."

    if quiz_type != "BLANK":
        normalized_answer = normalize_for_match(answer)
        normalized_question = normalize_for_match(question)

        if normalized_answer and normalized_answer in normalized_question:
            return "정답이 문제 문장에 그대로 노출되어 있습니다."

    if quiz_type == "BLANK":
        if "___" not in question:
            return "BLANK 문제에는 ___가 포함되어야 합니다."

        if is_weak_blank_answer(answer):
            return "BLANK 정답은 단순 부사/수식어가 아니라 핵심 개념어여야 합니다."

    if quiz_type == "KEYWORD_CHOICE":
        if len(answer) > MAX_KEYWORD_CHOICE_ANSWER_LENGTH:
            return "KEYWORD_CHOICE 정답은 긴 문장이 아니라 핵심어 또는 짧은 명사구여야 합니다."

        if is_sentence_like_answer(answer):
            return "KEYWORD_CHOICE 정답이 문장형 설명입니다."

    return None
