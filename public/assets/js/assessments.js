/*
 * Staff assessments page (teachers and administrators). The server enforces scope,
 * locking after publication, the answer-key rule and the approval order; these
 * controls only make the workflow easy to follow.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KARACHI = "Asia/Karachi";
  const TYPE_LABELS = { quiz: "Quiz", class_test: "Class test", monthly_test: "Monthly test" };
  const STATE_LABELS = { none: "Not started", in_progress: "In progress", not_submitted: "Not submitted", pending_review: "Awaiting approval", approved: "Approved", released: "Released" };
  const state = { role: null, assessments: [], current: null, editingId: null, requestToken: 0 };

  const api = (path, options) => window.StemSession.apiFetch(path, options);
  const notify = (id, text) => { $(id).textContent = text || ""; };

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("en-PK", { timeZone: KARACHI, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  }

  function toKarachiInput(iso) {
    if (!iso) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KARACHI, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(iso));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
  }

  const fromKarachiInput = (value) => (value ? `${value}:00+05:00` : null);

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function statusLabel(a) {
    return { draft: "Draft", published: "Published", closed: "Closed" }[a.publicationState] ?? a.publicationState;
  }

  function render(emptyMessage) {
    const body = $("assessmentBody");
    const filter = $("statusFilter").value;
    const rows = state.assessments.filter((a) => filter === "all" || a.publicationState === filter);
    body.replaceChildren();

    if (rows.length === 0) {
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = emptyMessage || "No assessments match these filters.";
      const tr = document.createElement("tr");
      tr.append(td);
      body.append(tr);
    } else {
      for (const a of rows) {
        const tr = document.createElement("tr");
        tr.append(cell(a.title), cell(TYPE_LABELS[a.assessmentType] ?? a.assessmentType), cell(formatWhen(a.opensAt)),
          cell(formatWhen(a.closesAt)), cell(`${a.questionCount} (${a.totalMarks} marks)`), cell(statusLabel(a)));
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-action";
        button.dataset.id = a.id;
        button.textContent = "Open";
        action.append(button);
        tr.append(action);
        body.append(tr);
      }
    }
    $("resultCount").textContent = `${rows.length} assessment(s)`;
  }

  async function loadClasses() {
    const { data } = await api("/classes");
    const select = $("classSelect");
    select.replaceChildren(option("", data.classes.length ? "Choose a class" : "No classes available"));
    for (const c of data.classes) select.append(option(c.id, `${c.name} (Grade ${c.grade})`));
  }

  async function loadSubjects() {
    const classId = $("classSelect").value;
    const select = $("subjectSelect");
    state.requestToken += 1;
    if (!classId) {
      select.replaceChildren(option("", "Choose a class first"));
      select.disabled = true;
      $("createButton").disabled = true;
      state.assessments = [];
      render("Choose a class and subject to see assessments.");
      return;
    }
    const { data } = await api(`/subjects?classId=${encodeURIComponent(classId)}`);
    select.replaceChildren(option("", data.subjects.length ? "Choose a subject" : "No subjects available"));
    for (const s of data.subjects) select.append(option(s.id, s.name));
    select.disabled = data.subjects.length === 0;
    state.assessments = [];
    render("Choose a subject to see assessments.");
  }

  async function loadAssessments() {
    const classId = $("classSelect").value;
    const subjectId = $("subjectSelect").value;
    $("createButton").disabled = !(classId && subjectId);
    if (!classId || !subjectId) return;

    const token = ++state.requestToken;
    const { data } = await api(`/assessments?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`);
    if (token !== state.requestToken) return;
    state.assessments = data.assessments;
    render();
  }

  // ----- question editor -----
  function questionBlock(question = {}) {
    const block = document.createElement("fieldset");
    block.className = "question-block";
    block.style.cssText = "border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin:10px 0";

    const legend = document.createElement("legend");
    legend.textContent = "Question";
    const text = document.createElement("textarea");
    text.className = "form-input";
    text.rows = 2;
    text.maxLength = 500;
    text.placeholder = "Question text";
    text.value = question.text ?? "";
    text.dataset.role = "text";

    const options = document.createElement("textarea");
    options.className = "form-input";
    options.rows = 3;
    options.placeholder = "One option per line (2 to 6)";
    options.value = (question.options ?? []).join("\n");
    options.dataset.role = "options";

    const correct = document.createElement("input");
    correct.className = "form-input";
    correct.type = "number";
    correct.min = "1";
    correct.max = "6";
    correct.placeholder = "Correct option number (1 = first line)";
    correct.value = question.correctIndex !== undefined && question.correctIndex !== null ? String(question.correctIndex + 1) : "";
    correct.dataset.role = "correct";

    const marks = document.createElement("input");
    marks.className = "form-input";
    marks.type = "number";
    marks.min = "1";
    marks.max = "10";
    marks.placeholder = "Marks";
    marks.value = question.marks ?? 1;
    marks.dataset.role = "marks";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Remove question";
    remove.addEventListener("click", () => block.remove());

    block.append(legend, text, options, correct, marks, remove);
    return block;
  }

  function readQuestions() {
    return [...document.querySelectorAll(".question-block")].map((block) => {
      const get = (role) => block.querySelector(`[data-role="${role}"]`);
      const lines = get("options").value.split("\n").map((l) => l.trim()).filter(Boolean);
      return {
        text: get("text").value.trim(),
        options: lines,
        correctIndex: Number(get("correct").value) - 1,
        marks: Number(get("marks").value)
      };
    });
  }

  function setEditorLocked(locked) {
    for (const el of document.querySelectorAll("#questionEditor input, #questionEditor textarea, #questionEditor button, #addQuestion")) {
      el.disabled = locked;
    }
    for (const id of ["formOpens", "formCloses", "formDuration", "formType"]) $(id).disabled = locked;
  }

  function openForm(existing) {
    state.editingId = existing ? existing.id : null;
    const published = existing && existing.publicationState === "published";
    $("formEyebrow").textContent = existing ? "EDIT ASSESSMENT" : "NEW ASSESSMENT";
    $("formHeading").textContent = existing ? "Edit assessment" : "Create assessment";
    $("saveForm").textContent = existing ? "Save changes" : "Save draft";
    $("formScope").textContent = `${$("classSelect").selectedOptions[0]?.textContent ?? ""} · ${$("subjectSelect").selectedOptions[0]?.textContent ?? ""}`;
    setShown("lockNote", published);

    $("formTitle").value = existing?.title ?? "";
    $("formType").value = existing?.assessmentType ?? "quiz";
    $("formInstructions").value = existing?.instructions ?? "";
    $("formOpens").value = toKarachiInput(existing?.opensAt);
    $("formCloses").value = toKarachiInput(existing?.closesAt);
    $("formDuration").value = existing?.durationMinutes ?? "";

    const editor = $("questionEditor");
    editor.replaceChildren();
    if (existing?.questions?.length) {
      for (const q of existing.questions) editor.append(questionBlock(q));
    } else {
      editor.append(questionBlock());
    }
    setEditorLocked(published);
    $("saveForm").disabled = false;
    notify("formFeedback", "");
    $("formDialog").showModal();
  }

  async function submitForm(event) {
    event.preventDefault();
    const durationText = $("formDuration").value.trim();
    const payload = {
      title: $("formTitle").value.trim(),
      assessmentType: $("formType").value,
      instructions: $("formInstructions").value.trim(),
      opensAt: fromKarachiInput($("formOpens").value),
      closesAt: fromKarachiInput($("formCloses").value),
      durationMinutes: durationText ? Number(durationText) : null
    };

    const locked = $("formOpens").disabled;
    if (!locked) payload.questions = readQuestions();

    $("saveForm").disabled = true;
    try {
      if (state.editingId) {
        await api(`/assessments/${encodeURIComponent(state.editingId)}`, { method: "PATCH", body: payload });
      } else {
        await api("/assessments", {
          method: "POST",
          body: { ...payload, classId: $("classSelect").value, subjectId: $("subjectSelect").value }
        });
      }
      $("formDialog").close();
      notify("pageNotice", "Assessment saved.");
      await loadAssessments();
    } catch (error) {
      notify("formFeedback", error.message);
    } finally {
      $("saveForm").disabled = false;
    }
  }

  function setShown(id, shown) {
    const el = $(id);
    el.hidden = !shown;
    el.style.display = shown ? "" : "none";
  }

  // ----- detail and transitions -----
  async function openDetail(id) {
    notify("detailFeedback", "");
    const { data } = await api(`/assessments/${encodeURIComponent(id)}`);
    const a = data.assessment;
    state.current = a;

    $("detailTitle").textContent = a.title;
    const content = $("detailContent");
    content.replaceChildren();
    const rows = [
      ["Type", TYPE_LABELS[a.assessmentType] ?? a.assessmentType],
      ["Status", statusLabel(a)],
      ["Opens", formatWhen(a.opensAt)],
      ["Closes", formatWhen(a.closesAt)],
      ["Time limit", a.durationMinutes ? `${a.durationMinutes} minutes` : "None"],
      ["Marks", `${a.totalMarks} across ${a.questionCount} questions`]
    ];
    for (const [label, value] of rows) {
      const wrap = document.createElement("div");
      wrap.className = "detail-field";
      const dt = document.createElement("span");
      dt.textContent = label;
      const dd = document.createElement("p");
      dd.textContent = value;
      wrap.append(dt, dd);
      content.append(wrap);
    }

    if (a.questions) {
      for (const [index, q] of a.questions.entries()) {
        const item = document.createElement("div");
        item.className = "detail-field";
        const label = document.createElement("span");
        label.textContent = `Question ${index + 1} · ${q.marks} mark(s)`;
        const text = document.createElement("p");
        text.textContent = q.text;
        const answer = document.createElement("p");
        answer.className = "muted";
        answer.textContent = `Answer: ${q.options[q.correctIndex]}`;
        item.append(label, text, answer);
        content.append(item);
      }
    }

    setShown("editButton", a.publicationState !== "closed");
    setShown("publishButton", a.publicationState === "draft");
    setShown("closeAssessmentButton", a.publicationState === "published");
    setShown("resultsButton", a.publicationState !== "draft");
    $("detailDialog").showModal();
  }

  async function transition(action) {
    const a = state.current;
    if (!a) return;
    const message = action === "publish"
      ? "Publish this assessment? Students in the class can start it once it opens. Questions and dates will be locked."
      : "Close this assessment? Students can no longer start or submit it.";
    if (!window.confirm(message)) return;
    try {
      await api(`/assessments/${encodeURIComponent(a.id)}/${action}`, { method: "POST" });
      $("detailDialog").close();
      notify("pageNotice", action === "publish" ? "Assessment published." : "Assessment closed.");
      await loadAssessments();
    } catch (error) {
      notify("detailFeedback", error.message);
    }
  }

  // ----- results -----
  let resultsFor = null;

  async function openResults() {
    const a = state.current;
    if (!a) return;
    resultsFor = a.id;
    notify("resultsFeedback", "");
    $("resultsTitle").textContent = `Results · ${a.title}`;
    await renderResults();
    $("resultsDialog").showModal();
  }

  async function renderResults() {
    const { data } = await api(`/assessments/${encodeURIComponent(resultsFor)}/results`);
    const body = $("resultsBody");
    body.replaceChildren();
    if (data.students.length === 0) {
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "No active students in this class.";
      const tr = document.createElement("tr");
      tr.append(td);
      body.append(tr);
      return;
    }

    for (const s of data.students) {
      const tr = document.createElement("tr");
      tr.append(cell(s.name), cell(STATE_LABELS[s.state] ?? s.state),
        cell(s.score === null ? "—" : `${s.score} / ${s.maxScore}`),
        cell(`${s.attemptsUsed} of ${s.attemptsAllowed}`));

      const action = document.createElement("td");
      if (s.state === "pending_review" || s.state === "approved") {
        const box = document.createElement("input");
        box.type = "checkbox";
        box.dataset.uid = s.studentUid;
        box.dataset.state = s.state;
        box.setAttribute("aria-label", `Select ${s.name}`);
        action.append(box);
      }
      if (s.state !== "none" && s.state !== "in_progress") {
        const review = document.createElement("button");
        review.type = "button";
        review.className = "table-action";
        review.dataset.review = s.studentUid;
        review.textContent = "Review answers";
        action.append(review);
      }
      if (s.state === "not_submitted") {
        const reopen = document.createElement("button");
        reopen.type = "button";
        reopen.className = "table-action";
        reopen.dataset.reopen = s.studentUid;
        reopen.textContent = "Reopen after technical problem";
        action.append(reopen);
      }
      if (s.attemptsUsed > 0 && s.attemptsUsed >= s.attemptsAllowed && s.state !== "released") {
        const retake = document.createElement("button");
        retake.type = "button";
        retake.className = "table-action";
        retake.dataset.retake = s.studentUid;
        retake.textContent = "Allow retake";
        action.append(retake);
      }
      tr.append(action);
      body.append(tr);
    }
  }

  async function actOnResults(action) {
    const boxes = [...document.querySelectorAll("#resultsBody input[type=checkbox]:checked")];
    const wanted = action === "approve" ? "pending_review" : "approved";
    const uids = boxes.filter((b) => b.dataset.state === wanted).map((b) => b.dataset.uid);
    if (uids.length === 0) {
      notify("resultsFeedback", action === "approve" ? "Select submitted results to approve." : "Select approved results to release.");
      return;
    }
    try {
      await api(`/assessments/${encodeURIComponent(resultsFor)}/results/${action}`, {
        method: "POST", body: { studentUids: uids }
      });
      notify("resultsFeedback", action === "approve" ? "Approved." : "Released to students.");
      await renderResults();
    } catch (error) {
      notify("resultsFeedback", error.message);
    }
  }

  /** Shows one student's latest submitted answers next to the key. Staff only. */
  async function reviewAnswers(uid) {
    const { data } = await api(`/assessments/${encodeURIComponent(resultsFor)}/attempts?studentUid=${encodeURIComponent(uid)}`);
    const box = $("attemptReview");
    box.replaceChildren();

    const heading = document.createElement("p");
    heading.textContent = `Attempt ${data.attemptNumber}: ${data.score} of ${data.maxScore} marks`;
    box.append(heading);

    for (const [index, item] of data.answers.entries()) {
      const wrap = document.createElement("div");
      wrap.className = "detail-field";
      const label = document.createElement("span");
      label.textContent = `Question ${index + 1} · ${item.correct ? "Correct" : "Incorrect"} · ${item.marks} mark(s)`;
      const text = document.createElement("p");
      text.textContent = item.text;
      const chosen = document.createElement("p");
      chosen.className = "muted";
      chosen.textContent = `Student chose: ${item.chosenIndex === null ? "no answer" : item.options[item.chosenIndex]}`;
      const key = document.createElement("p");
      key.className = "muted";
      key.textContent = `Correct answer: ${item.options[item.correctIndex]}`;
      wrap.append(label, text, chosen, key);
      box.append(wrap);
    }
  }

  /** Reopens an expired attempt after a documented technical problem. History is kept. */
  async function reopen(uid) {
    const reason = $("reopenReason").value.trim();
    if (reason.length < 3) {
      notify("resultsFeedback", "Enter the technical problem in the reason box first (at least 3 characters).");
      return;
    }
    try {
      await api(`/assessments/${encodeURIComponent(resultsFor)}/reopen`, {
        method: "POST", body: { studentUid: uid, reason }
      });
      $("reopenReason").value = "";
      notify("resultsFeedback", "Attempt reopened. The student can resume it until the deadline.");
      await renderResults();
    } catch (error) {
      notify("resultsFeedback", error.message);
    }
  }

  async function allowRetake(uid) {
    try {
      await api(`/assessments/${encodeURIComponent(resultsFor)}/retakes`, { method: "POST", body: { studentUid: uid } });
      notify("resultsFeedback", "One retake allowed. The student can start the assessment again.");
      await renderResults();
    } catch (error) {
      notify("resultsFeedback", error.message);
    }
  }

  async function init() {
    let me;
    try {
      me = await window.StemSession.ready;
    } catch {
      return;
    }
    state.role = me.role;

    $("classSelect").addEventListener("change", () => loadSubjects().catch((e) => notify("pageNotice", e.message)));
    $("subjectSelect").addEventListener("change", () => loadAssessments().catch((e) => notify("pageNotice", e.message)));
    $("statusFilter").addEventListener("change", () => render());
    $("createButton").addEventListener("click", () => openForm(null));
    $("assessmentBody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-id]");
      if (!button) return;
      openDetail(button.dataset.id).catch((e) => notify("pageNotice", e.message));
    });
    $("editButton").addEventListener("click", () => {
      $("detailDialog").close();
      openForm(state.current);
    });
    $("publishButton").addEventListener("click", () => transition("publish"));
    $("closeAssessmentButton").addEventListener("click", () => transition("close"));
    $("resultsButton").addEventListener("click", () => openResults().catch((e) => notify("detailFeedback", e.message)));
    $("doneDetail").addEventListener("click", () => $("detailDialog").close());
    $("closeDetail").addEventListener("click", () => $("detailDialog").close());

    $("addQuestion").addEventListener("click", () => $("questionEditor").append(questionBlock()));
    $("assessmentForm").addEventListener("submit", submitForm);
    $("cancelForm").addEventListener("click", () => $("formDialog").close());
    $("closeForm").addEventListener("click", () => $("formDialog").close());

    $("approveSelected").addEventListener("click", () => actOnResults("approve"));
    $("releaseSelected").addEventListener("click", () => actOnResults("release"));
    $("resultsBody").addEventListener("click", (event) => {
      const retake = event.target.closest("button[data-retake]");
      if (retake) return allowRetake(retake.dataset.retake);
      const review = event.target.closest("button[data-review]");
      if (review) return reviewAnswers(review.dataset.review).catch((e) => notify("resultsFeedback", e.message));
      const reopenButton = event.target.closest("button[data-reopen]");
      if (reopenButton) return reopen(reopenButton.dataset.reopen);
    });
    $("doneResults").addEventListener("click", () => $("resultsDialog").close());
    $("closeResults").addEventListener("click", () => $("resultsDialog").close());

    try {
      await loadClasses();
      render("Choose a class and subject to see assessments.");
    } catch (error) {
      notify("pageNotice", error.message);
    }
  }

  init();
})();
