// Module-level cache: survives React Router navigation within the same browser tab
const cache = {
  pdfData: null,
  pdfFileName: null,
  pdfTotal: 0,
  quizSets: [],
  questions: [],
  courseInfo: null,
};

const SS_KEY = "quizsync-pdf-v1";
const QUESTIONS_KEY = "quizsync-questions-v1";

function savePdfToSession(data, fileName, total) {
  try {
    let b64 = "";
    if (data) {
      const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
      const chunk = 8192;
      let binary = "";
      for (let i = 0; i < arr.length; i += chunk) {
        binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
      }
      b64 = btoa(binary);
    }
    sessionStorage.setItem(SS_KEY, JSON.stringify({ b64, fileName, total }));
  } catch {
    // sessionStorage may be full; silently skip
  }
}

function loadPdfFromSession() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const { b64, fileName, total } = JSON.parse(raw);
    if (!b64) return null;
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return { pdfData: arr, pdfFileName: fileName, pdfTotal: total };
  } catch {
    return null;
  }
}

export function setPdfCache(data, fileName, total) {
  cache.pdfData = data;
  cache.pdfFileName = fileName;
  cache.pdfTotal = total;
  savePdfToSession(data, fileName, total);
}

export function clearPdfCache() {
  cache.pdfData = null;
  cache.pdfFileName = null;
  cache.pdfTotal = 0;
  try { sessionStorage.removeItem(SS_KEY); } catch {}
}

export function getPdfCache() {
  if (cache.pdfData) {
    return { pdfData: cache.pdfData, pdfFileName: cache.pdfFileName, pdfTotal: cache.pdfTotal };
  }
  // Fallback: restore from sessionStorage after a hard reload
  const stored = loadPdfFromSession();
  if (stored) {
    cache.pdfData = stored.pdfData;
    cache.pdfFileName = stored.pdfFileName;
    cache.pdfTotal = stored.pdfTotal;
    return stored;
  }
  return { pdfData: null, pdfFileName: null, pdfTotal: 0 };
}

export function setQuizSets(sets) {
  cache.quizSets = sets;
}

export function getQuizSets() {
  return cache.quizSets;
}

function saveQuestionsToSession(questions) {
  try {
    sessionStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
  } catch {}
}

function loadQuestionsFromSession() {
  try {
    const raw = sessionStorage.getItem(QUESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setQuestionsCache(questions) {
  cache.questions = questions;
  saveQuestionsToSession(questions);
}

export function appendQuestionCache(question) {
  const current = getQuestionsCache();
  const exists = current.some((item) => item.id === question.id);
  const next = exists ? current : [question, ...current];
  setQuestionsCache(next);
  return next;
}

export function getQuestionsCache() {
  if (cache.questions.length > 0) return cache.questions;
  const stored = loadQuestionsFromSession();
  cache.questions = stored;
  return stored;
}

export function setCourseInfo(info) {
  cache.courseInfo = info;
}

export function getCourseInfo() {
  return cache.courseInfo;
}

export function clearSession() {
  clearPdfCache();
  cache.quizSets = [];
  cache.questions = [];
  cache.courseInfo = null;
  try { sessionStorage.removeItem(QUESTIONS_KEY); } catch {}
}
