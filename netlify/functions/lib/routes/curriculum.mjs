import { requireClassAccess, requireTeachingAssignment } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const obj = v => v !== null && typeof v === "object" && !Array.isArray(v);
async function bodyOf(req) { try { return await req.json(); } catch { return undefined; } }
const collections = { chapters: "curriculumChapters", topics: "curriculumTopics" };
const allowed = {
  chapters: new Set(["subjectId", "grade", "title", "sequence", "description", "sourceAttribution"]),
  topics: new Set(["chapterId", "subjectId", "grade", "title", "sequence", "description", "learningObjectives", "sourceAttribution"])
};
function cleanInput(kind, body, partial = false) {
  if (!obj(body) || Object.keys(body).some(k => !allowed[kind].has(k)) || (!partial && !Object.keys(body).length)) return null;
  const out = {};
  for (const key of ["subjectId", "grade", "chapterId", "title", "description", "sequence", "learningObjectives", "sourceAttribution"]) {
    if (!(key in body)) continue;
    const v = body[key];
    if (["subjectId", "chapterId"].includes(key) && !ID.test(v ?? "")) return null;
    if (key === "grade" && !(Number.isInteger(v) && v >= 1 && v <= 12)) return null;
    if (key === "title" && !(typeof v === "string" && v.trim().length >= 2 && v.trim().length <= 180)) return null;
    if (key === "description" && !(typeof v === "string" && v.length <= 5000)) return null;
    if (key === "sequence" && !(Number.isInteger(v) && v >= 0 && v <= 10000)) return null;
    if (key === "learningObjectives" && !(Array.isArray(v) && v.length <= 30 && v.every(x => typeof x === "string" && x.trim().length > 0 && x.length <= 500))) return null;
    if (key === "sourceAttribution" && v !== null && (!obj(v) || Object.keys(v).some(k => !["title", "publisher", "edition", "url", "page", "notes"].includes(k)) || Object.values(v).some(x => typeof x !== "string" || x.length > 500) || (v.url && !/^https?:\/\//i.test(v.url)))) return null;
    out[key] = key === "title" || key === "description" ? v.trim() : key === "learningObjectives" ? v.map(x => x.trim()) : v;
  }
  if (!partial && (!out.subjectId || !out.grade || !out.title || !Number.isInteger(out.sequence))) return null;
  return out;
}
function toCurriculumResponse(id, data, kind) {
  const value = {
    id, subjectId: data.subjectId, grade: data.grade, title: data.title,
    sequence: data.sequence, description: data.description ?? "",
    sourceAttribution: data.sourceAttribution ?? null,
    verificationStatus: data.verificationStatus,
    publicationState: data.publicationState
  };
  if (kind === "topics") {
    value.chapterId = data.chapterId;
    value.learningObjectives = data.learningObjectives ?? [];
  }
  return value;
}

async function checkSubject(db, subjectId, grade) {
  const snap = await db.collection("subjects").doc(subjectId).get();
  if (!snap.exists || snap.data().active !== true || snap.data().grade !== grade) throw new Error("NOT_FOUND");
}
async function checkReadScope(db, user, classId, subjectId) {
  const [c, s] = await Promise.all([db.collection("classes").doc(classId).get(), db.collection("subjects").doc(subjectId).get()]);
  if (!c.exists || !s.exists || c.data().active !== true || s.data().active !== true || c.data().grade !== s.data().grade) throw new Error("NOT_FOUND");
  if (user.role === "student") await requireClassAccess(db, user, classId, "student");
  else if (user.role === "teacher") await requireTeachingAssignment(db, user, classId, subjectId);
  else if (user.role !== "admin") throw new Error("FORBIDDEN");
}

/** Separate chapter/topic collections. No official content is seeded by this module. */
export async function handleCurriculum(request, ctx) {
  const parts = ctx.path.split("/").filter(Boolean);
  if (parts[0] !== "curriculum" || parts.length > 4) return fail("NOT_FOUND");
  const kind = parts[1];
  if (!collections[kind]) return fail("NOT_FOUND");
  const collection = collections[kind];
  const id = parts[2];
  const action = parts[3];

  if (parts.length === 2 && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const classId = params.get("classId"), subjectId = params.get("subjectId");
    if (!ID.test(classId ?? "") || !ID.test(subjectId ?? "")) return fail("INVALID_INPUT", "classId and subjectId are required.");
    try { await checkReadScope(ctx.db, ctx.user, classId, subjectId); }
    catch (e) { if (["FORBIDDEN", "NOT_FOUND"].includes(e.message)) return fail("NOT_FOUND"); throw e; }
    const q = await ctx.db.collection(collection).where("subjectId", "==", subjectId).where("grade", "==", (await ctx.db.collection("classes").doc(classId).get()).data().grade).limit(500).get();
    const records = q.docs.map(d => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => ctx.user.role === "admin" || data.publicationState === "published" && data.verificationStatus === "verified")
      .map(({ id, data }) => toCurriculumResponse(id, data, kind));
    return jsonResponse({ success: true, data: { [kind]: records } });
  }

  if (ctx.user.role !== "admin") return fail("FORBIDDEN");
  if (parts.length === 2 && request.method === "POST") {
    const body = await bodyOf(request), value = cleanInput(kind, body);
    if (!value) return fail("INVALID_INPUT", "Invalid curriculum record.");
    try { await checkSubject(ctx.db, value.subjectId, value.grade); }
    catch (e) { if (e.message === "NOT_FOUND") return fail("NOT_FOUND"); throw e; }
    if (kind === "topics") {
      const chapter = await ctx.db.collection("curriculumChapters").doc(value.chapterId).get();
      if (!chapter.exists || chapter.data().subjectId !== value.subjectId || chapter.data().grade !== value.grade) return fail("INVALID_INPUT", "Topic must reference a chapter in the same subject and grade.");
    }
    const ref = ctx.db.collection(collection).doc();
    return ctx.db.runTransaction(async tx => {
      const subjectSnap = await tx.get(ctx.db.collection("subjects").doc(value.subjectId));
      if (!subjectSnap.exists || subjectSnap.data().active !== true || subjectSnap.data().grade !== value.grade) return fail("NOT_FOUND");
      if (kind === "topics") {
        const chapterSnap = await tx.get(ctx.db.collection("curriculumChapters").doc(value.chapterId));
        if (!chapterSnap.exists || chapterSnap.data().subjectId !== value.subjectId || chapterSnap.data().grade !== value.grade) return fail("INVALID_INPUT", "Topic must reference a chapter in the same subject and grade.");
      }
      const now = ctx.serverTimestamp();
      tx.set(ref, { ...value, sourceAttribution: value.sourceAttribution ?? null, verificationStatus: "unverified", publicationState: "draft", createdBy: ctx.user.uid, createdAt: now, updatedAt: now });
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role, action: `curriculum.${kind.slice(0, -1)}.created`, targetType: collection, targetId: ref.id, metadata: { subjectId: value.subjectId, grade: value.grade }, createdAt: now });
      return jsonResponse({ success: true, data: { id: ref.id, verificationStatus: "unverified", publicationState: "draft" } }, 201);
    });
  }

  if (!ID.test(id ?? "")) return fail("INVALID_INPUT", "Invalid curriculum record ID.");
  const ref = ctx.db.collection(collection).doc(id);
  if (parts.length === 3 && request.method === "PATCH") {
    const body = await bodyOf(request), value = cleanInput(kind, body, true);
    if (!value || !Object.keys(value).length || ["subjectId", "grade", "chapterId"].some(k => k in value)) return fail("INVALID_INPUT", "Invalid curriculum update; subject, grade and parent chapter are immutable.");
    return ctx.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return fail("NOT_FOUND");
      const current = snap.data();
      if (current.publicationState === "published") return fail("CONFLICT", "Published curriculum is immutable; create a new draft for a correction.");
      const merged = { ...current, ...value };
      if ("subjectId" in value || "grade" in value) {
        const subjectSnap = await tx.get(ctx.db.collection("subjects").doc(merged.subjectId));
        if (!subjectSnap.exists || subjectSnap.data().active !== true || subjectSnap.data().grade !== merged.grade) return fail("NOT_FOUND");
      }
      if (kind === "topics" && ("chapterId" in value || "subjectId" in value || "grade" in value)) {
        const chapterSnap = await tx.get(ctx.db.collection("curriculumChapters").doc(merged.chapterId));
        if (!chapterSnap.exists || chapterSnap.data().subjectId !== merged.subjectId || chapterSnap.data().grade !== merged.grade) return fail("INVALID_INPUT", "Topic must reference a chapter in the same subject and grade.");
      }
      const now = ctx.serverTimestamp();
      tx.update(ref, { ...value, verificationStatus: "unverified", verifiedBy: null, verifiedAt: null, updatedAt: now });
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role, action: `curriculum.${kind.slice(0, -1)}.updated`, targetType: collection, targetId: id, metadata: { changedFields: Object.keys(value) }, createdAt: now });
      return jsonResponse({ success: true, data: { id, updated: true, verificationStatus: "unverified" } });
    });
  }
  if (parts.length === 4 && action === "verify" && request.method === "POST") {
    const body = await bodyOf(request);
    if (!obj(body) || Object.keys(body).some(k => !["title", "publisher", "edition", "url", "page", "notes"].includes(k)) ||
        !["title", "publisher", "edition"].every(k => typeof body[k] === "string" && body[k].trim()) ||
        Object.values(body).some(v => typeof v !== "string" || v.length > 500) || (body.url && !/^https?:\/\//i.test(body.url))) return fail("INVALID_INPUT", "Source title, publisher and edition are required for verification; URL must use HTTP or HTTPS.");
    return ctx.db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return fail("NOT_FOUND");
      const current = snap.data();
      if (current.publicationState === "published") return fail("CONFLICT", "Published curriculum is immutable.");
      const subjectSnap = await tx.get(ctx.db.collection("subjects").doc(current.subjectId));
      if (!subjectSnap.exists || subjectSnap.data().active !== true || subjectSnap.data().grade !== current.grade) return fail("NOT_FOUND");
      if (kind === "topics") {
        const chapterSnap = await tx.get(ctx.db.collection("curriculumChapters").doc(current.chapterId));
        if (!chapterSnap.exists || chapterSnap.data().subjectId !== current.subjectId || chapterSnap.data().grade !== current.grade) return fail("NOT_FOUND");
      }
      const now = ctx.serverTimestamp();
      tx.update(ref, { sourceAttribution: body, verificationStatus: "verified", verifiedBy: ctx.user.uid, verifiedAt: now, updatedAt: now });
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role, action: `curriculum.${kind.slice(0, -1)}.verified`, targetType: collection, targetId: id, metadata: { subjectId: current.subjectId, grade: current.grade }, createdAt: now });
      return jsonResponse({ success: true, data: { id, verificationStatus: "verified" } });
    });
  }
  if (parts.length === 4 && action === "publish" && request.method === "POST") {
    return ctx.db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return fail("NOT_FOUND");
      const d = snap.data();
      const subjectSnap = await tx.get(ctx.db.collection("subjects").doc(d.subjectId));
      if (!subjectSnap.exists || subjectSnap.data().active !== true || subjectSnap.data().grade !== d.grade) return fail("NOT_FOUND");
      let parentChapter = null;
      if (kind === "topics") {
        const parentSnap = await tx.get(ctx.db.collection("curriculumChapters").doc(d.chapterId));
        if (!parentSnap.exists) return fail("NOT_FOUND");
        parentChapter = parentSnap.data();
      }
      if (d.publicationState === "published") return fail("CONFLICT", "Curriculum is already published.");
      if (d.verificationStatus !== "verified" || !d.sourceAttribution?.title || !d.sourceAttribution?.publisher || !d.sourceAttribution?.edition) return fail("CONFLICT", "Only source-attributed, verified curriculum can be published.");
      if (parentChapter && (parentChapter.publicationState !== "published" || parentChapter.verificationStatus !== "verified")) return fail("CONFLICT", "Publish the verified parent chapter before publishing its topics.");
      const now = ctx.serverTimestamp();
      tx.update(ref, { publicationState: "published", publishedBy: ctx.user.uid, publishedAt: now, updatedAt: now });
      tx.set(ctx.db.collection("auditLogs").doc(), { actorUid: ctx.user.uid, actorRole: ctx.user.role, action: `curriculum.${kind.slice(0, -1)}.published`, targetType: collection, targetId: id, metadata: { subjectId: d.subjectId, grade: d.grade }, createdAt: now });
      return jsonResponse({ success: true, data: { id, publicationState: "published" } });
    });
  }
  return fail("NOT_FOUND");
}
