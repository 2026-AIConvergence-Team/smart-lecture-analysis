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
    CONCEPT_LABEL_REPLACEMENTS,
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
    SOURCE_FACT_MARKERS,
    SOURCE_LABEL_SEPARATORS,
    UNSAFE_CONCEPT_LABEL_SUFFIXES,
    WEAK_BLANK_ANSWER_WORDS,
)


def is_generic_bad_concept_label(value: str) -> bool:
    compact = normalize_for_match(value)
    return compact in {
        normalize_for_match(label)
        for label in GENERIC_BAD_CONCEPT_LABELS
    }


def infer_concept_label_from_source_sentence(source_sentence: str) -> Optional[str]:
    """
    원문 근거 문장을 보고 퀴즈용 개념명을 보정합니다.
    PDF 원문에서 추출된 concept_name이 너무 일반적이거나 예시 단어인 경우를 보완합니다.
    """
    compact = normalize_for_match(source_sentence)

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
    페이지 범위와 가용 개념 수를 기준으로 최종 퀴즈 수를 계산합니다.

    기존 방식은 4페이지당 1문제라서 9페이지 PDF도 3문제만 생성되는 문제가 있었습니다.
    수업 중 이해도 체크 용도라면 선택한 페이지 범위의 핵심 개념을 최대한 고르게 묻는 편이 낫습니다.
    """
    if available_concept_count <= 0:
        return 0

    page_count = max(1, page_end - page_start + 1)

    # 기본적으로 페이지당 1문제를 목표로 하되,
    # 실제 추출된 개념 수와 서비스 최대 개수를 넘지 않습니다.
    target_count = min(
        SERVICE_MAX_QUIZ_COUNT,
        available_concept_count,
        page_count,
    )

    # 단, 개념이 충분하면 최소 문제 수를 보장합니다.
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


def normalize_text_item(value: str) -> str:
    return " ".join(str(value).strip().split())


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

    if len(cleaned) > MAX_SHORT_ANSWER_LENGTH:
        return False

    if contains_low_quality_marker(cleaned):
        return False

    if len(compact_text(cleaned)) > 14 and any(
        marker in compact_text(cleaned)
        for marker in SHORT_ANSWER_SENTENCE_LIKE_MARKERS
    ):
        return False

    return True


def is_weak_blank_answer(value: str) -> bool:
    """
    BLANK 문제에서 빈칸으로 만들기 약한 답을 걸러냅니다.
    예: 합리적으로, 독립적으로 같은 부사/수식어는 이해도 체크 효과가 낮습니다.
    """
    cleaned = normalize_text_item(value)
    compact = compact_text(cleaned)

    if not compact:
        return True

    normalized_weak_words = {
        compact_text(word)
        for word in WEAK_BLANK_ANSWER_WORDS
    }

    if compact in normalized_weak_words:
        return True

    # 짧은 부사형 표현은 핵심 개념어보다 문장 암기에 가깝습니다.
    if len(compact) <= 8 and compact.endswith(("적으로", "하게", "히")):
        return True

    # 한 글자 답은 너무 쉬운 경우가 많아 BLANK에서는 제외합니다.
    if len(compact) <= 1:
        return True

    return False


def is_good_blank_answer(value: str) -> bool:
    return is_good_short_answer(value) and not is_weak_blank_answer(value)


def is_good_option_candidate(value: str) -> bool:
    cleaned = normalize_text_item(value)

    if not has_enough_meaning(cleaned):
        return False

    if len(cleaned) > MAX_OPTION_LENGTH:
        return False

    return True


def is_good_source_sentence(value: str) -> bool:
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

    if is_question_like_text(cleaned):
        return False

    if not has_fact_marker(cleaned):
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

    if len(compact) > MAX_CONCEPT_LABEL_LENGTH:
        return False

    if compact.endswith(UNSAFE_CONCEPT_LABEL_SUFFIXES):
        return False

    # 조사/서술어가 붙은 문장 조각은 개념명으로 쓰지 않습니다.
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

            # 긴 키워드는 일부만 겹쳐도 같은 개념 문장일 가능성이 있습니다.
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
    퀴즈에 노출 가능한 대표 개념명을 concept_name과 keywords에서 선택합니다.
    """
    candidates = [
        normalize_text_item(concept.concept_name),
        *parse_keywords(concept.keywords),
    ]

    for candidate in candidates:
        cleaned = normalize_text_item(candidate)

        if is_safe_concept_label(cleaned):
            return cleaned

    return ""

def find_answer_keyword(sentence: str, keywords: List[str]) -> Optional[str]:
    """
    빈칸 처리 후에도 문맥이 남는 정답 키워드를 선택합니다.
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

        candidates.append(cleaned_keyword)

    if not candidates:
        return None

    # 의미가 부족한 한 글자 후보보다 구체적인 핵심어를 우선합니다.
    candidates = sorted(
        candidates,
        key=lambda item: (len(compact_text(item)), len(item)),
        reverse=True,
    )

    return candidates[0]


def build_keyword_pool(concepts: List[models.Concept]) -> List[str]:
    pool = []

    for concept in concepts:
        concept_label = get_concept_label(concept)
        if is_good_short_answer(concept_label):
            pool.append(concept_label)

        for keyword in parse_keywords(concept.keywords):
            if is_good_short_answer(keyword):
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
        if is_good_short_answer(get_concept_label(concept))
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


def rank_wrong_candidates(answer: str, candidates: List[str]) -> List[str]:
    cleaned_answer = normalize_text_item(answer)
    answer_len = len(compact_text(cleaned_answer))

    filtered = []

    for candidate in candidates:
        cleaned_candidate = normalize_text_item(candidate)

        if not is_good_option_candidate(cleaned_candidate):
            continue

        if is_similar_text(cleaned_answer, cleaned_candidate):
            continue

        candidate_len = len(compact_text(cleaned_candidate))
        length_gap = abs(answer_len - candidate_len)

        # 길이 차이가 큰 보기는 제외하지 않고 후순위로 보냅니다.
        filtered.append((length_gap, random.random(), cleaned_candidate))

    filtered.sort(key=lambda item: (item[0], item[1]))

    return unique_keep_order([item[2] for item in filtered])


def build_options(
    answer: str,
    candidates: List[str],
    option_count: int,
    seed: Optional[int] = None,
) -> Optional[List[str]]:
    cleaned_answer = normalize_text_item(answer)

    if not is_good_option_candidate(cleaned_answer):
        return None

    wrong_candidates = rank_wrong_candidates(cleaned_answer, candidates)

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

    question = f"다음 중 '{concept_label}' 개념을 가장 잘 설명하는 것은 무엇인가요?"

    options = build_options(
        answer=answer,
        candidates=all_sentences,
        option_count=option_count,
        seed=index_seed,
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

    # 설명에 정답이 그대로 노출된 문제는 제외합니다.
    if normalize_for_match(answer) in normalize_for_match(source_sentence):
        return None

    question = f"다음 설명에 해당하는 핵심 개념은 무엇인가요?\n\n{source_sentence}"

    options = build_options(
        answer=answer,
        candidates=all_concept_names,
        option_count=option_count,
        seed=index_seed,
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


def attach_concept_metadata(quiz_data: Dict, concept: models.Concept) -> Dict:
    concept_label = get_concept_label(concept)

    quiz_data["lecture_id"] = concept.lecture_id
    quiz_data["concept_id"] = concept.id
    quiz_data["concept_name"] = concept_label or concept.concept_name
    quiz_data["concept_keywords"] = parse_keywords(concept.keywords)
    quiz_data["page_num"] = concept.page_num
    return quiz_data


def is_low_quality_generated_quiz(
    quiz: Dict,
    option_count: int,
) -> bool:
    quiz_type = str(quiz.get("quiz_type") or "").strip().upper()
    question = normalize_text_item(str(quiz.get("question") or ""))
    answer = normalize_text_item(str(quiz.get("answer") or ""))
    source_sentence = normalize_text_item(str(quiz.get("source_sentence") or ""))

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

    if not question or not answer:
        return True

    if len(compact_text(question)) < MIN_QUESTION_CONTEXT_LENGTH:
        return True

    if not source_sentence:
        return True

    if not is_good_source_sentence(source_sentence):
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

        return False

    if len(options) != option_count:
        return True

    if question == "___":
        return True

    if quiz_type == "BLANK":
        if not is_meaningful_blank_question(question):
            return True

        if not is_good_blank_answer(answer):
            return True

        if normalize_for_match(answer) not in normalize_for_match(source_sentence):
            return True

    if quiz_type == "KEYWORD_CHOICE":
        # KEYWORD_CHOICE의 정답은 긴 설명문이 아니라 핵심어/짧은 명사구여야 합니다.
        if not is_good_short_answer(answer):
            return True

        if normalize_for_match(answer) in normalize_for_match(question):
            return True

    if quiz_type == "DEFINITION":
        if len(answer) > MAX_OPTION_LENGTH:
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

    for quiz in quizzes:
        if is_low_quality_generated_quiz(quiz, option_count=option_count):
            rejected_count += 1
            continue

        passed.append(quiz)

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

            # MIXED는 후보 유형을 한 번씩 순회하며 성공한 첫 문제를 사용합니다.
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

    # 반올림 중복으로 부족한 수량은 앞쪽 후보부터 보충합니다.
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

        if cleaned and is_safe_concept_label(cleaned):
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
