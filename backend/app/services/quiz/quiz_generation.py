import json
import random
from typing import Dict, List, Optional, Tuple

import app.models as models


def parse_keywords(raw_keywords: Optional[str]) -> List[str]:
    if not raw_keywords:
        return []

    # 현재 Concept.keywords는 "스택,LIFO,push,pop" 형태로 저장됨
    return [
        keyword.strip()
        for keyword in raw_keywords.split(",")
        if keyword and keyword.strip()
    ]


def parse_sentences(raw_sentences: Optional[str]) -> List[str]:
    if not raw_sentences:
        return []

    try:
        data = json.loads(raw_sentences)
        if isinstance(data, list):
            return [
                str(sentence).strip()
                for sentence in data
                if str(sentence).strip()
            ]
    except Exception:
        pass

    return [
        sentence.strip()
        for sentence in raw_sentences.split(".")
        if sentence and sentence.strip()
    ]


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


def unique_keep_order(items: List[str]) -> List[str]:
    result = []
    seen = set()

    for item in items:
        if not item:
            continue

        cleaned = str(item).strip()
        if not cleaned:
            continue

        if cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)

    return result


def find_answer_keyword(sentence: str, keywords: List[str]) -> Optional[str]:
    # 긴 키워드를 우선 선택해야 "자료구조"보다 "LIFO 구조" 같은 표현을 더 잘 잡을 수 있음
    sorted_keywords = sorted(keywords, key=len, reverse=True)

    for keyword in sorted_keywords:
        if keyword and keyword in sentence:
            return keyword

    return None


def build_keyword_pool(concepts: List[models.Concept]) -> List[str]:
    pool = []

    for concept in concepts:
        pool.append(concept.concept_name)
        pool.extend(parse_keywords(concept.keywords))

    return unique_keep_order(pool)


def build_sentence_pool(concepts: List[models.Concept]) -> List[str]:
    pool = []

    for concept in concepts:
        pool.extend(parse_sentences(concept.sentences))

    return unique_keep_order(pool)


def build_concept_name_pool(concepts: List[models.Concept]) -> List[str]:
    return unique_keep_order([concept.concept_name for concept in concepts])


def build_options(
    answer: str,
    candidates: List[str],
    option_count: int,
) -> Optional[List[str]]:
    cleaned_answer = answer.strip()
    wrong_candidates = [
        item.strip()
        for item in candidates
        if item and item.strip() and item.strip() != cleaned_answer
    ]
    wrong_candidates = unique_keep_order(wrong_candidates)

    needed_wrong_count = option_count - 1
    if len(wrong_candidates) < needed_wrong_count:
        return None

    selected_wrong = wrong_candidates[:needed_wrong_count]
    options = [cleaned_answer] + selected_wrong
    random.shuffle(options)

    return options


def make_explanation(
    quiz_type: str,
    concept_name: str,
    answer: str,
    source_sentence: str,
) -> str:
    if quiz_type == "OX":
        return f"원문 근거: {source_sentence}"

    if quiz_type == "DEFINITION":
        return f"'{concept_name}' 개념과 연결된 설명입니다."

    if quiz_type == "KEYWORD_CHOICE":
        return f"제시된 설명은 '{answer}' 개념에 대한 설명입니다."

    return f"정답은 '{answer}'입니다. 원문 근거: {source_sentence}"


def generate_blank_quiz(
    concept: models.Concept,
    all_keywords: List[str],
    option_count: int,
) -> Optional[Dict]:
    keywords = parse_keywords(concept.keywords)
    sentences = parse_sentences(concept.sentences)

    for sentence in sentences:
        answer = find_answer_keyword(sentence, keywords)
        if not answer:
            continue

        question = sentence.replace(answer, "___", 1)

        if question == sentence:
            continue

        options = build_options(answer, all_keywords, option_count)
        if not options:
            continue

        return {
            "quiz_type": "BLANK",
            "question": question,
            "options": options,
            "answer": answer,
            "explanation": make_explanation(
                "BLANK",
                concept.concept_name,
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
) -> Optional[Dict]:
    sentences = parse_sentences(concept.sentences)
    if not sentences:
        return None

    answer = sentences[0]
    question = f"'{concept.concept_name}'에 대한 설명으로 가장 적절한 것은?"

    options = build_options(answer, all_sentences, option_count)
    if not options:
        return None

    return {
        "quiz_type": "DEFINITION",
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": make_explanation(
            "DEFINITION",
            concept.concept_name,
            answer,
            answer,
        ),
        "source_sentence": answer,
    }


def generate_keyword_choice_quiz(
    concept: models.Concept,
    all_concept_names: List[str],
    option_count: int,
) -> Optional[Dict]:
    sentences = parse_sentences(concept.sentences)
    if not sentences:
        return None

    source_sentence = sentences[0]
    answer = concept.concept_name
    question = f"다음 설명에 해당하는 핵심 개념은 무엇인가요?\n\n{source_sentence}"

    options = build_options(answer, all_concept_names, option_count)
    if not options:
        return None

    return {
        "quiz_type": "KEYWORD_CHOICE",
        "question": question,
        "options": options,
        "answer": answer,
        "explanation": make_explanation(
            "KEYWORD_CHOICE",
            concept.concept_name,
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
    keywords = parse_keywords(concept.keywords)
    sentences = parse_sentences(concept.sentences)

    if not sentences:
        return None

    source_sentence = sentences[0]
    answer_keyword = find_answer_keyword(source_sentence, keywords)

    # 일부는 X 문제로 만들고, 일부는 O 문제로 만듭니다.
    make_false = index_seed % 2 == 1 and answer_keyword is not None

    if make_false:
        wrong_candidates = [
            keyword
            for keyword in all_keywords
            if keyword != answer_keyword and keyword not in source_sentence
        ]

        if wrong_candidates:
            wrong_keyword = wrong_candidates[0]
            false_sentence = source_sentence.replace(answer_keyword, wrong_keyword, 1)

            return {
                "quiz_type": "OX",
                "question": f"다음 설명이 맞으면 O, 틀리면 X를 선택하세요.\n\n{false_sentence}",
                "options": ["O", "X"],
                "answer": "X",
                "explanation": f"원문은 '{source_sentence}'입니다.",
                "source_sentence": source_sentence,
            }

    return {
        "quiz_type": "OX",
        "question": f"다음 설명이 맞으면 O, 틀리면 X를 선택하세요.\n\n{source_sentence}",
        "options": ["O", "X"],
        "answer": "O",
        "explanation": make_explanation(
            "OX",
            concept.concept_name,
            "O",
            source_sentence,
        ),
        "source_sentence": source_sentence,
    }


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

    for concept_index, concept in enumerate(concepts):
        concept_generated_count = 0

        for local_index in range(count_per_concept):
            quiz_data = None
            seed = concept_index + local_index

            if quiz_type == "BLANK":
                quiz_data = generate_blank_quiz(
                    concept=concept,
                    all_keywords=all_keywords,
                    option_count=option_count,
                )

            elif quiz_type == "DEFINITION":
                quiz_data = generate_definition_quiz(
                    concept=concept,
                    all_sentences=all_sentences,
                    option_count=option_count,
                )

            elif quiz_type == "KEYWORD_CHOICE":
                quiz_data = generate_keyword_choice_quiz(
                    concept=concept,
                    all_concept_names=all_concept_names,
                    option_count=option_count,
                )

            elif quiz_type == "OX":
                quiz_data = generate_ox_quiz(
                    concept=concept,
                    all_keywords=all_keywords,
                    index_seed=seed,
                )

            if quiz_data:
                quiz_data["lecture_id"] = concept.lecture_id
                quiz_data["concept_id"] = concept.id
                quiz_data["concept_name"] = concept.concept_name
                quiz_data["page_num"] = concept.page_num
                generated.append(quiz_data)
                concept_generated_count += 1
            else:
                failed_count += 1

        if concept_generated_count == 0 and count_per_concept > 0:
            continue

    return generated, failed_count