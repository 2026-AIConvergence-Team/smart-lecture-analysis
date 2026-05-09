export const quiz = {
  course: "A204 · 자료구조",
  progress: "문제 1 / 3",
  score: "스택 · 큐",
  question: "스택은 ______ 구조로, 마지막에 삽입된 데이터가 먼저 삭제된다.",
  options: [
    "FIFO (First In First Out)",
    "LIFO (Last In First Out)",
    "LILO (Last In Last Out)",
    "FILO (First In Last Out)",
  ],
  selected: "LIFO (Last In First Out)",
};

export const materials = [
  { title: "스택과 큐", type: "PDF", status: "분석 완료", concepts: 7 },
  { title: "힙 메모리와 포인터", type: "개념 노트", status: "복습 추천", concepts: 5 },
  { title: "연결 리스트", type: "요약", status: "퀴즈 생성됨", concepts: 6 },
];

export const concepts = [
  { name: "스택", page: 3, keywords: ["LIFO", "push", "pop"], risk: "high" },
  { name: "큐", page: 4, keywords: ["FIFO", "enqueue", "dequeue"], risk: "low" },
  { name: "힙 메모리", page: 9, keywords: ["동적 할당", "free", "pointer"], risk: "medium" },
  { name: "포인터", page: 11, keywords: ["주소", "참조", "역참조"], risk: "high" },
];

export const generatedQuizzes = [
  { type: "빈칸", question: "스택은 마지막에 들어온 데이터가 먼저 나가는 ______ 구조이다.", answer: "LIFO" },
  { type: "객관식", question: "큐의 기본 동작 원리에 해당하는 것은?", answer: "FIFO" },
  { type: "단답형", question: "동적 할당 메모리를 해제할 때 사용하는 C 함수는?", answer: "free" },
];

export const dashboardStats = [
  { label: "평균 이해도", value: "48", tone: "danger" },
  { label: "접속 학생", value: "34명" },
  { label: "모르겠음 응답", value: "12명", tone: "warning" },
  { label: "익명 질문", value: "7건" },
];

export const understandingTrend = [78, 74, 71, 68, 72, 66, 61, 51, 47];

export const questions = [
  { text: "스택이랑 힙이 같은 공간에 있는 건가요?", count: 12 },
  { text: "포인터 주소값이 스택에 저장되는 건지 모르겠어요", count: 8 },
  { text: "힙은 언제 해제해야 하나요?", count: 5 },
  { text: "재귀 호출이 스택에 쌓인다는 게 무슨 뜻인가요?", count: 3 },
];

export const reportStats = [
  { label: "평균 이해도", value: "61" },
  { label: "참여 학생", value: "34명" },
  { label: "급락 구간", value: "3회" },
  { label: "익명 질문", value: "18건" },
];

export const weakConcepts = [
  { rank: 1, title: "스택 포인터와 힙 메모리 차이", detail: "32분 경과 시점", drop: "-22점" },
  { rank: 2, title: "재귀 함수의 콜스택 동작 원리", detail: "18분 경과 시점", drop: "-14점" },
  { rank: 3, title: "이중 연결 리스트 포인터 연결", detail: "44분 경과 시점", drop: "-11점" },
];

export const miniReport = {
  responseRate: 80,
  correctRate: 58,
  weakConcepts: [
    { title: "스택 / 힙 메모리 구조", rate: "오답률 68%" },
    { title: "포인터 참조 방식", rate: "오답률 52%" },
    { title: "이중 연결 리스트", rate: "오답률 35%" },
  ],
};

export const studentResult = {
  total: 3,
  correct: 2,
  wrongRate: 33,
  items: [
    { concept: "스택", result: "정답", note: "LIFO 구조를 잘 이해했습니다." },
    { concept: "힙 메모리", result: "오답", note: "할당과 해제 흐름 복습이 필요합니다." },
    { concept: "큐", result: "정답", note: "FIFO 개념을 정확히 골랐습니다." },
  ],
};

export const studentQuestions = [
  "스택과 힙이 실제 메모리에서 붙어 있나요?",
  "포인터 주소값은 어디에 저장되나요?",
  "재귀 호출이 왜 스택에 쌓이나요?",
];
