/* ==========================================================
   QuizSync v2 — Shared store
   ========================================================== */
const QSync = (function () {
  const MEMO_KEY = 'quizsync-v2-memos';
  const COURSES_KEY = 'quizsync-v2-courses';

  // ---- Keyword bank (mocked AI extraction by page range) ----
  const KEYWORD_BANK = {
    p1_3: ['스택', 'LIFO', 'push/pop', '큐', 'FIFO', 'rear/front'],
    p4_7: ['연결 리스트', '노드', '포인터', '단일 연결', '이중 연결', '환형 큐'],
    p8_12: ['BST', '트리 순회', '중위 후속자', '힙', '완전 이진 트리', '우선순위 큐'],
  };

  const QUIZ_TPL = {
    '스택': { type: '객관식', q: '스택은 ___ 구조를 따르는 선형 자료구조이다',
      choices: ['LIFO', 'FIFO', '트리', '그래프'], answer: 0,
      explain: '스택(Stack)은 Last-In-First-Out(LIFO) 구조로, 가장 마지막에 들어간 데이터가 가장 먼저 나옵니다.' },
    'LIFO': { type: '객관식', q: '다음 중 LIFO 구조의 예가 아닌 것은?',
      choices: ['스택', '함수 호출 스택', '브라우저 뒤로가기', '은행 대기열'], answer: 3,
      explain: '은행 대기열은 FIFO(선입선출) 구조입니다. 나머지는 모두 LIFO 구조에 기반합니다.' },
    'push/pop': { type: 'O/X', q: '스택의 push 연산은 top을 1 증가시킨다',
      choices: ['O', 'X'], answer: 0,
      explain: 'push는 top을 +1 한 뒤 해당 위치에 데이터를 저장합니다. pop은 반대로 동작합니다.' },
    '큐': { type: '객관식', q: '큐(Queue)는 어떤 구조를 따르나요?',
      choices: ['LIFO', 'FIFO', 'LILO', 'RANDOM'], answer: 1,
      explain: '큐는 FIFO(First-In-First-Out) 구조로, 먼저 들어간 데이터가 먼저 나옵니다.' },
    'FIFO': { type: '객관식', q: 'FIFO 구조의 대표적인 예는?',
      choices: ['스택', '큐', '힙', '재귀 호출'], answer: 1,
      explain: '큐가 가장 대표적인 FIFO 구조입니다.' },
    'rear/front': { type: '객관식', q: '큐에서 삽입은 ___ 에서 이루어진다',
      choices: ['rear', 'front', 'top', 'bottom'], answer: 0,
      explain: '큐는 rear(뒤)에서 삽입(enqueue), front(앞)에서 삭제(dequeue)합니다.' },
    '연결 리스트': { type: '객관식', q: '연결 리스트의 각 요소를 ___ 라고 한다',
      choices: ['노드', '배열', '셀', '블록'], answer: 0,
      explain: '연결 리스트의 각 요소는 데이터와 다음 노드 참조를 가진 노드(Node)입니다.' },
    '노드': { type: 'O/X', q: '단일 연결 리스트의 노드는 다음 노드의 참조만 가진다',
      choices: ['O', 'X'], answer: 0,
      explain: '단일 연결 리스트는 다음 참조만 있고, 이중 연결 리스트는 이전·다음 모두를 갖습니다.' },
    '포인터': { type: '객관식', q: 'NULL 포인터가 단일 연결 리스트에서 의미하는 것은?',
      choices: ['리스트의 끝', '루트 노드', '중간 삽입 지점', '오류 상태'], answer: 0,
      explain: '단일 연결 리스트에서 NULL 포인터는 리스트의 마지막 노드 다음을 나타냅니다.' },
    '단일 연결': { type: 'O/X', q: '단일 연결 리스트는 역방향 순회가 O(1)이다',
      choices: ['O', 'X'], answer: 1,
      explain: '단일 연결 리스트는 다음 참조만 있어 역방향 순회가 O(n)으로 느립니다.' },
    '이중 연결': { type: '객관식', q: '이중 연결 리스트가 단일 연결 리스트보다 우수한 점은?',
      choices: ['공간 효율', '양방향 순회', '메모리 사용량', '정렬 속도'], answer: 1,
      explain: '이중 연결 리스트는 이전 참조도 가져 양방향 순회가 O(1)에 가능합니다.' },
    '환형 큐': { type: '객관식', q: '환형 큐의 가장 큰 장점은?',
      choices: ['배열 공간 재사용', '메모리 절약', '삽입 속도', '검색 속도'], answer: 0,
      explain: '환형 큐는 배열의 빈 공간을 재사용해 메모리를 효율적으로 활용합니다.' },
    'BST': { type: '객관식', q: 'BST에서 왼쪽 서브트리의 값은 항상 부모보다 ___',
      choices: ['작다', '크다', '같다', '관계없음'], answer: 0,
      explain: 'BST의 정의: 왼쪽 서브트리는 부모보다 작고, 오른쪽 서브트리는 부모보다 큽니다.' },
    '트리 순회': { type: '객관식', q: '중위 순회의 방문 순서는?',
      choices: ['L-V-R', 'V-L-R', 'L-R-V', 'R-V-L'], answer: 0,
      explain: '중위 순회는 Left → Visit → Right 순서로 방문합니다.' },
    '중위 후속자': { type: '객관식', q: 'BST 노드 삭제 시 두 자식이 있는 경우 대체 값은?',
      choices: ['중위 후속자', '부모 노드', '최근 삽입 노드', '임의 리프'], answer: 0,
      explain: '중위 후속자(또는 중위 선행자)를 대체 값으로 사용해 BST 정렬 조건을 유지합니다.' },
    '힙': { type: '객관식', q: '힙은 ___ 트리의 일종이다',
      choices: ['완전 이진', '이진 탐색', 'AVL', 'B-'], answer: 0,
      explain: '힙은 완전 이진 트리 형태이며 우선순위 규칙을 따릅니다.' },
    '완전 이진 트리': { type: 'O/X', q: '완전 이진 트리는 모든 레벨이 꽉 차 있어야 한다',
      choices: ['O', 'X'], answer: 1,
      explain: '마지막 레벨은 왼쪽부터 채워지면 됩니다. 모든 레벨이 꽉 찰 필요는 없습니다.' },
    '우선순위 큐': { type: '객관식', q: '우선순위 큐의 효율적 구현에 적합한 자료구조는?',
      choices: ['스택', '연결 리스트', '힙', '배열'], answer: 2,
      explain: '힙을 사용하면 삽입과 추출이 모두 O(log n)에 가능합니다.' },
  };

  const BOT_RESP = {
    '스택':        [22, 5, 1, 1],
    'LIFO':        [4, 3, 4, 18],
    'push/pop':    [21, 8],
    '큐':          [3, 22, 2, 1],
    'FIFO':        [3, 22, 4, 0],
    'rear/front':  [14, 7, 2, 0],
    '연결 리스트': [19, 4, 2, 2],
    '노드':        [16, 9],
    '포인터':      [13, 6, 4, 4],
    '단일 연결':   [8, 19],
    '이중 연결':   [2, 21, 4, 1],
    '환형 큐':     [20, 4, 2, 1],
    'BST':         [22, 3, 1, 1],
    '트리 순회':   [21, 4, 2, 1],
    '중위 후속자': [22, 3, 1, 1],
    '힙':          [19, 5, 2, 1],
    '완전 이진 트리': [4, 21],
    '우선순위 큐': [2, 4, 18, 3],
  };

  const SAMPLE_QUESTIONS = [
    { id: 101, text: '스택 오버플로우가 언제 발생하나요?', ago: '22분 전' },
    { id: 102, text: '연결 리스트와 배열의 가장 큰 차이가 뭔지 다시 정리해주세요.', ago: '15분 전' },
    { id: 103, text: '큐와 덱(Deque)의 차이가 뭔가요? 환형 큐랑은 어떻게 다른가요?', ago: '8분 전' },
    { id: 104, text: '힙에서 부모-자식 인덱스 계산 공식 한 번 더 짚어주실 수 있나요?', ago: '5분 전' },
  ];

  const DEFAULT_COURSES = [
    { id: 'ds',   year: 2026, term: '1학기', title: '자료구조론',   section: '01', students: 32, meta: '컴퓨터공학과 · 월/수 10:30', status: 'live', week: 5 },
    { id: 'os',   year: 2026, term: '1학기', title: '운영체제',      section: '02', students: 28, meta: '컴퓨터공학과 · 화/목 13:30', status: 'soon', week: 4 },
    { id: 'algo', year: 2026, term: '1학기', title: '알고리즘 설계', section: '01', students: 41, meta: '소프트웨어학부 · 금 09:00',   status: 'idle', week: 5 },
    { id: 'db',   year: 2025, term: '2학기', title: '데이터베이스', section: '01', students: 38, meta: '컴퓨터공학과 · 화/목 13:30', status: 'done', week: 15 },
  ];

  function loadCourses() {
    try { const raw = localStorage.getItem(COURSES_KEY); return raw ? JSON.parse(raw) : DEFAULT_COURSES.slice(); }
    catch { return DEFAULT_COURSES.slice(); }
  }
  function saveCourses(list) { try { localStorage.setItem(COURSES_KEY, JSON.stringify(list)); } catch {} }

  function loadMemos() {
    try { const raw = localStorage.getItem(MEMO_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  function saveMemos(m) { try { localStorage.setItem(MEMO_KEY, JSON.stringify(m)); } catch {} }

  function keywordsFor(start, end) {
    if (end <= 3) return KEYWORD_BANK.p1_3.slice();
    if (start >= 8) return KEYWORD_BANK.p8_12.slice();
    if (start >= 4 && end <= 7) return KEYWORD_BANK.p4_7.slice();
    return [
      ...KEYWORD_BANK.p1_3.slice(0, 2),
      ...KEYWORD_BANK.p4_7.slice(0, 2),
      ...KEYWORD_BANK.p8_12.slice(0, 2),
    ];
  }

  let _qid = 1000;
  function quizFromKeyword(kw, idx) {
    const tpl = QUIZ_TPL[kw] || QUIZ_TPL['스택'];
    return {
      id: ++_qid, n: `Q${idx + 1}`, keyword: kw, type: tpl.type, q: tpl.q,
      choices: tpl.choices.slice(), answer: tpl.answer, explain: tpl.explain,
    };
  }
  function botCounts(kw) { return (BOT_RESP[kw] || [10, 5, 3, 2]).slice(); }

  const state = {
    role: 'professor',
    loggedIn: false,
    classCode: 'JEB5ZA',
    joinCount: 12,
    studentsConnected: 32,
    splitRatio: 0.68,           // PDF panel ratio
    courses: loadCourses(),
    selectedCourseId: 'ds',
    pdf: null,                  // pdfDocProxy
    pdfFileName: null,
    pdfTotalPages: 0,
    pdfCurrentPage: 1,
    pdfZoom: 1.0,
    selectedKws: [],
    extractedKws: [],
    sets: [],
    activeSetId: null,
    questions: SAMPLE_QUESTIONS.slice(),
    studentQuestions: [],
    memos: loadMemos(),
    inClassMode: false,
  };

  return {
    state, KEYWORD_BANK, QUIZ_TPL, BOT_RESP, SAMPLE_QUESTIONS,
    keywordsFor, quizFromKeyword, botCounts,
    saveMemos, loadMemos, saveCourses, loadCourses,
  };
})();

// PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}
