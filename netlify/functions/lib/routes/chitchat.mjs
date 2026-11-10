import { requireClassAccess, requireClassTeachingAssignment, txAuthorizeScope } from "../authorization.mjs";
import { jsonResponse, errorResponse } from "../response.mjs";
import { API_ERRORS } from "../errors.mjs";

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message) => errorResponse(code, message ?? API_ERRORS[code].message, API_ERRORS[code].status);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const staff = (u) => u.role === "admin" || u.role === "teacher";
const iso = (v) => { try { if (v?.toDate) return v.toDate().toISOString(); if (v?._seconds) return new Date(v._seconds * 1000).toISOString(); if (v instanceof Date) return v.toISOString(); if (typeof v === "string") return new Date(v).toISOString(); } catch {} return null; };
const millis = (v) => { const value = iso(v); return value ? Date.parse(value) : 0; };
async function bodyOf(req) { try { return await req.json(); } catch { return undefined; } }
async function scope(db, user, classId) {
  if (!ID.test(classId ?? "")) throw new Error("NOT_FOUND");
  const c = await db.collection("classes").doc(classId).get();
  if (!c.exists || c.data().active !== true) throw new Error("NOT_FOUND");
  if (user.role === "student") await requireClassAccess(db, user, classId, "student");
  else if (user.role === "teacher") await requireClassTeachingAssignment(db, user, classId);
  else if (user.role !== "admin") throw new Error("FORBIDDEN");
  return c.data();
}
function messageView(id, d) {
  return { id, classId: d.classId, senderUid: d.senderUid, senderName: d.senderName, text: d.deletedAt ? "This message was removed." : d.text,
    replyTo: d.replyTo ?? null, attachmentUrl: d.attachmentUrl ?? null, createdAt: iso(d.createdAt), editedAt: iso(d.editedAt),
    deleted: Boolean(d.deletedAt), moderated: Boolean(d.moderated) };
}
function auditRecord(db, user, action, classId, messageId, timestamp) {
  return { ref: db.collection("auditLogs").doc(), data: { actorUid: user.uid, actorRole: user.role, action: `chitchat.${action}`, entityType: "chatMessage", entityId: messageId, createdAt: timestamp, metadata: { classId } } };
}
function writeAudited(tx, db, user, action, classId, messageId, timestamp, writes) {
  for (const write of writes) tx.set(write.ref, write.data);
  const record = auditRecord(db, user, action, classId, messageId, timestamp);
  tx.set(record.ref, record.data);
}
async function runScoped(db, user, classId, callback) {
  return db.runTransaction(async (tx) => {
    await txAuthorizeScope(tx, db, user, classId);
    return callback(tx);
  });
}
export async function unreadMessageCount(db, user, classIds) {
  let total = 0;
  for (const classId of classIds.slice(0, 100)) {
    const [messages, reads] = await Promise.all([
      db.collection("chatMessages").where("classId", "==", classId).orderBy("createdAt", "desc").limit(500).get(),
      db.collection("chatReads").where("classId", "==", classId).where("userUid", "==", user.uid).orderBy("readAt", "desc").limit(500).get()
    ]);
    const readIds = new Set(reads.docs.map((d) => d.data().messageId));
    total += messages.docs.filter((d) => d.data().senderUid !== user.uid && !d.data().deletedAt && !readIds.has(d.id)).length;
  }
  return total;
}
export async function handleChitChat(request, ctx) {
  const { user, db, serverTimestamp = () => new Date(), now = () => new Date() } = ctx;
  const path = new URL(request.url).pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?:\/v1)?/, "") || "/";
  const url = new URL(request.url);
  try {
    if (path === "/chitchat" && request.method === "GET") {
      const classId = url.searchParams.get("classId"); await scope(db, user, classId);
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
      const [snap, readSnap] = await Promise.all([
        db.collection("chatMessages").where("classId", "==", classId).orderBy("createdAt", "desc").limit(100).get(),
        db.collection("chatReads").where("classId", "==", classId).where("userUid", "==", user.uid).orderBy("readAt", "desc").limit(500).get()
      ]);
      const readIds = new Set(readSnap.docs.map((d) => d.data().messageId));
      const rows = snap.docs.map((d) => ({ ...messageView(d.id, d.data()), readByMe: readIds.has(d.id) })).filter((m) => !q || `${m.text} ${m.senderName}`.toLowerCase().includes(q));
      rows.sort((a,b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
      return jsonResponse({ success: true, data: { messages: rows } });
    }
    if (path === "/chitchat/messages" && request.method === "POST") {
      const b = await bodyOf(request); if (!object(b) || Object.keys(b).some(k => !["classId","text","replyTo","attachmentUrl"].includes(k))) return fail("INVALID_INPUT");
      await scope(db, user, b.classId);
      if (typeof b.text !== "string" || b.text.trim().length < 1 || b.text.trim().length > 2000) return fail("INVALID_INPUT", "Message must contain 1 to 2000 characters.");
      if (b.replyTo !== undefined && !ID.test(b.replyTo)) return fail("INVALID_INPUT");
      if (b.attachmentUrl !== undefined && (typeof b.attachmentUrl !== "string" || b.attachmentUrl.length > 1000 || !/^https:\/\//i.test(b.attachmentUrl))) return fail("INVALID_INPUT", "Attachments must be secure HTTPS links; file uploads are not enabled.");
      if (b.replyTo) { const parent = await db.collection("chatMessages").doc(b.replyTo).get(); if (!parent.exists || parent.data().classId !== b.classId || parent.data().deletedAt) return fail("NOT_FOUND"); }
      const ref = db.collection("chatMessages").doc(); const timestamp = serverTimestamp();
      return await runScoped(db,user,b.classId,async(tx)=>{
        if (b.replyTo) { const parent=await tx.get(db.collection("chatMessages").doc(b.replyTo)); if(!parent.exists||parent.data().classId!==b.classId||parent.data().deletedAt)return fail("NOT_FOUND"); }
        tx.set(ref,{classId:b.classId,senderUid:user.uid,senderName:String(user.displayName??"Member").slice(0,80),text:b.text.trim(),replyTo:b.replyTo??null,attachmentUrl:b.attachmentUrl??null,createdAt:timestamp,editedAt:null,deletedAt:null,moderated:false});
        return jsonResponse({success:true,data:{message:{id:ref.id,classId:b.classId,senderUid:user.uid,senderName:String(user.displayName??"Member"),text:b.text.trim(),replyTo:b.replyTo??null,attachmentUrl:b.attachmentUrl??null,createdAt:iso(timestamp)}}},201);
      });
    }
    const msgMatch = path.match(/^\/chitchat\/messages\/([A-Za-z0-9_-]{1,100})(?:\/(read|moderate|history))?$/);
    if (msgMatch) {
      const [, id, action] = msgMatch; const ref = db.collection("chatMessages").doc(id); const snap = await ref.get(); if (!snap.exists) return fail("NOT_FOUND");
      const current = snap.data(); await scope(db, user, current.classId);
      if (action === "history" && request.method === "GET") {
        return await runScoped(db,user,current.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==current.classId)return fail("NOT_FOUND");const history=await tx.get(db.collection("chatMessageHistory").where("messageId","==",id).limit(50));return jsonResponse({success:true,data:{history:history.docs.map(d=>({editorUid:d.data().editorUid,previousText:d.data().previousText,editedAt:iso(d.data().editedAt)}))}});});
      }
      if (action === "read" && request.method === "POST") {
        return await runScoped(db,user,current.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==current.classId)return fail("NOT_FOUND");const message=fresh.data();if(message.senderUid!==user.uid&&!message.deletedAt)tx.set(db.collection("chatReads").doc(`${id}_${user.uid}`),{messageId:id,classId:message.classId,userUid:user.uid,readAt:serverTimestamp()});return jsonResponse({success:true,data:{read:true}});});
      }
      if (action === "moderate" && request.method === "POST") {
        if (!staff(user)) return fail("FORBIDDEN"); const b = await bodyOf(request); if (!object(b) || b.action !== "hide") return fail("INVALID_INPUT");
        const timestamp=serverTimestamp();return await runScoped(db,user,current.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==current.classId)return fail("NOT_FOUND");const latest=fresh.data();if(latest.deletedAt)return fail("CONFLICT");writeAudited(tx,db,user,"moderated",latest.classId,id,timestamp,[{ref,data:{...latest,moderated:true,deletedAt:timestamp,moderatedBy:user.uid}}]);return jsonResponse({success:true,data:{moderated:true}});});
      }
      if (action || !["PATCH","DELETE"].includes(request.method)) return fail("METHOD_NOT_ALLOWED");
      if (current.deletedAt) return fail("CONFLICT", "This message has already been removed.");
      if (request.method === "PATCH") {
        if (current.senderUid !== user.uid || now().getTime() - new Date(iso(current.createdAt) ?? 0).getTime() > 10 * 60 * 1000) return fail("FORBIDDEN", "Only the author can edit a message within 10 minutes.");
        const b = await bodyOf(request); if (!object(b) || Object.keys(b).length !== 1 || typeof b.text !== "string" || b.text.trim().length < 1 || b.text.trim().length > 2000) return fail("INVALID_INPUT");
        const timestamp=serverTimestamp();const historyRef=db.collection("chatMessageHistory").doc();
        return await runScoped(db,user,current.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==current.classId)return fail("NOT_FOUND");const latest=fresh.data();if(latest.deletedAt)return fail("CONFLICT");if(latest.senderUid!==user.uid||now().getTime()-millis(latest.createdAt)>10*60*1000)return fail("FORBIDDEN","Only the author can edit a message within 10 minutes.");writeAudited(tx,db,user,"edited",latest.classId,id,timestamp,[{ref,data:{...latest,text:b.text.trim(),editedAt:timestamp}},{ref:historyRef,data:{messageId:id,classId:latest.classId,editorUid:user.uid,previousText:latest.text,editedAt:timestamp}}]);return jsonResponse({success:true,data:{edited:true}});});
      }
      if (request.method === "DELETE") {
        if (current.senderUid !== user.uid && !staff(user)) return fail("FORBIDDEN");
        const timestamp=serverTimestamp();return await runScoped(db,user,current.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==current.classId)return fail("NOT_FOUND");const latest=fresh.data();if(latest.deletedAt)return fail("CONFLICT");if(latest.senderUid!==user.uid&&!staff(user))return fail("FORBIDDEN");writeAudited(tx,db,user,"deleted",latest.classId,id,timestamp,[{ref,data:{...latest,text:"",deletedAt:timestamp,deletedBy:user.uid}}]);return jsonResponse({success:true,data:{deleted:true}});});
      }
    }
    if (path === "/chitchat/typing" && request.method === "POST") {
      const b = await bodyOf(request); if (!object(b) || !ID.test(b.classId ?? "") || typeof b.typing !== "boolean") return fail("INVALID_INPUT"); await scope(db,user,b.classId);
      const ref = db.collection("chatTyping").doc(`${b.classId}_${user.uid}`); return await runScoped(db,user,b.classId,async(tx)=>{if(b.typing)tx.set(ref,{classId:b.classId,userUid:user.uid,displayName:String(user.displayName??"Member").slice(0,80),expiresAt:new Date(now().getTime()+15000)});else tx.set(ref,{classId:b.classId,userUid:user.uid,expiresAt:new Date(0)});return jsonResponse({success:true,data:{typing:b.typing}});});
    }
    if (path === "/chitchat/typing" && request.method === "GET") {
      const classId=url.searchParams.get("classId"); await scope(db,user,classId); const snap=await db.collection("chatTyping").where("classId","==",classId).limit(100).get();
      return jsonResponse({success:true,data:{typing:snap.docs.map(d=>d.data()).filter(d=>d.userUid!==user.uid && millis(d.expiresAt)>now().getTime()).map(d=>({displayName:d.displayName}))}});
    }
    if (path === "/chitchat/reports" && request.method === "POST") {
      const b=await bodyOf(request); if(!object(b)||!ID.test(b.messageId??"")||typeof b.reason!=="string"||b.reason.trim().length<3||b.reason.length>300) return fail("INVALID_INPUT");
      const msg=await db.collection("chatMessages").doc(b.messageId).get(); if(!msg.exists)return fail("NOT_FOUND"); const classId=msg.data().classId; const reportRef=db.collection("chatReports").doc();
      return await runScoped(db,user,classId,async(tx)=>{const fresh=await tx.get(db.collection("chatMessages").doc(b.messageId));if(!fresh.exists||fresh.data().classId!==classId)return fail("NOT_FOUND");tx.set(reportRef,{messageId:b.messageId,classId,reporterUid:user.uid,reason:b.reason.trim(),status:"open",createdAt:serverTimestamp()});return jsonResponse({success:true,data:{reported:true}},201);});
    }
    if (path === "/chitchat/reports" && request.method === "GET") {
      if(!staff(user))return fail("FORBIDDEN"); const classId=url.searchParams.get("classId"); await scope(db,user,classId); const snap=await db.collection("chatReports").where("classId","==",classId).limit(100).get();
      return jsonResponse({success:true,data:{reports:snap.docs.map(d=>({id:d.id,messageId:d.data().messageId,reason:d.data().reason,status:d.data().status,createdAt:iso(d.data().createdAt)}))}});
    }
    const reportMatch=path.match(/^\/chitchat\/reports\/([A-Za-z0-9_-]{1,100})$/);
    if(reportMatch && request.method === "PATCH") {
      if(!staff(user))return fail("FORBIDDEN"); const ref=db.collection("chatReports").doc(reportMatch[1]); const snap=await ref.get(); if(!snap.exists)return fail("NOT_FOUND");
      const report=snap.data(); const b=await bodyOf(request); if(!object(b)||Object.keys(b).length!==1||!["resolved","dismissed"].includes(b.status))return fail("INVALID_INPUT");
      const timestamp=serverTimestamp();return await runScoped(db,user,report.classId,async(tx)=>{const fresh=await tx.get(ref);if(!fresh.exists||fresh.data().classId!==report.classId)return fail("NOT_FOUND");const latest=fresh.data();tx.set(ref,{...latest,status:b.status,reviewedBy:user.uid,reviewedAt:timestamp});const auditRef=db.collection("auditLogs").doc();tx.set(auditRef,{actorUid:user.uid,actorRole:user.role,action:"chitchat.report_reviewed",entityType:"chatReport",entityId:reportMatch[1],createdAt:timestamp,metadata:{classId:latest.classId}});return jsonResponse({success:true,data:{status:b.status}});});
    }
    return fail("NOT_FOUND");
  } catch (error) {
    if (["FORBIDDEN","NOT_FOUND"].includes(error.message)) return fail(error.message);
    throw error;
  }
}
