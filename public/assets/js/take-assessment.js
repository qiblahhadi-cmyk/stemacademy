/*
 * Student view of one assessment. The server decides everything that matters:
 * window, deadline, attempt count, scoring and whether marks are released. The
 * page only shows what the server returns, and never receives answer keys.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KARACHI = "Asia/Karachi";
  const state = { id: null, attemptId: null, deadline: null, timer: null };

  const api = (path, options) => window.StemSession.apiFetch(path, options);
  const notify = (text) => { $("attemptFeedback").textContent = text || ""; };
  const when = (iso) => (iso ? new Intl.DateTimeFormat("en-PK", { timeZone: KARACHI, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "No closing time");

  const STATUS_TEXT = {
    not_started: "You have not started this assessment yet.",
    in_progress: "You have an attempt in progress.",
    not_submitted: "Your attempt ended without being submitted.",
    submitted: "Your answers have been submitted. Marks will appear here after your teacher releases them.",
    released: "Your marks have been released."
  };

  function show(el, visible) {
    el.hidden = !visible;
    el.style.display = visible ? "" : "none";
  }

  function renderQuestions(questions) {
    const list = $("questionList");
    list.replaceChildren();
    for (const [index, q] of questions.entries()) {
      const fieldset = document.createElement("fieldset");
      fieldset.style.cssText = "border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:10px 0";
      const legend = document.createElement("legend");
      legend.textContent = `Question ${index + 1} · ${q.marks} mark(s)`;
      const text = document.createElement("p");
      text.textContent = q.text;
      fieldset.append(legend, text);
      q.options.forEach((option, optionIndex) => {
        const label = document.createElement("label");
        label.style.display = "block";
        label.style.margin = "6px 0";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = q.id;
        radio.value = String(optionIndex);
        const span = document.createElement("span");
        span.textContent = ` ${option}`;
        label.append(radio, span);
        fieldset.append(label);
      });
      list.append(fieldset);
    }
  }

  function collectAnswers() {
    const answers = {};
    for (const radio of document.querySelectorAll("#questionList input[type=radio]:checked")) {
      answers[radio.name] = Number(radio.value);
    }
    return answers;
  }

  function tick() {
    if (!state.deadline) return;
    const remaining = Date.parse(state.deadline) - Date.now();
    if (remaining <= 0) {
      $("timer").textContent = "Time is up. Submit now; late submissions are not accepted.";
      clearInterval(state.timer);
      return;
    }
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    $("timer").textContent = `Time remaining: ${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  async function load() {
    const { data } = await api(`/assessments/${encodeURIComponent(state.id)}`);
    const a = data.assessment;
    $("assessmentTitle").textContent = a.title;
    $("assessmentMeta").textContent = `Closes ${when(a.closesAt)}${a.durationMinutes ? ` · Time limit ${a.durationMinutes} minutes` : ""} · ${a.totalMarks} marks`;
    $("assessmentInstructions").textContent = a.instructions || "";

    if (!a.attempt) {
      // Staff see the assessment through the Assessments page, not as a student attempt.
      $("attemptSummary").textContent = "Students take assessments from their own account. Staff manage assessments on the Assessments page.";
      return;
    }

    const attempt = a.attempt;
    $("attemptSummary").textContent = STATUS_TEXT[attempt.status] ?? "";
    if (attempt.status === "released") {
      $("attemptSummary").textContent = `${STATUS_TEXT.released} Score: ${attempt.score} out of ${attempt.maxScore}.`;
    }

    if (attempt.window === "upcoming") {
      $("attemptSummary").textContent = `This assessment opens ${when(a.opensAt)}.`;
    } else if (attempt.window === "closed" && attempt.status !== "released") {
      $("attemptSummary").textContent = "This assessment has closed.";
    }
    const canStart = attempt.window === "open" && (
      attempt.status === "not_started"
      || (attempt.status === "not_submitted" && attempt.attemptsRemaining > 0)
      || attempt.status === "in_progress");
    show($("startButton"), canStart && attempt.status !== "released");
    $("startButton").textContent = attempt.status === "in_progress" ? "Resume assessment" : "Start assessment";
  }

  async function start() {
    $("startButton").disabled = true;
    try {
      const { data } = await api(`/assessments/${encodeURIComponent(state.id)}/start`, { method: "POST" });
      state.attemptId = data.attemptId;
      state.deadline = data.deadline;
      renderQuestions(data.questions);
      show($("startButton"), false);
      show($("attemptForm"), true);
      show($("timer"), true);
      tick();
      clearInterval(state.timer);
      state.timer = setInterval(tick, 1000);
      notify("");
    } catch (error) {
      $("startButton").disabled = false;
      $("attemptSummary").textContent = error.message;
    }
  }

  async function submit(event) {
    event.preventDefault();
    $("submitButton").disabled = true;
    try {
      await api(`/assessments/${encodeURIComponent(state.id)}/submit`, {
        method: "POST",
        body: { attemptId: state.attemptId, answers: collectAnswers() }
      });
      clearInterval(state.timer);
      show($("attemptForm"), false);
      show($("timer"), false);
      $("attemptSummary").textContent = STATUS_TEXT.submitted;
    } catch (error) {
      notify(error.message);
      $("submitButton").disabled = false;
    }
  }

  async function init() {
    try {
      await window.StemSession.ready;
    } catch {
      return;
    }

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      $("assessmentTitle").textContent = "No assessment selected";
      return;
    }
    state.id = id;

    try {
      await load();
    } catch (error) {
      $("assessmentTitle").textContent = "Assessment unavailable";
      $("assessmentMeta").textContent = error.message;
      return;
    }

    $("startButton").addEventListener("click", start);
    $("attemptForm").addEventListener("submit", submit);
  }

  init();
})();
