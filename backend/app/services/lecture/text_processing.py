import re

from app.constants.lecture_constants import HEADER_PATTERNS, STOPWORDS


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
    text = remove_headers(text)
    words = re.findall(r'[가-힣]{2,}|[a-zA-Z]{3,}', text)

    cleaned_words = []
    for word in words:
        word = re.sub(r'(은|는|이|가|을|를|에|의|로|으로|과|와|에서|들|면|서|고|락)$', '', word)
        word = re.sub(r'(하|되|한|된|용|적)$', '', word)

        if len(word) >= 2 and word not in STOPWORDS:
            cleaned_words.append(word)

    return ' '.join(cleaned_words)


def extract_key_sentences(text: str, keywords: list, top_k: int = 2) -> list:
    raw_sentences = re.split(r'[\n•]', text)
    sentences = [s.strip() for s in raw_sentences if len(s.strip()) >= 15]
    if not sentences:
        return []

    scored = []
    for sentence in sentences:
        score = sum(1 for kw in keywords if kw in sentence)
        scored.append((score, sentence))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [s for score, s in scored[:top_k] if score > 0]