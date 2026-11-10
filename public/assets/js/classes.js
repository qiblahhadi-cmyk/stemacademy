/*
 * Classes & People: classes from /api/classes and one roster per class from
 * /api/classes/{id}/roster. The server decides what each role may see; this
 * script only displays and filters what it returns.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const HEADERS = {
    classes: ["Class", "Grade", "Academic session", "Students", "Teachers"],
    students: ["Student", "Academy ID", "Class", "Grade"],
    teachers: ["Teacher", "Academy ID", "Classes"]
  };
  const state = { classes: [], rosters: new Map(), failed: [], tab: "classes" };
  const gradeLabel = (grade) => `Grade ${grade}`;
  const identity = (person) => person.academyId ?? person.displayName;

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  function visibleClasses() {
    const grade = $("gradeFilter").value;
    return state.classes.filter((item) => grade === "all" || String(item.grade) === grade);
  }

  function rows() {
    const query = $("searchInput").value.trim().toLowerCase();
    const matches = (...values) => !query || values.some((value) => String(value ?? "").toLowerCase().includes(query));
    const classes = visibleClasses();

    if (state.tab === "classes") {
      return classes.filter((item) => matches(item.name, item.academicSessionId)).map((item) => {
        const roster = state.rosters.get(item.id);
        return [item.name, gradeLabel(item.grade), item.academicSessionId || "—",
          roster ? String(roster.counts.students) : "—", roster ? String(roster.counts.teachers) : "—"];
      });
    }

    if (state.tab === "students") {
      const result = [];
      for (const item of classes) {
        for (const student of state.rosters.get(item.id)?.students ?? []) {
          if (matches(student.displayName, student.academyId, item.name)) {
            result.push([student.displayName, student.academyId ?? "—", item.name, gradeLabel(item.grade)]);
          }
        }
      }
      return result;
    }

    // Teachers: one row per teacher, listing every visible class they teach.
    const teachers = new Map();
    for (const item of classes) {
      for (const teacher of state.rosters.get(item.id)?.teachers ?? []) {
        const key = identity(teacher);
        if (!teachers.has(key)) teachers.set(key, { teacher, classes: [] });
        teachers.get(key).classes.push(item.name);
      }
    }
    return [...teachers.values()]
      .filter(({ teacher, classes: names }) => matches(teacher.displayName, teacher.academyId, ...names))
      .map(({ teacher, classes: names }) => [teacher.displayName, teacher.academyId ?? "—", names.join(", ")]);
  }

  function render() {
    const headers = HEADERS[state.tab];
    const head = $("tableHead");
    head.replaceChildren();
    const headRow = document.createElement("tr");
    for (const label of headers) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.append(th);
    }
    head.append(headRow);

    const body = $("tableBody");
    body.replaceChildren();
    const data = rows();
    if (data.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = headers.length;
      td.textContent = state.classes.length === 0
        ? "No classes are visible to your account yet."
        : "No records match these filters.";
      tr.append(td);
      body.append(tr);
    } else {
      for (const values of data) {
        const tr = document.createElement("tr");
        tr.append(...values.map(cell));
        body.append(tr);
      }
    }
    $("resultCount").textContent = `${data.length} record${data.length === 1 ? "" : "s"}`;
  }

  function distinct(values) {
    return new Set(values.filter(Boolean)).size;
  }

  function renderStats() {
    const rosters = [...state.rosters.values()];
    const students = rosters.flatMap((roster) => roster.students.map(identity));
    const teachers = rosters.flatMap((roster) => roster.teachers.map(identity));
    $("gradeCount").textContent = String(distinct(state.classes.map((item) => item.grade)));
    $("classCount").textContent = String(state.classes.length);
    $("studentCount").textContent = state.failed.length ? "—" : String(distinct(students));
    $("teacherCount").textContent = state.failed.length ? "—" : String(distinct(teachers));
  }

  function setStatus(message) {
    $("pageStatus").textContent = message;
  }

  async function init() {
    try {
      await window.StemSession.ready;
    } catch {
      return;
    }

    try {
      const { data } = await window.StemSession.apiFetch("/classes");
      state.classes = data.classes;
    } catch (error) {
      setStatus(error.message || "Your classes could not be loaded.");
      $("resultCount").textContent = "";
      return;
    }

    const results = await Promise.allSettled(state.classes.map((item) =>
      window.StemSession.apiFetch(`/classes/${encodeURIComponent(item.id)}/roster`)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") state.rosters.set(state.classes[index].id, result.value.data);
      else state.failed.push(state.classes[index].name);
    });

    const grades = [...new Set(state.classes.map((item) => item.grade))].sort((a, b) => a - b);
    const select = $("gradeFilter");
    select.replaceChildren(new Option("All grades", "all"));
    for (const grade of grades) select.append(new Option(gradeLabel(grade), String(grade)));

    renderStats();
    setStatus(state.failed.length
      ? `Could not load the roster for: ${state.failed.join(", ")}. Counts are hidden until every roster loads.`
      : "");

    $("searchInput").addEventListener("input", render);
    select.addEventListener("change", render);
    for (const tab of document.querySelectorAll("[data-tab]")) {
      tab.addEventListener("click", () => {
        state.tab = tab.dataset.tab;
        for (const other of document.querySelectorAll("[data-tab]")) {
          const selected = other === tab;
          other.classList.toggle("active", selected);
          other.setAttribute("aria-selected", String(selected));
        }
        render();
      });
    }
    render();
  }

  init();
})();
