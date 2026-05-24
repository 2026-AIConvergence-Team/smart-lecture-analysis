import json
import random
import re
from typing import Any, Dict, List, Optional, Tuple
import math

import app.models as models
from app.constants.quiz_constants import (
    AI_BATCH_MAX_KEYWORDS,
    AI_BATCH_MAX_SOURCE_SENTENCES,
    AI_BATCH_SIZE as AI_BATCH_SIZE,
    AI_PREFERRED_MIXED_QUIZ_TYPES,
    AI_TARGET_MAX_QUIZZES,
    AI_TARGET_MIN_QUIZZES,
    ALGORITHM_QUIZ_TYPES,
    ALLOWED_SHORT_CONCEPT_LABELS,
    BAD_EXAMPLE_CONCEPT_MARKERS,
    BAD_STANDALONE_ENGLISH_KEYWORDS,
    COMPLETE_PREDICATE_MARKERS,
    CONCEPT_LABEL_REPLACEMENTS,
    CORE_KEYWORD_REQUIRED_MARKERS,
    DANGLING_TEXT_ENDINGS,
    EXTRA_WEAK_BLANK_ANSWER_WORDS,
    GENERIC_BAD_CONCEPT_LABELS,
    LOW_QUALITY_TEXT_MARKERS,
    MAX_CONCEPT_LABEL_LENGTH,
    MAX_OPTION_LENGTH,
    MAX_SHORT_ANSWER_LENGTH,
    MAX_SOURCE_SENTENCE_LENGTH,
    MIN_QUESTION_CONTEXT_LENGTH,
    MIN_SOURCE_SENTENCE_COMPACT_LENGTH,
    QUESTION_LIKE_ENDINGS,
    QUESTION_UNSAFE_NEGATIVE_MARKERS,
    SENTENCE_LIKE_CONCEPT_FRAGMENTS,
    SERVICE_MAX_QUIZ_COUNT,
    SERVICE_MIN_QUIZ_COUNT,
    SHORT_ANSWER_SENTENCE_LIKE_MARKERS,
    SHORT_OPTION_FRAGMENT_MARKERS,
    SLIDE_ARTIFACT_CHARS,
    SOURCE_FACT_MARKERS,
    SOURCE_LABEL_SEPARATORS,
    TITLE_LIKE_SHORT_OPTION_MARKERS,
    UNSAFE_CONCEPT_LABEL_SUFFIXES,
    WEAK_BLANK_ANSWER_WORDS,
    MIN_DEFINITION_ANSWER_COMPACT_LENGTH,
)


def is_generic_bad_concept_label(value: str) -> bool:
    compact = normalize_for_match(value)

    if compact in {
        normalize_for_match(label)
        for label in GENERIC_BAD_CONCEPT_LABELS
    }:
        return True

    return is_bad_example_or_noise_label(value)


def infer_concept_label_from_source_sentence(source_sentence: str) -> Optional[str]:
    """
    원문 근거에서 퀴즈에 적합한 대표 개념명을 추론합니다.
    추출된 concept_name이 너무 넓거나 예시성 단어일 때 보정합니다.
    """
    compact = normalize_for_match(source_sentence)

    # Chapter 7 '학습하는 뇌' 자료에서 자주 누락되는 핵심 개념 보정
    if "안와전두피질" in compact:
        return "안와전두피질"

    if "보상예측오류" in compact or ("보상" in compact and "예측오류" in compact):
        return "보상예측오류"

    if "도파민" in compact:
        return "도파민"

    if "심적시뮬레이션" in compact:
        return "심적 시뮬레이션"

    if "장기적증강" in compact or "ltp" in compact:
        return "장기적 증강"

    if "시냅스가소성" in compact or (
        "시냅스" in compact
        and ("가중" in compact or "연결강도" in compact or "변" in compact)
    ):
        return "시냅스 가소성"

    if "시냅스" in compact and ("100조" in compact or "조개" in compact or "존재" in compact):
        return "시냅스"

    if "강화학습" in compact:
        return "강화학습 이론"

    if "안도" in compact:
        return "안도"

    if "습관" in compact and ("행동" in compact or "무의식" in compact):
        return "습관적 행동"

    # 예시 선택지만 담긴 실험 설명은 개념명으로 승격하지 않습니다.
    if "가위" in compact and "바위" in compact and "보" in compact:
        return None

    # 다른 강의 자료에서 반복된 추출 오류 보정
    if "화초" in compact and "곤충" in compact:
        return "공생적 분업"

    if "화폐" in compact and "분업" in compact:
        return "사회적 분업"

    if "본인대리인이론" in compact or "대리인이본인을위해서" in compact:
        return "본인-대리인 이론"

    if "rna" in compact and "dna" in compact and "단백질" in compact:
        return "RNA-DNA/단백질 위임"

    if "유전자" in compact and "뇌" in compact:
        return "유전자-뇌 관계"

    if "고용주" in compact and ("고용인" in compact or "직원" in compact):
        return "이해관계 불일치"

    if "지주" in compact and "소작농" in compact:
        return "지주-소작농 문제"

    if "보험" in compact and "가입자" in compact:
        return "도덕적 해이"

    if "장려책" in compact or "incentive" in compact:
        return "장려책"

    if "효용함수" in compact:
        return "효용함수"

    if "학습" in compact and "지능" in compact:
        return "학습"

    return None


def calculate_target_quiz_count(
    page_start: int,
    page_end: int,
    available_concept_count: int,
) -> int:
    """
    페이지 범위와 가용 개념 수를 기준으로 생성할 퀴즈 수를 정합니다.

    수업 중 이해도 확인 용도에서는 선택 범위의 핵심 개념을
    가능한 한 고르게 묻는 것이 우선입니다.
    """
    if available_concept_count <= 0:
        return 0

    page_count = max(1, page_end - page_start + 1)

    # 페이지당 1문제를 기본 목표로 삼고, 가용 개념 수와 서비스 한도를 함께 적용합니다.
    target_count = min(
        SERVICE_MAX_QUIZ_COUNT,
        available_concept_count,
        page_count,
    )

    # 충분한 개념이 있으면 서비스 최소 생성 수를 보장합니다.
    if available_concept_count >= SERVICE_MIN_QUIZ_COUNT:
        target_count = max(SERVICE_MIN_QUIZ_COUNT, target_count)

    return target_count


def parse_keywords(raw_keywords: Optional[str]) -> List[str]:
    if not raw_keywords:
        return []

    return unique_keep_order([
        keyword.strip()
        for keyword in raw_keywords.split(",")
        if keyword and keyword.strip()
    ])


def parse_sentences(raw_sentences: Optional[str]) -> List[str]:
    if not raw_sentences:
        return []

    try:
        data = json.loads(raw_sentences)
        if isinstance(data, list):
            return unique_keep_order([
                normalize_text_item(str(sentence))
                for sentence in data
                if normalize_text_item(str(sentence))
            ])
    except Exception:
        pass

    return unique_keep_order([
        normalize_text_item(sentence)
        for sentence in raw_sentences.split(".")
        if normalize_text_item(sentence)
    ])


def serialize_options(options: List[str]) -> str:
    return json.dumps(options, ensure_ascii=False)


def deserialize_options(raw_options: str) -> List[str]:
    try:
        data = json.loads(raw_options)
        if isinstance(data, list):
            return [str(item) for item in data]
    except Exception:
        pass

    return []


def strip_slide_artifacts(value: str) -> str:
    cleaned = str(value or "")

    for char in SLIDE_ARTIFACT_CHARS:
        cleaned = cleaned.replace(char, " ")

    # PPT/PDF 추출 중 bullet 문자가 텍스트 앞에 붙은 경우를 정리합니다.
    cleaned = re.sub(r"^[\s\-–—·•‣▪▶→➔]+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)

    return cleaned.strip()


def normalize_text_item(value: str) -> str:
    return " ".join(strip_slide_artifacts(str(value)).strip().split())


def compact_text(value: str) -> str:
    return re.sub(r"\s+", "", str(value or "").strip())


def unique_keep_order(items: List[str]) -> List[str]:
    result = []
    seen = set()

    for item in items:
        cleaned = normalize_text_item(item)
        if not cleaned:
            continue

        key = compact_text(cleaned).lower()
        if key not in seen:
            seen.add(key)
            result.append(cleaned)

    return result



def has_enough_meaning(value: str) -> bool:
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if len(compact) < 2:
        return False

    if compact.isdigit():
        return False

    return True


def is_good_short_answer(value: str) -> bool:
    cleaned = normalize_text_item(value)

    if not has_enough_meaning(cleaned):
        return False

    if has_bad_slide_symbol(cleaned):
        return False

    if is_bad_example_or_noise_label(cleaned):
        return False

    if is_title_like_short_option(cleaned):
        return False

    if len(cleaned) > MAX_SHORT_ANSWER_LENGTH:
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_generic_bad_concept_label(cleaned):
        return False

    if is_cut_or_dangling_text(cleaned):
        return False
    
    if len(compact_text(cleaned)) > 14 and any(
        marker in compact_text(cleaned)
        for marker in SHORT_ANSWER_SENTENCE_LIKE_MARKERS
    ):
        return False

    return True


def is_weak_blank_answer(value: str) -> bool:
    cleaned = normalize_text_item(value)
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

    weak_verb_endings = (
        "나누",
        "확인",
        "수행",
        "사용",
        "제시",
        "증가",
        "감소",
        "변화",
        "선택",
        "계산",
        "전달",
        "수정",
    )

    if compact.endswith(weak_verb_endings):
        return True

    return False


def is_good_blank_answer(value: str) -> bool:
    return is_good_short_answer(value) and not is_weak_blank_answer(value)


def is_good_option_candidate(value: str) -> bool:
    cleaned = normalize_text_item(value)

    if has_bad_slide_symbol(value):
        return False

    if not has_enough_meaning(cleaned):
        return False

    if len(cleaned) > MAX_OPTION_LENGTH:
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_cut_or_dangling_text(cleaned):
        return False
    
    return True


def is_good_source_sentence(value: str) -> bool:
    if has_bad_slide_symbol(value):
        return False

    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not has_enough_meaning(cleaned):
        return False

    if len(compact) < MIN_SOURCE_SENTENCE_COMPACT_LENGTH:
        return False

    if len(cleaned) > MAX_SOURCE_SENTENCE_LENGTH:
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_cut_or_dangling_text(cleaned):
        return False
    
    if is_question_like_text(cleaned):
        return False

    if not has_fact_marker(cleaned):
        return False

    if is_weak_source_fragment(cleaned):
        return False

    return True


def is_meaningful_blank_question(question: str) -> bool:
    cleaned = normalize_text_item(question)

    if "___" not in cleaned:
        return False

    if cleaned == "___":
        return False

    context = normalize_text_item(cleaned.replace("___", ""))
    if len(compact_text(context)) < MIN_QUESTION_CONTEXT_LENGTH:
        return False

    return True


def normalize_for_match(value: str) -> str:
    return re.sub(
        r"[^0-9A-Za-z가-힣]",
        "",
        str(value or "").lower(),
    )

def is_bad_example_or_noise_label(value: str) -> bool:
    cleaned = normalize_text_item(value)
    normalized = normalize_for_match(cleaned)

    if not normalized:
        return True

    if any(marker in normalized for marker in BAD_EXAMPLE_CONCEPT_MARKERS):
        return True

    if normalized in BAD_STANDALONE_ENGLISH_KEYWORDS:
        return True

    return False


def looks_like_core_quiz_keyword(value: str) -> bool:
    cleaned = normalize_text_item(value)
    normalized = normalize_for_match(cleaned)

    if not normalized:
        return False

    if is_bad_example_or_noise_label(cleaned):
        return False

    if is_title_like_short_option(cleaned):
        return False

    # 한글/영문 혼합 핵심어는 허용하되, 단독 영단어 노이즈는 제외합니다.
    if re.fullmatch(r"[A-Za-z]+", cleaned) and normalized not in {"ltp", "td"}:
        return normalized in {"dopamine"}

    if len(normalized) <= 2 and cleaned not in ALLOWED_SHORT_CONCEPT_LABELS:
        return False

    return any(marker in normalized for marker in CORE_KEYWORD_REQUIRED_MARKERS)


def has_bad_slide_symbol(value: str) -> bool:
    return any(char in str(value or "") for char in SLIDE_ARTIFACT_CHARS)


def has_complete_predicate(value: str) -> bool:
    compact = compact_text(value)
    return any(marker in compact for marker in COMPLETE_PREDICATE_MARKERS)


def is_cut_or_dangling_text(value: str) -> bool:
    """
    PDF 추출 과정에서 중간에 끊긴 문장과 원문 조각을 걸러냅니다.
    예: '... 의사결정과정에 영향을', '만약 ... 이것이'
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not compact:
        return True

    # 조사나 어미가 앞뒤에 붙은 짧은 원문 조각은 제외합니다.
    # 예: 을수행, 의원숭이실험
    if len(compact) <= 10:
        if compact.startswith(("을", "를", "의", "에", "와", "과")):
            return True

        if compact.endswith((
            "수행",
            "실험",
            "부분",
            "부위",
            "경우",
            "과정",
            "방법",
            "결과",
            "상태",
            "때",
            "하",
        )):
            return True

        # 짧은 한글 후보라도 동작명이나 조각형 표현이면 제외합니다.
        if any(marker in compact for marker in ("나누", "설정", "시행", "선택")):
            return True

        return False

    # 긴 문장이 '...라고 하', '...아니라고 하'처럼 종결 전에 끊긴 경우
    if compact.endswith((
        "라고하",
        "다고하",
        "한다고하",
        "아니라고하",
        "것이라고하",
    )):
        return True

    if compact.endswith(DANGLING_TEXT_ENDINGS):
        return True

    dangling_phrases = (
        "영향을",
        "이것이",
        "것을",
        "것이",
        "하기위해",
        "하기위한",
        "할수있는",
        "나누고",
        "설정하고",
    )
    if compact.endswith(dangling_phrases):
        return True

    if cleaned.count("(") != cleaned.count(")"):
        return True

    if cleaned.count("[") != cleaned.count("]"):
        return True

    # 긴 텍스트에 서술 종결이나 사실 표지가 없으면 제목/조각일 가능성이 큽니다.
    if len(compact) >= 22 and not has_complete_predicate(cleaned):
        return True

    return False


def is_definition_answer_quality(answer: str, source_sentence: str) -> bool:
    """
    DEFINITION 보기/정답이 완전한 근거 문장인지 검증합니다.
    긴 설명형 답변은 source_sentence와 사실상 같은 근거를 공유해야 합니다.
    """
    cleaned_answer = normalize_text_item(answer)
    cleaned_source = normalize_text_item(source_sentence)

    if not cleaned_answer or not cleaned_source:
        return False

    if is_cut_or_dangling_text(cleaned_answer):
        return False

    if is_cut_or_dangling_text(cleaned_source):
        return False

    if len(compact_text(cleaned_answer)) < MIN_DEFINITION_ANSWER_COMPACT_LENGTH:
        return False

    normalized_answer = normalize_for_match(cleaned_answer)
    normalized_source = normalize_for_match(cleaned_source)

    if normalized_answer == normalized_source:
        return True

    # 긴 설명형 보기가 원문 근거와 다르면 근거 불일치로 간주합니다.
    if len(compact_text(cleaned_answer)) > MAX_SHORT_ANSWER_LENGTH:
        return normalized_answer in normalized_source or normalized_source in normalized_answer

    return is_answer_grounded_in_source(cleaned_answer, cleaned_source)

def is_title_like_short_option(value: str) -> bool:
    """
    짧은 보기처럼 보이지만 실제로는 슬라이드 제목/소제목인 후보를 제거합니다.
    예: 절차학습은뇌의어디 기저핵, 후회와안와전두피질 블레즈파스칼,
        신경세포와학습 시냅스가중치
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)
    normalized = normalize_for_match(cleaned)

    if not normalized:
        return True

    if any(marker in normalized for marker in TITLE_LIKE_SHORT_OPTION_MARKERS):
        return True

    # 의문사가 포함된 후보는 개념어보다 슬라이드 질문 제목일 가능성이 높습니다.
    if any(marker in normalized for marker in ("어디", "무엇", "어떻게", "왜")):
        return True

    # 'A와 B C' 형태의 제목형 조각을 걸러냅니다.
    title_pair_markers = (
        "와학습",
        "과학습",
        "와기억",
        "과기억",
        "와피질",
        "과피질",
        "와안와전두피질",
        "과안와전두피질",
    )
    if any(marker in normalized for marker in title_pair_markers):
        return True

    # 여러 개념/제목 단위가 억지로 이어붙은 짧은 후보를 제외합니다.
    if len(compact) >= 14 and " " in cleaned:
        left, right = cleaned.split(" ", 1)
        if (
            len(normalize_for_match(left)) >= 5
            and len(normalize_for_match(right)) >= 3
            and any(marker in normalize_for_match(left) for marker in ("은", "는", "와", "과"))
        ):
            return True

    return False


def is_fragment_like_short_option(value: str) -> bool:
    """
    BLANK/KEYWORD_CHOICE 보기로 부적합한 짧은 원문 조각을 제거합니다.
    예: 을수행, 의원숭이실험, 예상치못하게과일주스를받을때
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)
    normalized = normalize_for_match(cleaned)

    if not compact:
        return True

    if is_generic_bad_concept_label(cleaned):
        return True

    if is_bad_example_or_noise_label(cleaned):
        return True

    if is_title_like_short_option(cleaned):
        return True

    if any(marker in normalized for marker in SHORT_OPTION_FRAGMENT_MARKERS):
        return True

    if compact.startswith(("을", "를", "의", "에", "와", "과")):
        return True

    if compact.endswith((
        "수행",
        "실험",
        "시행",
        "선택",
        "설정",
        "확인",
        "증가",
        "감소",
        "변화",
        "때",
        "경우",
        "과정",
        "방법",
        "결과",
        "상태",
        "가중치",
    )):
        return True

    # 공백 없이 과도하게 긴 문장형 조각은 핵심어 보기로 보지 않습니다.
    if len(compact) >= 18 and " " not in cleaned and not re.search(r"[A-Za-z]", cleaned):
        return True

    return False


def is_good_short_option_candidate(value: str) -> bool:
    """
    BLANK/KEYWORD_CHOICE 보기 후보를 검증합니다.
    핵심어 또는 짧은 명사구만 허용합니다.
    """
    cleaned = normalize_text_item(value)

    if not is_good_short_answer(cleaned):
        return False

    if is_fragment_like_short_option(cleaned):
        return False

    if not looks_like_core_quiz_keyword(cleaned):
        return False

    return True


def is_good_definition_option_candidate(value: str) -> bool:
    """
    DEFINITION 보기 후보를 검증합니다.
    완전한 설명 문장 또는 '개념: 설명' 형태만 허용합니다.
    """
    cleaned = normalize_text_item(value)

    if not is_good_option_candidate(cleaned):
        return False

    if is_bad_example_or_noise_label(cleaned):
        return False

    if not is_good_source_sentence(cleaned):
        return False

    if not is_definition_answer_quality(cleaned, cleaned):
        return False

    return True


def is_bad_blank_question_shape(question: str) -> bool:
    """
    BLANK 문제가 원문 조각 맞추기로 변질되는 경우를 차단합니다.
    예: ___고T자미로실험수행, 부위에...것을___
    """
    cleaned = normalize_text_item(question)
    compact = compact_text(cleaned)

    if not compact:
        return True

    if compact.startswith("___") or compact.endswith("___"):
        return True

    if "___:" in compact or ":___" in compact:
        return True

    # 빈칸 앞뒤 문맥이 너무 짧으면 개념 이해보다 문장 기억 문제가 됩니다.
    left, _, right = cleaned.partition("___")
    if len(compact_text(left)) < 4 or len(compact_text(right)) < 4:
        return True

    return False


def is_weak_source_fragment(value: str) -> bool:
    """
    source_sentence가 제목, 조각, 비교 항목만 담은 경우를 차단합니다.
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)
    normalized = normalize_for_match(cleaned)

    if len(compact) < 14:
        return True

    if is_cut_or_dangling_text(cleaned):
        return True
    
    if "vs" in normalized and not any(
        marker in normalized
        for marker in ("설명", "비교", "제공", "유리", "불리", "선택", "가능", "적합")
    ):
        return True

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
        return True

    return False


def is_valid_ox_statement(statement: str) -> bool:
    """
    OX 문항으로 사용할 수 있는 참/거짓 명제인지 확인합니다.
    제목, 비교 항목, 단순 키워드 나열은 제외합니다.
    """
    cleaned = normalize_text_item(statement)
    compact = compact_text(cleaned)
    normalized = normalize_for_match(cleaned)

    if is_weak_source_fragment(cleaned):
        return False

    if "vs" in normalized:
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


def is_answer_exactly_required_in_source(answer: str) -> bool:
    """
    숫자/수량 정답은 source_sentence에 정확히 포함되어야 합니다.
    예: 100조개 문제인데 source_sentence에 100조개가 없으면 근거 불일치입니다.
    """
    return bool(re.search(r"\d", str(answer or "")))


def is_answer_grounded_in_source(answer: str, source_sentence: str) -> bool:
    normalized_answer = normalize_for_match(answer)
    normalized_source = normalize_for_match(source_sentence)

    if not normalized_answer or not normalized_source:
        return False

    if normalized_answer in normalized_source:
        return True

    if is_answer_exactly_required_in_source(answer):
        return False

    return True


def contains_low_quality_marker(value: str) -> bool:
    normalized = normalize_for_match(value)
    return any(
        normalize_for_match(marker) in normalized
        for marker in LOW_QUALITY_TEXT_MARKERS
    )


def is_safe_concept_label(value: str) -> bool:
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not has_enough_meaning(cleaned):
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_generic_bad_concept_label(cleaned):
        return False

    if is_bad_example_or_noise_label(cleaned):
        return False

    if has_bad_slide_symbol(value):
        return False

    if len(compact) <= 2 and cleaned not in ALLOWED_SHORT_CONCEPT_LABELS:
        return False

    if is_cut_or_dangling_text(cleaned):
        return False
    
    if len(compact) > MAX_CONCEPT_LABEL_LENGTH:
        return False

    if compact.endswith(UNSAFE_CONCEPT_LABEL_SUFFIXES):
        return False

    # 조사/서술어가 붙은 문장 조각은 개념명으로 사용하지 않습니다.
    if len(compact) >= 7 and any(
        fragment in compact
        for fragment in SENTENCE_LIKE_CONCEPT_FRAGMENTS
    ):
        return False

    return True


def get_safe_keywords(concept: models.Concept) -> List[str]:
    return unique_keep_order([
        keyword
        for keyword in parse_keywords(concept.keywords)
        if is_safe_concept_label(keyword)
    ])


def select_best_source_sentence(
    concept: models.Concept,
    concept_label: str,
) -> Optional[str]:
    sentences = [
        sentence
        for sentence in parse_sentences(concept.sentences)
        if is_good_source_sentence(sentence)
    ]

    if not sentences:
        return None

    support_terms = unique_keep_order([
        concept_label,
        *get_safe_keywords(concept),
    ])

    scored_sentences = []

    for sentence in sentences:
        score = 0
        normalized_sentence = normalize_for_match(sentence)

        for term in support_terms:
            normalized_term = normalize_for_match(term)

            if len(normalized_term) < 3:
                continue

            if normalized_term in normalized_sentence:
                score += 3

            # 긴 키워드는 일부만 겹쳐도 같은 개념을 설명하는 문장일 수 있습니다.
            if len(normalized_term) >= 8 and normalized_term[:6] in normalized_sentence:
                score += 1

        scored_sentences.append((score, len(sentence), sentence))

    scored_sentences.sort(key=lambda item: (item[0], -item[1]), reverse=True)

    best_score, _, best_sentence = scored_sentences[0]

    if best_score <= 0:
        return None

    return best_sentence


def has_fact_marker(value: str) -> bool:
    compact = compact_text(value)
    return any(marker in compact for marker in SOURCE_FACT_MARKERS)


def is_question_like_text(value: str) -> bool:
    compact = compact_text(value)

    if "?" in compact or "？" in compact:
        return True

    return compact.endswith(QUESTION_LIKE_ENDINGS)


def has_unsafe_negative_question(question: str) -> bool:
    compact = compact_text(question)
    return any(marker in compact for marker in QUESTION_UNSAFE_NEGATIVE_MARKERS)


def get_concept_label(concept: models.Concept) -> str:
    """
    퀴즈에 노출할 대표 개념명을 source_sentence와 keyword 기반으로 보정합니다.
    """
    source_sentences = [
        normalize_text_item(sentence)
        for sentence in parse_sentences(concept.sentences)
        if normalize_text_item(sentence)
    ]

    # 1) 근거 문장에서 명확히 추론되는 강의 핵심 개념을 우선합니다.
    for source_sentence in source_sentences:
        inferred_label = infer_concept_label_from_source_sentence(source_sentence)
        if inferred_label and is_safe_concept_label(inferred_label):
            return inferred_label

    # 2) '개념명: 설명' 형태에서는 구분자 앞부분을 label 후보로 사용합니다.
    for source_sentence in source_sentences:
        source_label = split_source_label(source_sentence)
        if source_label and is_safe_concept_label(source_label):
            return source_label

    normalized_sources = " ".join(
        normalize_for_match(sentence)
        for sentence in source_sentences
    )

    # 3) 원본 concept_name은 안전하고 근거 문장에도 등장할 때만 사용합니다.
    concept_name = simplify_concept_label(concept.concept_name)
    normalized_concept_name = normalize_for_match(concept_name)

    if (
        concept_name
        and is_safe_concept_label(concept_name)
        and len(normalized_concept_name) >= 3
        and normalized_concept_name in normalized_sources
    ):
        return concept_name

    # 4) keyword 중 근거 문장에 실제 등장하는 안전한 핵심어를 사용합니다.
    safe_keywords = get_safe_keywords_for_ai(concept)
    for keyword in safe_keywords:
        normalized_keyword = normalize_for_match(keyword)
        if len(normalized_keyword) >= 3 and normalized_keyword in normalized_sources:
            return keyword

    # 5) 마지막으로 안전한 keyword 하나를 fallback으로 사용합니다.
    if safe_keywords:
        return safe_keywords[0]

    return ""


def find_answer_keyword(sentence: str, keywords: List[str]) -> Optional[str]:
    """
    빈칸 처리 후에도 충분한 문맥이 남는 정답 키워드를 선택합니다.
    """
    candidates = []

    for keyword in keywords:
        cleaned_keyword = normalize_text_item(keyword)
        if not is_good_blank_answer(cleaned_keyword):
            continue

        if cleaned_keyword not in sentence:
            continue

        question = sentence.replace(cleaned_keyword, "___", 1)

        if not is_meaningful_blank_question(question):
            continue

        if is_bad_blank_question_shape(question):
            continue

        candidates.append(cleaned_keyword)

    if not candidates:
        return None

    # 짧고 모호한 후보보다 구체적인 핵심어를 우선합니다.
    candidates = sorted(
        candidates,
        key=lambda item: (len(compact_text(item)), len(item)),
        reverse=True,
    )

    return candidates[0]


def build_keyword_pool(concepts: List[models.Concept]) -> List[str]:
    """
    BLANK 보기 후보에는 원본 keyword 전체가 아니라 검증된 핵심 개념어만 사용합니다.
    일반 영단어, 실험 예시, 문장 조각이 보기로 섞이는 것을 막습니다.
    """
    pool = []

    for concept in concepts:
        concept_label = get_concept_label(concept)
        if is_good_short_option_candidate(concept_label):
            pool.append(concept_label)

        for keyword in get_safe_keywords_for_ai(concept):
            if is_good_short_option_candidate(keyword):
                pool.append(keyword)

    return unique_keep_order(pool)


def build_sentence_pool(concepts: List[models.Concept]) -> List[str]:
    pool = []

    for concept in concepts:
        for sentence in parse_sentences(concept.sentences):
            if is_good_source_sentence(sentence):
                pool.append(sentence)

    return unique_keep_order(pool)


def build_concept_name_pool(concepts: List[models.Concept]) -> List[str]:
    return unique_keep_order([
        get_concept_label(concept)
        for concept in concepts
        if is_good_short_option_candidate(get_concept_label(concept))
    ])


def is_similar_text(a: str, b: str) -> bool:
    compact_a = compact_text(a).lower()
    compact_b = compact_text(b).lower()

    if not compact_a or not compact_b:
        return False

    if compact_a == compact_b:
        return True

    if compact_a in compact_b or compact_b in compact_a:
        return True

    return False


def is_valid_option_for_mode(value: str, option_mode: str) -> bool:
    normalized_mode = normalize_text_item(option_mode).upper()

    if normalized_mode == "SHORT":
        return is_good_short_option_candidate(value)

    if normalized_mode == "DEFINITION":
        return is_good_definition_option_candidate(value)

    return is_good_option_candidate(value)


def rank_wrong_candidates(
    answer: str,
    candidates: List[str],
    option_mode: str = "GENERIC",
) -> List[str]:
    cleaned_answer = normalize_text_item(answer)
    answer_len = len(compact_text(cleaned_answer))
    normalized_mode = normalize_text_item(option_mode).upper()

    filtered = []

    for candidate in candidates:
        cleaned_candidate = normalize_text_item(candidate)

        if not is_valid_option_for_mode(cleaned_candidate, normalized_mode):
            continue

        if is_similar_text(cleaned_answer, cleaned_candidate):
            continue

        candidate_len = len(compact_text(cleaned_candidate))
        length_gap = abs(answer_len - candidate_len)

        # SHORT는 길이가 비슷한 개념어, DEFINITION은 설명성이 있는 문장을 우선합니다.
        if normalized_mode == "SHORT":
            mode_score = 0
            if candidate_len <= MAX_SHORT_ANSWER_LENGTH:
                mode_score -= 2
            if " " in cleaned_candidate or re.search(r"[A-Za-z]", cleaned_candidate):
                mode_score -= 1
        elif normalized_mode == "DEFINITION":
            mode_score = 0
            if split_source_label(cleaned_candidate):
                mode_score -= 2
            if has_complete_predicate(cleaned_candidate):
                mode_score -= 1
        else:
            mode_score = 0

        filtered.append((mode_score, length_gap, random.random(), cleaned_candidate))

    filtered.sort(key=lambda item: (item[0], item[1], item[2]))

    return unique_keep_order([item[3] for item in filtered])


def build_options(
    answer: str,
    candidates: List[str],
    option_count: int,
    seed: Optional[int] = None,
    option_mode: str = "GENERIC",
) -> Optional[List[str]]:
    cleaned_answer = normalize_text_item(answer)
    normalized_mode = normalize_text_item(option_mode).upper()

    if not is_valid_option_for_mode(cleaned_answer, normalized_mode):
        return None

    wrong_candidates = rank_wrong_candidates(
        answer=cleaned_answer,
        candidates=candidates,
        option_mode=normalized_mode,
    )

    needed_wrong_count = option_count - 1
    if len(wrong_candidates) < needed_wrong_count:
        return None

    rng = random.Random(seed)
    selected_wrong = wrong_candidates[:needed_wrong_count]

    options = [cleaned_answer] + selected_wrong
    rng.shuffle(options)

    return options


def make_explanation(
    quiz_type: str,
    concept_name: str,
    answer: str,
    source_sentence: str,
) -> str:
    concept_label = normalize_text_item(concept_name)

    if quiz_type == "OX":
        return f"원문 근거: {source_sentence}"

    if quiz_type == "DEFINITION":
        return f"'{concept_label}' 개념과 연결된 설명입니다. 원문 근거: {source_sentence}"

    if quiz_type == "KEYWORD_CHOICE":
        return f"제시된 설명은 '{answer}' 개념에 대한 설명입니다. 원문 근거: {source_sentence}"

    return f"정답은 '{answer}'입니다. 원문 근거: {source_sentence}"


def generate_blank_quiz(
    concept: models.Concept,
    all_keywords: List[str],
    option_count: int,
    index_seed: int = 0,
) -> Optional[Dict]:
    keywords = parse_keywords(concept.keywords)
    concept_label = get_concept_label(concept)

    if concept_label:
        keywords = [concept_label] + keywords

    keywords = unique_keep_order(keywords)
    sentences = parse_sentences(concept.sentences)

    if not sentences:
        return None

    for offset in range(len(sentences)):
        sentence = sentences[(index_seed + offset) % len(sentences)]

        if not is_good_source_sentence(sentence):
            continue

        answer = find_answer_keyword(sentence, keywords)
        if not answer:
            continue

        question = sentence.replace(answer, "___", 1)

        if not is_meaningful_blank_question(question):
            continue

        options = build_options(
            answer=answer,
            candidates=all_keywords,
            option_count=option_count,
            seed=index_seed + offset,
            option_mode="SHORT",
        )
        if not options:
            continue

        return {
            "quiz_type": "BLANK",
            "question": question,
            "options": options,
            "answer": answer,
            "explanation": make_explanation(
                "BLANK",
                concept_label,
                answer,
                sentence,
            ),
            "source_sentence": sentence,
        }

    return None


def generate_definition_quiz(
    concept: models.Concept,
    all_sentences: List[str],
    option_count: int,
    index_seed: int = 0,
) -> Optional[Dict]:
    concept_label = get_concept_label(concept)

    if not concept_label:
        return None

    answer = select_best_source_sentence(
        concept=concept,
        concept_label=concept_label,
    )

    if not answer:
        return None

    if not is_definition_answer_quality(answer, answer):
        return None
    
    question = f"다음 중 '{concept_label}' 개념을 가장 잘 설명하는 것은 무엇인가요?"

    options = build_options(
        answer=answer,
        candidates=all_sentences,
        option_count=option_count,
        seed=index_seed,
        option_mode="DEFINITION",
    )

    if not options:
        return None

    return {
        "quiz_type": "DEFINITION",
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": make_explanation(
            "DEFINITION",
            concept_label,
            answer,
            answer,
        ),
        "source_sentence": answer,
    }


def generate_keyword_choice_quiz(
    concept: models.Concept,
    all_concept_names: List[str],
    option_count: int,
    index_seed: int = 0,
) -> Optional[Dict]:
    answer = get_concept_label(concept)

    if not answer:
        return None

    source_sentence = select_best_source_sentence(
        concept=concept,
        concept_label=answer,
    )

    if not source_sentence:
        return None

    # 설명에 정답이 그대로 노출된 문항은 제외합니다.
    if normalize_for_match(answer) in normalize_for_match(source_sentence):
        return None

    question = f"다음 설명에 해당하는 핵심 개념은 무엇인가요?\n\n{source_sentence}"

    options = build_options(
        answer=answer,
        candidates=all_concept_names,
        option_count=option_count,
        seed=index_seed,
        option_mode="SHORT",
    )

    if not options:
        return None

    return {
        "quiz_type": "KEYWORD_CHOICE",
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": make_explanation(
            "KEYWORD_CHOICE",
            answer,
            answer,
            source_sentence,
        ),
        "source_sentence": source_sentence,
    }


def generate_ox_quiz(
    concept: models.Concept,
    all_keywords: List[str],
    index_seed: int,
) -> Optional[Dict]:
    concept_label = get_concept_label(concept)

    if not concept_label:
        return None

    source_sentence = select_best_source_sentence(
        concept=concept,
        concept_label=concept_label,
    )

    if not source_sentence:
        return None

    if is_question_like_text(source_sentence):
        return None

    # '개념: 설명' 형태는 DEFINITION에 더 적합하므로 OX에서는 제외합니다.
    if ":" in source_sentence or "：" in source_sentence:
        return None

    # 너무 짧은 문장은 OX로 만들면 단순 암기 확인에 그치기 쉽습니다.
    if len(compact_text(source_sentence)) < 22:
        return None

    if not is_valid_ox_statement(source_sentence):
        return None

    return {
        "quiz_type": "OX",
        "question": f"다음 설명이 맞으면 O, 틀리면 X를 선택하세요.\n\n{source_sentence}",
        "options": ["O", "X"],
        "answer": "O",
        "explanation": make_explanation(
            "OX",
            concept_label,
            "O",
            source_sentence,
        ),
        "source_sentence": source_sentence,
    }


def get_generation_types(quiz_type: str) -> List[str]:
    normalized_quiz_type = quiz_type.strip().upper()
    if normalized_quiz_type == "MIXED":
        return ALGORITHM_QUIZ_TYPES
    return [normalized_quiz_type]


def generate_single_quiz(
    concept: models.Concept,
    selected_quiz_type: str,
    all_keywords: List[str],
    all_sentences: List[str],
    all_concept_names: List[str],
    option_count: int,
    index_seed: int,
) -> Optional[Dict]:
    if selected_quiz_type == "BLANK":
        return generate_blank_quiz(
            concept=concept,
            all_keywords=all_keywords,
            option_count=option_count,
            index_seed=index_seed,
        )

    if selected_quiz_type == "DEFINITION":
        return generate_definition_quiz(
            concept=concept,
            all_sentences=all_sentences,
            option_count=option_count,
            index_seed=index_seed,
        )

    if selected_quiz_type == "KEYWORD_CHOICE":
        return generate_keyword_choice_quiz(
            concept=concept,
            all_concept_names=all_concept_names,
            option_count=option_count,
            index_seed=index_seed,
        )

    if selected_quiz_type == "OX":
        return generate_ox_quiz(
            concept=concept,
            all_keywords=all_keywords,
            index_seed=index_seed,
        )

    return None


def sanitize_quiz_payload(quiz_data: Dict) -> Dict:
    """
    PDF/PPT bullet 기호를 제거하고 문자열 필드를 일관되게 정규화합니다.
    """
    cleaned = dict(quiz_data)

    for key in ("quiz_type", "question", "answer", "explanation", "source_sentence", "concept_name"):
        if key in cleaned and cleaned.get(key) is not None:
            cleaned[key] = normalize_text_item(str(cleaned.get(key)))

    raw_options = cleaned.get("options") or []
    if isinstance(raw_options, list):
        cleaned["options"] = unique_keep_order([
            normalize_text_item(str(option))
            for option in raw_options
            if normalize_text_item(str(option))
        ])

    return cleaned


def get_quiz_duplicate_signature(quiz: Dict) -> Tuple:
    """
    concept_id, quiz_type, answer, source 조합으로 중복 문항을 판별합니다.
    AI 생성 결과와 fallback 결과가 섞일 때 같은 문제가 반복 저장되는 것을 막습니다.
    """
    return (
        quiz.get("concept_id"),
        normalize_text_item(str(quiz.get("quiz_type") or "")).upper(),
        normalize_for_match(str(quiz.get("answer") or "")),
        normalize_for_match(str(quiz.get("source_sentence") or "")),
    )


def attach_concept_metadata(quiz_data: Dict, concept: models.Concept) -> Dict:
    concept_label = get_concept_label(concept)

    quiz_data = sanitize_quiz_payload(quiz_data)
    quiz_data["lecture_id"] = concept.lecture_id
    quiz_data["concept_id"] = concept.id
    quiz_data["concept_name"] = concept_label or concept.concept_name
    quiz_data["concept_keywords"] = [
        keyword
        for keyword in get_safe_keywords_for_ai(concept)
        if is_good_short_option_candidate(keyword)
    ]
    quiz_data["page_num"] = concept.page_num
    return quiz_data


def is_low_quality_generated_quiz(
    quiz: Dict,
    option_count: int,
) -> bool:
    quiz = sanitize_quiz_payload(quiz)

    quiz_type = str(quiz.get("quiz_type") or "").strip().upper()
    question = normalize_text_item(str(quiz.get("question") or ""))
    answer = normalize_text_item(str(quiz.get("answer") or ""))
    source_sentence = normalize_text_item(str(quiz.get("source_sentence") or ""))
    concept_name = normalize_text_item(str(quiz.get("concept_name") or ""))

    raw_options = quiz.get("options") or []
    if not isinstance(raw_options, list):
        return True

    options = [
        normalize_text_item(str(option))
        for option in raw_options
        if normalize_text_item(str(option))
    ]

    if quiz_type not in ALGORITHM_QUIZ_TYPES:
        return True

    if concept_name and not is_safe_concept_label(concept_name):
        return True

    if concept_name and is_bad_example_or_noise_label(concept_name):
        return True

    if not question or not answer:
        return True

    if len(compact_text(question)) < MIN_QUESTION_CONTEXT_LENGTH:
        return True

    if not source_sentence:
        return True

    if not is_good_source_sentence(source_sentence):
        return True

    if any(is_cut_or_dangling_text(option) for option in options):
        return True

    if quiz_type in {"BLANK", "KEYWORD_CHOICE"}:
        if any(not is_good_short_option_candidate(option) for option in options):
            return True

    if quiz_type == "DEFINITION":
        if any(not is_good_definition_option_candidate(option) for option in options):
            return True
        
    if answer not in options:
        return True

    if len(options) != len(unique_keep_order(options)):
        return True

    if contains_low_quality_marker(question):
        return True

    if contains_low_quality_marker(answer):
        return True

    if any(contains_low_quality_marker(option) for option in options):
        return True

    if has_unsafe_negative_question(question):
        return True

    if quiz_type == "OX":
        if options != ["O", "X"]:
            return True

        if answer not in ["O", "X"]:
            return True

        statement = question.split("\n\n")[-1].strip()
        if not statement:
            return True

        if is_question_like_text(statement):
            return True

        if not is_valid_ox_statement(statement):
            return True

        return False


    if len(options) != option_count:
        return True

    if question == "___":
        return True

    if quiz_type == "BLANK":
        if not is_meaningful_blank_question(question):
            return True

        if is_bad_blank_question_shape(question):
            return True

        if not is_good_blank_answer(answer):
            return True

        if normalize_for_match(answer) not in normalize_for_match(source_sentence):
            return True

    if quiz_type == "KEYWORD_CHOICE":
        # KEYWORD_CHOICE 정답은 긴 설명문이 아니라 핵심어/짧은 명사구여야 합니다.
        if not is_good_short_answer(answer):
            return True

        if normalize_for_match(answer) in normalize_for_match(question):
            return True

    if quiz_type == "DEFINITION":
        if len(answer) > MAX_OPTION_LENGTH:
            return True

        if not is_definition_answer_quality(answer, source_sentence):
            return True

        if not is_answer_grounded_in_source(answer, source_sentence):
            return True

    if quiz_type != "BLANK":
        if normalize_for_match(answer) in normalize_for_match(question):
            return True

    long_option_count = sum(1 for option in options if len(option) > MAX_OPTION_LENGTH)
    if long_option_count >= 2:
        return True

    return False


def filter_quality_quizzes(
    quizzes: List[Dict],
    option_count: int,
) -> Tuple[List[Dict], int]:
    passed = []
    rejected_count = 0
    seen_signatures = set()

    for quiz in quizzes:
        cleaned_quiz = sanitize_quiz_payload(quiz)

        if is_low_quality_generated_quiz(cleaned_quiz, option_count=option_count):
            rejected_count += 1
            continue

        signature = get_quiz_duplicate_signature(cleaned_quiz)
        if signature in seen_signatures:
            rejected_count += 1
            continue

        seen_signatures.add(signature)
        passed.append(cleaned_quiz)

    return passed, rejected_count


def generate_quizzes_for_concepts(
    concepts: List[models.Concept],
    all_lecture_concepts: List[models.Concept],
    quiz_type: str,
    count_per_concept: int,
    option_count: int,
) -> Tuple[List[Dict], int]:
    generated = []
    failed_count = 0
    seen_signatures = set()

    all_keywords = build_keyword_pool(all_lecture_concepts)
    all_sentences = build_sentence_pool(all_lecture_concepts)
    all_concept_names = build_concept_name_pool(all_lecture_concepts)
    generation_types = get_generation_types(quiz_type)

    if not generation_types:
        return [], len(concepts) * count_per_concept

    for concept_index, concept in enumerate(concepts):
        for local_index in range(count_per_concept):
            base_seed = concept_index + local_index
            quiz_data = None

            # MIXED는 후보 유형을 순회하며 처음 성공한 문항을 사용합니다.
            for attempt in range(len(generation_types)):
                selected_quiz_type = generation_types[
                    (concept_index + local_index + attempt) % len(generation_types)
                ]

                candidate = generate_single_quiz(
                    concept=concept,
                    selected_quiz_type=selected_quiz_type,
                    all_keywords=all_keywords,
                    all_sentences=all_sentences,
                    all_concept_names=all_concept_names,
                    option_count=option_count,
                    index_seed=base_seed + attempt,
                )

                if candidate:
                    candidate = attach_concept_metadata(candidate, concept)

                    # 생성 직후 품질 검사를 통과한 후보만 채택합니다.
                    if is_low_quality_generated_quiz(candidate, option_count=option_count):
                        continue

                    signature = get_quiz_duplicate_signature(candidate)
                    if signature in seen_signatures:
                        continue

                    seen_signatures.add(signature)
                    quiz_data = candidate
                    break

            if quiz_data:
                generated.append(quiz_data)
            else:
                failed_count += 1

    return generated, failed_count


def pick_evenly_spaced_items(
    items: List[Dict[str, Any]],
    max_count: int,
) -> List[Dict[str, Any]]:
    """
    앞쪽 페이지만 선택되지 않도록 후보를 전체 범위에서 고르게 고릅니다.
    """
    if len(items) <= max_count:
        return items

    if max_count <= 1:
        return items[:1]

    last_index = len(items) - 1
    selected_indexes = []

    for i in range(max_count):
        index = round(i * last_index / (max_count - 1))
        selected_indexes.append(index)

    selected_indexes = sorted(set(selected_indexes))

    selected = [items[index] for index in selected_indexes]

    # 반올림 중복으로 수량이 부족하면 앞쪽 후보부터 보충합니다.
    if len(selected) < max_count:
        selected_ids = {id(item) for item in selected}
        for item in items:
            if id(item) not in selected_ids:
                selected.append(item)
                selected_ids.add(id(item))

            if len(selected) >= max_count:
                break

    return selected[:max_count]


def simplify_concept_label(value: str) -> str:
    """
    AI 출제용 개념명을 짧고 자연스럽게 정리합니다.
    """
    cleaned = normalize_text_item(value)

    for old, new in CONCEPT_LABEL_REPLACEMENTS:
        cleaned = cleaned.replace(old, new)

    cleaned = cleaned.strip(" :：,.")

    if len(compact_text(cleaned)) > MAX_CONCEPT_LABEL_LENGTH:
        # 긴 문장형 개념은 임의로 자르지 않고 제외합니다.
        return ""

    return cleaned


def split_source_label(source_sentence: str) -> Optional[str]:
    """
    source 문장의 구분자 앞부분을 출제용 concept label 후보로 사용합니다.
    """
    cleaned = normalize_text_item(source_sentence)

    for sep in SOURCE_LABEL_SEPARATORS:
        if sep in cleaned:
            prefix = normalize_text_item(cleaned.split(sep, 1)[0])
            prefix = simplify_concept_label(prefix)

            if is_safe_concept_label(prefix):
                return prefix

    return None


def score_sentence_by_terms(sentence: str, terms: List[str]) -> int:
    normalized_sentence = normalize_for_match(sentence)
    score = 0

    for term in terms:
        normalized_term = normalize_for_match(term)

        if len(normalized_term) < 3:
            continue

        if normalized_term in normalized_sentence:
            score += 5
            continue

        if len(normalized_term) >= 8 and normalized_term[:8] in normalized_sentence:
            score += 2
            continue

        if len(normalized_term) >= 5 and normalized_term[:5] in normalized_sentence:
            score += 1

    return score


def get_safe_keywords_for_ai(concept: models.Concept) -> List[str]:
    keywords = []

    for keyword in parse_keywords(concept.keywords):
        cleaned = simplify_concept_label(keyword)

        if (
            cleaned
            and is_safe_concept_label(cleaned)
            and looks_like_core_quiz_keyword(cleaned)
        ):
            keywords.append(cleaned)

    return unique_keep_order(keywords)


def select_source_sentences_for_ai(concept: models.Concept) -> List[str]:
    """
    AI에게 보낼 출제 근거 문장 후보를 고릅니다.
    """
    sentences = []

    for sentence in parse_sentences(concept.sentences):
        cleaned = normalize_text_item(sentence)

        if not is_good_source_sentence(cleaned):
            continue

        sentences.append(cleaned)

    return unique_keep_order(sentences)[:AI_BATCH_MAX_SOURCE_SENTENCES]


def get_refined_concept_label_for_ai(
    concept: models.Concept,
    source_sentences: List[str],
) -> Optional[str]:
    """
    source_sentence와 keyword를 함께 보고 더 안전한 출제용 label을 고릅니다.
    """
    for source_sentence in source_sentences:
        inferred_label = infer_concept_label_from_source_sentence(source_sentence)
        if inferred_label and is_safe_concept_label(inferred_label):
            return inferred_label

    for source_sentence in source_sentences:
        source_label = split_source_label(source_sentence)
        if source_label and not is_generic_bad_concept_label(source_label):
            return source_label

    concept_name = simplify_concept_label(concept.concept_name)
    if (
        concept_name
        and is_safe_concept_label(concept_name)
        and not is_generic_bad_concept_label(concept_name)
    ):
        return concept_name

    normalized_sources = " ".join(
        normalize_for_match(sentence)
        for sentence in source_sentences
    )

    for keyword in get_safe_keywords_for_ai(concept):
        normalized_keyword = normalize_for_match(keyword)

        if len(normalized_keyword) >= 3 and normalized_keyword in normalized_sources:
            return keyword

    safe_keywords = [
        keyword
        for keyword in get_safe_keywords_for_ai(concept)
        if not is_generic_bad_concept_label(keyword)
    ]
    if safe_keywords:
        return safe_keywords[0]

    return None


def calculate_material_quality_score(
    concept: models.Concept,
    concept_label: str,
    source_sentences: List[str],
) -> int:
    """
    AI material 선별에 사용할 우선순위 점수를 계산합니다.
    """
    terms = unique_keep_order([
        concept_label,
        normalize_text_item(concept.concept_name),
        *parse_keywords(concept.keywords),
    ])

    score = 0

    for sentence in source_sentences:
        score += score_sentence_by_terms(sentence, terms)

        if split_source_label(sentence):
            score += 2

    if is_safe_concept_label(concept_label):
        score += 2

    if len(source_sentences) >= 2:
        score += 1

    return score


def choose_preferred_quiz_type(
    quiz_type: str,
    source_sentence: str,
    index_seed: int = 0,
) -> str:
    normalized = quiz_type.strip().upper()

    if normalized != "MIXED":
        return normalized

    if len(compact_text(source_sentence)) < 18:
        return "DEFINITION"

    return AI_PREFERRED_MIXED_QUIZ_TYPES[
        index_seed % len(AI_PREFERRED_MIXED_QUIZ_TYPES)
    ]


def build_ai_quiz_material(
    concept: models.Concept,
    quiz_type: str,
    option_count: int,
    index_seed: int = 0,
) -> Optional[Dict[str, Any]]:
    source_sentences = select_source_sentences_for_ai(concept)

    if not source_sentences:
        return None

    concept_label = get_refined_concept_label_for_ai(
        concept=concept,
        source_sentences=source_sentences,
    )

    if not concept_label:
        return None

    best_source_sentence = source_sentences[0]

    quality_score = calculate_material_quality_score(
        concept=concept,
        concept_label=concept_label,
        source_sentences=source_sentences,
    )

    return {
        "lecture_id": concept.lecture_id,
        "concept_id": concept.id,
        "page_num": concept.page_num,
        "original_concept_name": normalize_text_item(concept.concept_name),
        "concept_label": concept_label,
        "keywords": get_safe_keywords_for_ai(concept)[:AI_BATCH_MAX_KEYWORDS],
        "source_sentences": source_sentences,
        "best_source_sentence": best_source_sentence,
        "preferred_quiz_type": choose_preferred_quiz_type(
            quiz_type=quiz_type,
            source_sentence=best_source_sentence,
            index_seed=index_seed,
        ),
        "option_count": option_count,
        "quality_score": quality_score,
    }


def prepare_quiz_materials_for_ai(
    concepts: List[models.Concept],
    quiz_type: str,
    count_per_concept: int,
    option_count: int,
    target_min: int = AI_TARGET_MIN_QUIZZES,
    target_max: int = AI_TARGET_MAX_QUIZZES,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    AI 호출 전에 출제 가능한 material을 선별하고 요청 범위에 맞게 제한합니다.
    """
    candidate_materials = []
    failed_count = 0

    for concept_index, concept in enumerate(concepts):
        local_created = 0

        for local_index in range(max(1, count_per_concept)):
            material = build_ai_quiz_material(
                concept=concept,
                quiz_type=quiz_type,
                option_count=option_count,
                index_seed=concept_index + local_index,
            )

            if not material:
                continue

            candidate_materials.append(material)
            local_created += 1

        if local_created == 0:
            failed_count += 1

    if not candidate_materials:
        return [], failed_count

    # 페이지 순서를 유지하면서 전체 범위에 고르게 분포되도록 제한합니다.
    candidate_materials.sort(
        key=lambda item: (
            item.get("page_num") or 0,
            -(item.get("quality_score") or 0),
        )
    )

    selected_materials = pick_evenly_spaced_items(
        candidate_materials,
        max_count=target_max,
    )

    print(
        "[QUIZ_AI_PREFILTER] "
        f"concepts={len(concepts)}, "
        f"candidates={len(candidate_materials)}, "
        f"selected={len(selected_materials)}, "
        f"failed={failed_count}, "
        f"target_min={target_min}, "
        f"target_max={target_max}"
    )

    return selected_materials, failed_count
