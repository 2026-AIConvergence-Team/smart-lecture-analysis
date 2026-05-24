/* ==========================================================
   QuizSync v2 — Views / events / rendering
   ========================================================== */
(function () {
  const S = QSync.state;

  // =====================================================
  // BroadcastChannel — 두 탭 실시간 동기화
  // =====================================================
  const syncCh = (typeof BroadcastChannel !== 'undefined')
    ? new BroadcastChannel('quizsync-v2') : null;

  function syncEmit(type, payload = {}) {
    syncCh?.postMessage({ type, payload });
  }

  // ---- Tiny helpers ----
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };

  // =====================================================
  // Login / Signup transitions
  // =====================================================
  function showAuthView(view) {
    document.body.removeAttribute('data-role');
    document.body.classList.remove('class-mode');
    $('#appShell').classList.add('hidden');
    $$('.view-panel').forEach(p => p.classList.toggle('active', p.id === `${view}-view`));
  }

  function enterApp(role, opts = {}) {
    S.role = role;
    S.loggedIn = true;
    document.body.setAttribute('data-role', role);
    $('#login-view').classList.remove('active');
    $('#signup-view').classList.remove('active');
    $('#appShell').classList.remove('hidden');

    // Role-scoped visibility
    $$('[data-role-only]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.roleOnly !== role);
    });
    $$('#roleToggle button').forEach(b => b.classList.toggle('on', b.dataset.roleSwitch === role));

    if (role === 'professor') {
      $('#profAv').textContent = 'K';
      $('#profName').textContent = '김교수';
      $('#profEmail').textContent = 'prof@sungshin.ac.kr';
      switchView(opts.view || 'courses');
    } else {
      $('#profAv').textContent = '노';
      $('#profName').textContent = '노은서';
      $('#profEmail').textContent = '20231349@sungshin.ac.kr';
      switchView(opts.view || 'studentCourses');
    }
    refreshIcons();
  }

  // Navigation backstack — keeps history of visited views for the back button.
  const ROOT_VIEWS = new Set(['login', 'signup', 'courses', 'studentCourses']);
  const navStack = [];
  let _suppressPush = false;

  function updateBackBtn(target) {
    const btn = $('#backBtn');
    if (!btn) return;
    btn.classList.toggle('hidden', ROOT_VIEWS.has(target) || navStack.length === 0);
  }
  $('#backBtn')?.addEventListener('click', () => {
    if (navStack.length === 0) return;
    const prev = navStack.pop();
    _suppressPush = true;
    switchView(prev);
    _suppressPush = false;
  });

  function switchView(target) {
    // Backstack push — capture any non-auth view so going from root (courses) → setup
    // still lets the user click back.
    const AUTH_VIEWS = new Set(['login', 'signup']);
    const current = $$('.view-panel.active').map(p => p.id.replace('-view',''))[0];
    if (!_suppressPush && current && current !== target && !AUTH_VIEWS.has(current)) {
      navStack.push(current);
      if (navStack.length > 12) navStack.shift();
    }
    if (ROOT_VIEWS.has(target)) navStack.length = 0;
    $$('.view-panel').forEach(p => p.classList.toggle('active', p.id === `${target}-view`));
    $$('.nav-btn[data-view-target]').forEach(b => b.classList.toggle('active', b.dataset.viewTarget === target));

    // Class mode (sidebar/topbar slim) only during live class
    const classMode = target === 'profLive' || target === 'studentLive';
    document.body.classList.toggle('class-mode', classMode);
    S.inClassMode = classMode;

    const labels = {
      courses: '강의 목록', studentCourses: '수업 목록', setup: '강의 설정',
      profLive: '수업 진행', studentLive: '수업 참여',
      profReport: '수업 리포트', studentReview: '복습',
    };
    if ($('#crumbCurrent')) $('#crumbCurrent').textContent = labels[target] || '';

    // Re-render dynamic views
    if (target === 'courses') renderCourses();
    if (target === 'studentCourses') renderStudentCourses();
    if (target === 'profLive') { renderCurrentSet(); renderLiveStats(); renderSetHistory(); renderProfQList(); applySplit('prof'); renderPdf('prof'); }
    if (target === 'studentLive') { syncEmit('STATE_REQUEST', {}); renderStudentLive(); applySplit('student'); renderPdf('student'); }
    if (target === 'studentReview') renderReview();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateBackBtn(target);
    refreshIcons();
  }

  // ---- Login form ----
  $$('#loginRoleTabs button').forEach(b => {
    b.addEventListener('click', () => {
      $$('#loginRoleTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  $('#loginSubmitBtn').addEventListener('click', () => {
    const role = $('#loginRoleTabs button.active').dataset.loginRole;
    enterApp(role);
  });
  $('#goSignupLink')?.addEventListener('click', e => { e.preventDefault(); showAuthView('signup'); refreshIcons(); });
  $('#goLoginLink')?.addEventListener('click', e => { e.preventDefault(); showAuthView('login'); refreshIcons(); });

  // ---- Signup form ----
  function syncSignupIdLabel() {
    const role = $('#signupRoleTabs button.active').dataset.signupRole;
    const labelEl = $('#suIdLabel');
    const helpEl = $('#suIdHelp');
    const inputEl = $('#suId');
    if (role === 'student') {
      labelEl.textContent = '학번';
      helpEl.textContent = '학생은 8자리 학번을 사용합니다 (예: 20231349).';
      inputEl.placeholder = '예: 20231349';
      inputEl.setAttribute('inputmode', 'numeric');
      inputEl.setAttribute('maxlength', '8');
    } else {
      labelEl.textContent = '사번 / 이메일';
      helpEl.textContent = '교수자는 사번 또는 이메일을 사용합니다.';
      inputEl.placeholder = '예: prof@sungshin.ac.kr';
      inputEl.removeAttribute('inputmode');
      inputEl.removeAttribute('maxlength');
    }
  }
  $$('#signupRoleTabs button').forEach(b => {
    b.addEventListener('click', () => {
      $$('#signupRoleTabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      syncSignupIdLabel();
    });
  });
  syncSignupIdLabel();
  $('#signupSubmitBtn').addEventListener('click', () => {
    const role = $('#signupRoleTabs button.active').dataset.signupRole;
    const name = $('#suName').value.trim();
    const id = $('#suId').value.trim();
    const pw = $('#suPw').value;
    const pw2 = $('#suPw2').value;
    if (!name || !id || !pw) { alert('이름, 아이디, 비밀번호를 모두 입력해 주세요.'); return; }
    if (role === 'student' && !/^\d{8}$/.test(id)) { alert('학번은 8자리 숫자여야 합니다.'); return; }
    if (pw !== pw2) { alert('비밀번호가 일치하지 않습니다.'); return; }
    if (pw.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
    // success → go to login
    showAuthView('login');
    refreshIcons();
    setTimeout(() => alert('회원가입이 완료되었습니다. 방금 만든 계정으로 로그인해 주세요.'), 100);
  });

  // ---- Logout / role toggle ----
  $('#logoutBtn').addEventListener('click', () => showAuthView('login'));
  $$('#roleToggle button').forEach(b => b.addEventListener('click', () => enterApp(b.dataset.roleSwitch)));

  // =====================================================
  // Generic nav delegation + modal helpers
  // =====================================================
  function openModal(id) { $(`#${id}`)?.classList.add('open'); refreshIcons(); }
  function closeModal(id) { $(`#${id}`)?.classList.remove('open'); }
  document.addEventListener('click', e => {
    const navBtn = e.target.closest('[data-view-target]');
    if (navBtn && !navBtn.disabled) { e.preventDefault(); switchView(navBtn.dataset.viewTarget); return; }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) { closeModal(closer.dataset.modalClose); return; }
    const backdrop = e.target.classList?.contains('modal-backdrop') ? e.target : null;
    if (backdrop) closeModal(backdrop.id);
  });

  // =====================================================
  // Courses (professor)
  // =====================================================
  function renderCourses() {
    const wrap = $('#courseSemesterWrap');
    if (!wrap) return;

    const groups = {};
    S.courses.forEach(c => {
      const key = `${c.year}년 ${c.term}`;
      (groups[key] = groups[key] || []).push(c);
    });

    const html = Object.keys(groups).map(label => {
      const list = groups[label];
      return `
        <div style="margin-bottom:28px;">
          <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:14px;">
            <h2 style="font-size:14px; font-weight:700; color:var(--zinc-900);">${esc(label)}</h2>
            <span style="font-size:12px; color:var(--zinc-500);">담당 ${list.length}과목</span>
          </div>
          <div class="course-grid">
            ${list.map(c => courseCardHTML(c)).join('')}
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = html;
    refreshIcons();

    $$('.course-card[data-course-id]').forEach(c => {
      c.addEventListener('click', () => {
        S.selectedCourseId = c.dataset.courseId;
        const course = S.courses.find(x => x.id === S.selectedCourseId);
        if (course) {
          $('#setupTitle').textContent = `${course.title} ${course.week}주차 · 강의 설정`;
        }
        switchView('setup');
      });
    });
    $$('[data-add-course]').forEach(b => b.addEventListener('click', () => openModal('courseAddModal')));
  }

  function courseCardHTML(c) {
    const statusPill = ({
      live: '<span class="status-tag pill pill-success"><span class="dot" style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>진행 중</span>',
      soon: '<span class="status-tag pill pill-warn">준비 중</span>',
      idle: '<span class="status-tag pill pill-neutral">대기</span>',
      done: '<span class="status-tag pill pill-neutral">종료</span>',
    })[c.status] || '';
    return `
      <button class="course-card" data-course-id="${esc(c.id)}">
        <div>
          <div class="title">${esc(c.title)}</div>
          <div class="term">${esc(c.meta)}</div>
        </div>
        ${statusPill}
        <div class="meta">
          <span class="key">수강생 ${c.students}명 · ${c.week}주차</span>
          <span style="color:var(--brand-deep); font-weight:600;">${c.status === 'done' ? '리포트 보기' : '수업 시작'} →</span>
        </div>
      </button>
    `;
  }

  // ---- Add course modal ----
  $('#addCourseBtn').addEventListener('click', () => openModal('courseAddModal'));
  $('#caAddBtn').addEventListener('click', () => {
    const year = +$('#caYear').value;
    const term = $('#caTerm').value;
    const title = $('#caTitle').value.trim();
    const section = $('#caSection').value.trim() || '01';
    const students = +$('#caStudents').value || 30;
    const meta = $('#caMeta').value.trim() || '학과 · 시간 미입력';
    if (!title) { alert('강의명을 입력해 주세요.'); return; }
    const id = `c-${Date.now()}`;
    S.courses.unshift({ id, year, term, title, section, students, meta, status: 'idle', week: 1 });
    QSync.saveCourses(S.courses);
    closeModal('courseAddModal');
    $('#caTitle').value = ''; $('#caSection').value = ''; $('#caMeta').value = '';
    renderCourses();
  });

  // =====================================================
  // Student courses
  // =====================================================
  function renderStudentCourses() {
    const wrap = $('#studentCourseWrap');
    if (!wrap) return;
    // Show currently-active (live + soon) and previously-attended courses
    const active = S.courses.filter(c => c.status === 'live' || c.status === 'soon' || c.status === 'idle');
    const past = S.courses.filter(c => c.status === 'done');

    const card = (c) => {
      const statusPill = c.status === 'live'
        ? '<span class="status-tag pill pill-success"><span class="dot" style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>수업 중</span>'
        : c.status === 'soon' ? '<span class="status-tag pill pill-warn">곧 시작</span>'
        : c.status === 'done' ? '<span class="status-tag pill pill-neutral">종료</span>'
        : '<span class="status-tag pill pill-neutral">대기</span>';
      const cta = c.status === 'done'
        ? `<span style="color:var(--brand-deep); font-weight:600;">복습 →</span>`
        : c.status === 'live'
          ? `<span style="color:var(--brand-deep); font-weight:600;">강의실 입장 →</span>`
          : `<span style="color:var(--zinc-500); font-weight:600;">곧 시작</span>`;
      return `
        <button class="course-card" data-student-course-id="${esc(c.id)}" data-status="${c.status}">
          <div>
            <div class="title">${esc(c.title)}</div>
            <div class="term">${esc(c.meta)}</div>
          </div>
          ${statusPill}
          <div class="meta">
            <span class="key">${c.week}주차 · 담당 김OO 교수</span>
            ${cta}
          </div>
        </button>
      `;
    };

    wrap.innerHTML = `
      <div style="margin-bottom:28px;">
        <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:14px;">
          <h2 style="font-size:14px; font-weight:700;">2026년 1학기</h2>
          <span style="font-size:12px; color:var(--zinc-500);">수강 ${active.length}과목</span>
        </div>
        <div class="course-grid">${active.map(card).join('')}</div>
      </div>
      ${past.length ? `
        <div>
          <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:14px;">
            <h2 style="font-size:14px; font-weight:700; color:var(--zinc-500);">지난 학기</h2>
            <span style="font-size:12px; color:var(--zinc-400);">${past.length}과목</span>
          </div>
          <div class="course-grid">${past.map(card).join('')}</div>
        </div>` : ''}
    `;

    $$('[data-student-course-id]').forEach(c => {
      c.addEventListener('click', () => {
        S.selectedCourseId = c.dataset.studentCourseId;
        const course = S.courses.find(x => x.id === S.selectedCourseId);
        if (c.dataset.status === 'done') {
          switchView('studentReview');
          return;
        }
        // open join modal
        $('#cjTitle').textContent = `${course.title} 강의실 입장`;
        $('#cjError').textContent = '';
        $$('#cjCodeEntry input').forEach(i => i.value = '');
        openModal('codeJoinModal');
        setTimeout(() => $$('#cjCodeEntry input')[0]?.focus(), 80);
      });
    });
  }

  // ---- Code entry handling ----
  $$('#cjCodeEntry input').forEach((inp, idx, arr) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.toUpperCase().slice(-1);
      if (inp.value && idx < arr.length - 1) arr[idx + 1].focus();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) arr[idx - 1].focus();
      if (e.key === 'Enter') $('#cjJoinBtn').click();
    });
    inp.addEventListener('paste', e => {
      const text = (e.clipboardData?.getData('text') || '').toUpperCase().replace(/\s/g, '');
      if (text.length >= 1) {
        e.preventDefault();
        arr.forEach((box, i) => box.value = text[i] || '');
        arr[Math.min(text.length, arr.length) - 1]?.focus();
      }
    });
  });
  $('#cjJoinBtn').addEventListener('click', () => {
    const code = $$('#cjCodeEntry input').map(i => i.value).join('').toUpperCase();
    if (code.length !== 6) { $('#cjError').textContent = '코드 6자리를 모두 입력해 주세요.'; return; }
    if (code !== S.classCode) {
      // demo: accept anyway with friendly hint
      $('#cjError').textContent = `현재 발급된 코드는 ${S.classCode} 입니다 (시연 안내).`;
      setTimeout(() => {
        closeModal('codeJoinModal');
        switchView('studentLive');
      }, 700);
      return;
    }
    closeModal('codeJoinModal');
    switchView('studentLive');
  });

  // =====================================================
  // Setup view — stepper, code, PDF
  // =====================================================
  function updateStepper(step) {
    $$('#setupStepper .step').forEach(s => {
      const n = +s.dataset.step;
      s.classList.toggle('active', n === step);
      s.classList.toggle('done', n < step);
    });
    $$('#setupStepper .step-line').forEach((l, i) => l.classList.toggle('done', i < step - 1));
  }
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  $('#regenCodeBtn').addEventListener('click', () => {
    S.classCode = genCode();
    $('#codeBig').textContent = S.classCode;
    $('#liveCode').textContent = S.classCode;
    updateStepper(2);
  });
  $('#copyCodeBtn').addEventListener('click', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(S.classCode).catch(() => {});
    const btn = $('#copyCodeBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;"></i> 복사됨';
    refreshIcons();
    setTimeout(() => { btn.innerHTML = orig; refreshIcons(); }, 1100);
  });

  // Live join sim
  let joinTick = null;
  (function startJoinSim() {
    if (joinTick) return;
    joinTick = setInterval(() => {
      const el = $('#joinCount');
      if (!el) return;
      if (S.joinCount < S.studentsConnected) {
        if (Math.random() < 0.45) S.joinCount += 1;
        el.textContent = S.joinCount;
      } else { clearInterval(joinTick); joinTick = null; }
    }, 1500);
  })();

  // =====================================================
  // PDF.js real upload + render
  // =====================================================
  async function handlePdfFile(file) {
    if (!file) return;
    $('#pdfFileName').textContent = file.name;
    $('#pdfMetaName').textContent = file.name;
    $('#pdfMetaSub').textContent = `${(file.size / 1024 / 1024).toFixed(2)}MB · 분석 중...`;
    $('#pdfMeta').classList.remove('hidden');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfClone = arrayBuffer.slice(0);           // BroadcastChannel용 복사본
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      S.pdf = pdf;
      S.pdfFileName = file.name;
      S.pdfTotalPages = pdf.numPages;
      S.pdfCurrentPage = 1;
      $('#pdfMetaSub').textContent = `${pdf.numPages}페이지 · ${(file.size / 1024 / 1024).toFixed(2)}MB · 업로드 완료`;
      $('#profPdfName').textContent = file.name;
      $('#profTotalPage').textContent = pdf.numPages;
      $('#stTotalPage').textContent = pdf.numPages;
      $('#rangeEnd').value = Math.min(3, pdf.numPages);
      updateStepper(4);
      syncEmit('PDF_LOADED', { pdfData: pdfClone, fileName: file.name, totalPages: pdf.numPages });
    } catch (err) {
      console.error(err);
      $('#pdfMetaSub').textContent = 'PDF 로드 실패';
    }
  }
  $('#pdfInput').addEventListener('change', e => handlePdfFile(e.target.files[0]));
  // drag-drop into the drop zone
  const dropZone = $('#pdfDropZone');
  ['dragover', 'dragenter'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.background = 'var(--brand-soft)'; }));
  ['dragleave', 'dragend', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.style.background = ''; }));
  dropZone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handlePdfFile(file);
  });
  $('#removePdfBtn').addEventListener('click', () => {
    $('#pdfMeta').classList.add('hidden');
    $('#pdfInput').value = '';
    $('#pdfFileName').textContent = 'PDF 파일을 드래그하거나 클릭해 업로드';
    S.pdf = null; S.pdfFileName = null; S.pdfTotalPages = 0;
    updateStepper(3);
  });
  $('#startClassBtn').addEventListener('click', () => switchView('profLive'));

  async function renderPdf(side) {
    if (!S.pdf) {
      // show empty state
      if (side === 'prof') {
        $('#profPdfEmpty')?.classList.remove('hidden');
        $('#profPdfCanvas')?.classList.add('hidden');
      } else {
        $('#stPdfEmpty')?.classList.remove('hidden');
        $('#stPdfCanvas')?.classList.add('hidden');
      }
      return;
    }
    const canvasId = side === 'prof' ? '#profPdfCanvas' : '#stPdfCanvas';
    const emptyId = side === 'prof' ? '#profPdfEmpty' : '#stPdfEmpty';
    const canvas = $(canvasId);
    const empty = $(emptyId);
    if (!canvas) return;
    empty?.classList.add('hidden');
    canvas.classList.remove('hidden');

    try {
      const page = await S.pdf.getPage(S.pdfCurrentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      // fit width to container
      const container = canvas.parentElement;
      const maxWidth = container.clientWidth - 32;
      const maxHeight = container.clientHeight - 32;
      const scaleW = maxWidth / baseViewport.width;
      const scaleH = maxHeight / baseViewport.height;
      const scale = Math.max(0.5, Math.min(scaleW, scaleH, 3) * S.pdfZoom);
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;

      // update labels
      if (side === 'prof') {
        $('#profCurPage').textContent = S.pdfCurrentPage;
        $('#profTotalPage').textContent = S.pdfTotalPages;
        $('#profZoomLevel').textContent = Math.round(S.pdfZoom * 100) + '%';
      } else {
        $('#stCurPage').textContent = S.pdfCurrentPage;
        $('#stTotalPage').textContent = S.pdfTotalPages;
      }
    } catch (err) {
      console.error('PDF render error:', err);
    }
  }
  // Re-render PDF on window resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (S.inClassMode && S.pdf) {
        renderPdf(S.role === 'professor' ? 'prof' : 'student');
      }
    }, 200);
  });

  $('#profPrevPage')?.addEventListener('click', () => {
    if (!S.pdf || S.pdfCurrentPage <= 1) return;
    S.pdfCurrentPage--;
    renderPdf('prof');
    syncRangeToCurrentPage();
    syncEmit('PDF_PAGE', { page: S.pdfCurrentPage });
  });
  $('#profNextPage')?.addEventListener('click', () => {
    if (!S.pdf || S.pdfCurrentPage >= S.pdfTotalPages) return;
    S.pdfCurrentPage++;
    renderPdf('prof');
    syncRangeToCurrentPage();
    syncEmit('PDF_PAGE', { page: S.pdfCurrentPage });
  });
  function syncRangeToCurrentPage() {
    const cur = S.pdfCurrentPage;
    if ($('#rangeStart')) $('#rangeStart').value = cur;
    if ($('#rangeEnd'))   $('#rangeEnd').value   = cur;
  }
  $('#profZoomIn')?.addEventListener('click', () => { S.pdfZoom = Math.min(2, S.pdfZoom + 0.1); renderPdf('prof'); });
  $('#profZoomOut')?.addEventListener('click', () => { S.pdfZoom = Math.max(0.5, S.pdfZoom - 0.1); renderPdf('prof'); });

  // =====================================================
  // Split resizer
  // =====================================================
  function applySplit(side) {
    const leftSelector = side === 'prof' ? '#profSplitLeft' : '#studentSplitLeft';
    const rightSelector = side === 'prof' ? '#profSplitRight' : '#studentSplitRight';
    const left = $(leftSelector);
    if (!left) return;
    const pct = Math.max(35, Math.min(80, S.splitRatio * 100));
    left.style.flex = `0 0 ${pct}%`;
  }
  function setupSplitDrag(handleId, splitId) {
    const handle = $(`#${handleId}`);
    const splitEl = $(`#${splitId}`);
    if (!handle || !splitEl) return;
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      const rect = splitEl.getBoundingClientRect();
      const onMove = (ev) => {
        const x = ev.clientX - rect.left;
        const ratio = x / rect.width;
        S.splitRatio = Math.max(0.35, Math.min(0.8, ratio));
        const side = handleId.startsWith('prof') ? 'prof' : 'student';
        applySplit(side);
        // throttle PDF re-render until pointer up
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        // re-render PDF at final size
        if (S.pdf) renderPdf(handleId.startsWith('prof') ? 'prof' : 'student');
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
  setupSplitDrag('profSplitHandle', 'profSplit');
  setupSplitDrag('studentSplitHandle', 'studentSplit');

  // =====================================================
  // Quick range
  // =====================================================
  $$('[data-quick-range]').forEach(b => {
    b.addEventListener('click', () => {
      const r = b.dataset.quickRange;
      const cur = S.pdfCurrentPage;
      const tot = S.pdfTotalPages || 29;
      if (r === 'current') { $('#rangeStart').value = cur; $('#rangeEnd').value = cur; S._rangeManual = false; }
      else if (r === 'recent') { $('#rangeStart').value = Math.max(1, cur - 2); $('#rangeEnd').value = cur; S._rangeManual = true; }
      else { $('#rangeStart').value = 1; $('#rangeEnd').value = tot; S._rangeManual = true; }
    });
  });

  // =====================================================
  // Keyword extraction & quiz generation
  // =====================================================
  $('#extractKwBtn').addEventListener('click', () => {
    const start = +$('#rangeStart').value || 1;
    const end = +$('#rangeEnd').value || start;
    const btn = $('#extractKwBtn');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> 키워드 분석 중...';
    setTimeout(() => {
      S.extractedKws = QSync.keywordsFor(start, end);
      S.selectedKws = [];
      renderKeywordChips();
      $('#kwSection').classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = orig;
      refreshIcons();
    }, 800);
  });

  function renderKeywordChips() {
    const wrap = $('#kwChips');
    wrap.innerHTML = '';
    const reachedMax = S.selectedKws.length >= 5;
    S.extractedKws.forEach(kw => {
      const isSelected = S.selectedKws.includes(kw);
      const chip = document.createElement('button');
      chip.className = 'chip' + (isSelected ? ' selected' : '') + ((!isSelected && reachedMax) ? ' disabled' : '');
      chip.textContent = kw;
      chip.addEventListener('click', () => {
        if (isSelected) S.selectedKws = S.selectedKws.filter(k => k !== kw);
        else if (!reachedMax) S.selectedKws.push(kw);
        renderKeywordChips();
      });
      wrap.appendChild(chip);
    });
    $('#kwSelectedCount').textContent = S.selectedKws.length;
    $('#generateQuizBtn').disabled = S.selectedKws.length === 0;
  }

  $('#generateQuizBtn').addEventListener('click', () => {
    if (S.selectedKws.length === 0) return;
    const btn = $('#generateQuizBtn');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="loader"></span> 퀴즈 생성 중...';
    setTimeout(() => {
      const setId = Date.now();
      const n = S.sets.length + 1;
      S.sets.push({
        id: setId, n,
        range: [+$('#rangeStart').value, +$('#rangeEnd').value],
        keywords: S.selectedKws.slice(),
        quizzes: S.selectedKws.map((kw, i) => QSync.quizFromKeyword(kw, i)),
        status: 'draft', responses: {}, studentChoices: {}, studentSubmitted: false,
        createdAt: Date.now(),
      });
      S.activeSetId = setId;
      S.extractedKws = []; S.selectedKws = [];
      $('#kwSection').classList.add('hidden');
      btn.innerHTML = orig; btn.disabled = false;
      renderCurrentSet(); renderSetHistory();
      refreshIcons();
    }, 900);
  });

  function currentSet() { return S.sets.find(s => s.id === S.activeSetId); }

  function renderCurrentSet() {
    const set = currentSet();
    const wrap = $('#currentSetWrap');
    updateQuizBadge();
    if (!set || set.status !== 'draft') {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = '';
      $('#setNumLabel').textContent = `#${set.n}`;
      $('#setMetaLabel').textContent = `${set.quizzes.length}문제 · p.${set.range[0]}~${set.range[1]} · 초안 · 클릭해 검토`;
      $('#currentSetList').innerHTML = set.quizzes.map(q => quizDraftHTML(q)).join('');
    }
    renderLiveStats();
    refreshIcons();
  }

  function updateQuizBadge() {
    const count = S.sets.filter(s => s.status === 'draft' || s.status === 'active').length;
    $('#quizBadge').textContent = count;
  }

  function quizDraftHTML(q) {
    return `
      <div class="quiz-item" style="margin-bottom:10px;">
        <div class="quiz-item-head">
          <span class="q-num">
            <span class="badge">${q.n}</span> ${esc(q.type)}
            <span style="color:var(--zinc-500); font-weight:500; margin-left:4px;">· ${esc(q.keyword)}</span>
          </span>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-ghost btn-sm" data-edit-quiz="${q.id}" title="편집"><i data-lucide="pencil" style="width:12px;height:12px;"></i></button>
            <button class="btn btn-ghost btn-sm" data-delete-quiz="${q.id}" title="삭제"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
          </div>
        </div>
        <div style="margin-top:10px; font-size:14px; font-weight:600; line-height:1.5;">${esc(q.q)}</div>
        <div class="choices ${q.choices.length === 2 ? 'col1' : ''}">
          ${q.choices.map((c, j) => `
            <div class="choice ${j === q.answer ? 'correct' : ''}">
              <span class="mono" style="font-size:11px; color:var(--zinc-500); margin-right:4px;">${String.fromCharCode(65 + j)}</span>
              ${esc(c)}
              ${j === q.answer ? '<i data-lucide="check" style="width:14px;height:14px; margin-left:auto; color:var(--success);"></i>' : ''}
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  document.addEventListener('click', e => {
    const del = e.target.closest('[data-delete-quiz]');
    if (del) {
      e.preventDefault();
      const qid = +del.dataset.deleteQuiz;
      const set = currentSet();
      if (set && set.status === 'draft') {
        set.quizzes = set.quizzes.filter(q => q.id !== qid);
        set.quizzes.forEach((q, i) => q.n = `Q${i + 1}`);
        renderCurrentSet();
      }
    }
  });

  // ---- Set history filter ----
  function renderClosedSetsList() {
    const wrap = $('#closedSetsList');
    if (!wrap) return;
    const closed = S.sets.filter(s => s.status === 'closed');
    if (closed.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:36px 24px;">
          <div class="ic"><i data-lucide="archive" style="width:24px;height:24px;"></i></div>
          <div class="t">아직 마감된 세트가 없어요</div>
          <div class="s">현재 세트를 출제하고 마감하면 이곳에 주차·범위별로 남습니다.</div>
        </div>`;
      refreshIcons();
      return;
    }
    const palette = ['var(--brand)', 'var(--warning)', '#94a3b8', '#cbd5e1'];
    wrap.innerHTML = closed.map(set => {
      const total = S.studentsConnected;
      const sumResp = set.quizzes.reduce((s, q) => s + ((set.responses[q.id]?.counts || []).reduce((a,b) => a+b, 0)), 0);
      const avgResp = set.quizzes.length ? Math.round(sumResp / set.quizzes.length) : 0;
      const correctTotal = set.quizzes.reduce((s,q) => s + ((set.responses[q.id]?.counts?.[q.answer]) || 0), 0);
      const correctPct = sumResp ? Math.round(correctTotal / sumResp * 100) : 0;
      const timeStr = new Date(set.createdAt).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
      return `
        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">세트 #${set.n}</div>
              <div class="card-sub">
                <span class="pill pill-brand" style="font-size:10.5px;"><i data-lucide="file-text" style="width:10px;height:10px;"></i> p.${set.range[0]}~${set.range[1]}</span>
                <span style="margin-left:8px;">${set.quizzes.length}문제 · 평균 ${avgResp}/${total}명 응답 · 정답률 ${correctPct}%</span>
              </div>
            </div>
            <span class="pill pill-neutral" style="font-size:11px;">
              <span class="dot" style="width:6px;height:6px;border-radius:50%;background:#a1a1aa;"></span>
              마감 · ${esc(timeStr)}
            </span>
          </div>
          <div style="padding:14px;">
            ${set.quizzes.map(q => {
              const r = set.responses[q.id] || { counts: [] };
              const counts = r.counts;
              const sum = counts.reduce((a,b) => a+b, 0) || 1;
              const correctCount = counts[q.answer] || 0;
              return `
                <div class="quiz-item" style="margin-bottom:10px;">
                  <div class="quiz-item-head">
                    <span class="q-num"><span class="badge">${q.n}</span> ${esc(q.type)} <span style="color:var(--zinc-500); font-weight:500; margin-left:4px;">· ${esc(q.keyword)}</span></span>
                    <span style="font-size:11px; color:var(--zinc-500);">정답률 ${Math.round(correctCount/sum*100)}%</span>
                  </div>
                  <div style="margin-top:8px; font-size:13px; font-weight:600; line-height:1.55;">${esc(q.q)}</div>
                  <div class="donut-wrap" style="margin-top:10px;">
                    ${donutSVG(counts, q.answer, palette, correctCount)}
                    <div style="flex:1; min-width:0;">
                      ${q.choices.map((c,j) => {
                        const cc = counts[j] || 0;
                        const p = sum ? Math.round((cc/sum)*100) : 0;
                        return `<div class="choice-bar">
                          <span class="sw" style="background:${palette[j] || '#cbd5e1'};"></span>
                          <span class="lbl">${j === q.answer ? '<strong style="color:var(--success-700);">✓ </strong>' : ''}${esc(c)}</span>
                          <span class="v">${cc}명</span>
                          <span class="pct">${p}%</span>
                        </div>`;
                      }).join('')}
                    </div>
                  </div>
                  <div class="explain-box" style="margin-top:10px;"><strong>해설</strong> · ${esc(q.explain)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
    refreshIcons();
  }

  function renderSetHistory() {
    updateQuizBadge();
    const filter = ($('#setFilter button.on')?.dataset.setFilter) || 'current';
    const gen = $('#quizGeneratorCard');
    const wrap = $('#currentSetWrap');
    const live = $('#liveStatsWrap');
    const closedList = $('#closedSetsList');

    // GENERATOR: hidden only in 'closed' view
    if (gen) gen.style.display = (filter === 'closed') ? 'none' : '';

    // DRAFT preview
    const draftSet = S.sets.find(s => s.status === 'draft');
    if (draftSet && filter !== 'closed') {
      S.activeSetId = draftSet.id;
      renderCurrentSet();
    } else {
      wrap.style.display = 'none';
    }

    // LIVE active set
    const activeSet = S.sets.find(s => s.status === 'active');
    if (activeSet && filter !== 'closed') {
      S.activeSetId = activeSet.id;
      renderLiveStats();
    } else {
      live.style.display = 'none';
    }

    // CLOSED list — only in 'closed' view
    if (filter === 'closed') {
      renderClosedSetsList();
    } else {
      closedList.innerHTML = '';
    }
  }
  $('#setFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-set-filter]');
    if (!b) return;
    $$('#setFilter button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    renderSetHistory();
  });

  // ---- Panel tabs (quiz / qna) ----
  $('#profPanelTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-panel]');
    if (!b) return;
    $$('#profPanelTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const p = b.dataset.panel;
    $('#quizPanel').classList.toggle('hidden', p !== 'quiz');
    $('#qnaPanel').classList.toggle('hidden', p !== 'qna');
    $('#setFilter').style.visibility = p === 'quiz' ? 'visible' : 'hidden';
  });

  // ---- Publish, close, discard ----
  $('#publishQuizBtn').addEventListener('click', () => {
    const set = currentSet();
    if (!set) return;
    S._rangeManual = false;
    set.status = 'active';
    set.responses = {};
    set.quizzes.forEach(q => {
      const full = QSync.botCounts(q.keyword);
      while (full.length < q.choices.length) full.push(0);
      const counts = full.map(c => Math.floor(c * 0.35));
      set.responses[q.id] = { counts, full };
    });
    renderCurrentSet(); renderLiveStats(); renderSetHistory();
    renderStudentLive();
    syncEmit('QUIZ_PUBLISHED', { set: S.sets.find(s => s.id === S.activeSetId) });
    startProgress();
  });

  let progressTick = null;
  function startProgress() {
    if (progressTick) clearInterval(progressTick);
    progressTick = setInterval(() => {
      const set = S.sets.find(s => s.status === 'active');
      if (!set) { clearInterval(progressTick); progressTick = null; return; }
      let allFull = true;
      set.quizzes.forEach(q => {
        const r = set.responses[q.id]; if (!r) return;
        for (let i = 0; i < r.counts.length; i++) {
          if (r.counts[i] < r.full[i]) {
            if (Math.random() < 0.55) r.counts[i] = Math.min(r.counts[i] + 1, r.full[i]);
          }
          if (r.counts[i] < r.full[i]) allFull = false;
        }
      });
      renderLiveStats();
      if (allFull) { clearInterval(progressTick); progressTick = null; }
    }, 900);
  }

  function renderLiveStats() {
    const set = S.sets.find(s => s.id === S.activeSetId && (s.status === 'active' || s.status === 'closed'));
    const wrap = $('#liveStatsWrap');
    if (!set) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const total = S.studentsConnected;
    const sumResp = set.quizzes.reduce((s, q) => s + ((set.responses[q.id]?.counts || []).reduce((a, b) => a + b, 0)), 0);
    const avgResp = set.quizzes.length ? Math.round(sumResp / set.quizzes.length) : 0;
    $('#liveStatsSub').textContent = `세트 #${set.n} · 평균 ${avgResp} / ${total}명 응답`;

    const pillEl = $('#liveSetPill');
    if (set.status === 'closed') {
      pillEl.className = 'pill pill-neutral';
      pillEl.innerHTML = '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:#a1a1aa;"></span>마감';
    } else {
      pillEl.className = 'pill pill-success';
      pillEl.innerHTML = '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>출제 중';
    }
    $('#closeSetBtn').disabled = set.status !== 'active';

    const palette = ['var(--brand)', 'var(--warning)', '#94a3b8', '#cbd5e1'];
    $('#liveStatsList').innerHTML = set.quizzes.map(q => {
      const r = set.responses[q.id] || { counts: [], full: [] };
      const counts = r.counts;
      const sum = counts.reduce((a, b) => a + b, 0) || 1;
      const pct = Math.round((sum / total) * 100);
      const correctCount = counts[q.answer] || 0;
      return `
        <div class="quiz-item" style="margin-bottom:10px;">
          <div class="quiz-item-head">
            <span class="q-num"><span class="badge">${q.n}</span> ${esc(q.type)} <span style="color:var(--zinc-500); font-weight:500; margin-left:4px;">· ${esc(q.keyword)}</span></span>
            <span style="font-size:11px; color:var(--zinc-500);">${sum}/${total}명 · 응답률 ${pct}%</span>
          </div>
          <div style="margin-top:8px; font-size:13px; font-weight:600; line-height:1.55;">${esc(q.q)}</div>
          <div class="donut-wrap" style="margin-top:12px;">
            ${donutSVG(counts, q.answer, palette, correctCount)}
            <div style="flex:1; min-width:0;">
              ${q.choices.map((c, j) => {
                const cc = counts[j] || 0;
                const p = sum ? Math.round((cc / sum) * 100) : 0;
                return `
                  <div class="choice-bar">
                    <span class="sw" style="background:${palette[j] || '#cbd5e1'};"></span>
                    <span class="lbl">${j === q.answer ? '<strong style="color:var(--success-700);">✓ </strong>' : ''}${esc(c)}</span>
                    <span class="v">${cc}명</span>
                    <span class="pct">${p}%</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
          ${set.status === 'closed' ? `<div class="explain-box" style="margin-top:10px;"><strong>해설</strong> · ${esc(q.explain)}</div>` : ''}
        </div>
      `;
    }).join('');
    refreshIcons();
  }

  function donutSVG(counts, answerIdx, palette, correctCount) {
    const sum = counts.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const r = 42, cx = 52, cy = 52;
    const arc = (start, end) => {
      const sa = start * Math.PI * 2 - Math.PI / 2;
      const ea = end * Math.PI * 2 - Math.PI / 2;
      const large = end - start > 0.5 ? 1 : 0;
      const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
      const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
      return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    };
    const segs = counts.map((c, i) => {
      const start = acc / sum; acc += c; const end = acc / sum;
      return `<path d="${arc(start, end)}" fill="${palette[i] || '#cbd5e1'}" />`;
    }).join('');
    return `
      <svg width="104" height="104" viewBox="0 0 104 104" style="flex-shrink:0;">
        ${segs}
        <circle cx="${cx}" cy="${cy}" r="28" fill="#fff" />
        <text x="${cx}" y="${cy}" text-anchor="middle" font-size="16" font-weight="700" fill="#18181b">${correctCount}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="9" fill="#71717a">정답</text>
      </svg>`;
  }

  $('#closeSetBtn').addEventListener('click', () => {
    const set = S.sets.find(s => s.status === 'active');
    if (!set) return;
    set.status = 'closed';
    set.quizzes.forEach(q => { const r = set.responses[q.id]; if (r) r.counts = r.full.slice(); });
    if (progressTick) { clearInterval(progressTick); progressTick = null; }
    renderCurrentSet(); renderLiveStats(); renderSetHistory();
    renderStudentLive();
    syncEmit('QUIZ_CLOSED', { setId: set.id, responses: set.responses });
  });
  $('#discardSetBtn').addEventListener('click', () => {
    S.sets = S.sets.filter(s => s.id !== S.activeSetId);
    S.activeSetId = null;
    renderCurrentSet(); renderSetHistory();
    renderStudentLive();
  });

  // ---- Custom confirm modal ----
  let _confirmHandler = null;
  function showConfirm({ title, message, okLabel = '확인', cancelLabel = '취소', okClass = 'btn-primary', icon = 'alert-circle', iconTone = 'danger', onConfirm }) {
    $('#cfmTitle').textContent = title;
    $('#cfmMessage').textContent = message;
    const okBtn = $('#cfmConfirmBtn');
    okBtn.textContent = okLabel;
    okBtn.className = 'btn ' + okClass;
    $('#cfmCancelBtn').textContent = cancelLabel;
    const ic = $('#cfmIcon');
    if (iconTone === 'brand') ic.style.cssText = 'width:42px;height:42px;border-radius:12px;flex-shrink:0;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand);';
    else if (iconTone === 'warning') ic.style.cssText = 'width:42px;height:42px;border-radius:12px;flex-shrink:0;display:grid;place-items:center;background:var(--warning-50);color:var(--warning-700);';
    else ic.style.cssText = 'width:42px;height:42px;border-radius:12px;flex-shrink:0;display:grid;place-items:center;background:var(--danger-50);color:var(--danger-600);';
    ic.innerHTML = `<i data-lucide="${icon}" style="width:22px;height:22px;"></i>`;
    refreshIcons();
    _confirmHandler = onConfirm;
    $('#confirmModal').classList.add('open');
  }
  $('#cfmConfirmBtn').addEventListener('click', () => {
    $('#confirmModal').classList.remove('open');
    const fn = _confirmHandler;
    _confirmHandler = null;
    if (typeof fn === 'function') fn();
  });

  // ---- End class → go to report ----
  $('#endClassBtn').addEventListener('click', () => {
    showConfirm({
      title: '수업을 종료하시겠어요?',
      message: '확인 시 남은 세트가 자동 마감되고 리포트 페이지로 이동합니다.',
      okLabel: '수업 종료',
      okClass: 'btn-danger',
      icon: 'square',
      iconTone: 'danger',
      onConfirm: () => {
        S.sets.forEach(s => { if (s.status === 'active') s.status = 'closed'; });
        if (progressTick) { clearInterval(progressTick); progressTick = null; }
        S.classEnded = true;
        syncEmit('CLASS_ENDED', {});
        switchView('profReport');
      },
    });
  });

  // =====================================================
  // Student live render
  // =====================================================
  function activeRunningSet() { return S.sets.find(s => s.status === 'active' || s.status === 'closed'); }

  function renderStudentLive() {
    const set = activeRunningSet();
    const waitCard = $('#studentWaitCard');
    const setCard = $('#studentSetCard');
    const lockOverlay = $('#studentLockOverlay');
    if (!set) {
      setCard.style.display = 'none';
      waitCard.style.display = '';
      lockOverlay?.classList.add('hidden');
      return;
    }
    waitCard.style.display = 'none';
    setCard.style.display = 'flex';
    $('#studentSetNum').textContent = `#${set.n}`;
    const isActive = set.status === 'active';
    const allAnswered = set.quizzes.every(q => set.studentChoices[q.id] != null);

    if (isActive && !set.studentSubmitted) {
      lockOverlay.classList.remove('hidden');
      $('#studentSetSub').textContent = `${set.quizzes.length}문제 · 모두 풀고 제출하세요`;
      $('#studentSetPill').className = 'pill pill-warn'; $('#studentSetPill').textContent = '진행 중';
      $('#studentSubmitBtn').disabled = !allAnswered;
      $('#studentSubmitBtn').innerHTML = allAnswered
        ? '<i data-lucide="send" style="width:14px;height:14px;"></i> 답안 제출'
        : '<i data-lucide="lock" style="width:14px;height:14px;"></i> 모든 문제에 답해 주세요';
      $('#studentSubmitNote').textContent = '교수님이 마감해야 정답이 공개돼요';
    } else if (isActive && set.studentSubmitted) {
      lockOverlay.classList.add('hidden');
      $('#studentSetSub').textContent = `${set.quizzes.length}문제 · 제출 완료 — 마감 대기 중`;
      $('#studentSetPill').className = 'pill pill-warn'; $('#studentSetPill').textContent = '제출 완료';
      $('#studentSubmitBtn').disabled = true;
      $('#studentSubmitBtn').innerHTML = '<i data-lucide="check-circle-2" style="width:14px;height:14px;"></i> 제출 완료';
      $('#studentSubmitNote').textContent = '교수님이 마감하면 정답·해설이 공개됩니다';
    } else {
      lockOverlay.classList.add('hidden');
      $('#studentSetPill').className = 'pill pill-success'; $('#studentSetPill').textContent = '결과 공개';
      $('#studentSetSub').textContent = `${set.quizzes.length}문제 · 결과를 확인하세요`;
      $('#studentSubmitBtn').disabled = true;
      $('#studentSubmitBtn').innerHTML = '<i data-lucide="check" style="width:14px;height:14px;"></i> 결과 확인 완료';
      $('#studentSubmitNote').textContent = '복습 페이지에서도 다시 확인할 수 있어요';
    }

    $('#studentQuizList').innerHTML = set.quizzes.map(q => studentQuizHTML(q, set)).join('');
    refreshIcons();

    $$('#studentQuizList [data-st-choice]').forEach(b => {
      b.addEventListener('click', () => {
        if (set.studentSubmitted || set.status === 'closed') return;
        const qid = +b.dataset.stQid; const ci = +b.dataset.stChoice;
        set.studentChoices[qid] = ci;
        renderStudentLive();
      });
    });
    $$('#studentQuizList [data-memo-for]').forEach(t => {
      t.addEventListener('input', () => {
        S.memos[t.dataset.memoFor] = t.value;
        QSync.saveMemos(S.memos);
      });
    });
  }

  function studentQuizHTML(q, set) {
    const isClosed = set.status === 'closed';
    const choice = set.studentChoices[q.id];
    const memo = S.memos[q.id] || '';
    return `
      <div class="quiz-item" style="margin-bottom:12px;">
        <div class="quiz-item-head">
          <span class="q-num"><span class="badge">${q.n}</span> ${esc(q.type)}</span>
          ${isClosed
            ? (choice === q.answer
              ? '<span class="pill pill-success" style="font-size:11px;">정답</span>'
              : choice == null
                ? '<span class="pill pill-neutral" style="font-size:11px;">미응답</span>'
                : '<span class="pill pill-danger" style="font-size:11px;">오답</span>')
            : (choice != null ? '<span class="pill pill-brand" style="font-size:11px;">선택 완료</span>' : '')}
        </div>
        <div style="margin-top:10px; font-size:14.5px; font-weight:600; line-height:1.55;">${esc(q.q)}</div>
        <div class="choices ${q.choices.length === 2 ? 'col1' : ''}">
          ${q.choices.map((c, j) => {
            let cls = '';
            if (isClosed) {
              if (j === q.answer) cls = 'correct';
              else if (j === choice) cls = 'wrong';
            } else if (j === choice) cls = 'selected';
            return `
              <button data-st-qid="${q.id}" data-st-choice="${j}" class="choice ${cls}">
                <span class="ck"></span>
                <span class="mono" style="font-size:11px; color:var(--zinc-500); margin-right:4px;">${String.fromCharCode(65 + j)}</span>
                ${esc(c)}
              </button>`;
          }).join('')}
        </div>
        ${isClosed ? `<div class="explain-box" style="margin-top:10px;"><strong>해설</strong> · ${esc(q.explain)}</div>` : ''}
        <div class="postit" style="margin-top:14px;">
          <div class="head"><i data-lucide="sticky-note" style="width:11px;height:11px;"></i> 내 메모</div>
          <textarea data-memo-for="${q.id}" placeholder="교수님 설명, 헷갈렸던 부분을 메모해두세요. 복습에서 다시 볼 수 있어요.">${esc(memo)}</textarea>
        </div>
      </div>
    `;
  }

  $('#studentSubmitBtn').addEventListener('click', () => {
    const set = S.sets.find(s => s.status === 'active');
    if (!set) return;
    if (!set.quizzes.every(q => set.studentChoices[q.id] != null)) return;
    set.studentSubmitted = true;
    set.quizzes.forEach(q => {
      const r = set.responses[q.id]; const ci = set.studentChoices[q.id];
      if (r && ci != null) r.counts[ci] = Math.min(r.full[ci], (r.counts[ci] || 0) + 1);
      syncEmit('STUDENT_ANSWER', { setId: set.id, qid: q.id, choiceIdx: set.studentChoices[q.id] });
    });
    renderStudentLive(); renderLiveStats();
  });

  // =====================================================
  // Chatbot popup (student anonymous question)
  // =====================================================
  const cb = {
    btn: $('#chatbotBtn'), popup: $('#chatbotPopup'),
    text: $('#cbText'), count: $('#cbCount'),
    send: $('#cbSendBtn'), cancel: $('#cbCancelBtn'),
    recent: $('#cbRecent'), recentText: $('#cbRecentText'),
  };
  cb.btn?.addEventListener('click', () => {
    cb.popup.classList.toggle('open');
    if (cb.popup.classList.contains('open')) setTimeout(() => cb.text.focus(), 150);
    refreshIcons();
  });
  cb.cancel?.addEventListener('click', () => { cb.popup.classList.remove('open'); });
  cb.text?.addEventListener('input', () => {
    cb.count.textContent = cb.text.value.length;
  });
  cb.send?.addEventListener('click', () => {
    const t = cb.text.value.trim();
    if (!t) return;
    const q = { id: Date.now(), text: t, ago: '방금 전' };
    S.studentQuestions.unshift(q);
    S.questions.unshift(q);
    cb.recent.style.display = '';
    cb.recentText.textContent = t;
    cb.text.value = ''; cb.count.textContent = 0;
    syncEmit('STUDENT_QUESTION', { question: q });
    renderProfQList();
    setTimeout(() => { cb.popup.classList.remove('open'); }, 1200);
  });

  // =====================================================
  // Q&A rendering
  // =====================================================
  function renderProfQList() {
    const wrap = $('#liveQList');
    if (!wrap) return;
    $('#liveQCount').textContent = `${S.questions.length}개`;
    $('#qnaBadge').textContent = S.questions.length;
    if (!S.questions.length) {
      wrap.innerHTML = '<div style="padding:24px; text-align:center; color:var(--zinc-500); font-size:13px;">아직 받은 질문이 없어요</div>';
      return;
    }
    wrap.innerHTML = S.questions.slice(0, 30).map((q, i) => `
      <div class="qna-item" style="${i === 0 && q.id > 1000 ? 'border-color:var(--brand); background:var(--brand-softer);' : ''}">
        <div class="meta">${esc(q.ago)} · 익명</div>
        <div class="body">${esc(q.text)}</div>
      </div>
    `).join('');
  }

  // =====================================================
  // Report — per-set body (different content per tab + page range)
  // =====================================================
  const REPORT_SETS = {
    1: {
      range: [1, 5], avg: 68,
      rows: [
        ['Q1', '스택은 ___ 구조를 따르는 선형 자료구조이다',     75, 'success', 'FIFO (17%)'],
        ['Q2', '큐에서 <strong>삽입</strong>은 ___ 에서 이루어진다', 52, 'warning', 'front (22%)'],
        ['Q3', '연결 리스트의 각 요소를 ___ 라고 한다',           45, 'danger',  '포인터 (38%)'],
        ['Q4', '스택은 중간 삽입이 가능하다 (O/X)',                62, 'success', 'O (38%)'],
        ['Q5', '힙은 ___ 트리의 일종이다',                        80, 'success', '이진 탐색 (12%)'],
      ],
    },
    2: {
      range: [9, 14], avg: 72,
      rows: [
        ['Q1', 'BST에서 왼쪽 서브트리의 값은 항상 부모보다 ___',  84, 'success', '크다 (12%)'],
        ['Q2', '중위 순회의 방문 순서는?',                        66, 'warning', 'V-L-R (24%)'],
        ['Q3', 'BST 노드 삭제 시 두 자식이 있는 경우 대체 값은?',  58, 'warning', '부모 노드 (28%)'],
        ['Q4', '힙은 ___ 트리의 일종이다',                        82, 'success', '이진 탐색 (10%)'],
        ['Q5', '우선순위 큐의 효율적 구현에 적합한 자료구조는?',   70, 'success', '연결 리스트 (18%)'],
      ],
    },
  };
  function renderReportSet(num) {
    const data = REPORT_SETS[num] || REPORT_SETS[1];
    const body = $('#reportSetBody');
    if (!body) return;
    const colorVar = (k) => k === 'danger' ? 'var(--danger-700)' : k === 'warning' ? 'var(--warning-700)' : 'var(--success-700)';
    body.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
        <span class="pill pill-brand" style="font-size:11px;">
          <i data-lucide="file-text" style="width:11px;height:11px;"></i>
          출제 범위 p.${data.range[0]}~${data.range[1]}
        </span>
        <span class="pill pill-neutral" style="font-size:11px;">${data.rows.length}문제</span>
        <span class="pill pill-success" style="font-size:11px;">평균 정답률 ${data.avg}%</span>
      </div>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="font-size:11px; color:var(--zinc-500); text-align:left; border-bottom:1px solid var(--zinc-150);">
            <th style="padding:8px 0; font-weight:600;">문제</th>
            <th style="padding:8px 0; font-weight:600;">내용</th>
            <th style="padding:8px 0; font-weight:600; text-align:right;">정답률</th>
            <th style="padding:8px 0; font-weight:600; text-align:right;">오답 TOP</th>
          </tr>
        </thead>
        <tbody style="font-size:13px;">
          ${data.rows.map((r, i) => `
            <tr style="${i === data.rows.length - 1 ? '' : 'border-bottom:1px solid var(--zinc-100);'}">
              <td style="padding:12px 0;">${r[0]}</td>
              <td>${r[1]}</td>
              <td style="text-align:right; color:${colorVar(r[3])}; font-weight:600;">${r[2]}%</td>
              <td style="text-align:right;"><span class="pill pill-danger">${esc(r[4])}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    $('#reportSetSub').textContent = `세트 #${num} · ${data.rows.length}문제 · p.${data.range[0]}~${data.range[1]} · 평균 정답률 ${data.avg}%`;
    refreshIcons();
  }
  $('#reportSetTabs')?.addEventListener('click', e => {
    const b = e.target.closest('[data-set-tab]'); if (!b) return;
    $$('#reportSetTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderReportSet(b.dataset.setTab);
  });
  renderReportSet(1);

  // =====================================================
  // Report week navigation
  // =====================================================
  // Per-week mock data. Today = week 5 (current). Weeks 6+ are future ("수업 전").
  const WEEKS = {
    3: { date: '2026.04.29', title: '자료구조론 3주차', sub: '2026.04.29 · 90분 · 출제 1세트 · 응답 28명' },
    4: { date: '2026.05.06', title: '자료구조론 4주차', sub: '2026.05.06 · 90분 · 출제 2세트 · 응답 30명' },
    5: { date: '2026.05.13', title: '자료구조론 5주차', sub: '2026.05.13 · 90분 · 출제 2세트 · 응답 32명' },
    6: { date: '2026.05.20', title: '자료구조론 6주차', sub: '예정 일자 2026.05.20', future: true },
    7: { date: '2026.05.27', title: '자료구조론 7주차', sub: '예정 일자 2026.05.27', future: true },
    8: { date: '2026.06.03', title: '자료구조론 8주차', sub: '예정 일자 2026.06.03', future: true },
  };
  const WEEK_MIN = 3, WEEK_MAX = 8, WEEK_CURRENT = 5;
  S.reportWeek = WEEK_CURRENT;

  function renderReportWeek() {
    const w = S.reportWeek;
    const data = WEEKS[w];
    if (!data) return;
    $('#reportTitle').textContent = `${data.title} — 수업 리포트`;
    $('#reportSubtitle').textContent = data.sub;
    $('#profWeekNow').innerHTML = `${w}주차 <span class="sub">${esc(data.date)}</span>`;

    const ready = $('#reportContentReady');
    const empty = $('#reportEmptyState');
    if (data.future) {
      ready.classList.add('hidden');
      empty.classList.remove('hidden');
      $('#emptyStateTitle').textContent = `${w}주차 수업은 아직 진행되지 않았어요`;
      $('#emptyStateSub').textContent = `예정 일자: ${data.date} · 수업이 끝난 뒤 리포트가 이곳에 자동 생성됩니다.`;
    } else {
      ready.classList.remove('hidden');
      empty.classList.add('hidden');
    }
    // Disable arrows at bounds
    $$('[data-week-scope="prof"][data-week-step="-1"]').forEach(b => b.disabled = w <= WEEK_MIN);
    $$('[data-week-scope="prof"][data-week-step="1"]').forEach(b => b.disabled = w >= WEEK_MAX);
    refreshIcons();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-week-step][data-week-scope="prof"]');
    if (!b || b.disabled) return;
    const step = +b.dataset.weekStep;
    const next = Math.max(WEEK_MIN, Math.min(WEEK_MAX, S.reportWeek + step));
    if (next === S.reportWeek) return;
    S.reportWeek = next;
    renderReportWeek();
  });
  renderReportWeek();

  // =====================================================
  // Student review render (with choices visible)
  // =====================================================
  function renderReview() {
    const wrap = $('#reviewList'); if (!wrap) return;
    let set = S.sets.find(s => s.status === 'closed') || S.sets[0];
    if (!set) {
      const kws = ['스택', 'rear/front', '연결 리스트', '노드', '힙'];
      const quizzes = kws.map((kw, i) => QSync.quizFromKeyword(kw, i));
      const wrongRates = [25, 48, 55, 38, 20];
      const studentChoices = {};
      quizzes.forEach((q, i) => { studentChoices[q.id] = (i < 3) ? q.answer : (q.answer + 1) % q.choices.length; q.wrongRate = wrongRates[i]; });
      set = { n: 1, quizzes, studentChoices };
    } else {
      set.quizzes.forEach(q => {
        if (q.wrongRate == null) {
          const r = set.responses?.[q.id];
          if (r) {
            const sum = r.full.reduce((a, b) => a + b, 0) || 1;
            q.wrongRate = Math.round((1 - (r.full[q.answer] || 0) / sum) * 100);
          } else q.wrongRate = 25;
        }
        if (set.studentChoices[q.id] == null) {
          set.studentChoices[q.id] = Math.random() < 0.7 ? q.answer : (q.answer + 1) % q.choices.length;
        }
      });
    }

    const filter = $('#reviewFilter button.on')?.dataset.rf || 'all';
    let list = set.quizzes.slice();
    if (filter === 'wrong') list = list.filter(q => set.studentChoices[q.id] !== q.answer);
    if (filter === 'hot') list = list.slice().sort((a, b) => (b.wrongRate || 0) - (a.wrongRate || 0));

    if (list.length === 0) {
      wrap.innerHTML = '<div class="card card-pad" style="text-align:center; color:var(--zinc-500); font-size:13px;">조건에 맞는 문제가 없어요</div>';
      return;
    }

    wrap.innerHTML = list.map(q => {
      const sc = set.studentChoices[q.id];
      const correct = sc === q.answer;
      const memo = S.memos[q.id] || '';
      const wrongRate = q.wrongRate ?? 25;

      return `
        <div class="card">
          <div class="card-pad-lg">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="q-num"><span class="badge">${q.n}</span> ${esc(q.type)} <span style="color:var(--zinc-500); font-weight:500; margin-left:4px;">· ${esc(q.keyword)}</span></span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="pill ${correct ? 'pill-success' : 'pill-danger'}" style="font-size:11px;">${correct ? '정답' : '오답'}</span>
                <span style="font-size:11px; color:var(--zinc-500);">전체 오답률 ${wrongRate}%</span>
              </div>
            </div>
            <div style="margin-top:10px; font-size:14.5px; font-weight:600; line-height:1.55;">${esc(q.q)}</div>

            <div class="choices ${q.choices.length === 2 ? 'col1' : ''}" style="margin-top:12px;">
              ${q.choices.map((c, j) => {
                let cls = '';
                if (j === q.answer) cls = 'correct';
                else if (j === sc) cls = 'wrong';
                const tag = j === q.answer ? '<span class="pill pill-success" style="font-size:10px; margin-left:auto;">정답</span>'
                  : j === sc ? '<span class="pill pill-danger" style="font-size:10px; margin-left:auto;">내 답</span>'
                  : '';
                return `
                  <div class="choice ${cls}" style="cursor:default;">
                    <span class="mono" style="font-size:11px; color:var(--zinc-500); margin-right:4px;">${String.fromCharCode(65 + j)}</span>
                    ${esc(c)}
                    ${tag}
                  </div>`;
              }).join('')}
            </div>

            <div class="explain-box" style="margin-top:10px;"><strong>해설</strong> · ${esc(q.explain)}</div>

            <div class="postit" style="margin-top:14px;">
              <div class="head"><i data-lucide="sticky-note" style="width:11px;height:11px;"></i> 수업 중 내 메모</div>
              <textarea data-memo-for="${q.id}" placeholder="이 문제 관련 메모를 남겨두세요. 시험 공부 때 다시 볼 수 있어요.">${esc(memo)}</textarea>
            </div>
          </div>
        </div>
      `;
    }).join('');

    refreshIcons();

    $$('#reviewList [data-memo-for]').forEach(t => {
      t.addEventListener('input', () => {
        S.memos[t.dataset.memoFor] = t.value;
        QSync.saveMemos(S.memos);
      });
    });
  }

  $('#reviewFilter')?.addEventListener('click', e => {
    const b = e.target.closest('[data-rf]'); if (!b) return;
    $$('#reviewFilter button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    renderReview();
  });
  $('#reviewSetTabs')?.addEventListener('click', e => {
    const b = e.target.closest('[data-set-tab]'); if (!b) return;
    $$('#reviewSetTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderReview();
  });

  // =====================================================
  // Init
  // =====================================================
  renderCourses();
  renderStudentCourses();
  renderProfQList();
  updateQuizBadge();
  refreshIcons();

  // =====================================================
  // BroadcastChannel 수신 핸들러
  // =====================================================
  if (syncCh) {
    syncCh.onmessage = function (e) {
      const { type, payload } = e.data;
      const isStudentLiveActive = () => !!$('#studentLive-view')?.classList.contains('active');
      const isProfLiveActive   = () => !!$('#profLive-view')?.classList.contains('active');

      switch (type) {

        // ── 교수 → 학생: PDF 업로드 ──────────────────────────
        case 'PDF_LOADED':
          if (S.role !== 'professor') {
            pdfjsLib.getDocument({ data: payload.pdfData }).promise.then(pdf => {
              S.pdf = pdf;
              S.pdfFileName = payload.fileName;
              S.pdfTotalPages = payload.totalPages;
              S.pdfCurrentPage = 1;
              if ($('#stTotalPage')) $('#stTotalPage').textContent = payload.totalPages;
              if ($('#stCurPage'))   $('#stCurPage').textContent = 1;
              if (isStudentLiveActive()) renderPdf('student');
            }).catch(err => console.warn('PDF sync error:', err));
          }
          break;

        // ── 교수 → 학생: 페이지 넘기기 ──────────────────────
        case 'PDF_PAGE':
          if (S.role !== 'professor') {
            S.pdfCurrentPage = payload.page;
            if ($('#stCurPage')) $('#stCurPage').textContent = payload.page;
            if (isStudentLiveActive()) renderPdf('student');
          }
          break;

        // ── 교수 → 학생: 퀴즈 내보내기 ──────────────────────
        case 'QUIZ_PUBLISHED':
          if (S.role !== 'professor') {
            const incoming = payload.set;
            const idx = S.sets.findIndex(s => s.id === incoming.id);
            if (idx >= 0) S.sets[idx] = incoming; else S.sets.push(incoming);
            S.activeSetId = incoming.id;
            if (isStudentLiveActive()) renderStudentLive();
          }
          break;

        // ── 교수 → 학생: 퀴즈 마감 ──────────────────────────
        case 'QUIZ_CLOSED':
          if (S.role !== 'professor') {
            const cs = S.sets.find(s => s.id === payload.setId);
            if (cs) { cs.status = 'closed'; if (payload.responses) cs.responses = payload.responses; }
            if (isStudentLiveActive()) renderStudentLive();
          }
          break;

        // ── 교수 → 학생: 수업 종료 ──────────────────────────
        case 'CLASS_ENDED':
          if (S.role !== 'professor') {
            S.classEnded = true;
            showClassEndedOverlay();
          }
          break;

        // ── 학생 → 교수: 답안 제출 ──────────────────────────
        case 'STUDENT_ANSWER':
          if (S.role === 'professor') {
            const as = S.sets.find(s => s.id === payload.setId);
            if (as && payload.qid != null && payload.choiceIdx != null) {
              const r = as.responses[payload.qid];
              if (r) r.counts[payload.choiceIdx] = Math.min(
                r.full[payload.choiceIdx],
                (r.counts[payload.choiceIdx] || 0) + 1
              );
            }
            if (isProfLiveActive()) renderLiveStats();
          }
          break;

        // ── 학생 → 교수: 익명 질문 ──────────────────────────
        case 'STUDENT_QUESTION':
          if (S.role === 'professor') {
            S.questions.unshift(payload.question);
            if (isProfLiveActive()) renderProfQList();
          }
          break;

        // ── 학생 탭이 열릴 때 현재 상태 요청 ────────────────
        case 'STATE_REQUEST':
          if (S.role === 'professor' && S.loggedIn) {
            syncEmit('STATE_RESPONSE', {
              sets: S.sets,
              activeSetId: S.activeSetId,
              classCode: S.classCode,
              classEnded: S.classEnded || false,
            });
          }
          break;

        // ── 교수 탭이 현재 상태 응답 ─────────────────────────
        case 'STATE_RESPONSE':
          if (S.role !== 'professor') {
            S.sets       = payload.sets || [];
            S.activeSetId = payload.activeSetId;
            S.classCode  = payload.classCode;
            if (payload.classEnded) { S.classEnded = true; showClassEndedOverlay(); return; }
            if (isStudentLiveActive()) { renderStudentLive(); renderPdf('student'); }
          }
          break;
      }
    };
  }

  // ---- 수업 종료 알림 오버레이 (학생 화면) ----
  function showClassEndedOverlay() {
    if ($('#classEndedOverlay')) return; // 중복 방지
    const overlay = document.createElement('div');
    overlay.id = 'classEndedOverlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,0.72)', 'backdrop-filter:blur(6px)',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');
    overlay.innerHTML = `
      <div style="
        background:var(--surface,#fff); border-radius:20px;
        padding:40px 36px; text-align:center; max-width:380px; width:90%;
        box-shadow:0 24px 80px rgba(0,0,0,0.3);
      ">
        <div style="
          width:60px; height:60px; margin:0 auto 16px;
          border-radius:16px; background:var(--brand-soft,#ede9f6);
          display:grid; place-items:center;
        ">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
               xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2 L19 6 V14 L12 18 L5 14 V6 Z"
                  stroke="#7C5BC4" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="12" cy="11" r="2.5" fill="#7C5BC4"/>
            <path d="M14 13 L17 16" stroke="#7C5BC4"
                  stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <h2 style="font-size:18px; font-weight:700; color:var(--zinc-900,#18181b);">
          교수님이 수업을 종료했어요
        </h2>
        <p style="margin-top:8px; font-size:13.5px;
                  color:var(--zinc-500,#71717a); line-height:1.65;">
          오늘 퀴즈 결과와 해설, 내가 남긴 메모를<br/>
          복습 페이지에서 다시 확인할 수 있어요.
        </p>
        <button id="classEndedGoReview" style="
          margin-top:24px; width:100%;
          padding:12px 0; border:none; border-radius:10px; cursor:pointer;
          background:linear-gradient(135deg,#7C5BC4,#9B6FDF);
          color:#fff; font-size:14px; font-weight:700; letter-spacing:-.01em;
        ">복습 페이지로 이동하기</button>
        <button id="classEndedStay" style="
          margin-top:10px; width:100%;
          padding:10px 0; border:none; border-radius:10px; cursor:pointer;
          background:transparent; color:var(--zinc-500,#71717a); font-size:13px;
        ">잠깐 더 머무르기</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#classEndedGoReview').addEventListener('click', () => {
      overlay.remove();
      switchView('studentReview');
    });
    overlay.querySelector('#classEndedStay').addEventListener('click', () => {
      overlay.remove();
    });
  }

})();