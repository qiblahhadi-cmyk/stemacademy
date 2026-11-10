(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { role: null, classId: null, subjectId: null, grade: null, chapters: [], topics: [], selectedChapter: null };
  const api = (path, options) => window.StemSession.apiFetch(path, options);
  const setShown = (el, show) => { el.hidden = !show; el.style.display = show ? "" : "none"; };
  const note = text => { $("pageFeedback").textContent = text || ""; };
  const opt = (value, label) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; };
  const admin = () => state.role === "admin";
  function button(label, action, className = "secondary-button") { const b = document.createElement("button"); b.type = "button"; b.className = className; b.textContent = label; b.addEventListener("click", action); return b; }
  function verifyAndPublish(kind, record) {
    const title = window.prompt("Source title (exact official source):"); if (!title) return;
    const publisher = window.prompt("Publisher / issuing authority:"); if (!publisher) return;
    const edition = window.prompt("Edition / academic year:"); if (!edition) return;
    const page = window.prompt("Page or section reference (optional):") || "";
    const source = { title: title.trim(), publisher: publisher.trim(), edition: edition.trim(), page };
    api(`/curriculum/${kind}/${encodeURIComponent(record.id)}/verify`, { method: "POST", body: source })
      .then(() => api(`/curriculum/${kind}/${encodeURIComponent(record.id)}/publish`, { method: "POST" }))
      .then(() => { note("Source recorded, verified and published."); return loadCurriculum(); })
      .catch(error => note(error.message));
  }
  function render() {
    const chapters = [...state.chapters].sort((a,b) => a.sequence - b.sequence);
    const topics = [...state.topics].sort((a,b) => a.sequence - b.sequence);
    $("chapterCount").textContent = String(chapters.length);
    $("topicCount").textContent = String(topics.length);
    $("objectiveCount").textContent = String(topics.reduce((n,t) => n + (t.learningObjectives?.length || 0), 0));
    const list = $("chapterList"); list.replaceChildren();
    if (!chapters.length) { const p = document.createElement("p"); p.className = "empty-resource"; p.textContent = admin() ? "No curriculum chapters yet. Add only content supported by an official source." : "No verified curriculum chapters have been published for this subject."; list.append(p); }
    for (const chapter of chapters) {
      const card = document.createElement("article"); card.className = "chapter-card" + (chapter.id === state.selectedChapter ? " selected" : "");
      const head = document.createElement("div"); head.className = "chapter-toggle";
      const number = document.createElement("span"); number.className = "chapter-number"; number.textContent = String(chapter.sequence).padStart(2,"0");
      const title = document.createElement("span"); title.className = "chapter-title"; title.textContent = chapter.title;
      const status = document.createElement("small"); status.textContent = admin() ? `${chapter.verificationStatus} · ${chapter.publicationState}` : "Verified";
      head.append(number,title,status,button("View topics", () => { state.selectedChapter = chapter.id; render(); }));
      card.append(head);
      if (admin() && chapter.publicationState !== "published") {
        card.append(button("Edit draft", async () => {
          const title = window.prompt("Chapter title:", chapter.title); if (!title) return;
          const sequenceRaw = window.prompt("Sequence number:", String(chapter.sequence)); if (sequenceRaw === null) return;
          const sequence = Number(sequenceRaw);
          if (!Number.isInteger(sequence) || sequence < 0) { note("Enter a valid sequence number."); return; }
          const description = window.prompt("Description:", chapter.description || ""); if (description === null) return;
          try { await api(`/curriculum/chapters/${encodeURIComponent(chapter.id)}`, { method:"PATCH", body:{ title, sequence, description } }); await loadCurriculum(); note("Chapter draft updated and returned to unverified status."); } catch(e) { note(e.message); }
        }));
        card.append(button("Verify source & publish", () => verifyAndPublish("chapters", chapter)));
      }
      list.append(card);
    }
    const current = chapters.find(c => c.id === state.selectedChapter);
    $("topicHeading").textContent = current ? current.title : "Select a chapter to view its topics.";
    const topicList = $("topicList"); topicList.replaceChildren();
    const related = current ? topics.filter(t => t.chapterId === current.id) : [];
    if (!related.length) { const li = document.createElement("li"); li.textContent = current ? "No topics have been added." : "No topic selected."; topicList.append(li); }
    for (const topic of related) {
      const li = document.createElement("li");
      const strong = document.createElement("strong"); strong.textContent = topic.title; li.append(strong);
      if (admin()) { const small = document.createElement("small"); small.textContent = ` — ${topic.verificationStatus} · ${topic.publicationState}`; li.append(small); }
      for (const objective of topic.learningObjectives || []) { const sub = document.createElement("div"); sub.textContent = `• ${objective}`; li.append(sub); }
      if (admin() && topic.publicationState !== "published") {
        li.append(button("Edit draft", async () => {
          const title = window.prompt("Topic title:", topic.title); if (!title) return;
          const sequenceRaw = window.prompt("Sequence number:", String(topic.sequence)); if (sequenceRaw === null) return;
          const sequence = Number(sequenceRaw);
          if (!Number.isInteger(sequence) || sequence < 0) { note("Enter a valid sequence number."); return; }
          const objectiveText = window.prompt("Learning objectives, one per line:", (topic.learningObjectives || []).join("\n"));
          if (objectiveText === null) return;
          try { await api(`/curriculum/topics/${encodeURIComponent(topic.id)}`, { method:"PATCH", body:{ title, sequence, learningObjectives:objectiveText.split("\n").map(x=>x.trim()).filter(Boolean) } }); await loadCurriculum(); note("Topic draft updated and returned to unverified status."); } catch(e) { note(e.message); }
        }));
        li.append(button("Verify source & publish", () => verifyAndPublish("topics", topic)));
      }
      topicList.append(li);
    }
    setShown($("addChapter"), admin() && Boolean(state.subjectId));
    setShown($("adminTopicTools"), admin() && Boolean(current));
  }
  async function loadClasses() {
    const { data } = await api("/classes");
    const select = $("classSelect"); select.replaceChildren(opt("", "Choose a class"));
    for (const c of data.classes) select.append(opt(c.id, `${c.name} (Grade ${c.grade})`));
  }
  async function loadSubjects() {
    state.classId = $("classSelect").value; state.subjectId = null; state.grade = null;
    const select = $("subjectSelect");
    if (!state.classId) { select.replaceChildren(opt("", "Choose a class first")); select.disabled = true; state.chapters=[]; state.topics=[]; render(); return; }
    const classes = await api("/classes");
    state.grade = classes.data.classes.find(c => c.id === state.classId)?.grade ?? null;
    const { data } = await api(`/subjects?classId=${encodeURIComponent(state.classId)}`);
    select.replaceChildren(opt("", data.subjects.length ? "Choose a subject" : "No subjects available"));
    for (const subject of data.subjects) select.append(opt(subject.id, subject.name));
    select.disabled = !data.subjects.length;
  }
  async function loadCurriculum() {
    state.subjectId = $("subjectSelect").value;
    if (!state.classId || !state.subjectId) { state.chapters=[]; state.topics=[]; render(); return; }
    const [chapters, topics] = await Promise.all([
      api(`/curriculum/chapters?classId=${encodeURIComponent(state.classId)}&subjectId=${encodeURIComponent(state.subjectId)}`),
      api(`/curriculum/topics?classId=${encodeURIComponent(state.classId)}&subjectId=${encodeURIComponent(state.subjectId)}`)
    ]);
    state.chapters = chapters.data.chapters; state.topics = topics.data.topics;
    if (!state.chapters.some(c => c.id === state.selectedChapter)) state.selectedChapter = state.chapters[0]?.id ?? null;
    $("curriculumStatus").textContent = admin() ? "Administrative draft and publication view." : "Only verified, published content is shown.";
    render();
  }
  async function init() {
    try {
      const me = await window.StemSession.ready; state.role = me.role;
      const roleLabel = document.querySelector(".role-label"); if (roleLabel) roleLabel.textContent = me.role;
      setShown($("addChapter"), false); setShown($("adminTopicTools"), false);
      $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
      for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", () => $(b.dataset.close).close());
      $("classSelect").addEventListener("change", async () => { state.selectedChapter=null; try { await loadSubjects(); } catch(e) { note(e.message); } });
      $("subjectSelect").addEventListener("change", () => loadCurriculum().catch(e => note(e.message)));
      $("addChapter").addEventListener("click", () => $("chapterDialog").showModal());
      $("addTopic").addEventListener("click", () => $("topicDialog").showModal());
      $("chapterForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/curriculum/chapters", { method:"POST", body:{ subjectId:state.subjectId, grade:state.grade, title:$("chapterTitle").value, sequence:Number($("chapterSequence").value), description:$("chapterDescription").value } }); $("chapterDialog").close(); e.target.reset(); note("Unverified chapter draft saved."); await loadCurriculum(); } catch(err) { note(err.message); } });
      $("topicForm").addEventListener("submit", async e => { e.preventDefault(); try { await api("/curriculum/topics", { method:"POST", body:{ chapterId:state.selectedChapter, subjectId:state.subjectId, grade:state.grade, title:$("topicTitle").value, sequence:Number($("topicSequence").value), description:$("topicDescription").value, learningObjectives:$("topicObjectives").value.split("\n").map(x=>x.trim()).filter(Boolean) } }); $("topicDialog").close(); e.target.reset(); note("Unverified topic draft saved."); await loadCurriculum(); } catch(err) { note(err.message); } });
      await loadClasses();
      if (!$("classSelect").options.length || $("classSelect").options.length === 1) { note("No active classes are available for this account."); return; }
    } catch (error) { note(error.message); }
  }
  init();
})();
