ALGORITHM_QUIZ_TYPES = [
    "MULTIPLE_CHOICE",
    "OX",
    "SHORT_ANSWER",
    "SUBJECTIVE",
]

# Keep SUBJECTIVE support in the codebase, but disable new generation for now.
SUBJECTIVE_GENERATION_ENABLED = False

MAX_SHORT_ANSWER_LENGTH = 30
MAX_OPTION_LENGTH = 90
MAX_SOURCE_SENTENCE_LENGTH = 160
MIN_QUESTION_CONTEXT_LENGTH = 8
MAX_CONCEPT_LABEL_LENGTH = 36
MIN_SOURCE_SENTENCE_COMPACT_LENGTH = 10
MIN_DEFINITION_ANSWER_COMPACT_LENGTH = 16

SERVICE_MIN_QUIZ_COUNT = 3
SERVICE_MAX_QUIZ_COUNT = 12

AI_TARGET_MIN_QUIZZES = 6
AI_TARGET_MAX_QUIZZES = SERVICE_MAX_QUIZ_COUNT
AI_BATCH_SIZE = 4

AI_BATCH_MAX_SOURCE_SENTENCES = 4
AI_BATCH_MAX_KEYWORDS = 8

SLIDE_ARTIFACT_CHARS = (
    "\uf0e8",  # 
    "\uf0b7",  # 
    "\u2022",  # •
    "\u2023",  # ‣
    "\u25e6",  # ◦
    "\u25aa",  # ▪
    "\u25cf",  # ●
    "\u25b6",  # ▶
    "\u2794",  # ➔
    "\u2192",  # →
)

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
    # 너무 일반적인 말
    "조건만족",
    "초기",
    "확인",
    "부분",
    "부위",
    "경우",
    "과정",
    "방법",
    "결과",
    "상태",
    "대상",
    "문제",
    "내용",
    "설명",
    "선택",
    "실험",
    "그룹",
    "활동",
    "수준",
    "양",

    # 실험 예시/선택지 단어
    "가위",
    "바위",
    "보",
    "방울",
    "쥐",
    "원숭이",

    # 다른 장에서 들어온 과도하게 넓은 단어
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

    # PDF 문장 조각이 concept_name으로 들어온 경우
    "도착하는경우",
    "도착하는",
    "손상시킨",
    "실험수행",
    "그룹으로나누",
    "보상을다르게설정",
    "활동수준",
    "증가함에따라",
    "존재한다고추정",
    "조개의시냅스",
    "의사결정과정에영향",
)

DANGLING_TEXT_ENDINGS = (
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
    "및",
    "또는",
    "그리고",
    "하지만",
    "통해",
    "위해",
    "따라",
    "대해",
    "관한",
    "때문에",
    "이것이",
    "영향을",
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

ALLOWED_SHORT_CONCEPT_LABELS = {
    "보상",
    "효용",
    "해마",
    "안도",
    "도파민",
    "시냅스",
    "LTP",
    "TD",
}

BAD_EXAMPLE_CONCEPT_MARKERS = (
    "가위바위",
    "가위바위보",
    "rockpaperscissors",
    "쥐를활용",
    "원숭이실험",
    "의원숭이실험",
)

BAD_STANDALONE_ENGLISH_KEYWORDS = {
    "acid",
    "lobe",
    "synaptic",
    "plasticity",
}

CORE_KEYWORD_REQUIRED_MARKERS = (
    "기억",
    "학습",
    "강화",
    "보상",
    "예측",
    "오류",
    "도파민",
    "시냅스",
    "가소성",
    "해마",
    "기저핵",
    "피질",
    "안도",
    "효용",
    "모델",
    "습관",
    "의사결정",
    "simulation",
    "memory",
    "dopamine",
    "synapse",
    "plasticity",
    "reinforcement",
)

COMPLETE_PREDICATE_MARKERS = (
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
    "선택",
    "수행",
    "높아짐",
    "낮아짐",
    "존재",
    "추정",
    "나타남",
)

SHORT_OPTION_FRAGMENT_MARKERS = (
    "을수행",
    "를수행",
    "의원숭이",
    "의실험",
    "실험수행",
    "그룹으로나누",
    "보상을다르게설정",
    "예상치못하게",
    "받을때",
    "시행에서",
    "어떻게확인",
    "쥐를활용",
    "시냅스가중치synaptic",
    "유식한강화학습무식한강화학습",
    "유식한강화학습",
    "무식한강화학습",
    "가위바위",
    "가위바위보",
)

TITLE_LIKE_SHORT_OPTION_MARKERS = (
    # 슬라이드 제목/소제목과 답 조각이 붙은 형태
    "절차학습은뇌의어디",
    "절차학습뇌의어디",
    "은뇌의어디",
    "는뇌의어디",
    "뇌의어디",
    "어디기저핵",
    "후회와안와전두피질",
    "후회안와전두피질",
    "신경세포와학습",
    "신경세포학습",
    "시냅스가중치",
    "블레즈파스칼",
    "파스칼",
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
    "MULTIPLE_CHOICE",
    "SUBJECTIVE",
    "MULTIPLE_CHOICE",
    "SHORT_ANSWER",
    "OX",
]
