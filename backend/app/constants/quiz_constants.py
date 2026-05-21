ALGORITHM_QUIZ_TYPES = ["BLANK", "DEFINITION", "KEYWORD_CHOICE", "OX"]

MAX_SHORT_ANSWER_LENGTH = 30
MAX_OPTION_LENGTH = 90
MAX_SOURCE_SENTENCE_LENGTH = 160
MIN_QUESTION_CONTEXT_LENGTH = 8
MAX_CONCEPT_LABEL_LENGTH = 36
MIN_SOURCE_SENTENCE_COMPACT_LENGTH = 10

SERVICE_MIN_QUIZ_COUNT = 3
SERVICE_MAX_QUIZ_COUNT = 12

AI_TARGET_MIN_QUIZZES = 6
AI_TARGET_MAX_QUIZZES = SERVICE_MAX_QUIZ_COUNT
AI_BATCH_SIZE = 4

AI_BATCH_MAX_SOURCE_SENTENCES = 4
AI_BATCH_MAX_KEYWORDS = 8

QUESTION_UNSAFE_NEGATIVE_MARKERS = (
    "아닌",
    "없는",
    "않은",
    "틀린",
    "적절하지",
    "관련 없는",
    "관련이 없는",
)

GENERIC_BAD_CONCEPT_LABELS = {
    "조건만족",
    "유전자",
    "지주",
    "체세포",
}

LOW_QUALITY_TEXT_MARKERS = (
    "이요구",
    "인간을위",
    "에게넘겨줌",
    "년도착후",
    "현재활동중",
    "도구활",
    "장착도구활",
    "앞으로우리",
    "모델시냅스",
    "85모델",
    "의매리너",
    "전송가능목시",
)

SOURCE_FACT_MARKERS = (
    ":",
    "：",
    "다",
    "함",
    "있음",
    "가능",
    "필요",
    "선택",
    "전송",
    "분석",
    "이동",
    "수행",
    "장착",
    "활용",
    "조절",
    "유지",
    "동작",
    "해결",
    "개선",
    "증가",
    "확인",
    "보유",
    "도착",
    "착륙",
    "학습",
    "변함",
    "늘어난다",
    "아님",
)

SHORT_ANSWER_SENTENCE_LIKE_MARKERS = [
    "다.",
    "함",
    "것",
    "있음",
    "필요",
    "가능",
    "요구",
]

WEAK_BLANK_ANSWER_WORDS = {
    "합리적으로",
    "비합리적으로",
    "독립적으로",
    "무의식적으로",
    "직접적으로",
    "간접적으로",
    "효율적으로",
    "적절하게",
    "가능한",
    "필요한",
    "많은",
    "적은",
    "높은",
    "낮은",
}

UNSAFE_CONCEPT_LABEL_SUFFIXES = ("을위", "에게", "활", "중")

SENTENCE_LIKE_CONCEPT_FRAGMENTS = (
    "수있음",
    "것이다",
    "필요",
    "요구",
    "위해",
    "넘겨",
    "해결한문제",
    "당면할수있는",
)

QUESTION_LIKE_ENDINGS = (
    "무엇인가",
    "무엇인가요",
    "어떻게되는가",
    "어떻게되나요",
    "왜필요한가",
    "왜필요한가요",
    "하려면",
)

CONCEPT_LABEL_REPLACEMENTS = [
    ("에필요한고려사항은", ""),
    ("에필요한고려사항", ""),
    ("을사용하면복잡한의사결정의문제를보다쉽고합리적으로해결할수있음", ""),
    ("년도착후현재활동중", ""),
    ("앞으로우리", ""),
]

SOURCE_LABEL_SEPARATORS = [":", "："]

AI_PREFERRED_MIXED_QUIZ_TYPES = [
    "DEFINITION",
    "KEYWORD_CHOICE",
    "DEFINITION",
    "BLANK",
]
