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

    # 게임이론/사회적 의사결정 강의 자료 보정
    if "사회적인의사결정" in compact or "사회적의사결정" in compact:
        return "사회적 의사결정"

    if "전략" in compact and (
        "각선수가선택하는내용" in compact
        or "선수가선택" in compact
        or "선택하는내용" in compact
    ):
        return "전략"

    if "게임이론" in compact and (
        "사회적의사결정" in compact
        or "의사결정" in compact
    ):
        return "게임이론"

    if "죄수의딜레마" in compact and "협동" in compact:
        return "죄수의 딜레마에서의 협동"

    if "죄수의딜레마" in compact and (
        "자백" in compact or "부인" in compact or "변절" in compact
    ):
        return "죄수의 딜레마"

    if "내쉬균형" in compact or "균형" in compact:
        return "내쉬균형"

     # Chapter 9 '사회적 지능과 이타성' / 게임이론 강의 보정
    if "사회적인의사결정" in compact or "사회적의사결정" in compact:
        return "사회적 의사결정"

    if "게임이론" in compact or "gametheory" in compact:
        return "게임 이론"

    if "선수player" in compact or "의사결정의주체" in compact:
        return "선수"

    if "전략strategy" in compact or (
        "전략" in compact and ("각선수" in compact or "선택하는내용" in compact)
    ):
        return "전략"

    if "제로섬게임" in compact or "zerosumgame" in compact:
        return "제로섬 게임"

    if "최상의대응" in compact or "bestresponse" in compact:
        return "최상의 대응"

    if "최적의전략" in compact or "optimalstrategy" in compact:
        return "최적의 전략"

    if "내시균형" in compact or "nashequilibrium" in compact:
        return "내시 균형"

    if "죄수의딜레마" in compact or "prisonersdilemma" in compact:
        return "죄수의 딜레마"

    if "일회성" in compact and "게임" in compact:
        return "일회성 게임"

    if "반복적" in compact and "게임" in compact:
        return "반복적 게임"

    if "맞대응" in compact or "titfortat" in compact:
        return "맞대응 전략"

    if "파블로프" in compact or "pavlov" in compact:
        return "파블로프 전략"

    # Chapter 9 게임이론 / 죄수의 딜레마 보정
    if "사회적인의사결정" in compact or "사회적의사결정" in compact:
        return "사회적 의사결정"

    if "게임이론" in compact or "gametheory" in compact:
        return "게임 이론"

    if "전략strategy" in compact or (
        "전략" in compact and ("각선수" in compact or "선택하는내용" in compact)
    ):
        return "전략"

    if "두죄수" in compact and (
        "부인" in compact or "자백" in compact or "징역" in compact
    ):
        return "죄수의 딜레마"

    if "죄수의딜레마" in compact or "prisonersdilemma" in compact:
        return "죄수의 딜레마"

    if "내시균형" in compact or "nashequilibrium" in compact:
        return "내시 균형"

    if "맞대응" in compact or "titfortat" in compact:
        return "맞대응 전략"

    if "파블로프" in compact or "pavlov" in compact:
        return "파블로프 전략"
    
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

NEW_GENERATED_QUIZ_TYPES = {
    "MULTIPLE_CHOICE",
    "OX",
    "SHORT_ANSWER",
    "SUBJECTIVE",
}

LEGACY_GENERATED_QUIZ_TYPE_ALIASES = {
    "DEFINITION": "MULTIPLE_CHOICE",
    "KEYWORD_CHOICE": "MULTIPLE_CHOICE",
    "BLANK": "SHORT_ANSWER",
    "TRUE_FALSE": "OX",
}


def canonicalize_generation_quiz_type(
    quiz_type: str,
    default: str = "MULTIPLE_CHOICE",
) -> str:
    normalized = normalize_text_item(str(quiz_type or "")).upper()

    if not normalized or normalized == "MIXED":
        return default

    normalized = LEGACY_GENERATED_QUIZ_TYPE_ALIASES.get(normalized, normalized)

    if normalized in NEW_GENERATED_QUIZ_TYPES:
        return normalized

    return default

def is_answer_exposed_in_question(
    quiz_type: str,
    question: str,
    answer: str,
) -> bool:
    """
    question 안에 answer가 그대로 노출되어 있는지 검사합니다.

    ai_quiz_generation.py에서 import하면 순환 참조가 생기므로,
    quiz_generation.py 내부에서도 동일한 로직을 로컬로 둡니다.
    """
    if not question or not answer:
        return False

    canonical_type = canonicalize_generation_quiz_type(quiz_type)

    # OX의 answer는 O/X라서 문제 본문 노출 검사 대상이 아닙니다.
    if canonical_type == "OX":
        return False

    # 주관식은 모범답안 전체가 질문과 완전히 같은 경우만 막습니다.
    # 주관식 질문에는 핵심 개념명이 들어갈 수 있기 때문입니다.
    if canonical_type == "SUBJECTIVE":
        return normalize_for_match(question) == normalize_for_match(answer)

    normalized_answer = normalize_for_match(answer)
    normalized_question = normalize_for_match(question.replace("___", ""))

    if not normalized_answer:
        return False

    return normalized_answer in normalized_question

def get_default_mixed_quiz_types() -> List[str]:
    """
    MIXED 요청 시 사용할 새 타입 순서입니다.
    핵심어 선택형은 제거하고, 객관식/주관식/단답/OX를 섞습니다.
    """
    preferred = []

    for quiz_type in AI_PREFERRED_MIXED_QUIZ_TYPES:
        canonical = canonicalize_generation_quiz_type(quiz_type)
        if canonical in NEW_GENERATED_QUIZ_TYPES:
            preferred.append(canonical)

    preferred = unique_keep_order(preferred)

    # constants.py가 아직 예전 값이어도 새 타입이 부족하지 않게 보정합니다.
    for fallback_type in [
        "MULTIPLE_CHOICE",
        "SUBJECTIVE",
        "SHORT_ANSWER",
        "OX",
    ]:
        if fallback_type not in preferred:
            preferred.append(fallback_type)

    return preferred


def normalize_quiz_string_list(raw_items: Any) -> List[str]:
    if not isinstance(raw_items, list):
        return []

    return unique_keep_order([
        normalize_text_item(str(item))
        for item in raw_items
        if normalize_text_item(str(item))
    ])


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
    normalized_quiz_type = normalize_text_item(str(quiz_type or "")).upper()

    if normalized_quiz_type == "MIXED":
        return get_default_mixed_quiz_types()

    canonical = canonicalize_generation_quiz_type(normalized_quiz_type)

    if canonical not in NEW_GENERATED_QUIZ_TYPES:
        return []

    return [canonical]


def generate_single_quiz(
    concept: models.Concept,
    selected_quiz_type: str,
    all_keywords: List[str],
    all_sentences: List[str],
    all_concept_names: List[str],
    option_count: int,
    index_seed: int,
) -> Optional[Dict]:
    """
    DEPRECATED.

    기존 알고리즘 직접 생성 함수입니다.
    이제 최종 문제는 AI가 생성하고, 알고리즘은 재료 선별/검증만 담당합니다.

    호환성을 위해 함수는 남기되, 어떤 문제도 직접 생성하지 않습니다.
    """
    return None


def sanitize_quiz_payload(quiz_data: Dict) -> Dict:
    """
    PDF/PPT bullet 기호를 제거하고 문자열 필드를 일관되게 정규화합니다.
    새 퀴즈 타입도 canonicalize합니다.
    """
    cleaned = dict(quiz_data)

    for key in (
        "quiz_type",
        "question",
        "answer",
        "explanation",
        "source_sentence",
        "concept_name",
        "concept_label",
        "original_concept_name",
    ):
        if key in cleaned and cleaned.get(key) is not None:
            cleaned[key] = normalize_text_item(str(cleaned.get(key)))

    cleaned["quiz_type"] = canonicalize_generation_quiz_type(
        cleaned.get("quiz_type"),
        default="MULTIPLE_CHOICE",
    )

    raw_options = cleaned.get("options") or []
    if isinstance(raw_options, list):
        cleaned["options"] = unique_keep_order([
            normalize_text_item(str(option))
            for option in raw_options
            if normalize_text_item(str(option))
        ])
    else:
        cleaned["options"] = []

    for list_key in ("accepted_answers", "grading_keywords", "rubric", "source_sentences"):
        cleaned[list_key] = normalize_quiz_string_list(cleaned.get(list_key))

    return cleaned


def repair_quiz_concept_name_from_source(quiz: Dict) -> Dict:
    """
    generated quiz의 concept_name이 PDF 조각이면 source_sentence에서 안전한 label로 복구합니다.
    복구가 안 되는 경우에는 원래 값을 유지하고 quality filter에서 reject합니다.
    """
    repaired = dict(quiz)

    concept_name = normalize_text_item(str(repaired.get("concept_name") or ""))
    source_sentence = normalize_text_item(str(repaired.get("source_sentence") or ""))
    concept_label = normalize_text_item(str(repaired.get("concept_label") or ""))

    if concept_name and is_safe_concept_label(concept_name):
        return repaired

    inferred = infer_concept_label_from_source_sentence(source_sentence)
    if inferred and is_safe_concept_label(inferred):
        repaired["concept_name"] = inferred
        repaired["concept_label"] = inferred
        return repaired

    if concept_label and is_safe_concept_label(concept_label):
        repaired["concept_name"] = concept_label
        return repaired

    source_label = split_source_label(source_sentence)
    if source_label and is_safe_concept_label(source_label):
        repaired["concept_name"] = source_label
        repaired["concept_label"] = source_label
        return repaired

    return repaired


def get_quiz_duplicate_signature(quiz: Dict) -> Tuple:
    """
    concept_id, quiz_type, question, source 조합으로 중복 문항을 판별합니다.
    주관식/단답은 answer가 조금 달라도 같은 질문이면 중복으로 봅니다.
    """
    return (
        quiz.get("concept_id"),
        canonicalize_generation_quiz_type(str(quiz.get("quiz_type") or "")),
        normalize_for_match(str(quiz.get("question") or "")),
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

def is_game_theory_sports_hallucination(
    question: str,
    answer: str,
    options: List[str],
    source_sentence: str,
) -> bool:
    """
    게임이론의 player/strategy를 스포츠 문맥으로 오해한 문항을 차단합니다.
    """
    normalized_source = normalize_for_match(source_sentence)

    is_game_theory_strategy_source = any(
        marker in normalized_source
        for marker in (
            "전략strategy",
            "전략",
            "선수player",
            "각선수",
            "게임이론",
            "의사결정",
        )
    )

    if not is_game_theory_strategy_source:
        return False

    combined_text = " ".join([
        question,
        answer,
        *options,
    ])
    normalized_combined = normalize_for_match(combined_text)

    sports_markers = (
        "경기중",
        "경기전",
        "팀전체",
        "상대팀",
        "수비패턴",
        "연습계획",
        "피드백모임",
        "전술적행동",
        "선수들의피드백",
    )

    return any(marker in normalized_combined for marker in sports_markers)

def has_unsupported_concept_term(
    term: str,
    source_blob: str,
    output_blob: str,
) -> bool:
    normalized_term = normalize_for_match(term)
    if not normalized_term:
        return False

    return normalized_term in output_blob and normalized_term not in source_blob


def has_negation_or_misconception_context(text: str) -> bool:
    """
    '협동이 내시균형으로 정당화된다'는 단정은 reject해야 하지만,
    '그 관점이 왜 잘못되었는가?'처럼 오개념을 구분하는 문항은 허용합니다.
    """
    normalized = normalize_for_match(text)

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


def get_best_response_optimal_strategy_saved_reject_reason(
    question: str,
    answer: str,
    options: List[str],
    explanation: str,
    source_sentence: str,
    source_sentences: Optional[List[str]] = None,
) -> Optional[str]:
    source_items = source_sentences or []
    if source_sentence:
        source_items = unique_keep_order([source_sentence, *source_items])

    output_text = " ".join([question, answer, explanation, *options])
    output = normalize_for_match(output_text)

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


def is_ambiguous_misconception_multiple_choice(
    quiz_type: str,
    question: str,
    options: List[str],
) -> bool:
    """
    객관식에서 '어떤 오해인가?', '잘못된 해석은?'처럼
    틀린 보기/오해 보기 하나를 고르게 하면 정답이 모호해지기 쉽습니다.
    """
    if quiz_type != "MULTIPLE_CHOICE":
        return False

    normalized_question = normalize_for_match(question)

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
        normalize_for_match(option)
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


def get_semantic_quality_reject_reason_for_saved_quiz(
    quiz_type: str,
    question: str,
    answer: str,
    options: List[str],
    explanation: str,
    source_sentence: str,
    source_sentences: Optional[List[str]] = None,
) -> Optional[str]:
    best_optimal_reject_reason = get_best_response_optimal_strategy_saved_reject_reason(
        question=question,
        answer=answer,
        options=options,
        explanation=explanation,
        source_sentence=source_sentence,
        source_sentences=source_sentences,
    )
    if best_optimal_reject_reason:
        return best_optimal_reject_reason

    source_items = source_sentences or []
    if source_sentence:
        source_items = unique_keep_order([source_sentence, *source_items])

    combined_text = " ".join([
        question,
        answer,
        explanation,
        *options,
    ])

    combined = normalize_for_match(combined_text)
    question_norm = normalize_for_match(question)
    answer_norm = normalize_for_match(answer)
    source_blob = normalize_for_match(" ".join(source_items))

    is_social_decision_context = (
        "사회적의사결정" in source_blob
        or "다른개체의행동" in source_blob
        or "다른개체에게영향" in source_blob
    )

    if is_social_decision_context:
        unsupported_social_terms = (
            "협력",
            "협동",
            "협력적행동",
            "협동적행동",
        )

        for term in unsupported_social_terms:
            if has_unsupported_concept_term(term, source_blob, combined):
                return (
                    "사회적 의사결정 source에 없는 협력/협동 개념을 "
                    "정답 또는 해설에 추가했습니다."
                )

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
        if not has_negation_or_misconception_context(combined_text):
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
        )

        if any(pattern in combined for pattern in unsupported_pavlov_patterns) and not any(
            pattern in source_blob
            for pattern in unsupported_pavlov_patterns
        ):
            return "파블로프 전략 설명에 source에 없는 상대 행동 예측/보상 조정 내용을 추가했습니다."

        if (
            "맞대응" in question_norm
            and "파블로프" in question_norm
            and "파블로프" in answer_norm
        ):
            has_pavlov_result_condition = any(
                marker in answer_norm
                for marker in ("이익", "손해", "결과", "같은행동", "반대행동")
            )
            if not has_pavlov_result_condition:
                return "파블로프 전략 비교 정답에서 이익/손해 또는 결과에 따른 행동 조건이 빠졌습니다."

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

def get_low_quality_generated_quiz_reason(
    quiz: Dict,
    option_count: int,
) -> Optional[str]:
    quiz = sanitize_quiz_payload(quiz)

    quiz_type = canonicalize_generation_quiz_type(quiz.get("quiz_type"))
    question = normalize_text_item(str(quiz.get("question") or ""))
    answer = normalize_text_item(str(quiz.get("answer") or ""))
    source_sentence = normalize_text_item(str(quiz.get("source_sentence") or ""))
    concept_name = normalize_text_item(str(quiz.get("concept_name") or ""))
    explanation = normalize_text_item(str(quiz.get("explanation") or ""))

    options = quiz.get("options") or []
    accepted_answers = quiz.get("accepted_answers") or []
    grading_keywords = quiz.get("grading_keywords") or []
    rubric = quiz.get("rubric") or []
    source_sentences = quiz.get("source_sentences") or []

    if quiz_type not in NEW_GENERATED_QUIZ_TYPES:
        return f"지원하지 않는 quiz_type입니다: {quiz_type}"

    if concept_name and not is_safe_concept_label(concept_name):
        return f"concept_name이 안전한 개념 라벨이 아닙니다: {concept_name}"

    if concept_name and is_bad_example_or_noise_label(concept_name):
        return f"concept_name이 예시/노이즈 라벨입니다: {concept_name}"

    if not question:
        return "question이 비어 있습니다."

    if not answer:
        return "answer가 비어 있습니다."

    if len(compact_text(question)) < MIN_QUESTION_CONTEXT_LENGTH:
        return "question의 문맥 길이가 너무 짧습니다."

    if not source_sentence:
        return "source_sentence가 비어 있습니다."

    if len(source_sentence) > 280:
        return "source_sentence가 너무 깁니다. page chunk가 아니라 핵심 근거 문장 1개여야 합니다."

    if not (
        is_good_source_sentence(source_sentence)
        or is_usable_ai_source_sentence(source_sentence)
    ):
        return f"source_sentence가 품질 기준을 통과하지 못했습니다: {source_sentence[:120]}"

    if contains_low_quality_marker(question):
        return "question에 low quality marker가 포함되어 있습니다."

    if contains_low_quality_marker(answer):
        return "answer에 low quality marker가 포함되어 있습니다."

    if has_unsafe_negative_question(question):
        return "부정형/오답 고르기 형태의 위험한 question입니다."

    semantic_reject_reason = get_semantic_quality_reject_reason_for_saved_quiz(
        quiz_type=quiz_type,
        question=question,
        answer=answer,
        options=options,
        explanation=explanation,
        source_sentence=source_sentence,
        source_sentences=source_sentences,
    )
    if semantic_reject_reason:
        return semantic_reject_reason

    if quiz_type == "MULTIPLE_CHOICE":
        if len(options) != option_count:
            return f"MULTIPLE_CHOICE options 개수가 {option_count}개가 아닙니다. 현재={len(options)}"

        if is_ambiguous_misconception_multiple_choice(
            quiz_type=quiz_type,
            question=question,
            options=options,
        ):
            return "객관식에서 모호한 오해/잘못된 해석 고르기 형태입니다. 이유를 묻는 문항으로 바꿔야 합니다."

        if len(options) != len(unique_keep_order(options)):
            return "MULTIPLE_CHOICE options에 중복이 있습니다."

        if answer not in options:
            return "MULTIPLE_CHOICE answer가 options 안에 없습니다."

        if is_game_theory_sports_hallucination(
            question=question,
            answer=answer,
            options=options,
            source_sentence=source_sentence,
        ):
            return "게임이론의 player/strategy 개념을 스포츠 경기 문맥으로 오해한 문항입니다."
        
        if any(is_cut_or_dangling_text(option) for option in options):
            return "MULTIPLE_CHOICE options 중 중간에서 잘린 문장 조각이 있습니다."

        if is_answer_exposed_in_question(quiz_type, question, answer):
            return "MULTIPLE_CHOICE question에 answer가 그대로 노출되어 있습니다."

        if is_cut_or_dangling_text(answer):
            return "MULTIPLE_CHOICE answer가 중간에서 잘린 원문 조각입니다."

        return None

    if quiz_type == "OX":
        if options != ["O", "X"]:
            return "OX options가 ['O', 'X']가 아닙니다."

        if answer not in ["O", "X"]:
            return "OX answer가 O 또는 X가 아닙니다."

        statement = question.split("\n\n")[-1].strip()
        if not statement:
            return "OX statement가 비어 있습니다."

        if is_question_like_text(statement):
            return "OX statement가 질문형 문장입니다."

        if not is_valid_ox_statement(statement):
            return "OX statement가 참/거짓 판단 가능한 완전한 명제가 아닙니다."

        return None

    if quiz_type == "SHORT_ANSWER":
        if options:
            return "SHORT_ANSWER인데 options가 비어 있지 않습니다."

        if "___" not in question:
            return "SHORT_ANSWER question에 ___가 없습니다."

        if not is_meaningful_blank_question(question):
            return "SHORT_ANSWER 빈칸 문제의 문맥이 부족합니다."

        if is_bad_blank_question_shape(question):
            return "SHORT_ANSWER 문제가 원문 조각 맞추기 형태입니다."

        if not is_good_blank_answer(answer):
            return "SHORT_ANSWER answer가 핵심 개념어로 적절하지 않습니다."

        if normalize_for_match(answer) not in normalize_for_match(source_sentence):
            return "SHORT_ANSWER answer가 source_sentence에 직접 등장하지 않습니다."

        question_without_blank = question.replace("___", "")
        if normalize_for_match(answer) in normalize_for_match(question_without_blank):
            return "SHORT_ANSWER answer가 빈칸 외 question 본문에 노출되어 있습니다."

        if any(is_cut_or_dangling_text(item) for item in accepted_answers):
            return "SHORT_ANSWER accepted_answers 중 잘린 문장 조각이 있습니다."

        return None

    if quiz_type == "SUBJECTIVE":
        if options:
            return "SUBJECTIVE인데 options가 비어 있지 않습니다."

        if len(compact_text(answer)) < 12:
            return "SUBJECTIVE 모범답안이 너무 짧습니다."

        if is_cut_or_dangling_text(answer):
            return "SUBJECTIVE 모범답안이 중간에서 잘린 원문 조각입니다."

        if not explanation and not rubric and not grading_keywords:
            return "SUBJECTIVE explanation, rubric, grading_keywords가 모두 비어 있습니다."

        if normalize_for_match(answer) == normalize_for_match(question):
            return "SUBJECTIVE question과 answer가 동일합니다."

        if any(is_cut_or_dangling_text(item) for item in rubric):
            return "SUBJECTIVE rubric 중 잘린 문장 조각이 있습니다."

        if any(is_cut_or_dangling_text(item) for item in grading_keywords):
            return "SUBJECTIVE grading_keywords 중 잘린 문장 조각이 있습니다."

        return None

    return f"처리되지 않은 quiz_type입니다: {quiz_type}"


def is_low_quality_generated_quiz(
    quiz: Dict,
    option_count: int,
) -> bool:
    return get_low_quality_generated_quiz_reason(
        quiz=quiz,
        option_count=option_count,
    ) is not None


def filter_quality_quizzes(
    quizzes: List[Dict],
    option_count: int,
) -> Tuple[List[Dict], int]:
    passed = []
    rejected_count = 0
    seen_signatures = set()

    for quiz in quizzes:
        cleaned_quiz = sanitize_quiz_payload(quiz)
        cleaned_quiz = repair_quiz_concept_name_from_source(cleaned_quiz)

        reject_reason = get_low_quality_generated_quiz_reason(
            cleaned_quiz,
            option_count=option_count,
        )

        if reject_reason:
            rejected_count += 1
            print(
                "[QUIZ_QUALITY_REJECT] "
                f"reason={reject_reason}, "
                f"concept_id={cleaned_quiz.get('concept_id')}, "
                f"quiz_type={cleaned_quiz.get('quiz_type')}, "
                f"question={str(cleaned_quiz.get('question') or '')[:120]}, "
                f"answer={str(cleaned_quiz.get('answer') or '')[:120]}, "
                f"options_count={len(cleaned_quiz.get('options') or []) if isinstance(cleaned_quiz.get('options'), list) else 'not_list'}, "
                f"source_sentence={str(cleaned_quiz.get('source_sentence') or '')[:120]}"
            )
            continue

        signature = get_quiz_duplicate_signature(cleaned_quiz)
        if signature in seen_signatures:
            rejected_count += 1
            print(
                "[QUIZ_QUALITY_REJECT] "
                f"reason=중복 퀴즈 signature입니다, "
                f"concept_id={cleaned_quiz.get('concept_id')}, "
                f"quiz_type={cleaned_quiz.get('quiz_type')}, "
                f"question={str(cleaned_quiz.get('question') or '')[:120]}, "
                f"answer={str(cleaned_quiz.get('answer') or '')[:120]}"
            )
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
    """
    DEPRECATED.

    기존 알고리즘 직접 생성 경로입니다.
    이제 최종 문제 생성은 AI batch 생성에서만 수행합니다.

    이 함수는 라우터/서비스의 기존 import 호환을 위해 남겨두지만,
    문제를 직접 생성하지 않습니다.
    """
    requested_count = len(concepts) * max(1, count_per_concept)

    print(
        "[QUIZ_ALGORITHM_GENERATION_DISABLED] "
        f"concepts={len(concepts)}, "
        f"requested={requested_count}, "
        "final quiz generation is handled by AI batch only"
    )

    return [], requested_count


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

def is_usable_ai_source_sentence(value: str) -> bool:
    """
    AI에게 넘길 source_sentence 후보를 고릅니다.

    기존 is_good_source_sentence()는 알고리즘이 직접 문제를 만들 때 쓰기에는 좋지만,
    AI 생성용 material 선별 단계에서는 너무 엄격합니다.

    여기서는 다음을 목표로 합니다.
    - 완벽한 문장이 아니어도 AI가 맥락을 읽을 수 있으면 허용
    - 단, 명백한 제목/질문/슬라이드 노이즈/잘린 조사형 조각은 제외
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not cleaned:
        return False

    if has_bad_slide_symbol(cleaned):
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_question_like_text(cleaned):
        return False

    if len(compact) < MIN_SOURCE_SENTENCE_COMPACT_LENGTH:
        return False

    # AI 프롬프트에 너무 긴 문장을 넣으면 토큰과 품질이 불안정해지므로 제한합니다.
    # 기존 MAX_SOURCE_SENTENCE_LENGTH보다 조금만 여유를 둡니다.
    if len(cleaned) > MAX_SOURCE_SENTENCE_LENGTH + 80:
        return False

    # 엄격 기준을 통과하면 당연히 허용합니다.
    if is_good_source_sentence(cleaned):
        return True

    # '개념: 설명' 형태는 PPT에서 자주 나오므로, 종결어미가 없어도 AI 재료로 허용합니다.
    # 예: 게임이론Game Theory: 사회적의사결정을수학
    # 예: 전략strategy: 각선수가선택하는내용
    if split_source_label(cleaned):
        return True

    # 명확한 개념/사실 표지가 있으면 허용합니다.
    relaxed_fact_markers = (
        "이다",
        "한다",
        "된다",
        "있다",
        "없다",
        "의미",
        "설명",
        "선택",
        "전략",
        "균형",
        "게임",
        "협동",
        "변절",
        "자백",
        "부인",
        "보상",
        "성과",
        "행렬",
        "효용",
        "형성",
        "증명",
        "존재",
        "반복",
        "예측",
        "결정",
        "연구",
        "학습",
        "처벌",
        "명성",
    )

    if any(marker in compact for marker in relaxed_fact_markers):
        # 다만 조사 하나로 끝나는 명백한 잘림은 제외합니다.
        if compact.endswith(("을", "를", "은", "는", "이", "가", "의", "에", "으로", "로")):
            return False

        return True

    return False


def is_understanding_check_source_sentence(value: str) -> bool:
    """
    학생 이해도 체크용 퀴즈로 출제 가능한 source_sentence인지 확인합니다.

    목적:
    - AI가 억지로 추론해야 하는 조각 문장 제외
    - 단순 제목/키워드 나열 제외
    - 원인, 의미, 관계, 결과, 적용을 물을 수 있는 문장만 허용
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not cleaned:
        return False

    if has_bad_slide_symbol(cleaned):
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if is_question_like_text(cleaned):
        return False

    # 너무 짧으면 개념 이해보다 단어 맞히기가 되기 쉽습니다.
    if len(compact) < 16:
        return False

    # 조사/연결어로 끝나는 명백한 조각은 제외합니다.
    if compact.endswith((
        "을", "를", "은", "는", "이", "가", "의", "에",
        "로", "으로", "와", "과", "통해", "위해", "따라",
        "대해", "관한", "것을", "것이", "영향을",
    )):
        return False

    # 기존 엄격 기준을 통과하면 가장 좋습니다.
    if is_good_source_sentence(cleaned):
        return True

    # '개념: 설명' 형태는 정의/역할 이해 문제로 만들 수 있습니다.
    # 예: 전략strategy: 각선수가선택하는내용
    if split_source_label(cleaned):
        right_side = normalize_text_item(
            re.split(r"[:：]", cleaned, maxsplit=1)[-1]
        )
        if len(compact_text(right_side)) >= 10:
            return True

    # 이해도 체크에 필요한 관계/의미/결과 표지가 있는 경우만 허용합니다.
    understanding_markers = (
        "의미", "설명", "영향", "결과", "이유", "때문",
        "관계", "비교", "선택", "전략", "균형", "협동",
        "자백", "부인", "보상", "효용", "반복", "예측",
        "결정", "형성", "가능", "있음", "한다", "된다", "이다",
    )

    if any(marker in compact for marker in understanding_markers):
        return True

    return False


def split_long_context_item(item: str) -> List[str]:
    """
    여러 개념이 한 줄로 붙은 page chunk를 핵심 근거 단위로 분리합니다.
    """
    cleaned = normalize_text_item(item)
    if not cleaned:
        return []

    boundary_patterns = [
        r"(?=사회적인?\s*의사결정)",
        r"(?=원하는\s*결과를\s*얻기\s*위해서)",
        r"(?=게임\s*이론\s*Game\s*Theory)",
        r"(?=선수\s*player\s*:)",
        r"(?=전략\s*strategy\s*:)",
        r"(?=제로섬\s*게임\s*zero\s*-\s*sum\s*game\s*:)",
        r"(?=제로섬\s*게임\s*에서는)",
        r"(?=사람들\s*간의\s*경쟁적인\s*상호작용)",
        r"(?=재귀적으로\s*상대\s*선수의\s*전략)",
        r"(?=이런\s*문제를\s*해소하기\s*위해)",
        r"(?=순수\s*전략\s*pure\s*strategy)",
        r"(?=혼합\s*전략\s*mixed\s*strategy)",
        r"(?=최상의\s*대응\s*:)",
        r"(?=최적의\s*전략\s*:)",
        r"(?=내시\s*균형\s*Nash\s*equilibrium\s*:)",
        r"(?=죄수의\s*딜레마\s*prisoner)",
        r"(?=두\s*죄수가\s*모두)",
        r"(?=한\s*죄수만\s*자백)",
        r"(?=상대\s*선수가\s*자백)",
        r"(?=But\s*,)",
        r"(?=분명한\s*것은)",
        r"(?=일회성\s*one\s*-\s*shot\s*게임\s*:)",
        r"(?=반복적\s*iterative\s*게임\s*:)",
        r"(?=맞대응\s*전략\s*:)",
        r"(?=파블로프\s*Pavlov\s*전략\s*:)",
        r"(?=vs\.\s*맞대응\s*전략\s*:)",
    ]

    for pattern in boundary_patterns:
        cleaned = re.sub(pattern, "\n", cleaned)

    parts = []

    for part in re.split(r"\n+", cleaned):
        part = normalize_text_item(part)
        if not part:
            continue

        compact = compact_text(part)

        if len(compact) < 8:
            continue

        if len(part) > 280:
            continue

        parts.append(part)

    return unique_keep_order(parts)


def build_atomic_source_sentences_for_ai(
    source_sentences: List[str],
    max_length: int = 280,
) -> List[str]:
    """
    AI가 source_sentence로 선택할 수 있는 후보를 짧고 명확한 근거 단위로 제한합니다.
    """
    atomic_sources = []

    for source in source_sentences:
        cleaned = normalize_text_item(source)
        if not cleaned:
            continue

        pieces = split_long_context_item(cleaned)

        if not pieces and len(cleaned) <= max_length:
            pieces = [cleaned]

        for piece in pieces:
            piece = normalize_text_item(piece)
            if not piece:
                continue

            if len(piece) > max_length:
                continue

            if (
                is_understanding_check_source_sentence(piece)
                or is_usable_ai_source_sentence(piece)
                or ":" in piece
                or "：" in piece
            ):
                atomic_sources.append(piece)

    return unique_keep_order(atomic_sources)

def split_page_context_sentences(page_text: str) -> List[str]:
    """
    PageContent의 원문 텍스트를 AI 출제용 문장/bullet 단위로 나눕니다.
    """
    cleaned = strip_slide_artifacts(page_text)
    cleaned = cleaned.replace("\r", "\n")

    cleaned = re.sub(
        r"Multimedia\s+VLSI\s+Lab\.\s*\d*",
        "\n",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(r"[•·▪▶➔→]\s*", "\n", cleaned)

    boundary_patterns = [
        r"(?=\s*Intro\.)",
        r"(?=\s*게임\s*이론의\s*등장)",
        r"(?=\s*게임\s*이론의\s*사망\??)",
        r"(?=\s*반복적\s*죄수의\s*딜레마)",
        r"(?=\s*파블로프\s*전략)",
        r"(?=\s*사회적인?\s*의사결정)",
        r"(?=\s*게임\s*이론\s*Game\s*Theory)",
        r"(?=\s*선수\s*player\s*:)",
        r"(?=\s*전략\s*strategy\s*:)",
        r"(?=\s*제로섬\s*게임\s*zero\s*-\s*sum\s*game\s*:)",
        r"(?=\s*순수\s*전략\s*pure\s*strategy)",
        r"(?=\s*혼합\s*전략\s*mixed\s*strategy)",
        r"(?=\s*최상의\s*대응\s*:)",
        r"(?=\s*최적의\s*전략\s*:)",
        r"(?=\s*내시\s*균형\s*Nash\s*equilibrium\s*:)",
        r"(?=\s*죄수의\s*딜레마\s*prisoner)",
        r"(?=\s*두\s*죄수가\s*모두)",
        r"(?=\s*한\s*죄수만\s*자백)",
        r"(?=\s*상대\s*선수가\s*자백)",
        r"(?=\s*But\s*,)",
        r"(?=\s*분명한\s*것은)",
        r"(?=\s*일회성\s*one\s*-\s*shot\s*게임\s*:)",
        r"(?=\s*반복적\s*iterative\s*게임\s*:)",
        r"(?=\s*컴퓨터\s*프로그램을\s*이용한\s*실험)",
        r"(?=\s*맞대응\s*전략\s*:)",
        r"(?=\s*파블로프\s*Pavlov\s*전략\s*:)",
        r"(?=\s*vs\.\s*맞대응\s*전략\s*:)",
    ]

    for pattern in boundary_patterns:
        cleaned = re.sub(pattern, "\n", cleaned)

    raw_parts = re.split(r"\n+", cleaned)

    parts = []

    for part in raw_parts:
        item = normalize_text_item(part)
        if not item:
            continue

        normalized = normalize_for_match(item)
        compact = compact_text(item)

        if not normalized:
            continue

        if normalized.startswith("multimediavlsilab"):
            continue

        if normalized.isdigit():
            continue

        if compact in {
            "intro",
            "게임이론의등장",
            "게임이론의사망",
            "반복적죄수의딜레마",
            "파블로프전략",
        }:
            continue

        if len(compact) < 6:
            continue

        if len(item) > 260:
            parts.extend(split_long_context_item(item))
            continue

        parts.append(item)

    return unique_keep_order(parts)


def is_similar_source_text(a: str, b: str) -> bool:
    normalized_a = normalize_for_match(a)
    normalized_b = normalize_for_match(b)

    if not normalized_a or not normalized_b:
        return False

    return normalized_a in normalized_b or normalized_b in normalized_a


def collect_context_window_for_concept(
    concept: models.Concept,
    base_sentences: List[str],
    page_context_map: Optional[Dict[int, str]],
    window_size: int = 1,
) -> List[str]:
    """
    concept.sentences와 같은 page의 원문 문맥을 합칩니다.

    예:
    - concept sentence: '전략strategy: 각선수가선택하는내용'
    - page context에서 바로 앞 문장: '선수player: 의사결정의 주체'
    이 둘을 함께 AI에 넘기면 '선수'를 스포츠 선수로 오해하는 문제를 줄일 수 있습니다.
    """
    if not page_context_map:
        return base_sentences

    page_text = page_context_map.get(int(getattr(concept, "page_num", 0) or 0), "")
    if not page_text:
        return base_sentences

    page_sentences = split_page_context_sentences(page_text)
    if not page_sentences:
        return base_sentences

    selected_context = []

    for index, page_sentence in enumerate(page_sentences):
        matched = any(
            is_similar_source_text(page_sentence, source)
            for source in base_sentences
        )

        if not matched:
            continue

        start = max(0, index - window_size)
        end = min(len(page_sentences), index + window_size + 1)

        selected_context.extend(page_sentences[start:end])

    if not selected_context:
        # 직접 매칭이 안 될 때는 concept label/keyword와 겹치는 문장을 보조로 추가합니다.
        concept_terms = unique_keep_order([
            normalize_text_item(getattr(concept, "concept_name", "") or ""),
            *parse_keywords(getattr(concept, "keywords", "") or ""),
        ])

        for sentence in page_sentences:
            normalized_sentence = normalize_for_match(sentence)

            if any(
                normalize_for_match(term)
                and normalize_for_match(term) in normalized_sentence
                for term in concept_terms
            ):
                selected_context.append(sentence)

    return unique_keep_order([
        *base_sentences,
        *selected_context,
    ])


def choose_best_source_sentence_for_material(
    source_sentences: List[str],
    concept_label: str,
) -> str:
    """
    source_sentences 중 해당 concept_label을 가장 잘 설명하는 문장을 대표 근거로 선택합니다.
    첫 번째 문장이 항상 제일 좋은 근거가 아니므로 점수화합니다.
    """
    if not source_sentences:
        return ""

    scored = []

    for sentence in source_sentences:
        score = 0
        normalized_sentence = normalize_for_match(sentence)
        normalized_label = normalize_for_match(concept_label)

        if normalized_label and normalized_label in normalized_sentence:
            score += 5

        if split_source_label(sentence):
            score += 3

        if is_good_source_sentence(sentence):
            score += 2
        elif is_usable_ai_source_sentence(sentence):
            score += 1

        if len(compact_text(sentence)) >= 18:
            score += 1

        scored.append((score, len(compact_text(sentence)), sentence))

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)

    return scored[0][2]


def select_source_sentences_for_ai(
    concept: models.Concept,
    page_context_map: Optional[Dict[int, str]] = None,
) -> List[str]:
    """
    AI에게 보낼 출제 근거 문장 후보를 고릅니다.

    기존에는 is_good_source_sentence()를 통과한 문장만 보냈습니다.
    하지만 PPT/PDF 추출 결과는 종결어미 없이 끊기는 경우가 많아,
    AI 생성용 material이 0개가 되는 문제가 있었습니다.

    따라서:
    1. 엄격 기준을 통과한 문장을 우선 사용
    2. 없으면 AI용 완화 기준을 통과한 문장을 fallback으로 사용
    """
    raw_sentences = [
        normalize_text_item(sentence)
        for sentence in parse_sentences(concept.sentences)
        if normalize_text_item(sentence)
    ]

    strict_sentences = [
        sentence
        for sentence in raw_sentences
        if is_good_source_sentence(sentence)
    ]

    if strict_sentences:
        selected = unique_keep_order(strict_sentences)
    else:
        selected = unique_keep_order([
            sentence
            for sentence in raw_sentences
            if is_usable_ai_source_sentence(sentence)
        ])

    selected = collect_context_window_for_concept(
        concept=concept,
        base_sentences=selected,
        page_context_map=page_context_map,
        window_size=1,
    )

    return unique_keep_order(selected)[: max(AI_BATCH_MAX_SOURCE_SENTENCES, 6)]


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
    """
    AI에게 전달할 선호 문제 유형을 정합니다.
    """
    normalized = normalize_text_item(str(quiz_type or "")).upper()

    if normalized != "MIXED":
        return canonicalize_generation_quiz_type(
            normalized,
            default="MULTIPLE_CHOICE",
        )

    preferred_types = get_default_mixed_quiz_types()

    if not preferred_types:
        return "MULTIPLE_CHOICE"

    # 근거 문장이 너무 짧으면 주관식/OX보다 객관식이 안정적입니다.
    if len(compact_text(source_sentence)) < 18:
        return "MULTIPLE_CHOICE"

    return preferred_types[index_seed % len(preferred_types)]


def build_ai_quiz_material(
    concept: models.Concept,
    quiz_type: str,
    option_count: int,
    index_seed: int = 0,
    page_context_map: Optional[Dict[int, str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    AI 출제에 필요한 재료만 구성합니다.
    여기서는 문제를 만들지 않습니다.
    """
    source_sentences = select_source_sentences_for_ai(
        concept=concept,
        page_context_map=page_context_map,
    )
    if not source_sentences:
        return None

    concept_label = get_refined_concept_label_for_ai(
        concept=concept,
        source_sentences=source_sentences,
    )

    # AI 생성에서는 concept_label이 완벽하지 않아도 source_sentence가 충분하면
    # AI가 문제를 만들 수 있으므로 안전한 fallback을 둡니다.
    if not concept_label:
        concept_label = split_source_label(source_sentences[0]) or ""

    if not concept_label:
        for keyword in get_safe_keywords_for_ai(concept):
            if keyword:
                concept_label = keyword
                break

    if not concept_label:
        return None

    if not is_safe_concept_label(concept_label):
        print(
            "[QUIZ_AI_MATERIAL_SKIP] "
            f"reason=unsafe_concept_label, "
            f"concept_id={getattr(concept, 'id', None)}, "
            f"concept_label={concept_label}, "
            f"original_concept_name={normalize_text_item(getattr(concept, 'concept_name', '') or '')}"
        )
        return None

    raw_source_sentences = unique_keep_order(source_sentences)

    atomic_source_sentences = build_atomic_source_sentences_for_ai(
        raw_source_sentences,
        max_length=280,
    )

    if atomic_source_sentences:
        source_sentences = atomic_source_sentences
    else:
        source_sentences = raw_source_sentences

    best_source_sentence = choose_best_source_sentence_for_material(
        source_sentences=source_sentences,
        concept_label=concept_label,
    )

    source_sentences = unique_keep_order([
        best_source_sentence,
        *source_sentences,
    ])

    if not is_understanding_check_source_sentence(best_source_sentence):
        print(
            "[QUIZ_AI_MATERIAL_SKIP] "
            f"reason=not_understanding_check_source, "
            f"concept_id={getattr(concept, 'id', None)}, "
            f"concept_label={concept_label}, "
            f"source_sentence={best_source_sentence[:120]}"
        )
        return None
    
    preferred_quiz_type = choose_preferred_quiz_type(
        quiz_type=quiz_type,
        source_sentence=best_source_sentence,
        index_seed=index_seed,
    )

    if preferred_quiz_type == "SHORT_ANSWER":
        normalized_source = normalize_for_match(best_source_sentence)

        short_answer_candidates = [
            keyword
            for keyword in get_safe_keywords_for_ai(concept)
            if keyword
            and is_good_blank_answer(keyword)
            and normalize_for_match(keyword) in normalized_source
        ]

        if not short_answer_candidates:
            preferred_quiz_type = "MULTIPLE_CHOICE"

    quality_score = calculate_material_quality_score(
        concept=concept,
        concept_label=concept_label,
        source_sentences=source_sentences,
    )

    print(
        "[QUIZ_AI_MATERIAL_BUILT] "
        f"concept_id={getattr(concept, 'id', None)}, "
        f"page={getattr(concept, 'page_num', None)}, "
        f"concept_label={concept_label}, "
        f"preferred_quiz_type={preferred_quiz_type}, "
        f"source_count={len(source_sentences)}, "
        f"best_source={best_source_sentence[:120]}"
    )

    return {
        "lecture_id": concept.lecture_id,
        "concept_id": concept.id,
        "page_num": concept.page_num,
        "original_concept_name": normalize_text_item(concept.concept_name),
        "concept_label": concept_label,
        "keywords": get_safe_keywords_for_ai(concept)[:AI_BATCH_MAX_KEYWORDS],
        "source_sentences": source_sentences[:AI_BATCH_MAX_SOURCE_SENTENCES],
        "best_source_sentence": best_source_sentence,
        "preferred_quiz_type": preferred_quiz_type,
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
    page_context_map: Optional[Dict[int, str]] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    AI 호출 전에 출제 가능한 material을 선별하고 요청 범위에 맞게 제한합니다.

    알고리즘의 역할:
    - concept_label 정제
    - source_sentences 선별
    - keywords 정제
    - preferred_quiz_type 지정
    - material 품질 점수 계산

    하지 않는 것:
    - 최종 문제 직접 생성
    """
    candidate_materials = []
    failed_count = 0

    normalized_count_per_concept = max(1, count_per_concept)
    normalized_target_max = max(1, min(SERVICE_MAX_QUIZ_COUNT, target_max))

    for concept_index, concept in enumerate(concepts):
        local_created = 0

        for local_index in range(normalized_count_per_concept):
            material = build_ai_quiz_material(
                concept=concept,
                quiz_type=quiz_type,
                option_count=option_count,
                index_seed=concept_index + local_index,
                page_context_map=page_context_map,
            )

            if not material:
                print(
                    "[QUIZ_AI_MATERIAL_SKIP] "
                    f"concept_id={getattr(concept, 'id', None)}, "
                    f"page={getattr(concept, 'page_num', None)}, "
                    f"concept_name={normalize_text_item(getattr(concept, 'concept_name', '') or '')}, "
                    f"sentences={parse_sentences(getattr(concept, 'sentences', '') or '')}"
                )
                continue

            candidate_materials.append(material)
            local_created += 1

        if local_created == 0:
            failed_count += 1

    if not candidate_materials:
        return [], failed_count

    # 품질이 너무 낮은 material은 여기서 1차 제거합니다.
    candidate_materials = [
        material
        for material in candidate_materials
        if material.get("concept_label")
        and material.get("source_sentences")
        and material.get("best_source_sentence")
        and material.get("preferred_quiz_type") in NEW_GENERATED_QUIZ_TYPES
    ]

    if not candidate_materials:
        return [], failed_count

    # 페이지 순서를 유지하면서 같은 페이지/앞쪽 페이지만 몰리지 않도록 정렬합니다.
    candidate_materials.sort(
        key=lambda item: (
            item.get("page_num") or 0,
            -(item.get("quality_score") or 0),
            item.get("concept_id") or 0,
        )
    )

    selected_materials = pick_evenly_spaced_items(
        candidate_materials,
        max_count=normalized_target_max,
    )

    print(
        "[QUIZ_AI_PREFILTER] "
        f"concepts={len(concepts)}, "
        f"candidates={len(candidate_materials)}, "
        f"selected={len(selected_materials)}, "
        f"failed={failed_count}, "
        f"target_min={target_min}, "
        f"target_max={normalized_target_max}, "
        f"quiz_type={quiz_type}"
    )

    return selected_materials, failed_count

