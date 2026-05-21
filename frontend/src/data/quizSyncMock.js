export const defaultCourses = [
  { id: 'ds', year: 2026, term: '1학기', title: '자료구조론', section: '01', students: 32, meta: '컴퓨터공학과 · 월/수 10:30', status: 'live', week: 5 },
  { id: 'os', year: 2026, term: '1학기', title: '운영체제', section: '02', students: 28, meta: '컴퓨터공학과 · 화/목 13:30', status: 'soon', week: 4 },
  { id: 'algo', year: 2026, term: '1학기', title: '알고리즘 설계', section: '01', students: 41, meta: '소프트웨어학부 · 금 09:00', status: 'idle', week: 5 },
  { id: 'db', year: 2025, term: '2학기', title: '데이터베이스', section: '01', students: 38, meta: '컴퓨터공학과 · 화/목 13:30', status: 'done', week: 15 },
];

export const KEYWORD_BANK = {
  p1_3: ['스택', 'LIFO', 'push/pop', '큐', 'FIFO', 'rear/front'],
  p4_7: ['연결 리스트', '노드', '포인터', '단일 연결', '이중 연결', '환형 큐'],
  p8_12: ['BST', '트리 순회', '중위 후속자', '힙', '완전 이진 트리', '우선순위 큐'],
};

export const QUIZ_TEMPLATES = {
  '스택': { type: '객관식', q: '스택은 ___ 구조를 따르는 선형 자료구조이다', choices: ['LIFO', 'FIFO', '트리', '그래프'], answer: 0 },
  'LIFO': { type: '객관식', q: '다음 중 LIFO 구조의 예가 아닌 것은?', choices: ['스택', '함수 호출 스택', '브라우저 뒤로가기', '은행 대기열'], answer: 3 },
  'push/pop': { type: 'O/X', q: '스택의 push 연산은 top을 1 증가시킨다', choices: ['O', 'X'], answer: 0 },
  '큐': { type: '객관식', q: '큐(Queue)는 어떤 구조를 따르나요?', choices: ['LIFO', 'FIFO', 'LILO', 'RANDOM'], answer: 1 },
  'FIFO': { type: '객관식', q: 'FIFO 구조의 대표적인 예는?', choices: ['스택', '큐', '힙', '재귀 호출'], answer: 1 },
  'rear/front': { type: '객관식', q: '큐에서 삽입은 ___ 에서 이루어진다', choices: ['rear', 'front', 'top', 'bottom'], answer: 0 },
  '연결 리스트': { type: '객관식', q: '연결 리스트의 각 요소를 ___ 라고 한다', choices: ['노드', '배열', '셀', '블록'], answer: 0 },
  '노드': { type: 'O/X', q: '단일 연결 리스트의 노드는 다음 노드의 참조만 가진다', choices: ['O', 'X'], answer: 0 },
  '포인터': { type: '객관식', q: 'NULL 포인터가 단일 연결 리스트에서 의미하는 것은?', choices: ['리스트의 끝', '루트 노드', '중간 삽입 지점', '오류 상태'], answer: 0 },
  '단일 연결': { type: 'O/X', q: '단일 연결 리스트는 역방향 순회가 O(1)이다', choices: ['O', 'X'], answer: 1 },
  '이중 연결': { type: '객관식', q: '이중 연결 리스트가 단일 연결 리스트보다 우수한 점은?', choices: ['공간 효율', '양방향 순회', '메모리 사용량', '정렬 속도'], answer: 1 },
  '환형 큐': { type: '객관식', q: '환형 큐의 가장 큰 장점은?', choices: ['배열 공간 재사용', '메모리 절약', '삽입 속도', '검색 속도'], answer: 0 },
  'BST': { type: '객관식', q: 'BST에서 왼쪽 서브트리의 값은 항상 부모보다 ___', choices: ['작다', '크다', '같다', '관계없음'], answer: 0 },
  '트리 순회': { type: '객관식', q: '중위 순회의 방문 순서는?', choices: ['L-V-R', 'V-L-R', 'L-R-V', 'R-V-L'], answer: 0 },
  '중위 후속자': { type: '객관식', q: 'BST 노드 삭제 시 두 자식이 있는 경우 대체 값은?', choices: ['중위 후속자', '부모 노드', '최근 삽입 노드', '임의 리프'], answer: 0 },
  '힙': { type: '객관식', q: '힙은 ___ 트리의 일종이다', choices: ['완전 이진', '이진 탐색', 'AVL', 'B-'], answer: 0 },
  '완전 이진 트리': { type: 'O/X', q: '완전 이진 트리는 모든 레벨이 꽉 차 있어야 한다', choices: ['O', 'X'], answer: 1 },
  '우선순위 큐': { type: '객관식', q: '우선순위 큐의 효율적 구현에 적합한 자료구조는?', choices: ['스택', '연결 리스트', '힙', '배열'], answer: 2 },
};

export const SAMPLE_QUESTIONS = [
  { id: 101, text: '스택 오버플로우가 언제 발생하나요?', ago: '22분 전' },
  { id: 102, text: '연결 리스트와 배열의 가장 큰 차이가 뭔지 다시 정리해주세요.', ago: '15분 전' },
  { id: 103, text: '큐와 덱(Deque)의 차이가 뭔가요? 환형 큐랑은 어떻게 다른가요?', ago: '8분 전' },
  { id: 104, text: '힙에서 부모-자식 인덱스 계산 공식 한 번 더 짚어주실 수 있나요?', ago: '5분 전' },
];

export function keywordsFor(start, end) {
  if (end <= 3) return KEYWORD_BANK.p1_3.slice();
  if (start >= 8) return KEYWORD_BANK.p8_12.slice();
  if (start >= 4 && end <= 7) return KEYWORD_BANK.p4_7.slice();
  return [
    ...KEYWORD_BANK.p1_3.slice(0, 2),
    ...KEYWORD_BANK.p4_7.slice(0, 2),
    ...KEYWORD_BANK.p8_12.slice(0, 2),
  ];
}

let nextQuestionId = 1000;
export function quizFromKeyword(keyword, index) {
  const tpl = QUIZ_TEMPLATES[keyword] || QUIZ_TEMPLATES['스택'];
  return {
    id: ++nextQuestionId,
    n: `Q${index + 1}`,
    keyword,
    type: tpl.type,
    question: tpl.q,
    choices: tpl.choices,
    answer: tpl.answer,
  };
}

export function botCounts(keyword) {
  return [
    Math.max(2, Math.floor(Math.random() * 28)),
    Math.max(1, Math.floor(Math.random() * 18)),
    Math.max(0, Math.floor(Math.random() * 12)),
    Math.max(0, Math.floor(Math.random() * 6)),
  ];
}
