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
    SUPPORTED_QUIZ_SET_STATUSES,
    SUPPORTED_QUIZ_STATUSES,
    SUPPORTED_QUIZ_TYPES,
)


# ---------------------------------------------------------------------
# New quiz type policy
# ---------------------------------------------------------------------
# 사용자에게 노출할 새 타입
# - MULTIPLE_CHOICE: 객관식
# - OX: O/X
# - SHORT_ANSWER: 단답(빈칸)
# - SUBJECTIVE: 주관식
#
# 기존 타입 호환
# - DEFINITION, KEYWORD_CHOICE -> MULTIPLE_CHOICE
# - BLANK -> SHORT_ANSWER
# ---------------------------------------------------------------------

NEW_SUPPORTED_QUIZ_TYPES = {
    "MIXED",
    "MULTIPLE_CHOICE",
    "OX",
    "SHORT_ANSWER",
    "SUBJECTIVE",
}

NEW_SUPPORTED_GENERATED_QUIZ_TYPES = {
    "MULTIPLE_CHOICE",
    "OX",
    "SHORT_ANSWER",
    "SUBJECTIVE",
}

LEGACY_QUIZ_TYPE_ALIASES = {
    "DEFINITION": "MULTIPLE_CHOICE",
    "KEYWORD_CHOICE": "MULTIPLE_CHOICE",
    "BLANK": "SHORT_ANSWER",
    "TRUE_FALSE": "OX",
}


EXTRA_WEAK_BLANK_ANSWER_WORDS = {
    "초기",
    "확인",
    "방울",
    "가위",
    "바위",
    "보",
    "부분",
    "부위",
    "경우",
    "과정",
    "방법",
    "결과",
    "상태",
}


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


def normalize_quiz_type(quiz_type: str) -> str:
    return normalize_text(quiz_type).upper()


def canonicalize_quiz_type(quiz_type: str) -> str:
    normalized = normalize_quiz_type(quiz_type)
    return LEGACY_QUIZ_TYPE_ALIASES.get(normalized, normalized)


def normalize_quiz_status(status_value: str) -> str:
    return normalize_text(status_value).upper()


def normalize_quiz_set_status(status_value: str) -> str:
    return normalize_text(status_value).upper()


def normalize_difficulty(difficulty: str) -> str:
    return normalize_text(difficulty).upper()


def get_supported_input_quiz_types() -> set[str]:
    return (
        set(SUPPORTED_QUIZ_TYPES)
        | NEW_SUPPORTED_QUIZ_TYPES
        | set(LEGACY_QUIZ_TYPE_ALIASES.keys())
    )


def get_supported_generated_quiz_types() -> set[str]:
    return (
        set(SUPPORTED_GENERATED_QUIZ_TYPES)
        | NEW_SUPPORTED_GENERATED_QUIZ_TYPES
        | set(LEGACY_QUIZ_TYPE_ALIASES.keys())
    )


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


def is_sentence_like_answer(value: str) -> bool:
    compact = compact_text(value)

    if len(compact) <= MAX_KEYWORD_CHOICE_ANSWER_LENGTH:
        return False

    return any(marker in compact for marker in SENTENCE_LIKE_ANSWER_MARKERS)


def is_cut_or_dangling_answer(value: str) -> bool:
    cleaned = normalize_text(value)
    compact = compact_text(cleaned)

    if not compact or len(compact) <= 10:
        return False

    dangling_endings = (
        "을",
        "를",
        "은",
        "는",
        "이",
        "가",
        "의",
        "에",
        "로",
        "으로",
        "와",
        "과",
        "통해",
        "위해",
        "따라",
        "대해",
        "관한",
        "이것이",
        "영향을",
        "것을",
        "것이",
    )

    if compact.endswith(dangling_endings):
        return True

    complete_markers = (
        "다",
        "한다",
        "된다",
        "있다",
        "없다",
        "이다",
        "함",
        "있음",
        "가능",
        "필요",
        "의미",
        "증가",
        "감소",
        "변화",
        "영향",
        "연관",
        "관련",
        "담당",
        "형성",
        "보유",
        "설명",
        "수행",
        "높아짐",
        "낮아짐",
        "존재",
        "추정",
        "나타남",
    )

    if len(compact) >= 22 and not any(marker in compact for marker in complete_markers):
        return True

    return False


def is_weak_blank_answer(value: str) -> bool:
    cleaned = normalize_text(value)
    compact = compact_text(cleaned)

    if not compact:
        return True

    normalized_weak_words = {
        compact_text(word)
        for word in [*WEAK_BLANK_ANSWER_WORDS, *EXTRA_WEAK_BLANK_ANSWER_WORDS]
    }

    if compact in normalized_weak_words:
        return True

    if len(compact) <= 8 and compact.endswith(("적으로", "하게", "히")):
        return True

    if len(compact) <= 1:
        return True

    return False


def is_bad_blank_question_shape(question: str) -> bool:
    cleaned = normalize_text(question)
    compact = compact_text(cleaned)

    if not compact:
        return True

    if compact.startswith("___") or compact.endswith("___"):
        return True

    if "___:" in compact or ":___" in compact:
        return True

    left, _, right = cleaned.partition("___")
    if len(compact_text(left)) < 4 or len(compact_text(right)) < 4:
        return True

    return False


def is_valid_ox_statement(statement: str) -> bool:
    cleaned = normalize_text(statement)
    compact = compact_text(cleaned)
    normalized = normalize_for_match(cleaned)

    if len(compact) < 14:
        return False

    if "vs" in normalized:
        return False

    weak_endings = (
        "통해가",
        "시냅스가중",
        "이후의일",
        "것을",
        "관한",
        "통해",
        "위해",
        "나누",
    )
    if compact.endswith(weak_endings):
        return False

    predicate_markers = (
        "이다",
        "한다",
        "된다",
        "있다",
        "없다",
        "의미",
        "제공",
        "가능",
        "수행",
        "증가",
        "감소",
        "변화",
        "영향",
        "연관",
        "사용",
        "필요",
        "담당",
        "형성",
        "보유",
        "설명",
        "선택",
        "수정",
    )

    return any(marker in compact for marker in predicate_markers)


def is_answer_exposed_in_question(question: str, answer: str) -> bool:
    normalized_answer = normalize_for_match(answer)
    normalized_question = normalize_for_match(question)

    if not normalized_answer:
        return False

    return normalized_answer in normalized_question


def validate_quiz_type(quiz_type: str) -> Optional[JSONResponse]:
    normalized = normalize_quiz_type(quiz_type)
    canonical = canonicalize_quiz_type(normalized)

    if (
        normalized not in get_supported_input_quiz_types()
        and canonical not in get_supported_input_quiz_types()
    ):
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            (
                "지원하지 않는 quiz_type입니다. "
                "MIXED, MULTIPLE_CHOICE, OX, SHORT_ANSWER, SUBJECTIVE 중 하나를 사용하세요. "
                "기존 BLANK, DEFINITION, KEYWORD_CHOICE는 호환은 되지만 새 생성 로직에서는 권장하지 않습니다."
            ),
        )

    return None


def validate_quiz_status(status_value: str) -> Optional[JSONResponse]:
    if normalize_quiz_status(status_value) not in SUPPORTED_QUIZ_STATUSES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 status입니다. ACTIVE, DELETED 중 하나를 사용하세요.",
        )
    return None


def validate_quiz_set_status(status_value: str) -> Optional[JSONResponse]:
    if normalize_quiz_set_status(status_value) not in SUPPORTED_QUIZ_SET_STATUSES:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "지원하지 않는 quiz set status입니다. DRAFT, SENT, CLOSED 중 하나를 사용하세요.",
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


def validate_answer_text(answer: str) -> Optional[JSONResponse]:
    cleaned_answer = normalize_text(answer)

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

    return None


def validate_options_and_answer(
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    """
    객관식 보기와 정답의 기본 제약을 검증합니다.
    이 함수는 MULTIPLE_CHOICE 전용입니다.
    SHORT_ANSWER, SUBJECTIVE에는 사용하지 마세요.
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

    answer_error = validate_answer_text(cleaned_answer)
    if answer_error:
        return answer_error

    if cleaned_answer not in cleaned_options:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "answer는 options 안에 포함되어야 합니다.",
        )

    return None


def validate_active_quiz(
    question: str,
    options: List[str],
    answer: str,
) -> Optional[JSONResponse]:
    """
    기존 라우터 호환용 검증 함수입니다.
    기존 호출부는 quiz_type을 넘기지 않기 때문에 객관식 기준으로 검증합니다.

    새 타입을 정확히 검증하려면 validate_active_quiz_by_type()을 사용하세요.
    """
    question_error = validate_question_text(question)
    if question_error:
        return question_error

    options_error = validate_options_and_answer(options, answer)
    if options_error:
        return options_error

    return None


def validate_active_quiz_by_type(
    quiz_type: str,
    question: str,
    options: List[str],
    answer: str,
    explanation: Optional[str] = None,
) -> Optional[JSONResponse]:
    """
    새 타입 기준 ACTIVE 퀴즈 검증 함수입니다.
    라우터/서비스 수정 시 validate_active_quiz() 대신 이 함수를 사용하세요.
    """
    canonical_type = canonicalize_quiz_type(quiz_type)

    question_error = validate_question_text(question)
    if question_error:
        return question_error

    if canonical_type == "MULTIPLE_CHOICE":
        return validate_options_and_answer(options, answer)

    if canonical_type == "OX":
        cleaned_options = clean_options(options)

        if cleaned_options != ["O", "X"]:
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "OX 문제의 options는 ['O', 'X']여야 합니다.",
            )

        if normalize_text(answer) not in ["O", "X"]:
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "OX 문제의 answer는 O 또는 X여야 합니다.",
            )

        statement = normalize_text(question).split("\n\n")[-1].strip()
        if not is_valid_ox_statement(statement):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "OX 문제는 참/거짓 판단 가능한 완전한 명제여야 합니다.",
            )

        return None

    if canonical_type == "SHORT_ANSWER":
        if clean_options(options):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SHORT_ANSWER 문제의 options는 비워야 합니다.",
            )

        answer_error = validate_answer_text(answer)
        if answer_error:
            return answer_error

        if "___" not in normalize_text(question):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SHORT_ANSWER 문제에는 빈칸 표시 ___가 포함되어야 합니다.",
            )

        if is_bad_blank_question_shape(question):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SHORT_ANSWER 문제가 원문 조각 맞추기 형태입니다.",
            )

        if is_weak_blank_answer(answer):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SHORT_ANSWER 정답은 단순 부사/수식어가 아니라 핵심 개념어여야 합니다.",
            )

        if is_answer_exposed_in_question(question, answer):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "정답이 문제 문장에 그대로 노출되어 있습니다.",
            )

        return None

    if canonical_type == "SUBJECTIVE":
        if clean_options(options):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SUBJECTIVE 문제의 options는 비워야 합니다.",
            )

        answer_error = validate_answer_text(answer)
        if answer_error:
            return answer_error

        if is_cut_or_dangling_answer(answer):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SUBJECTIVE 모범답안이 중간에서 잘린 원문 조각입니다.",
            )

        if not normalize_text(explanation):
            return error_response(
                status.HTTP_400_BAD_REQUEST,
                "SUBJECTIVE 문제는 explanation에 채점 기준 또는 모범답안 해설이 필요합니다.",
            )

        return None

    return error_response(
        status.HTTP_400_BAD_REQUEST,
        "지원하지 않는 quiz_type입니다.",
    )


def validate_generated_multiple_choice(
    question: str,
    answer: str,
    options: List[str],
    option_count: int,
) -> Optional[str]:
    cleaned_options = clean_options(options)

    if len(cleaned_options) != option_count:
        return f"MULTIPLE_CHOICE options 개수는 {option_count}개여야 합니다."

    if has_duplicate_options(cleaned_options):
        return "MULTIPLE_CHOICE options에 중복된 값이 있습니다."

    if any(len(option) > MAX_OPTION_LENGTH for option in cleaned_options):
        return f"MULTIPLE_CHOICE 각 선택지는 {MAX_OPTION_LENGTH}자 이하여야 합니다."

    if answer not in cleaned_options:
        return "MULTIPLE_CHOICE answer는 options 안에 포함되어야 합니다."

    if is_answer_exposed_in_question(question, answer):
        return "정답이 문제 문장에 그대로 노출되어 있습니다."

    if is_cut_or_dangling_answer(answer):
        return "MULTIPLE_CHOICE 정답이 중간에서 잘린 원문 조각입니다."

    return None


def validate_generated_ox(
    question: str,
    answer: str,
    options: List[str],
) -> Optional[str]:
    cleaned_options = clean_options(options)

    if cleaned_options != ["O", "X"]:
        return "OX 문제의 options는 ['O', 'X']여야 합니다."

    if answer not in ["O", "X"]:
        return "OX 문제의 answer는 O 또는 X여야 합니다."

    statement = question.split("\n\n")[-1].strip()
    if not is_valid_ox_statement(statement):
        return "OX 문제는 참/거짓 판단 가능한 완전한 명제여야 합니다."

    return None


def validate_generated_short_answer(
    question: str,
    answer: str,
    options: List[str],
) -> Optional[str]:
    cleaned_options = clean_options(options)

    if cleaned_options:
        return "SHORT_ANSWER 문제의 options는 비워야 합니다."

    if "___" not in question:
        return "SHORT_ANSWER 문제에는 ___가 포함되어야 합니다."

    if is_bad_blank_question_shape(question):
        return "SHORT_ANSWER 문제가 원문 조각 맞추기 형태입니다."

    if is_weak_blank_answer(answer):
        return "SHORT_ANSWER 정답은 단순 부사/수식어가 아니라 핵심 개념어여야 합니다."

    if is_cut_or_dangling_answer(answer):
        return "SHORT_ANSWER 정답이 중간에서 잘린 원문 조각입니다."

    if is_answer_exposed_in_question(question, answer):
        return "정답이 문제 문장에 그대로 노출되어 있습니다."

    return None


def validate_generated_subjective(
    quiz_data: dict,
    question: str,
    answer: str,
    options: List[str],
) -> Optional[str]:
    cleaned_options = clean_options(options)

    if cleaned_options:
        return "SUBJECTIVE 문제의 options는 비워야 합니다."

    if is_cut_or_dangling_answer(answer):
        return "SUBJECTIVE 모범답안이 중간에서 잘린 원문 조각입니다."

    if len(compact_text(answer)) < 12:
        return "SUBJECTIVE 모범답안이 너무 짧습니다."

    explanation = normalize_text(quiz_data.get("explanation"))
    rubric = quiz_data.get("rubric") or quiz_data.get("grading_rubric") or []
    grading_keywords = quiz_data.get("grading_keywords") or quiz_data.get("accepted_keywords") or []

    has_rubric = isinstance(rubric, list) and any(normalize_text(item) for item in rubric)
    has_grading_keywords = isinstance(grading_keywords, list) and any(
        normalize_text(item) for item in grading_keywords
    )

    if not explanation and not has_rubric and not has_grading_keywords:
        return (
            "SUBJECTIVE 문제는 explanation, rubric, grading_keywords 중 "
            "최소 하나의 채점 기준이 필요합니다."
        )

    # 주관식은 질문에 핵심 개념명이 포함될 수 있으므로
    # 객관식처럼 answer 전체 노출 검사를 강하게 적용하지 않습니다.
    if normalize_for_match(answer) == normalize_for_match(question):
        return "SUBJECTIVE 문제와 모범답안이 동일합니다."

    return None


def validate_generated_quiz_dict(
    quiz_data: dict,
    option_count: int = 4,
) -> Optional[str]:
    """
    AI 생성 퀴즈를 저장하기 전에 검증합니다.

    새 정책:
    - MULTIPLE_CHOICE: options 필요, answer는 options 중 하나
    - OX: options는 ['O', 'X'], answer는 O 또는 X
    - SHORT_ANSWER: options 없음, answer는 직접 입력 정답
    - SUBJECTIVE: options 없음, answer는 모범답안, explanation/rubric 필요

    기존 타입 호환:
    - DEFINITION, KEYWORD_CHOICE -> MULTIPLE_CHOICE로 검증
    - BLANK -> SHORT_ANSWER로 검증
    """
    raw_quiz_type = normalize_quiz_type(quiz_data.get("quiz_type"))
    quiz_type = canonicalize_quiz_type(raw_quiz_type)

    question = normalize_text(quiz_data.get("question"))
    answer = normalize_text(quiz_data.get("answer"))
    source_sentence = normalize_text(quiz_data.get("source_sentence"))
    options = quiz_data.get("options") or []

    if (
        raw_quiz_type not in get_supported_generated_quiz_types()
        and quiz_type not in get_supported_generated_quiz_types()
    ):
        return "지원하지 않는 자동 생성 quiz_type입니다."

    if quiz_type not in NEW_SUPPORTED_GENERATED_QUIZ_TYPES:
        return "지원하지 않는 자동 생성 quiz_type입니다."

    if not question:
        return "question이 비어 있습니다."

    if question == "___":
        return "question이 빈칸만으로 구성되어 있습니다."

    if len(question) > MAX_QUESTION_LENGTH:
        return f"question은 {MAX_QUESTION_LENGTH}자 이하여야 합니다."

    if not answer:
        return "answer가 비어 있습니다."

    if len(answer) > MAX_ANSWER_LENGTH:
        return f"answer는 {MAX_ANSWER_LENGTH}자 이하여야 합니다."

    if source_sentence and is_cut_or_dangling_answer(source_sentence):
        return "source_sentence가 중간에서 잘린 원문 조각입니다."

    if not isinstance(options, list):
        return "options는 배열이어야 합니다."

    if quiz_type == "MULTIPLE_CHOICE":
        return validate_generated_multiple_choice(
            question=question,
            answer=answer,
            options=options,
            option_count=option_count,
        )

    if quiz_type == "OX":
        return validate_generated_ox(
            question=question,
            answer=answer,
            options=options,
        )

    if quiz_type == "SHORT_ANSWER":
        return validate_generated_short_answer(
            question=question,
            answer=answer,
            options=options,
        )

    if quiz_type == "SUBJECTIVE":
        return validate_generated_subjective(
            quiz_data=quiz_data,
            question=question,
            answer=answer,
            options=options,
        )

    return "지원하지 않는 자동 생성 quiz_type입니다."