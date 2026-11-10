/*
 * Assignments page. Uses the session bundle (window.StemSession) for every API
 * call. Server data is written with textContent only, never innerHTML. Buttons
 * shown to staff are a convenience: the server enforces scope and state rules.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const KARACHI = "Asia/Karachi";
  const state = {
    role: null,
    view: "current",
    assignments: [],
    current: null,
    editingId: null,
    requestToken: 0
  };

  const isStaff = () => state.role === "admin" || state.role === "teacher";
  const api = (path, options) => window.StemSession.apiFetch(path, options);

  function setShown(el, shown) {
    el.hidden = !shown;
    el.style.display = shown ? "" : "none";
  }

  function notify(id, text) {
    $(id).textContent = text || "";
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function formatDue(iso) {
    if (!iso) return "No due date";
    return new Intl.DateTimeFormat("en-PK", { timeZone: KARACHI, dateStyle: "medium", timeStyle: "short" })
      .format(new Date(iso));
  }

  // Convert a stored instant into the Pakistan-time value a datetime-local input expects.
  function toKarachiInput(iso) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KARACHI, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(iso));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
  }

  // Pakistan is UTC+5 with no daylight saving, so the offset is fixed.
  function fromKarachiInput(value) {
    return value ? `${value}:00+05:00` : null;
  }

  function statusLabel(a) {
    if (state.role === "student") return a.publicationState === "closed" ? "Completed" : "Current";
    return { draft: "Draft", published: "Published", closed: "Closed" }[a.publicationState] ?? a.publicationState;
  }

  function selectedText(id) {
    return $(id).selectedOptions[0]?.textContent ?? "";
  }

  function visibleRows() {
    const query = $("searchInput").value.trim().toLowerCase();
    let rows = state.assignments;

    if (state.role === "student") {
      rows = rows.filter((a) => (state.view === "past"
        ? a.publicationState === "closed"
        : a.publicationState === "published"));
    } else if ($("statusFilter").value !== "all") {
      rows = rows.filter((a) => a.publicationState === $("statusFilter").value);
    }

    if (query) rows = rows.filter((a) => a.title.toLowerCase().includes(query));
    return rows;
  }

  function render(emptyMessage) {
    const body = $("assignmentBody");
    const rows = visibleRows();
    body.replaceChildren();

    if (rows.length === 0) {
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = emptyMessage || (state.role === "student"
        ? (state.view === "past" ? "No completed assignments yet." : "No current assignments.")
        : "No assignments match these filters.");
      const tr = document.createElement("tr");
      tr.append(cell);
      body.append(tr);
    } else {
      for (const a of rows) {
        const tr = document.createElement("tr");
        const title = document.createElement("td");
        title.textContent = a.title;
        const type = document.createElement("td");
        type.textContent = a.type === "physical" ? "Physical" : "Online";
        const due = document.createElement("td");
        due.textContent = formatDue(a.dueAt);
        const status = document.createElement("td");
        status.textContent = statusLabel(a);
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-action";
        button.dataset.id = a.id;
        button.textContent = "View";
        action.append(button);
        tr.append(title, type, due, status, action);
        body.append(tr);
      }
    }

    $("resultCount").textContent = `${rows.length} assignment(s)`;
  }

  function clearList(message) {
    state.assignments = [];
    render(message);
  }

  async function loadClasses() {
    const { data } = await api("/classes");
    const select = $("classSelect");
    select.replaceChildren(option("", data.classes.length ? "Choose a class" : "No classes available"));
    for (const c of data.classes) {
      select.append(option(c.id, `${c.name} (Grade ${c.grade})`));
    }
  }

  async function loadSubjects() {
    const classId = $("classSelect").value;
    const select = $("subjectSelect");
    state.requestToken += 1;

    if (!classId) {
      select.replaceChildren(option("", "Choose a class first"));
      select.disabled = true;
      clearList("Choose a class and subject to see assignments.");
      return;
    }

    const { data } = await api(`/subjects?classId=${encodeURIComponent(classId)}`);
    select.replaceChildren(option("", data.subjects.length ? "Choose a subject" : "No subjects available"));
    for (const s of data.subjects) select.append(option(s.id, s.name));
    select.disabled = data.subjects.length === 0;
    clearList(data.subjects.length
      ? "Choose a subject to see assignments."
      : "No subjects are available for this class.");
  }

  async function loadAssignments() {
    const classId = $("classSelect").value;
    const subjectId = $("subjectSelect").value;
    if (!classId || !subjectId) {
      clearList("Choose a class and subject to see assignments.");
      return;
    }

    // Ignore responses for an earlier selection that finished late.
    const token = ++state.requestToken;
    const { data } = await api(`/assignments?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}`);
    if (token !== state.requestToken) return;

    state.assignments = data.assignments;
    render();
  }

  function detailRow(label, value) {
    const wrap = document.createElement("div");
    wrap.className = "detail-field";
    const dt = document.createElement("span");
    dt.textContent = label;
    const dd = document.createElement("p");
    dd.textContent = value;
    wrap.append(dt, dd);
    return wrap;
  }

  async function openDetail(id) {
    notify("detailFeedback", "");
    const { data } = await api(`/assignments/${encodeURIComponent(id)}`);
    const a = data.assignment;
    state.current = a;

    $("detailTitle").textContent = a.title;
    const content = $("detailContent");
    const instructions = detailRow("Instructions", a.instructions || "No instructions provided.");
    instructions.querySelector("p").style.whiteSpace = "pre-wrap";
    content.replaceChildren(
      detailRow("Type", a.type === "physical" ? "Physical (done in class)" : "Online (typed answer)"),
      detailRow("Due", formatDue(a.dueAt)),
      detailRow(isStaff() ? "Status" : "Availability", statusLabel(a)),
      instructions
    );
    await appendSubmissionWorkspace(content, a);

    const staff = isStaff();
    setShown($("editButton"), staff && a.publicationState !== "closed");
    setShown($("publishButton"), staff && a.publicationState === "draft");
    setShown($("closeAssignmentButton"), staff && a.publicationState === "published");
    $("detailDialog").showModal();
  }


  function labeledControl(labelText, control) {
    const wrap = document.createElement("label");
    wrap.className = "field-label";
    wrap.append(document.createTextNode(labelText), control);
    return wrap;
  }

  async function appendSubmissionWorkspace(container, assignment) {
    const section = document.createElement("section");
    section.className = "submission-workspace";
    const heading = document.createElement("h3");
    heading.textContent = isStaff() ? "Student submissions" : "Your submission";
    section.append(heading);
    const { data } = await api(`/assignment-submissions?assignmentId=${encodeURIComponent(assignment.id)}`);
    const submissions = data.submissions || [];

    if (!isStaff()) {
      const current = submissions[0] || null;
      if (current) {
        const status = detailRow("Submission status", `${current.status} · revision ${current.revision}`);
        const answer = detailRow("Your submitted answer", current.text);
        answer.querySelector("p").style.whiteSpace = "pre-wrap";
        section.append(status, answer);
        if (current.grade !== null) section.append(detailRow("Grade", `${current.grade}/100`));
        if (current.feedback) section.append(detailRow("Teacher feedback", current.feedback));
      }
      if (assignment.publicationState === "published" && current?.status !== "graded") {
        const textarea = document.createElement("textarea");
        textarea.className = "form-input assignment-textarea";
        textarea.rows = 6;
        textarea.maxLength = 20000;
        textarea.required = true;
        textarea.value = current?.text ?? "";
        textarea.placeholder = "Write your answer here (maximum 20,000 characters)…";
        const submit = document.createElement("button");
        submit.type = "button";
        submit.className = "primary-button";
        submit.textContent = current ? "Resubmit answer" : "Submit answer";
        const feedback = document.createElement("p");
        feedback.className = "form-feedback";
        feedback.setAttribute("role", "status");
        submit.addEventListener("click", async () => {
          submit.disabled = true;
          try {
            await api("/assignment-submissions", { method: "POST", body: { assignmentId: assignment.id, text: textarea.value } });
            notify("detailFeedback", "Your answer was submitted.");
            $("detailDialog").close();
            await openDetail(assignment.id);
          } catch (error) { feedback.textContent = error.message; }
          finally { submit.disabled = false; }
        });
        section.append(labeledControl("Your answer (text only)", textarea), submit, feedback);
      } else if (!current) {
        section.append(detailRow("Submission", "This assignment is closed. No new submission is available."));
      }
    } else if (!submissions.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No student submissions yet.";
      section.append(empty);
    } else {
      for (const submission of submissions) {
        const card = document.createElement("article");
        card.className = "submission-card";
        const answerRow = detailRow("Answer", submission.text);
        answerRow.querySelector("p").style.whiteSpace = "pre-wrap";
        card.append(detailRow("Student account", submission.studentUid), detailRow("Status", `${submission.status} · revision ${submission.revision}`), answerRow);
        const feedback = document.createElement("textarea");
        feedback.className = "form-input";
        feedback.rows = 3;
        feedback.maxLength = 5000;
        feedback.value = submission.feedback || "";
        const grade = document.createElement("input");
        grade.className = "form-input";
        grade.type = "number";
        grade.min = "0"; grade.max = "100"; grade.step = "0.5";
        grade.value = submission.grade ?? "";
        const save = document.createElement("button");
        save.type = "button"; save.className = "secondary-button"; save.textContent = "Save review";
        const result = document.createElement("p"); result.className = "form-feedback"; result.setAttribute("role", "status");
        save.addEventListener("click", async () => {
          save.disabled = true;
          try {
            const payload = { feedback: feedback.value };
            if (grade.value !== "") payload.grade = Number(grade.value);
            await api(`/assignment-submissions/${encodeURIComponent(submission.id)}/review`, { method: "PATCH", body: payload });
            result.textContent = "Review saved.";
          } catch (error) { result.textContent = error.message; }
          finally { save.disabled = false; }
        });
        card.append(labeledControl("Feedback", feedback), labeledControl("Grade (0–100, optional)", grade), save, result);
        section.append(card);
      }
    }
    container.append(section);
  }

  function openForm(existing) {
    if (!$("subjectSelect").value) {
      notify("pageNotice", "Choose a class and subject before creating an assignment.");
      return;
    }

    state.editingId = existing ? existing.id : null;
    $("formEyebrow").textContent = existing ? "EDIT ASSIGNMENT" : "NEW ASSIGNMENT";
    $("formHeading").textContent = existing ? "Edit assignment" : "Create assignment";
    $("saveButton").textContent = existing ? "Save changes" : "Save as draft";
    const scope = `${selectedText("classSelect")} · ${selectedText("subjectSelect")}`;
    $("formScope").textContent = existing
      ? `${scope} (class and subject cannot be changed)`
      : scope;

    $("assignmentTitle").value = existing?.title ?? "";
    $("assignmentType").value = existing?.type ?? "online";
    $("assignmentDue").value = existing?.dueAt ? toKarachiInput(existing.dueAt) : "";
    $("assignmentInstructions").value = existing?.instructions ?? "";
    notify("formFeedback", "");
    $("assignmentDialog").showModal();
  }

  async function submitForm(event) {
    event.preventDefault();
    const title = $("assignmentTitle").value.trim();
    if (title.length < 2 || title.length > 160) {
      notify("formFeedback", "Title must contain 2 to 160 characters.");
      return;
    }

    const payload = {
      title,
      type: $("assignmentType").value,
      instructions: $("assignmentInstructions").value.trim(),
      dueAt: fromKarachiInput($("assignmentDue").value)
    };

    const saveButton = $("saveButton");
    saveButton.disabled = true;
    try {
      if (state.editingId) {
        await api(`/assignments/${encodeURIComponent(state.editingId)}`, { method: "PATCH", body: payload });
      } else {
        await api("/assignments", {
          method: "POST",
          body: { ...payload, classId: $("classSelect").value, subjectId: $("subjectSelect").value }
        });
      }
      $("assignmentDialog").close();
      notify("pageNotice", "Assignment saved.");
      await loadAssignments();
    } catch (error) {
      notify("formFeedback", error.message);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function transition(action) {
    const a = state.current;
    if (!a) return;
    const message = action === "publish"
      ? "Publish this assignment? Students in this class will be able to see it."
      : "Close this assignment? It will become read-only for students and cannot be edited.";
    if (!window.confirm(message)) return;

    try {
      await api(`/assignments/${encodeURIComponent(a.id)}/${action}`, { method: "POST" });
      $("detailDialog").close();
      notify("pageNotice", action === "publish" ? "Assignment published." : "Assignment closed.");
      await loadAssignments();
    } catch (error) {
      notify("detailFeedback", error.message);
    }
  }

  function bindEvents() {
    $("classSelect").addEventListener("change", () => {
      loadSubjects().catch((error) => notify("pageNotice", error.message));
    });
    $("subjectSelect").addEventListener("change", () => {
      loadAssignments().catch((error) => notify("pageNotice", error.message));
    });
    $("statusFilter").addEventListener("change", () => render());
    $("searchInput").addEventListener("input", () => render());

    for (const tab of document.querySelectorAll("[data-view]")) {
      tab.addEventListener("click", () => {
        state.view = tab.dataset.view;
        for (const other of document.querySelectorAll("[data-view]")) {
          other.setAttribute("aria-pressed", String(other === tab));
        }
        render();
      });
    }

    $("createButton").addEventListener("click", () => openForm(null));

    $("assignmentBody").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-id]");
      if (!button) return;
      openDetail(button.dataset.id).catch((error) => notify("pageNotice", error.message));
    });

    $("editButton").addEventListener("click", () => {
      $("detailDialog").close();
      openForm(state.current);
    });
    $("publishButton").addEventListener("click", () => transition("publish"));
    $("closeAssignmentButton").addEventListener("click", () => transition("close"));
    $("doneDetail").addEventListener("click", () => $("detailDialog").close());
    $("closeDetail").addEventListener("click", () => $("detailDialog").close());

    $("assignmentForm").addEventListener("submit", submitForm);
    $("cancelDialog").addEventListener("click", () => $("assignmentDialog").close());
    $("closeDialog").addEventListener("click", () => $("assignmentDialog").close());
  }

  async function init() {
    let me;
    try {
      me = await window.StemSession.ready;
    } catch {
      return; // The session guard has already redirected or shown the error.
    }

    state.role = me.role;
    setShown($("createButton"), isStaff());
    setShown($("studentTabs"), me.role === "student");
    setShown($("statusFilter"), isStaff());
    setShown($("statusFilterLabel"), isStaff());
    $("statusHeader").textContent = isStaff() ? "Status" : "Availability";
    $("pageSubtitle").textContent = isStaff()
      ? "Prepare classwork, set due dates and publish to students."
      : "Your current and completed assignments.";

    bindEvents();
    try {
      await loadClasses();
      clearList("Choose a class and subject to see assignments.");
    } catch (error) {
      notify("pageNotice", error.message);
    }
  }

  init();
})();
