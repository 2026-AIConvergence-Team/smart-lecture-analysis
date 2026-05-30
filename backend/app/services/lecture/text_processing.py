import re


from sklearn.feature_extraction.text import TfidfVectorizer
from kiwipiepy import Kiwi
from app.constants.lecture_constants import HEADER_PATTERNS, STOPWORDS

# 문장 병합 시 최대 길이 제한
MAX_SENTENCE_LENGTH = 150
kiwi = Kiwi()


def remove_headers(text: str) -> str:
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        line = line.strip()
        skip = False
        for pattern in HEADER_PATTERNS:
            if re.fullmatch(pattern, line):
                skip = True
                break
        if not skip and line:
            cleaned_lines.append(line)
    return '\n'.join(cleaned_lines)


def extract_pure_tokens(text: str) -> str:
    """TF-IDF용 토크나이징 — kiwipiepy 형태소 분석 기반"""
    text = remove_headers(text)

    result = kiwi.analyze(text)[0][0]
    nouns = [
        token.form
        for token in result
        if token.tag in ('NNG', 'NNP')  
        and len(token.form) >= 2
        and token.form not in STOPWORDS
    ]

    return ' '.join(nouns)


def _remove_substring_duplicates(keywords: list[str]) -> list[str]:
    """
    키워드 중 다른 키워드의 부분 문자열인 것을 제거.
    예: ["불확실성", "동반 불확실성", "동반"] → ["동반 불확실성"]
    """
    filtered = []
    for kw in keywords:
        if not any(kw != other and kw in other for other in keywords):
            filtered.append(kw)
    return filtered


def extract_keywords_tfidf(
    text: str,
    all_texts: list[str],
    top_n: int = 10,
) -> list[str]:
    """
    TF-IDF 기반 키워드 추출.
    text: 현재 페이지 텍스트
    all_texts: 전체 페이지 텍스트 리스트 (IDF 계산용)
    """
    tokenized = [extract_pure_tokens(t) for t in all_texts]
    current_tokenized = extract_pure_tokens(text)

    if not current_tokenized.strip():
        return []

    try:
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            max_df=0.5,
            min_df=1,
            token_pattern=r'[가-힣a-zA-Z]{2,}'
        )
        tfidf_matrix = vectorizer.fit_transform(tokenized)
        feature_names = vectorizer.get_feature_names_out()

        current_idx = tokenized.index(current_tokenized) if current_tokenized in tokenized else 0
        scores = tfidf_matrix[current_idx].toarray()[0]

        # top_n보다 더 많이 뽑은 후 중복 제거
        top_indices = scores.argsort()[::-1][:top_n * 2]
        keywords = [feature_names[idx] for idx in top_indices if scores[idx] > 0]

        # 부분 문자열 중복 제거
        keywords = _remove_substring_duplicates(keywords)

        return keywords[:top_n]

    except Exception:
        return []


def extract_page_title(text: str) -> str:
    """페이지 첫 번째 유효한 줄을 제목으로 추출"""
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if len(line) >= 4 and len(line) <= 40:
            if not re.fullmatch(r'[\d\s\.\-]+', line):
                return line
    return ""


def generate_concept_name(keywords: list[str]) -> str:
    """키워드 중 첫 번째를 개념명으로 사용"""
    if keywords:
        return keywords[0]
    return ""


def _is_incomplete_line(text: str) -> bool:
    """
    문장이 불완전하게 끝났는지 판별.
    - 콜론(:)으로 끝나는 경우
    - 쉼표(,)로 끝나는 경우
    - 조사/어미로 시작하는 경우
    - 너무 짧은 경우
    """
    if len(text) < 5:
        return True
    if re.search(r'[,:]$', text):
        return True
    if re.match(r'^(을|를|이|가|은|는|도|만|의|에|로|와|과|서|고|며|어|아|음|임|함|됨|겠|었|았)', text):
        return True
    return False


def _is_truncated_sentence(text: str) -> bool:
    """
    PDF 추출 중 잘린 불완전한 문장 판별.
    - 조사/어미/전치사로 끝나는 경우 (문장이 중간에 잘린 것)
    - 예: "...번영에 이", "...보일 수 있으나, 실", "...얻을 것인"
    """
    if not text:
        return True

    # 한 글자 조사/어미로 끝나는 경우
    if re.search(r'(이|을|를|의|에|로|은|는|가|와|과|서|고|며|나|도|만|인|적|실|한|된|기|다|라)$', text):
        return True

    # 2글자 이하로 끝나고 명사가 아닌 경우 (잘린 단어)
    last_word = text.split()[-1] if text.split() else ""
    if len(last_word) <= 1:
        return True

    return False


def _merge_lines(raw_lines: list[str]) -> list[str]:
    """
    불완전하게 끊긴 줄을 다음 줄과 합쳐서 완전한 문장으로 만듦.
    MAX_SENTENCE_LENGTH 초과 시 강제로 끊어서 너무 긴 문장 방지.
    """
    merged = []
    buffer = ""

    for line in raw_lines:
        line = line.strip()
        if not line:
            continue

        if buffer:
            merged_candidate = buffer + " " + line
            if len(merged_candidate) > MAX_SENTENCE_LENGTH:
                merged.append(buffer)
                if _is_incomplete_line(line):
                    buffer = line
                else:
                    merged.append(line)
                    buffer = ""
            else:
                buffer = merged_candidate
                if not _is_incomplete_line(buffer):
                    merged.append(buffer)
                    buffer = ""
        else:
            if _is_incomplete_line(line):
                buffer = line
            else:
                merged.append(line)

    if buffer:
        merged.append(buffer)

    return merged


def extract_key_sentences(text: str, keywords: list, top_k: int = 2) -> list:
    """키워드 기반 핵심 문장 추출 (불완전한 줄 병합 + 잘린 문장 필터링 포함)"""
    raw_lines = re.split(r'[\n•]', text)

    sentences = _merge_lines(raw_lines)

    # 최소 길이 필터
    sentences = [s for s in sentences if len(s) >= 15]

    # 잘린 문장 필터링
    sentences = [s for s in sentences if not _is_truncated_sentence(s)]

    if not sentences:
        return []

    scored = []
    for sentence in sentences:
        score = sum(1 for kw in keywords if kw in sentence)
        scored.append((score, sentence))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored[:top_k] if score > 0]