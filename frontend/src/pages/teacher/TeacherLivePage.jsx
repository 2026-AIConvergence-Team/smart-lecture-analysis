import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, Zap, AlertCircle, Send, CheckCircle2, Pencil, Trash2, Plus, RotateCcw, ChevronLeft } from "lucide-react";
import RoleLayout from "../../components/RoleLayout.jsx";
import PdfViewer from "../../components/PdfViewer.jsx";
import { BOT_RESP } from "../../data/quizSyncMock.js";
import useLectureRealtime from "../../hooks/useLectureRealtime.js";
import { appendQuestionCache, getQuestionsCache, setPdfCache, setQuizSets, setCourseInfo, getPdfCache } from "../../data/sessionCache.js";
import { generateQuizzes, getQuizGenerateStatus, getConcepts, getLectureQuizzes, deleteQuiz, createManualQuiz, updateQuiz, getQuizDetail, getLecture, updateLectureStatus, getQuizSets, getQuizSetReport, updateQuizSetStatus, regenerateQuiz, getQuestions, downloadLecturePdf, generateClassCode } from "../../api/lectureApi.js";

const PALETTE = ["var(--brand)", "var(--warning)", "#94a3b8", "#cbd5e1"];
const CODE_VALID_SECONDS = 10 * 60;

function formatRemaining(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function DonutStat({ counts }) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="donut" style={{ background: "var(--zinc-100)" }}>
        <div className="ctr">
          <div className="v">0</div>
          <div className="l">명 응답</div>
        </div>
      </div>
    );
  }
  let cum = 0;
  const stops = counts.map((c, i) => {
    const pct = (c / total) * 100;
    const seg = `${PALETTE[i] || "#e2e8f0"} ${cum.toFixed(1)}% ${(cum + pct).toFixed(1)}%`;
    cum += pct;
    return seg;
  });
  return (
    <div className="donut" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
      <div className="ctr">
        <div className="v">{total}</div>
        <div className="l">명 응답</div>
      </div>
    </div>
  );
}

function QuizStats({ question, counts }) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div style={{ marginTop: 14 }}>
      <div className="donut-wrap">
        <DonutStat counts={counts} />
        <div style={{ flex: 1 }}>
          {question.choices.map((choice, i) => {
            const cnt = counts[i] || 0;
            const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
            return (
              <div key={i} className="choice-bar">
                <div className="sw" style={{ background: PALETTE[i] || "#e2e8f0" }} />
                <div className="lbl">
                  {String.fromCharCode(65 + i)}. {choice}
                  {i === question.answer && (
                    <span style={{ color: "var(--success)", marginLeft: 4 }}>★</span>
                  )}
                </div>
                <div className="v">{cnt}</div>
                <div className="pct">{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getSetReport(set, report = null) {
  if (report) {
    return {
      answered: report.total_answers || 0,
      correct: report.correct_count || 0,
      wrong: report.wrong_count || 0,
      wrongRate: Math.round(report.wrong_rate || 0),
    };
  }

  const totals = (set.questions || []).reduce(
    (acc, question) => {
      const counts = set.counts?.[question.id] || new Array(question.choices.length).fill(0);
      const answered = counts.reduce((sum, count) => sum + count, 0);
      const correct = counts[question.answer] || 0;
      return {
        answered: acc.answered + answered,
        correct: acc.correct + correct,
        wrong: acc.wrong + Math.max(0, answered - correct),
      };
    },
    { answered: 0, correct: 0, wrong: 0 }
  );

  return {
    ...totals,
    wrongRate: totals.answered > 0 ? Math.round((totals.wrong / totals.answered) * 100) : 0,
  };
}

function getQuestionReport(report, quizId) {
  return report?.quizzes?.find((quiz) => String(quiz.quiz_id) === String(quizId)) || null;
}

function TeacherLivePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    code: initialCode = "",
    courseId = null,
    courseName = "자료구조론",
    courseMeta = "",
    week = 5,
    lectureTitle = "",
    pdfFileName = null,
    pdfTotal = 8,
    currentQuizSet = [],
    lectureId = null,
  } = location.state || {};

  const [pdfData, setPdfData] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [totalPages, setTotalPages] = useState(pdfTotal);
  const [liveCode, setLiveCode] = useState(initialCode);
  const [issuingCode, setIssuingCode] = useState(false);

  // Refs to read current state inside memoized callbacks without stale closure
  const emitRef = useRef(null);
  const pdfDataRef = useRef(null);
  const pdfPageRef = useRef(1);
  const setsRef = useRef([]);
  const activeSetIdRef = useRef(null);
  const pendingSetReportIdsRef = useRef(new Set());
  const dataLoadedRef = useRef(false);   // 초기 데이터 로드 중복 방지

  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(3);
  const [extractedKeywords, setExtractedKeywords] = useState([]);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [keywordConceptMap, setKeywordConceptMap] = useState({}); // keyword → concept_id
  const [keywordNotice, setKeywordNotice] = useState("");
  const [quizDraft, setQuizDraft] = useState(() =>
    (currentQuizSet || []).map((q, i) =>
      q.quiz_id !== undefined
        ? {
            id: q.quiz_id,
            setId: q.set_id,
            n: i + 1,
            keyword: q.concept || "개념",
            type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
            question: q.question,
            choices: Array.isArray(q.options) ? q.options : [],
            answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
            explain: q.explanation || "",
          }
        : q
    )
  );
  const [concepts, setConcepts] = useState([]);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [manualForm, setManualForm] = useState(null);   // null = 숨김
  const [editForm, setEditForm] = useState(null);       // null = 숨김

  const [sets, setSets] = useState([]);
  const [setReports, setSetReports] = useState({});
  const [activeSetId, setActiveSetId] = useState(null);

  const [activePanel, setActivePanel] = useState("quiz");
  const [setFilter, setSetFilter] = useState("current");
  const [joinCount, setJoinCount] = useState(0);
  // 새 강의마다 질문 0에서 시작 (이전 세션 캐시·샘플 질문 제거)
  const [questions, setQuestions] = useState([]);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState(null);
  const [codeRemaining, setCodeRemaining] = useState(0);

  const getSafeRange = () => {
    const start = Math.max(1, Number(rangeStart) || 1);
    const end = Math.max(1, Number(rangeEnd) || start);
    return start <= end ? { start, end } : { start: end, end: start };
  };

  const handleRangeInput = (setter) => (event) => {
    const value = event.target.value;
    if (value === "") {
      setter("");
      return;
    }
    setter(Math.max(1, Number(value)));
  };

  const handleRangeBlur = (setter) => () => {
    setter((value) => Math.max(1, Number(value) || 1));
  };

  const handleBackToSetup = () => {
    navigate("/teacher/setup", {
      state: {
        courseId,
        courseName,
        courseMeta,
        week,
        lectureTitle,
        lectureId,
        classCode: liveCode,
        pdfFileName,
        pdfTotal: totalPages,
        currentQuizSet,
      },
    });
  };

  // class-mode hides sidebar and slims topbar
  useEffect(() => {
    document.body.classList.add("class-mode");
    return () => document.body.classList.remove("class-mode");
  }, []);

  useEffect(() => {
    if (!codeExpiresAt) return undefined;

    const tick = () => {
      setCodeRemaining(Math.max(0, Math.ceil((codeExpiresAt - Date.now()) / 1000)));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [codeExpiresAt]);

  // Load PDF from sessionCache (set by TeacherSetupPage on upload)
  useEffect(() => {
    const { pdfData: cached, pdfTotal: cachedTotal } = getPdfCache();
    if (cached) setPdfData(cached);
    if (cachedTotal) setTotalPages(cachedTotal);
  }, []);

  useEffect(() => {
    if (pdfData || !lectureId || !pdfFileName) return;

    downloadLecturePdf(lectureId)
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        setPdfData(bytes);
        setPdfCache(bytes, pdfFileName, totalPages || pdfTotal || 0);
      })
      .catch((err) => console.error("PDF 다운로드 실패:", err));
  }, [pdfData, lectureId, pdfFileName, pdfTotal, totalPages]);

  useEffect(() => {
    setCourseInfo({ code: liveCode, courseName, week });
  }, [liveCode, courseName, week]);

  // 마운트 시: 강의 정보 조회 + 개념 목록 + 기존 DRAFT 퀴즈 로드 (1회만 실행)
  useEffect(() => {
    if (!lectureId || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    // 강의 정보 조회 (강의 상태·코드 최신화)
    getLecture(lectureId)
      .then((lecture) => {
        if (lecture?.class_code) setLiveCode(lecture.class_code);
        setJoinCount(Number(lecture?.participant_count || 0));
      })
      .catch(() => {});
    // 세트 목록 조회 → 기존 백엔드 세트 복원 (setId 포함)
    getLectureQuizzes(lectureId)
      .then((res) => {
        const backendSets = res.sets || [];
        if (backendSets.length === 0) return;
        setSets((prev) => {
          if (prev.length > 0) return prev;  // 이미 로컬 세트 있으면 덮지 않음
          return backendSets.map((s) => ({
            id: s.set_id,
            setId: s.set_id,
            idx: s.set_number,
            status: s.status === "ACTIVE" ? "active" : s.status === "CLOSED" ? "closed" : "draft",
            createdAt: new Date(s.created_at).toLocaleTimeString("ko-KR"),
            startPage: s.page_start,
            pdfRange: s.page_start === s.page_end
              ? `p.${s.page_start}`
              : `p.${s.page_start}-${s.page_end}`,
            questions: (s.quizzes || []).map((q, i) => ({
              id: q.quiz_id,
              setId: q.set_id,
              n: i + 1,
              keyword: q.concept || "개념",
              type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
              question: q.question,
              choices: Array.isArray(q.options) ? q.options : [],
              answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
              explain: q.explanation || "",
            })),
            counts: {},
          }));
        });
      })
      .catch(() => {});
    getConcepts(lectureId)
      .then((res) => setConcepts(res.concepts || []))
      .catch(() => {});
    getLectureQuizzes(lectureId, { status: "ACTIVE" })
      .then((res) => {
        const list = res.quizzes || [];
        if (list.length > 0) {
          setQuizDraft((prev) =>
            prev.length === 0
              ? list.map((q, i) => ({
                  id: q.quiz_id,
                  setId: q.set_id,
                  n: i + 1,
                  keyword: q.concept || "개념",
                  type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
                  question: q.question,
                  choices: Array.isArray(q.options) ? q.options : [],
                  answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
                  explain: q.explanation || "",
                }))
              : prev
          );
        }
      })
      .catch(() => {});
    // 기존 익명 질문 목록 로드 (수업 중 새 질문은 STUDENT_QUESTION 브로드캐스트로 추가됨)
    getQuestions(lectureId)
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        if (list.length === 0) return;
        setQuestions((prev) => {
          const existingIds = new Set(prev.map((q) => q.id));
          const incoming = list
            .filter((q) => !existingIds.has(q.id))
            .map((q) => ({
              id: q.id,
              text: q.content,
              week,
              time: new Date(q.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
            }));
          return incoming.length > 0 ? [...incoming, ...prev] : prev;
        });
      })
      .catch(() => {});
  }, [lectureId, week]);

  // Keep refs current so handleMessage can read latest state
  useEffect(() => { pdfDataRef.current = pdfData; }, [pdfData]);
  useEffect(() => { pdfPageRef.current = pdfPage; }, [pdfPage]);
  useEffect(() => { setsRef.current = sets; }, [sets]);
  useEffect(() => { activeSetIdRef.current = activeSetId; }, [activeSetId]);

  const handleMessage = useCallback((msg) => {
    if (msg.type === "STUDENT_QUESTION") {
      const question = { ...msg.payload.question, week, time: msg.payload.question?.time || "방금 전" };
      setQuestions((prev) => {
        if (prev.some((item) => item.id === question.id)) return prev;
        appendQuestionCache(question);
        return [question, ...prev];
      });
    }
    if (msg.type === "STUDENT_ANSWER") {
      const { setId, qid, choiceIdx } = msg.payload || {};

      if (setId === undefined || qid === undefined || choiceIdx === undefined) {
        return;
      }

      setSets((prev) =>
        prev.map((set) => {
          const isTargetSet =
            String(set.id) === String(setId) ||
            String(set.setId) === String(setId);

          if (!isTargetSet) return set;

          const question = set.questions?.find((q) => String(q.id) === String(qid));
          const optionCount = question?.choices?.length || 4;

          const prevCounts =
            set.counts?.[qid] || new Array(optionCount).fill(0);

          const nextCounts = [...prevCounts];
          const idx = Number(choiceIdx);

          if (!Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
            return set;
          }

          nextCounts[idx] = (nextCounts[idx] || 0) + 1;

          return {
            ...set,
            counts: {
              ...set.counts,
              [qid]: nextCounts,
            },
          };
        })
      );
    }

    // Student joined late — respond with current state
    if (msg.type === "STATE_REQUEST") {
      // lectureId가 명시된 경우, 자기 세션과 다르면 응답하지 않음 (이전 탭 오염 방지)
      const requestedId = msg.payload?.lectureId;
      if (requestedId && lectureId && requestedId !== lectureId) return;
      // Always tell student which course/week this is
      emitRef.current?.("COURSE_INFO", { courseName, week });
      const pdfd = pdfDataRef.current;
      if (pdfd) {
        emitRef.current?.("PDF_LOADED", {
          lectureId,
          pdfData: pdfd,
          pdfFileName,
          pdfTotal: totalPages,
        });
        // Keep ref in sync in case it was stale
        if (!pdfDataRef.current) pdfDataRef.current = pdfd;
      }
      emitRef.current?.("PDF_PAGE", { page: pdfPageRef.current || 1 });
      const active = setsRef.current.find((s) => s.id === activeSetIdRef.current);
      if (active) {
        emitRef.current?.("QUIZ_PUBLISHED", { setId: active.id, questions: active.questions });
      }
    }
  }, [week, courseName, pdfFileName, totalPages]);

  const emit = useLectureRealtime("quizsync-v2", lectureId, handleMessage);

  // Keep emitRef current
  useEffect(() => { emitRef.current = emit; }, [emit]);

  // Broadcast PDF to students as soon as the teacher live view receives it
  const pdfBroadcastedRef = useRef(false);
  useEffect(() => {
    if (!pdfData || pdfBroadcastedRef.current) return;
    pdfBroadcastedRef.current = true;
    emit("COURSE_INFO", { courseName, week });
    emit("PDF_LOADED", { lectureId, pdfData, pdfFileName, pdfTotal: totalPages });
  }, [pdfData, pdfFileName, totalPages, emit, courseName, week, lectureId]);

  // Sync PDF page to students
  useEffect(() => {
    emit("PDF_PAGE", { page: pdfPage });
  }, [pdfPage, emit]);

  // Keep the live student count aligned with lecture_participants.
  useEffect(() => {
    if (!lectureId) {
      setJoinCount(0);
      return undefined;
    }

    let cancelled = false;

    const syncParticipantCount = () => {
      getLecture(lectureId)
        .then((lecture) => {
          if (cancelled) return;
          if (lecture?.class_code) setLiveCode(lecture.class_code);
          setJoinCount(Number(lecture?.participant_count || 0));
        })
        .catch(() => {});
    };

    syncParticipantCount();
    const interval = setInterval(syncParticipantCount, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lectureId]);

  // Gradually fill response counts for the active set
  useEffect(() => {
    if (lectureId) return;
    if (!activeSetId) return;
    const timer = setInterval(() => {
      setSets((prev) => {
        const set = prev.find((s) => s.id === activeSetId && s.status === "active");
        if (!set) return prev;
        let changed = false;
        const newCounts = { ...set.counts };
        set.questions.forEach((q) => {
          const full = BOT_RESP[q.keyword] || [10, 5, 3, 2];
          const cur = [...(newCounts[q.id] || [])];
          const totalFull = full.reduce((a, b) => a + b, 0);
          const totalCur = cur.reduce((a, b) => a + b, 0);
          if (totalCur < totalFull) {
            const eligible = full.reduce((acc, f, i) => {
              if ((cur[i] || 0) < f) acc.push(i);
              return acc;
            }, []);
            if (eligible.length > 0) {
              const idx = eligible[Math.floor(Math.random() * eligible.length)];
              cur[idx] = (cur[idx] || 0) + 1;
              newCounts[q.id] = cur;
              changed = true;
            }
          }
        });
        if (!changed) return prev;
        return prev.map((s) => (s.id === activeSetId ? { ...s, counts: newCounts } : s));
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [activeSetId, lectureId]);

  // Keep session cache in sync
  useEffect(() => {
    setQuizSets(sets);
  }, [sets]);

  const handleExtractKeywords = () => {
    const { start, end } = getSafeRange();

    if (!lectureId || concepts.length === 0) {
      setKeywordNotice(
        !lectureId
          ? "선택된 수업이 없어 키워드를 추출할 수 없습니다."
          : "분석된 키워드가 아직 없습니다. PDF 분석이 완료된 뒤 다시 시도해 주세요."
      );
      setKeywordConceptMap({});
      setExtractedKeywords([]);
      setSelectedKeywords([]);
      return;
    }
    // page_num 기준 범위 필터 (없으면 전체)
    const filtered = concepts.filter(
      (c) => !c.page_num || (c.page_num >= start && c.page_num <= end)
    );
    const list = filtered.length > 0 ? filtered : concepts;

    // keywords 배열(짧은 핵심어) 우선 사용, 없으면 짧은 concept_name fallback
    const map = {};
    const seen = new Set();
    const kwList = [];

    const BAD_ENDINGS = [
      "으며", "이며", "하며", "되며", "고서", "어서", "하여", "되어",
      "있으며", "이고", "하고", "되고", "으로", "에서", "부터", "까지",
      "에게", "보다", "있음", "없음", "이란", "하는", "되는", "이다",
      "한다", "된다", "하다", "지다", "수있음", "ㄹ수있음", "처지", "쳐지",
    ];
    const BAD_STARTS = ["을", "를", "의", "에", "와", "과", "도", "만", "어떤", "이런", "그런", "저런"];
    // compact 안에 포함되면 노이즈로 간주
    const NOISE_CONTAINS = ["어떤", "화학물질"];

    const addKw = (kw, conceptId) => {
      let t = kw.trim();
      if (!t) return;

      // 영문 혼합("옥신 auxin") → 한국어 부분만 추출
      const koreanOnly = t.replace(/\s+[A-Za-z][A-Za-z\s]*$/, "").trim();
      if (koreanOnly && koreanOnly !== t) t = koreanOnly;

      // 영문만 있는 키워드 제외 (단, 2자 이하 약어는 허용)
      if (/^[A-Za-z\s]+$/.test(t) && t.replace(/\s/g, "").length > 2) return;

      const compact = t.replace(/\s+/g, "");

      // 최소 2자
      if (compact.length < 2) return;
      // 공백 제거 기준 8자 초과는 문장형으로 간주
      if (compact.length > 8) return;
      // 문장형 어미로 끝나는 것 제외
      if (BAD_ENDINGS.some((e) => compact.endsWith(e))) return;
      // 조사로 시작하는 것 제외
      if (BAD_STARTS.some((s) => compact.startsWith(s))) return;
      // 노이즈 단어가 포함된 것 제외
      if (NOISE_CONTAINS.some((s) => compact.includes(s))) return;

      // 이미 동일한 compact가 등록됐으면 skip (중복 방지)
      const compactKey = compact.toLowerCase();
      if (seen.has(compactKey)) return;
      seen.add(compactKey);
      map[t] = conceptId;
      kwList.push(t);
    };

    // 1) 각 concept의 keywords 배열에서 핵심어 수집
    list.forEach((c) => {
      const kws = Array.isArray(c.keywords) ? c.keywords : [];
      kws.forEach((kw) => addKw(kw, c.concept_id));
    });

    // 2) keywords가 없거나 너무 적으면 짧은 concept_name도 추가
    if (kwList.length < list.length) {
      list.forEach((c) => {
        if (c.concept_name) addKw(c.concept_name, c.concept_id);
      });
    }

    // 3) 그래도 없으면 길이 제한 없이 concept_name 그대로 (최후 수단)
    if (kwList.length === 0) {
      list.forEach((c) => {
        const t = c.concept_name?.trim();
        if (!t) return;
        const compactKey = t.replace(/\s+/g, "").toLowerCase();
        if (seen.has(compactKey)) return;
        seen.add(compactKey);
        map[t] = c.concept_id;
        kwList.push(t);
      });
    }

    setKeywordConceptMap(map);
    setExtractedKeywords(kwList);
    setSelectedKeywords([]);
    setKeywordNotice(kwList.length > 0 ? "" : "선택한 페이지 범위에서 추출된 키워드가 없습니다.");
  };

  const handleToggleKeyword = (keyword) => {
    setSelectedKeywords((cur) => {
      if (cur.includes(keyword)) return cur.filter((k) => k !== keyword);
      if (cur.length >= 5) return cur;
      return [...cur, keyword];
    });
  };

  const handleGenerateQuiz = () => {
    if (selectedKeywords.length === 0) return;

    if (!lectureId) {
      setQuizError("선택된 수업이 없어 퀴즈를 생성할 수 없습니다.");
      return;
    }

    const { start, end } = getSafeRange();

    setQuizError("");

    const conceptIds = selectedKeywords
      .map((kw) => keywordConceptMap[kw] ?? concepts.find((c) => c.concept_name === kw)?.concept_id)
      .filter(Boolean);

    // concept_id → 사용자가 선택한 키워드 역매핑
    const conceptIdToKeyword = {};
    selectedKeywords.forEach((kw) => {
      const cid = keywordConceptMap[kw] ?? concepts.find((c) => c.concept_name === kw)?.concept_id;
      if (cid) conceptIdToKeyword[cid] = kw;
    });

    setLoadingQuiz(true);
    generateQuizzes(lectureId, {
      page_start: start,
      page_end: end,
      quiz_type: "MIXED",
      selected_keywords: selectedKeywords,
      ...(conceptIds.length > 0 && { concept_ids: conceptIds }),
    })
      .then(() => getQuizGenerateStatus(lectureId))
      .then((res) => {
        const list = res.quizzes || [];
        const converted = list.map((q, i) => ({
          id: q.quiz_id,
          setId: q.set_id,
          n: i + 1,
          keyword: selectedKeywords[i] || conceptIdToKeyword[q.concept_id] || q.concept || "개념",
          type: q.quiz_type === "OX" ? "OX" : q.quiz_type === "BLANK" ? "빈칸형" : "객관식",
          question: q.question,
          choices: Array.isArray(q.options) ? q.options : [],
          answer: Array.isArray(q.options) ? Math.max(0, q.options.indexOf(q.answer)) : 0,
          explain: q.explanation || "",
        }));
        setQuizDraft(converted);
        setExtractedKeywords([]);
        setSelectedKeywords([]);
      })
      .catch((err) => {
        const message = err.message || "퀴즈 생성에 실패했습니다.";
        console.error("퀴즈 생성 실패:", message);
        setQuizError(message);
      })
      .finally(() => setLoadingQuiz(false));
  };

  // ── 드래프트에서 개별 퀴즈 삭제 (deleteQuiz) ───────────
  const handleDeleteQuizFromDraft = (quizId) => {
    if (lectureId) {
      const target = quizDraft.find((q) => q.id === quizId);
      deleteQuiz(target?.setId, quizId).catch((err) => console.error("퀴즈 삭제 실패:", err.message));
    }
    setQuizDraft((prev) => prev.filter((q) => q.id !== quizId));
  };

  // ── 퀴즈 재생성 (regenerateQuiz) ───────────────────────
  const handleRegenerateQuiz = (quiz) => {
    if (!quiz.setId || !lectureId) return;
    regenerateQuiz(quiz.setId, quiz.id, { use_ai: true, difficulty: "MEDIUM" })
      .then((data) => {
        setQuizDraft((prev) =>
          prev.map((q) =>
            q.id === quiz.id
              ? {
                  ...q,
                  question: data.question ?? q.question,
                  choices: Array.isArray(data.options) ? data.options : q.choices,
                  answer: Array.isArray(data.options)
                    ? Math.max(0, data.options.indexOf(data.answer))
                    : q.answer,
                  explain: data.explanation ?? q.explain,
                }
              : q
          )
        );
      })
      .catch((err) => console.error("퀴즈 재생성 실패:", err.message));
  };

  // ── 퀴즈 수정 폼 열기 (getQuizDetail → editForm 세팅) ──
  const handleEditClick = (quiz) => {
    const fallback = {
      quizId: quiz.id,
      setId: quiz.setId,
      question: quiz.question,
      options: Array.isArray(quiz.choices) ? [...quiz.choices] : [],
      answer: Array.isArray(quiz.choices) ? (quiz.choices[quiz.answer] ?? "") : "",
      explanation: quiz.explain || "",
    };
    if (lectureId) {
      getQuizDetail(quiz.id)
        .then((data) =>
          setEditForm({
            quizId: data.quiz_id,
            setId: data.set_id,
            question: data.question,
            options: Array.isArray(data.options) ? [...data.options] : [],
            answer: data.answer ?? "",
            explanation: data.explanation || "",
          })
        )
        .catch(() => setEditForm(fallback));
    } else {
      setEditForm(fallback);
    }
  };

  // ── 퀴즈 수정 저장 (updateQuiz) ────────────────────────
  const handleEditSubmit = () => {
    if (!editForm?.question?.trim()) return;

    const payload = {
      question: editForm.question,
      ...(editForm.options?.length >= 2 && { options: editForm.options }),
      ...(editForm.answer?.trim() && { answer: editForm.answer }),
      ...(editForm.explanation !== undefined && { explanation: editForm.explanation }),
    };

    const applyLocal = (q, data) => ({
      ...q,
      question: data?.question ?? editForm.question,
      choices: data?.options ?? editForm.options ?? q.choices,
      answer: (() => {
        const opts = data?.options ?? editForm.options ?? q.choices;
        const ans = data?.answer ?? editForm.answer;
        const idx = opts.indexOf(ans);
        return idx >= 0 ? idx : q.answer;
      })(),
      explain: data?.explanation ?? editForm.explanation ?? q.explain,
    });

    if (lectureId) {
      updateQuiz(editForm.setId, editForm.quizId, payload)
        .then((data) => {
          setQuizDraft((prev) =>
            prev.map((q) => (q.id === editForm.quizId ? applyLocal(q, data) : q))
          );
          setEditForm(null);
        })
        .catch((err) => console.error("퀴즈 수정 실패:", err.message));
    } else {
      setQuizDraft((prev) =>
        prev.map((q) => (q.id === editForm.quizId ? applyLocal(q, null) : q))
      );
      setEditForm(null);
    }
  };

  // ── 수동 퀴즈 추가 (createManualQuiz) ──────────────────
  const handleManualSubmit = () => {
    if (!manualForm?.question?.trim() || !lectureId) return;
    const opts = manualForm.options.filter((o) => o.trim());
    if (opts.length < 2) return;
    createManualQuiz(lectureId, {
      quiz_type: manualForm.quizType || "BLANK",
      question: manualForm.question,
      options: opts,
      answer: opts[manualForm.answerIdx] || opts[0],
      page: pdfPage,
      status: "ACTIVE",
      ...(manualForm.setId && { set_id: Number(manualForm.setId) }),
      ...(manualForm.conceptId && { concept_id: Number(manualForm.conceptId) }),
      ...(manualForm.sourceSentence?.trim() && { source_sentence: manualForm.sourceSentence }),
      ...(manualForm.explanation?.trim() && { explanation: manualForm.explanation }),
    })
      .then((data) => {
        setQuizDraft((prev) => [
          ...prev,
          {
            id: data.quiz_id,
            setId: data.set_id,
            n: prev.length + 1,
            keyword: "수동",
            type: "객관식",
            question: data.question,
            choices: data.options || opts,
            answer: (data.options || opts).indexOf(data.answer),
            explain: data.explanation || "",
          },
        ]);
        setManualForm(null);
      })
      .catch((err) => console.error("수동 퀴즈 추가 실패:", err.message));
  };

const handlePublishQuiz = async () => {
  if (!quizDraft.length) return;

  const backendSetIds = [
    ...new Set(
      quizDraft
        .map((q) => q.setId)
        .filter((setId) => setId !== undefined && setId !== null && setId !== "")
        .map(Number)
    ),
  ];

  if (lectureId && backendSetIds.length > 0) {
    await Promise.all(
      backendSetIds.map((setId) =>
        updateQuizSetStatus(setId, "SENT").catch((err) => {
          console.error("세트 배포 상태 변경 실패:", err.message);
          return null;
        })
      )
    );
  }

  const id = backendSetIds[0] ?? Date.now();

  const initialCounts = {};
  quizDraft.forEach((q) => {
    initialCounts[q.id] = new Array(q.choices?.length || 4).fill(0);
  });

  const { start: publishRangeStart, end: publishRangeEnd } = getSafeRange();
  const pdfRange =
    publishRangeStart === publishRangeEnd ? `p.${publishRangeStart}` : `p.${publishRangeStart}-${publishRangeEnd}`;

  const newSet = {
    id,
    setId: backendSetIds[0] ?? null,
    idx: sets.length + 1,
    status: "active",
    createdAt: new Date().toLocaleTimeString("ko-KR"),
    startPage: publishRangeStart,
    pdfRange,
    questions: quizDraft,
    counts: initialCounts,
  };

  setSets((prev) => [...prev, newSet]);
  setActiveSetId(id);
  setQuizDraft([]);

  emit("QUIZ_PUBLISHED", {
    setId: id,
    questions: quizDraft,
    startPage: publishRangeStart,
    pdfRange,
  });

  if (lectureId) {
    getQuizSets(lectureId)
      .then((res) => {
        const list = res.sets || [];
        if (list.length === 0) return;

        const latest = [...list].sort((a, b) => b.set_id - a.set_id)[0];

        setSets((prev) =>
          prev.map((s) =>
            s.id === id && !s.setId ? { ...s, setId: latest.set_id } : s
          )
        );

        emit("QUIZ_SET_BACKEND_ID", {
          localSetId: id,
          backendSetId: latest.set_id,
        });
      })
      .catch(() => {});
  }
};

  const handleCloseSet = (setId) => {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, status: "closed" } : s)));
    if (activeSetId === setId) setActiveSetId(null);
    setActivePanel("quiz");
    setSetFilter("closed");
    emit("QUIZ_CLOSED", { setId });
    // 백엔드 세트 상태 CLOSED로 변경 (setId가 있을 때만)
    if (lectureId) {
      const set = setsRef.current.find((s) => s.id === setId);
      if (set?.setId) {
        updateQuizSetStatus(set.setId, "CLOSED")
          .then(() => getQuizSetReport(set.setId))
          .then((report) => {
            setSetReports((prev) => ({ ...prev, [set.setId]: report }));
          })
          .catch(() => {});
      }
    }
  };

  const handleConfirmEnd = async () => {
    emit("CLASS_ENDED", {});
    // 강의 상태를 "ended"로 변경한 뒤 리포트로 이동 (실패해도 이동)
    if (lectureId) {
      await updateLectureStatus(lectureId, "ended").catch(() => {});
    }
    navigate("/teacher/report", { state: { lectureId } });
  };

  const hasDisplayableCode = Boolean(
    liveCode &&
      liveCode !== "------" &&
      liveCode !== "미발급" &&
      !String(liveCode).includes("발급")
  );
  const hasValidCode = hasDisplayableCode && (!codeExpiresAt || codeRemaining > 0);

  const handleIssueLiveCode = () => {
    if (!lectureId || issuingCode || hasValidCode) return;

    setIssuingCode(true);
    generateClassCode(lectureId)
      .then((res) => {
        if (res?.class_code) {
          setLiveCode(res.class_code);
          setCodeExpiresAt(Date.now() + CODE_VALID_SECONDS * 1000);
          setCodeRemaining(CODE_VALID_SECONDS);
          setShowCodeModal(true);
        }
      })
      .catch((err) => alert(err.message || "코드 생성에 실패했습니다."))
      .finally(() => setIssuingCode(false));
  };

  const activeSet = sets.find((s) => s.id === activeSetId);
  const closedSets = sets.filter((s) => s.status === "closed");
  const closedReportIds = closedSets
    .map((set) => set.setId || set.id)
    .filter(Boolean)
    .join(",");

  useEffect(() => {
    if (!closedReportIds) return;

    closedReportIds.split(",").forEach((setId) => {
      if (!setId || setReports[setId] || pendingSetReportIdsRef.current.has(setId)) {
        return;
      }

      pendingSetReportIdsRef.current.add(setId);
      getQuizSetReport(setId)
        .then((report) => {
          setSetReports((prev) => ({ ...prev, [setId]: report }));
        })
        .catch((err) => console.error("퀴즈 세트 리포트 조회 실패:", err.message))
        .finally(() => pendingSetReportIdsRef.current.delete(setId));
    });
  }, [closedReportIds, setReports]);

  const totalQuizCount =
    quizDraft.length +
    sets.reduce((a, s) => a + s.questions.length, 0);

  return (
    <RoleLayout role="teacher">
      <section className="content wide">
        {/* Status bar */}
        <div className="live-statusbar">
          <div className="left">
            <span className="pill pill-brand">
              {courseName} {week}주차
            </span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleBackToSetup}>
              <ChevronLeft size={14} />
              뒤로
            </button>
            <span>
              학생 <strong>{joinCount}</strong>명 접속 중
            </span>
          </div>
          <div className="right">
            <span style={{ display: hasValidCode ? "inline" : "none", fontSize: 12, color: "var(--zinc-500)" }}>
              코드{" "}
              <strong className="mono" style={{ color: "var(--zinc-900)" }}>
                {liveCode}
              </strong>
            </span>
            {!hasValidCode && (
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={handleIssueLiveCode}
                disabled={!lectureId || issuingCode}
              >
                {issuingCode ? "코드 생성 중..." : "입장 코드 생성"}
              </button>
            )}
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={() => setShowEndModal(true)}
            >
              수업 종료
            </button>
          </div>
        </div>

        <div className="split">
          {/* Left: PDF */}
          <div className="split-left" style={{ flex: "0 0 62%" }}>
            <PdfViewer
              pdfData={pdfData}
              currentPage={pdfPage}
              onPageChange={setPdfPage}
              onTotalPagesChange={setTotalPages}
              pdfFileName={pdfFileName}
              initialTotalPages={totalPages}
              role="teacher"
            />
          </div>

          <div className="split-handle" />

          {/* Right: Quiz / QnA */}
          <div
            className="split-right"
            style={{ flex: 1, paddingLeft: 14, minWidth: 340, display: "flex", flexDirection: "column" }}
          >
            <div className="set-filter-row">
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${activePanel === "quiz" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActivePanel("quiz")}
                >
                  퀴즈 <span className="badge">{totalQuizCount}</span>
                </button>
                <button
                  className={`panel-tab ${activePanel === "qna" ? "active" : ""}`}
                  type="button"
                  onClick={() => setActivePanel("qna")}
                >
                  질문함 <span className="badge">{questions.length}</span>
                </button>
              </div>
            </div>

            {/* Quiz panel */}
            {activePanel === "quiz" && (
              <div className="panel-list">
                <div className="quiz-stage-tabs">
                  <button
                    className={setFilter === "current" ? "active" : ""}
                    type="button"
                    onClick={() => setSetFilter("current")}
                  >
                    생성/진행
                    <span>{quizDraft.length + (activeSet ? 1 : 0)}</span>
                  </button>
                  <button
                    className={setFilter === "closed" ? "active" : ""}
                    type="button"
                    onClick={() => setSetFilter("closed")}
                  >
                    끝난 퀴즈
                    <span>{closedSets.length}</span>
                  </button>
                </div>
                {setFilter === "current" ? (
                  <>
                    {/* AI Generator card */}
                    <article className="card flow-card">
                      <div className="card-pad-lg">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <span className="eyebrow">Quiz Generator</span>
                            <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                              새 퀴즈 세트 만들기
                            </h3>
                          </div>
                          <span className="pill pill-brand">AI</span>
                        </div>

                        <div style={{ marginTop: 14 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--zinc-700)",
                              marginBottom: 8,
                            }}
                          >
                            생성 범위
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 16px 1fr",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="number"
                              className="input"
                              min="1"
                              value={rangeStart}
                              onChange={handleRangeInput(setRangeStart)}
                              onBlur={handleRangeBlur(setRangeStart)}
                            />
                            <div style={{ textAlign: "center", color: "var(--zinc-400)" }}>—</div>
                            <input
                              type="number"
                              className="input"
                              min="1"
                              value={rangeEnd}
                              onChange={handleRangeInput(setRangeEnd)}
                              onBlur={handleRangeBlur(setRangeEnd)}
                            />
                          </div>
                          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(pdfPage);
                                setRangeEnd(pdfPage);
                              }}
                            >
                              현재 페이지
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(Math.max(1, pdfPage - 2));
                                setRangeEnd(pdfPage);
                              }}
                            >
                              최근 3p
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              type="button"
                              onClick={() => {
                                setRangeStart(1);
                                setRangeEnd(Math.max(1, totalPages || 1));
                              }}
                            >
                              전체
                            </button>
                          </div>
                        </div>

                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ marginTop: 14, width: "100%" }}
                          onClick={handleExtractKeywords}
                        >
                          <Sparkles size={14} /> AI 핵심 키워드 추출
                        </button>

                        <button
                          className="btn btn-ghost"
                          type="button"
                          style={{ marginTop: 8, width: "100%" }}
                          disabled={!lectureId}
                          onClick={() =>
                            setManualForm({
              question: "",
              options: ["", "", "", ""],
              answerIdx: 0,
              quizType: "BLANK",
              conceptId: "",
              explanation: "",
              sourceSentence: "",
              setId: sets.filter((s) => s.setId).at(-1)?.setId ?? "",
            })
                          }
                        >
                          <Plus size={14} /> 수동 퀴즈 추가
                        </button>

                        {manualForm && (
                          <div style={{ marginTop: 12, padding: 12, background: "var(--zinc-50)", borderRadius: 10, border: "1px solid var(--zinc-200)" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--zinc-700)" }}>수동 퀴즈 추가</div>

                            {/* 개념 선택 */}
                            <select
                              className="input"
                              value={manualForm.conceptId}
                              onChange={(e) => setManualForm((f) => ({ ...f, conceptId: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            >
                              <option value="">개념 선택 (선택사항)</option>
                              {concepts.map((c) => (
                                <option key={c.concept_id} value={c.concept_id}>{c.concept_name}</option>
                              ))}
                            </select>

                            {/* 퀴즈 유형 */}
                            <select
                              className="input"
                              value={manualForm.quizType}
                              onChange={(e) => {
                                const t = e.target.value;
                                setManualForm((f) => ({
                                  ...f,
                                  quizType: t,
                                  // OX형 선택 시 보기를 O/X로 자동 세팅
                                  options: t === "OX" ? ["O", "X", "", ""] : f.options,
                                  answerIdx: 0,
                                }));
                              }}
                              style={{ marginBottom: 8, width: "100%" }}
                            >
                              <option value="BLANK">빈칸형 (BLANK)</option>
                              <option value="OX">OX형</option>
                            </select>

                            {/* 질문 */}
                            <input
                              className="input"
                              placeholder="질문을 입력하세요"
                              value={manualForm.question}
                              onChange={(e) => setManualForm((f) => ({ ...f, question: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            />
                            {manualForm.options.map((opt, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <input
                                  type="radio"
                                  name="manual_answer"
                                  checked={manualForm.answerIdx === i}
                                  onChange={() => setManualForm((f) => ({ ...f, answerIdx: i }))}
                                />
                                <input
                                  className="input"
                                  placeholder={`보기 ${i + 1}`}
                                  value={opt}
                                  onChange={(e) =>
                                    setManualForm((f) => {
                                      const options = [...f.options];
                                      options[i] = e.target.value;
                                      return { ...f, options };
                                    })
                                  }
                                  style={{ flex: 1 }}
                                />
                              </div>
                            ))}
                            <p style={{ fontSize: 11, color: "var(--zinc-500)", margin: "4px 0 8px" }}>
                              라디오 버튼으로 정답 보기를 선택하세요
                            </p>

                            {/* 세트 선택 */}
                            <select
                              className="input"
                              value={manualForm.setId}
                              onChange={(e) => setManualForm((f) => ({ ...f, setId: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            >
                              <option value="">세트 선택 (선택사항)</option>
                              {sets.filter((s) => s.setId).map((s) => (
                                <option key={s.setId} value={s.setId}>
                                  세트 #{s.idx} ({s.pdfRange})
                                </option>
                              ))}
                            </select>

                            {/* 출처 문장 */}
                            <input
                              className="input"
                              placeholder="출처 문장 (선택사항)"
                              value={manualForm.sourceSentence}
                              onChange={(e) => setManualForm((f) => ({ ...f, sourceSentence: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            />

                            {/* 해설 */}
                            <input
                              className="input"
                              placeholder="해설 (선택사항)"
                              value={manualForm.explanation}
                              onChange={(e) => setManualForm((f) => ({ ...f, explanation: e.target.value }))}
                              style={{ marginBottom: 8, width: "100%" }}
                            />

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                type="button"
                                onClick={handleManualSubmit}
                                disabled={!manualForm.question.trim()}
                              >
                                추가
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() => setManualForm(null)}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}

                        {keywordNotice && (
                          <p style={{ marginTop: 12, fontSize: 12, color: "var(--zinc-500)", lineHeight: 1.5 }}>
                            {keywordNotice}
                          </p>
                        )}

                        {extractedKeywords.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "var(--zinc-700)",
                                }}
                              >
                                추출된 키워드
                              </div>
                              <div style={{ fontSize: 11, color: "var(--zinc-500)" }}>
                                선택{" "}
                                <span
                                  style={{ color: "var(--brand-deep)", fontWeight: 700 }}
                                >
                                  {selectedKeywords.length}
                                </span>{" "}
                                / 최대 5
                              </div>
                            </div>
                            <div className="chip-wrap" style={{ marginTop: 8 }}>
                              {extractedKeywords.map((kw) => (
                                <button
                                  key={kw}
                                  className={`chip ${
                                    selectedKeywords.includes(kw) ? "selected" : ""
                                  }`}
                                  type="button"
                                  onClick={() => handleToggleKeyword(kw)}
                                >
                                  {kw}
                                </button>
                              ))}
                            </div>
                            <p style={{ marginTop: 8, fontSize: 11, color: "var(--zinc-500)" }}>
                              선택한 키워드 1개당 1문제가 생성됩니다.
                            </p>
                            <button
                              className="btn btn-primary"
                              type="button"
                              style={{ marginTop: 12, width: "100%" }}
                              disabled={selectedKeywords.length === 0 || loadingQuiz}
                              onClick={handleGenerateQuiz}
                            >
                              <Zap size={14} /> {loadingQuiz ? "생성 중..." : "선택한 키워드로 퀴즈 생성"}
                            </button>
                            {quizError && (
                              <p style={{ marginTop: 10, fontSize: 12, color: "var(--danger)", lineHeight: 1.5 }}>
                                {quizError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </article>

                    {/* Draft quiz card */}
                    {quizDraft.length > 0 && (
                      <article className="card">
                        <div className="card-head">
                          <div>
                            <div className="card-title">
                              새 세트 · #{sets.length + 1}
                            </div>
                            <div className="card-sub">
                              {quizDraft.length}문제 · 학생에게 출제하기 전 확인하세요
                            </div>
                          </div>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => setQuizDraft([])}
                          >
                            폐기
                          </button>
                        </div>
                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
                          {quizDraft.map((q) => (
                            <div key={q.id} className="quiz-item">
                              <div className="quiz-item-head">
                                <div className="q-num">
                                  <strong>{q.n}</strong>
                                  <span className="badge">{q.keyword}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span className="pill pill-neutral" style={{ fontSize: 10 }}>
                                    {q.type}
                                  </span>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    style={{ padding: "0 6px", height: 24 }}
                                    title="퀴즈 재생성"
                                    disabled={!q.setId || !lectureId}
                                    onClick={() => handleRegenerateQuiz(q)}
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    style={{ padding: "0 6px", height: 24 }}
                                    title="문제 수정"
                                    onClick={() => handleEditClick(q)}
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    type="button"
                                    style={{ padding: "0 6px", height: 24, color: "var(--danger)" }}
                                    title="퀴즈 삭제"
                                    onClick={() => handleDeleteQuizFromDraft(q.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 500 }}>
                                {q.question}
                              </div>
                              <div
                                className={`choices ${
                                  q.choices.length <= 2 ? "col1" : ""
                                }`}
                                style={{ marginTop: 10 }}
                              >
                                {q.choices.map((choice, i) => (
                                  <div
                                    key={i}
                                    className={`choice ${i === q.answer ? "correct" : ""}`}
                                    style={{ cursor: "default" }}
                                  >
                                    {String.fromCharCode(65 + i)}. {choice}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            padding: "14px 16px",
                            borderTop: "1px solid var(--zinc-150)",
                          }}
                        >
                          <button
                            className="btn btn-primary"
                            type="button"
                            style={{ width: "100%" }}
                            onClick={handlePublishQuiz}
                          >
                            <Send size={14} /> 학생에게 퀴즈 내보내기
                          </button>
                        </div>
                      </article>
                    )}

                    {/* Active set stats card */}
                    {activeSet && (
                      <article className="card">
                        <div className="card-head">
                          <div>
                            <div className="card-title">세트 #{activeSet.idx} 응답 현황</div>
                            <div className="card-sub">
                              {activeSet.questions.reduce(
                                (a, q) =>
                                  a +
                                  (activeSet.counts[q.id]?.reduce((x, y) => x + y, 0) || 0),
                                0
                              )}{" "}
                              / {joinCount}명 응답 중
                            </div>
                          </div>
                          <span className="pill pill-success">
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--success)",
                                display: "inline-block",
                                marginRight: 4,
                              }}
                            />
                            출제 중
                          </span>
                        </div>
                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          {activeSet.questions.map((q) => {
                            const counts =
                              activeSet.counts[q.id] ||
                              new Array(q.choices.length).fill(0);
                            return (
                              <div key={q.id} className="quiz-item active">
                                <div className="quiz-item-head">
                                  <div className="q-num">
                                    <strong>{q.n}</strong>
                                    <span className="badge">{q.keyword}</span>
                                  </div>
                                </div>
                                <div style={{ marginTop: 8, fontSize: 14 }}>
                                  {q.question}
                                </div>
                                <QuizStats question={q} counts={counts} />
                              </div>
                            );
                          })}
                        </div>
                        <div
                          style={{
                            padding: "14px 16px",
                            borderTop: "1px solid var(--zinc-150)",
                          }}
                        >
                          <button
                            className="btn btn-dark"
                            type="button"
                            style={{ width: "100%" }}
                            onClick={() => handleCloseSet(activeSet.id)}
                          >
                            <CheckCircle2 size={14} /> 정답 공개 및 마감
                          </button>
                        </div>
                      </article>
                    )}

                    {!quizDraft.length && !activeSet && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "32px 16px",
                          color: "var(--zinc-500)",
                          fontSize: 13,
                        }}
                      >
                        키워드를 추출하고 퀴즈를 생성해보세요
                      </div>
                    )}
                  </>
                ) : (
                  /* Closed sets */
                  <>
                    {closedSets.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "32px 16px",
                          color: "var(--zinc-500)",
                          fontSize: 13,
                        }}
                      >
                        마감된 세트가 없습니다
                      </div>
                    ) : (
                      closedSets.map((s) => {
                        const backendReport = setReports[s.setId || s.id] || null;
                        const report = getSetReport(s, backendReport);
                        return (
                        <article key={s.id} className="card">
                          <div className="card-head">
                            <div>
                              <div className="card-title">세트 #{s.idx}</div>
                              <div className="card-sub">
                                {s.questions.length}문제 · 마감 {s.createdAt}
                              </div>
                            </div>
                            <span className="pill pill-neutral">마감됨</span>
                          </div>
                          <div className="closed-quiz-report">
                            <div>
                              <strong>{report.wrongRate}%</strong>
                              <span>오답률</span>
                            </div>
                            <div>
                              <strong>{report.answered}</strong>
                              <span>총 응답</span>
                            </div>
                            <div>
                              <strong>{report.wrong}</strong>
                              <span>오답 수</span>
                            </div>
                          </div>
                          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                            {s.questions.map((q) => {
                              const questionReport = getQuestionReport(backendReport, q.id);
                              const counts =
                                questionReport?.option_counts ||
                                s.counts[q.id] ||
                                new Array(q.choices.length).fill(0);
                              return (
                                <div key={q.id} className="quiz-item">
                                  <div className="quiz-item-head">
                                    <div className="q-num">
                                      <strong>{q.n}</strong>
                                      <span className="badge">{q.keyword}</span>
                                    </div>
                                  </div>
                                  <div style={{ marginTop: 8, fontSize: 14 }}>
                                    {q.question}
                                  </div>
                                  <QuizStats question={q} counts={counts} />
                                  <div className="explain-box">{q.explain}</div>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            )}

            {/* QnA panel */}
            {activePanel === "qna" && (
              <div className="panel-list">
                <article className="card">
                  <div className="card-head">
                    <div>
                      <div className="card-title">익명 질문함</div>
                      <div className="card-sub">
                        학생들이 수업 중에 보낸 질문입니다 · 답변은 수업 후 리포트에서
                      </div>
                    </div>
                    <span className="pill pill-neutral">{questions.length}개</span>
                  </div>
                  <div style={{ padding: 14 }}>
                    {questions.map((q) => (
                      <div key={q.id} className="qna-item">
                        <div className="meta">
                          {q.week}주차 · {q.time || q.ago}
                        </div>
                        <div className="body">{q.text}</div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )}
          </div>
        </div>

        {/* 퀴즈 수정 모달 (updateQuiz) */}
        {editForm && (
          <div className="modal-backdrop open">
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-head">
                <h3>퀴즈 수정</h3>
                <p>문제·선택지·해설을 수정한 뒤 저장하세요.</p>
              </div>
              <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* 문제 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>문제</div>
                  <textarea
                    className="input"
                    style={{ width: "100%", minHeight: 64, resize: "vertical" }}
                    value={editForm.question}
                    onChange={(e) => setEditForm((f) => ({ ...f, question: e.target.value }))}
                  />
                </div>

                {/* 선택지 + 정답 라디오 */}
                {editForm.options?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>
                      선택지 <span style={{ fontWeight: 400, color: "var(--zinc-500)" }}>(라디오로 정답 선택)</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {editForm.options.map((opt, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="radio"
                            name="edit_answer"
                            checked={editForm.answer === opt}
                            onChange={() => setEditForm((f) => ({ ...f, answer: opt }))}
                          />
                          <input
                            className="input"
                            value={opt}
                            style={{ flex: 1 }}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const opts = [...f.options];
                                const wasAnswer = f.answer === opts[i];
                                opts[i] = e.target.value;
                                return { ...f, options: opts, answer: wasAnswer ? e.target.value : f.answer };
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 해설 */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--zinc-700)", marginBottom: 4 }}>해설</div>
                  <textarea
                    className="input"
                    style={{ width: "100%", minHeight: 56, resize: "vertical" }}
                    value={editForm.explanation}
                    onChange={(e) => setEditForm((f) => ({ ...f, explanation: e.target.value }))}
                  />
                </div>

              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" type="button" onClick={() => setEditForm(null)}>
                  취소
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleEditSubmit}
                  disabled={!editForm.question.trim()}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}

        {showCodeModal && hasDisplayableCode && (
          <div className="modal-backdrop open">
            <div className="modal" style={{ maxWidth: 430 }}>
              <div className="modal-head">
                <h3>입장 코드가 생성되었습니다</h3>
                <p>학생에게 아래 코드를 공유하세요. 이 창을 닫아도 상단에서 코드를 계속 볼 수 있습니다.</p>
              </div>
              <div className="modal-body">
                <div
                  className="mono"
                  style={{
                    minHeight: 98,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 14,
                    background: "var(--brand-soft)",
                    color: "var(--brand-deep)",
                    fontSize: 46,
                    fontWeight: 800,
                  }}
                >
                  {liveCode}
                </div>
                <div style={{ marginTop: 14, textAlign: "center", color: "var(--zinc-600)", fontSize: 13 }}>
                  남은 시간{" "}
                  <strong className="mono" style={{ color: "var(--zinc-900)", fontSize: 18 }}>
                    {formatRemaining(codeRemaining)}
                  </strong>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn btn-ghost" type="button" onClick={() => navigator.clipboard.writeText(liveCode)}>
                  복사
                </button>
                <button className="btn btn-primary" type="button" onClick={() => setShowCodeModal(false)}>
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* End class modal */}
        {showEndModal && (
          <div className="modal-backdrop open">
            <div className="modal">
              <div
                className="modal-head"
                style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "var(--danger-50)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <AlertCircle size={20} color="var(--danger)" />
                </div>
                <div>
                  <h3>수업을 종료하시겠어요?</h3>
                  <p>확인 시 수업이 마감되고 리포트 페이지로 이동합니다.</p>
                </div>
              </div>
              <div className="modal-foot">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => setShowEndModal(false)}
                >
                  취소
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={handleConfirmEnd}
                >
                  수업 종료
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </RoleLayout>
  );
}

export default TeacherLivePage;
