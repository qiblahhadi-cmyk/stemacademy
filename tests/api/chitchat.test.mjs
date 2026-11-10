import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDb } from "../helpers/fake-firestore.mjs";
import { classAccessDocumentId } from "../../netlify/functions/lib/authorization.mjs";
import { handleChitChat, unreadMessageCount } from "../../netlify/functions/lib/routes/chitchat.mjs";

const stamp = new Date("2026-11-10T06:00:00.000Z");
const seed = {
  classes: { c1: { active: true, name: "Grade 9" }, c2: { active: true, name: "Grade 10" } },
  classAccess: {
    [classAccessDocumentId("c1", "student-1", "student")]: { classId: "c1", userUid: "student-1", accessType: "student", active: true },
    [classAccessDocumentId("c1", "student-2", "student")]: { classId: "c1", userUid: "student-2", accessType: "student", active: true },
    [classAccessDocumentId("c2", "student-3", "student")]: { classId: "c2", userUid: "student-3", accessType: "student", active: true }
  }
};
const student = { uid: "student-1", role: "student", displayName: "Student One" };
const otherStudent = { uid: "student-2", role: "student", displayName: "Student Two" };
const admin = { uid: "admin-1", role: "admin", displayName: "Admin" };
function request(path, method="GET", body) { return new Request(`https://academy.test${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
async function call(db,user,path,method,body) { return handleChitChat(request(path,method,body), { db,user,serverTimestamp:()=>stamp,now:()=>stamp }); }
async function data(response) { return response.json(); }

test("ChitChat sends and lists messages only for active class members", async () => {
  const db=createFakeDb(seed);
  const sent=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Please review Newton's laws."});
  assert.equal(sent.status,201);
  const listed=await call(db,student,"/api/chitchat?classId=c1");
  assert.equal((await data(listed)).data.messages.length,1);
  const denied=await call(db,{uid:"outsider",role:"student"},"/api/chitchat?classId=c1");
  assert.equal(denied.status,403);
});

test("ChitChat read state is per-user and unread counts are class-scoped", async () => {
  const db=createFakeDb(seed);
  const sent=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Read me"});
  const id=(await data(sent)).data.message.id;
  assert.equal(await unreadMessageCount(db,otherStudent,["c1"]),1);
  await call(db,otherStudent,`/api/chitchat/messages/${id}/read`,"POST",{});
  assert.equal(await unreadMessageCount(db,otherStudent,["c1"]),0);
  assert.equal(await unreadMessageCount(db,{uid:"student-3",role:"student"},["c2"]),0);
});

test("ChitChat validates attachments, edits within the window and records history", async () => {
  const db=createFakeDb(seed);
  assert.equal((await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"x",attachmentUrl:"http://unsafe.test/file"})).status,400);
  const sent=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Original"});
  const id=(await data(sent)).data.message.id;
  assert.equal((await call(db,student,`/api/chitchat/messages/${id}`,"PATCH",{text:"Corrected"})).status,200);
  assert.equal([...db.store.keys()].some(k=>k.startsWith("chatMessageHistory/")),true);
  const history=await call(db,student,`/api/chitchat/messages/${id}/history`);
  assert.equal((await data(history)).data.history[0].previousText,"Original");
});

test("ChitChat prevents another student editing/deleting and allows staff moderation with audit", async () => {
  const db=createFakeDb(seed);
  const sent=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Inappropriate"});
  const id=(await data(sent)).data.message.id;
  assert.equal((await call(db,otherStudent,`/api/chitchat/messages/${id}`,"PATCH",{text:"Hijack"})).status,403);
  assert.equal((await call(db,otherStudent,`/api/chitchat/messages/${id}`,"DELETE")).status,403);
  assert.equal((await call(db,otherStudent,`/api/chitchat/messages/${id}/moderate`,"POST",{action:"hide"})).status,403);
  assert.equal((await call(db,admin,`/api/chitchat/messages/${id}/moderate`,"POST",{action:"hide"})).status,200);
  assert.equal([...db.store.keys()].some(k=>k.startsWith("auditLogs/")),true);
  const list=await call(db,student,"/api/chitchat?classId=c1");
  assert.equal((await data(list)).data.messages[0].deleted,true);
});

test("ChitChat rejects inactive classes and malformed message bodies", async () => {
  const db=createFakeDb({...seed,classes:{c1:{active:false}}});
  assert.equal((await call(db,student,"/api/chitchat?classId=c1")).status,404);
  const db2=createFakeDb(seed);
  assert.equal((await call(db2,student,"/api/chitchat/messages","POST",{classId:"c1",text:" "})).status,400);
});

test("ChitChat reports can be reviewed only by authorised class staff", async () => {
  const db=createFakeDb(seed);
  const sent=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Please review this"});
  const messageId=(await data(sent)).data.message.id;
  assert.equal((await call(db,student,"/api/chitchat/reports","POST",{messageId,reason:"Potentially harmful content"})).status,201);
  assert.equal((await call(db,student,"/api/chitchat/reports?classId=c1")).status,403);
  const queue=await call(db,admin,"/api/chitchat/reports?classId=c1");
  const reports=(await data(queue)).data.reports;
  assert.equal(reports.length,1);
  assert.equal((await call(db,admin,`/api/chitchat/reports/${reports[0].id}`,"PATCH",{status:"resolved"})).status,200);
});


test("ChitChat typing indicators expire and remain scoped to authorised class members", async () => {
  const db=createFakeDb(seed);
  assert.equal((await call(db,student,"/api/chitchat/typing","POST",{classId:"c1",typing:true})).status,200);
  const visible=await call(db,otherStudent,"/api/chitchat/typing?classId=c1");
  assert.equal((await data(visible)).data.typing.length,1);
  const denied=await call(db,{uid:"stranger",role:"student"},"/api/chitchat/typing?classId=c1");
  assert.equal(denied.status,403);
});

test("ChitChat send rechecks student membership inside the write transaction", async () => {
  const db=createFakeDb(seed);
  const membershipId=classAccessDocumentId("c1","student-1","student");
  db.beforeNextCommit=()=>db.updateDocument("classAccess",membershipId,{active:false});
  const response=await call(db,student,"/api/chitchat/messages","POST",{classId:"c1",text:"Must not persist after membership revocation"});
  assert.equal(response.status,403);
  assert.equal([...db.store.keys()].filter(k=>k.startsWith("chatMessages/")).length,0);
});
