(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const labels = {
    students: ["Students", "Student accounts and permanent academy IDs."],
    staff: ["Teachers", "Teacher accounts and permanent staff IDs."],
    classes: ["Classes", "Grade 9 and Grade 10 classroom groups."],
    subjects: ["Subjects", "AJK Board subjects by grade."],
    memberships: ["Memberships", "Enroll students and preserve membership history."],
    "teaching-assignments": ["Teaching assignments", "Assign active teachers to matching class and subject records."]
  };
  const fields = {
    students: [{ name: "displayName", label: "Student name", type: "text" }],
    staff: [{ name: "displayName", label: "Teacher name", type: "text" }],
    classes: [{ name: "name", label: "Class name", type: "text" }, { name: "grade", label: "Grade", type: "select", options: [[9,"Grade 9"],[10,"Grade 10"]] }, { name: "academicSessionId", label: "Academic session year", type: "text", value: "2026" }],
    subjects: [{ name: "name", label: "Subject name", type: "text" }, { name: "grade", label: "Grade", type: "select", options: [[9,"Grade 9"],[10,"Grade 10"]] }, { name: "board", label: "Board", type: "select", options: [["AJK","AJK"]] }],
    memberships: [{ name: "classId", label: "Class", type: "select", source: "classes" }, { name: "studentUid", label: "Student", type: "select", source: "students" }],
    "teaching-assignments": [{ name: "teacherUid", label: "Teacher", type: "select", source: "staff" }, { name: "classId", label: "Class", type: "select", source: "classes" }, { name: "subjectId", label: "Subject", type: "select", source: "subjects" }]
  };
  let current = "students";
  let records = [];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const cell = (value) => `<td>${esc(value || "—")}</td>`;
  async function drawForm() {
    $("formTitle").textContent = current === "memberships" ? "Enroll student" : current === "teaching-assignments" ? "Assign teacher" : current === "students" || current === "staff" ? `Provision ${current === "students" ? "student" : "teacher"} account (disabled)` : `Create ${current.slice(0,-1)}`;
    $("formFields").replaceChildren();
    for (const f of fields[current]) {
      const label = document.createElement("label");
      const title = document.createElement("span"); title.textContent = f.label; label.append(title);
      let control;
      if (f.type === "select") {
        control = document.createElement("select");
        let options = f.options || [];
        if (f.source) {
          const result = await window.StemSession.apiFetch(`/admin/${f.source}?active=true`);
          const rows = result.data.records || [];
          options = rows.map((r) => {
            const value = f.source === "classes" || f.source === "subjects" ? r.id : r.id;
            const text = f.source === "classes" ? `${r.name} · Grade ${r.grade} · ${r.academicSessionId || "Session"}`
              : f.source === "subjects" ? `${r.name} · Grade ${r.grade}`
              : `${r.displayName} · ${r.academyId || r.id}`;
            return [value, text];
          });
        }
        control.add(new Option("Select…", ""));
        for (const [v, t] of options) control.add(new Option(t, String(v)));
      } else {
        control = document.createElement("input"); control.type = f.type; control.maxLength = 100; control.value = f.value || "";
      }
      control.name = f.name; control.required = true; label.append(control); $("formFields").append(label);
    }
  }
  function render() {
    const q = $("adminSearch").value.trim().toLowerCase();
    const visible = records.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
    const columns = current === "memberships" ? ["classId","userUid","active"] : current === "teaching-assignments" ? ["id","teacherUid","classId","subjectId","active"] : current === "classes" ? ["id","name","grade","academicSessionId","active"] : current === "subjects" ? ["id","name","grade","board","active"] : ["id","academyId","displayName","active","provisioningStatus"];
    const columnLabels = { id: current === "classes" ? "Class ID" : current === "subjects" ? "Subject ID" : current === "teaching-assignments" ? "Assignment ID" : "Firebase UID", userUid: "Student UID", teacherUid: "Teacher UID" };
    $("adminHead").innerHTML = `<tr>${columns.map((c) => `<th>${esc(columnLabels[c] || c)}</th>`).join("")}<th>Actions</th></tr>`;
    $("adminRows").replaceChildren();
    if (!visible.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = columns.length + 1; td.className = "empty-row"; td.textContent = "No records match this view."; tr.append(td); $("adminRows").append(tr); }
    for (const r of visible) {
      const tr = document.createElement("tr");
      for (const c of columns) tr.insertAdjacentHTML("beforeend", cell(r[c]));
      const td = document.createElement("td"); const actions = document.createElement("div"); actions.className = "admin-row-actions";
      const identifier = r.id;
      if (current === "students") { const details = document.createElement("button"); details.type = "button"; details.dataset.details = identifier; details.textContent = "Details"; actions.append(details); }
      if (r.active === true) {
        if (["students", "staff", "classes", "subjects"].includes(current)) { const edit = document.createElement("button"); edit.type = "button"; edit.dataset.edit = identifier; edit.textContent = "Edit"; actions.append(edit); }
        const button = document.createElement("button"); button.type = "button"; button.dataset.deactivate = identifier; button.textContent = "Deactivate"; actions.append(button);
      }
      else if (r.provisioningStatus !== "pending_activation") { const button = document.createElement("button"); button.type = "button"; button.dataset.activate = identifier; button.textContent = "Reactivate"; actions.append(button); }
      td.append(actions); tr.append(td); $("adminRows").append(tr);
    }
    $("adminStatus").textContent = `${visible.length} record(s) shown. Permanent IDs are read-only.`;
  }
  async function load() {
    const [title, description] = labels[current]; $("adminTitle").textContent = title; $("adminDescription").textContent = description;
    drawForm(); $("adminStatus").textContent = "Loading records…";
    try {
      const path = current === "memberships" ? "/memberships" : `/admin/${current}`;
      const result = await window.StemSession.apiFetch(path);
      records = current === "memberships" ? result.data.memberships : result.data.records;
      render();
    } catch (error) { records = []; render(); $("adminStatus").textContent = error.message; }
  }
  async function init() {
    try { const me = await window.StemSession.ready; if (me.role !== "admin") return; await load(); }
    catch { return; }
    document.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => {
      current = button.dataset.adminTab; document.querySelectorAll("[data-admin-tab]").forEach((b) => b.classList.toggle("active", b === button)); $("adminSearch").value = ""; load();
    }));
    $("reloadRecords").addEventListener("click", load);
    $("adminSearch").addEventListener("input", render);
    $("closeStudentDetail").addEventListener("click", () => $("studentDetailDialog").close());
    $("adminRows").addEventListener("click", async (event) => {
      const target = event.target;
      if (target.dataset.details) {
        try {
          const { data } = await window.StemSession.apiFetch(`/admin/students/${encodeURIComponent(target.dataset.details)}`);
          $("studentDetailTitle").textContent = `${data.student.displayName} · ${data.student.academyId}`;
          const panel = $("studentDetailBody"); panel.replaceChildren();
          const sections = [
            ["Enrollment", data.memberships.map((m) => `${m.classId} — ${m.active ? "Active" : "Inactive"}`)],
            ["Current subject access", data.subjectAccess.map((s) => `${s.classId}: ${s.name} (Grade ${s.grade})`)],
            ["Membership history", data.membershipHistory.map((h) => `${h.action} · ${h.classId} · ${h.actorUid}`)]
          ];
          for (const [heading, values] of sections) {
            const title = document.createElement("h3"); title.textContent = heading; panel.append(title);
            const list = document.createElement("ul");
            if (!values.length) { const item = document.createElement("li"); item.textContent = "No records."; list.append(item); }
            for (const value of values) { const item = document.createElement("li"); item.textContent = value; list.append(item); }
            panel.append(list);
          }
          $("studentDetailDialog").showModal();
        } catch (error) { $("adminStatus").textContent = error.message; }
        return;
      }
      const id = target.dataset.deactivate || target.dataset.activate || target.dataset.edit;
      if (!id) return;
      const item = records.find((r) => r.id === id);
      try {
        if (target.dataset.deactivate) {
          if (!window.confirm("Deactivate this record? Historical records will be retained.")) return;
          if (current === "memberships") await window.StemSession.apiFetch(`/memberships/${encodeURIComponent(item.classId)}/${encodeURIComponent(item.userUid)}/deactivate`, { method: "POST" });
          else await window.StemSession.apiFetch(`/admin/${current}/${encodeURIComponent(id)}/deactivate`, { method: "POST" });
        } else if (target.dataset.activate) {
          if (current === "memberships") await window.StemSession.apiFetch("/memberships", { method: "POST", body: { classId: item.classId, studentUid: item.userUid } });
          else await window.StemSession.apiFetch(`/admin/${current}/${encodeURIComponent(id)}`, { method: "PATCH", body: { active: true } });
        } else if (target.dataset.edit) {
          const editable = current === "students" || current === "staff" ? ["displayName"]
            : current === "classes" ? ["name", "academicSessionId"]
            : current === "subjects" ? ["name", "board"] : [];
          const patch = {};
          for (const field of editable) {
            const updated = window.prompt(`Update ${field}`, item[field] ?? "");
            if (updated === null) return;
            if (updated.trim() !== String(item[field] ?? "")) patch[field] = updated.trim();
          }
          if (Object.keys(patch).length) await window.StemSession.apiFetch(`/admin/${current}/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
        }
        await load();
      } catch (error) { $("adminStatus").textContent = error.message; }
    });
    $("adminCreateForm").addEventListener("submit", async (event) => {
      event.preventDefault(); $("adminFeedback").textContent = "";
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (data.grade) data.grade = Number(data.grade);
      try {
        const path = current === "memberships" ? "/memberships" : current === "students" || current === "staff" ? "/admin/accounts" : `/admin/${current}`;
        const payload = current === "students" ? { role: "student", displayName: data.displayName } : current === "staff" ? { role: "teacher", displayName: data.displayName } : data;
        const result = await window.StemSession.apiFetch(path, { method: "POST", body: payload });
        $("adminFeedback").textContent = current === "students" || current === "staff" ? `Created ${result.data.academyId}; account remains disabled pending verified activation.` : "Record created.";
        event.currentTarget.reset(); await load();
      } catch (error) { $("adminFeedback").textContent = error.message; }
    });
  }
  init();
})();
