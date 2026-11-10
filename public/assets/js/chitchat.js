(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { me:null, classes:[], classId:"", messages:[], replyTo:null, editing:null, timer:null, lastTyping:0 };
  const api = (path, options) => window.StemSession.apiFetch(path, options);
  const el = (tag, cls, value) => { const n=document.createElement(tag); if(cls)n.className=cls; if(value!==undefined)n.textContent=value; return n; };
  const time = (v) => { const d=v?new Date(v):null; return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-PK",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Karachi"}).format(d):""; };
  const day = (v) => { const d=v?new Date(v):null; return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-PK",{dateStyle:"full",timeZone:"Asia/Karachi"}).format(d):"Earlier"; };
  function setStatus(s){$("chatStatus").textContent=s;}
  function findMessage(id){return state.messages.find(m=>m.id===id);}
  function render(){
    const host=$("chatMessages"); host.replaceChildren(); const q=$("chatSearch").value.trim().toLowerCase(); const rows=state.messages.filter(m=>!q||`${m.text} ${m.senderName}`.toLowerCase().includes(q)); let prior="";
    if(!rows.length){host.append(el("p","chat-empty",q?"No messages match your search.":"No messages yet. Start the class conversation."));return;}
    for(const m of rows){const label=day(m.createdAt);if(label!==prior){host.append(el("div","chat-day",label));prior=label;}
      const card=el("article",`chat-message${m.senderUid===state.me.uid?" mine":""}`);card.dataset.message=m.id;
      const head=el("div","chat-message-head");head.append(el("strong","",m.senderUid===state.me.uid?"You":m.senderName||"Class member"),el("time","",`${time(m.createdAt)}${m.editedAt?" · edited":""}`));card.append(head);
      if(m.replyTo){const parent=findMessage(m.replyTo);card.append(el("div","chat-reply",parent?`Reply to ${parent.senderName}: ${parent.text.slice(0,100)}`:"Reply to an earlier message"));}
      card.append(el("p","",m.deleted?"This message was removed.":m.text));
      if(m.attachmentUrl&&!m.deleted){const a=el("a","","Open attachment link");a.href=m.attachmentUrl;a.target="_blank";a.rel="noopener noreferrer";card.append(a);}
      if(!m.deleted){const actions=el("div","chat-message-actions");const reply=el("button","","Reply");reply.type="button";reply.dataset.reply=m.id;actions.append(reply);
        if(m.senderUid===state.me.uid){const edit=el("button","","Edit");edit.type="button";edit.dataset.edit=m.id;actions.append(edit);}
        if(m.senderUid===state.me.uid||state.me.role!=="student"){const history=el("button","","History");history.type="button";history.dataset.history=m.id;actions.append(history);}
        const report=el("button","","Report");report.type="button";report.dataset.report=m.id;actions.append(report);
        if(state.me.role!=="student"){const hide=el("button","","Moderate / remove");hide.type="button";hide.dataset.moderate=m.id;actions.append(hide);}
        card.append(actions);
      }
      host.append(card);
    }
    host.scrollTop=host.scrollHeight;
  }
  async function markRead(){for(const m of state.messages.slice(-100)){if(m.senderUid!==state.me.uid&&!m.deleted&&!m.readByMe)try{await api(`/chitchat/messages/${m.id}/read`,{method:"POST"});}catch{}}}
  async function load(){if(!state.classId)return;try{const r=await api(`/chitchat?classId=${encodeURIComponent(state.classId)}`);state.messages=r.data.messages;render();await markRead();setStatus(`${state.messages.length} recent messages · class members only`);await loadTyping();}catch(e){setStatus(e.message||"Unable to load this class conversation.");}}
  async function loadTyping(){try{const r=await api(`/chitchat/typing?classId=${encodeURIComponent(state.classId)}`);$("typingStatus").textContent=r.data.typing.map(x=>x.displayName).join(", ")+(r.data.typing.length?" typing…":"");}catch{}}
  async function sendTyping(typing){try{await api("/chitchat/typing",{method:"POST",body:{classId:state.classId,typing}});}catch{}}
  async function submit(event){event.preventDefault();const text=$("chatText").value.trim();if(!text||!state.classId)return;try{
    if(state.editing){await api(`/chitchat/messages/${state.editing}`,{method:"PATCH",body:{text}});state.editing=null;}
    else await api("/chitchat/messages",{method:"POST",body:{classId:state.classId,text,replyTo:state.replyTo,attachmentUrl:$ ("attachmentUrl").value.trim()||undefined}});
    $("chatText").value="";$("attachmentUrl").value="";state.replyTo=null;$("replyPreview").hidden=true;await sendTyping(false);await load();
  }catch(e){setStatus(e.message||"Message could not be sent.");}}
  async function onMessages(event){const b=event.target.closest("button[data-reply],button[data-edit],button[data-report],button[data-moderate],button[data-history]");if(!b)return;const m=findMessage(b.dataset.reply||b.dataset.edit||b.dataset.report||b.dataset.moderate||b.dataset.history);if(!m)return;
    try{if(b.dataset.reply){state.replyTo=m.id;$("replyPreview").textContent=`Replying to ${m.senderName}: ${m.text.slice(0,100)}`;$("replyPreview").hidden=false;$("chatText").focus();}
      if(b.dataset.edit){state.editing=m.id;$("chatText").value=m.text;$("chatText").focus();}
      if(b.dataset.history){const r=await api(`/chitchat/messages/${m.id}/history`);const history=r.data.history.map(x=>`${time(x.editedAt)} — ${x.previousText}`).join("\n\n");window.alert(history||"No edits recorded.");}
      if(b.dataset.report){const reason=window.prompt("Why are you reporting this message?");if(reason&&reason.trim().length>=3){await api("/chitchat/reports",{method:"POST",body:{messageId:m.id,reason:reason.trim()}});setStatus("Report submitted to class staff.");}}
      if(b.dataset.moderate&&window.confirm("Hide this message and record a moderation action?")){await api(`/chitchat/messages/${m.id}/moderate`,{method:"POST",body:{action:"hide"}});await load();}
    }catch(e){setStatus(e.message||"That action could not be completed.");}}
  async function loadReports(){try{const r=await api(`/chitchat/reports?classId=${encodeURIComponent(state.classId)}`);const host=$("chatReports");host.replaceChildren();for(const report of r.data.reports){const row=el("article","notice-card");row.append(el("strong","",`Report · ${report.status}`),el("p","",report.reason),el("small","",`Message ${report.messageId}`));if(report.status==="open"){for(const status of ["resolved","dismissed"]){const b=el("button","table-action",status);b.type="button";b.addEventListener("click",async()=>{await api(`/chitchat/reports/${report.id}`,{method:"PATCH",body:{status}});await loadReports();});row.append(b);}}host.append(row);}if(!r.data.reports.length)host.append(el("p","empty-resource","No reports for this class."));$("chatReportsPanel").hidden=false;}catch(e){setStatus(e.message||"Unable to load reports.");}}
  async function init(){try{state.me=await window.StemSession.ready;const r=await api("/classes");state.classes=r.data.classes;const select=$("chatClass");select.replaceChildren();for(const c of state.classes){const o=el("option","",c.name);o.value=c.id;select.append(o);}if(!state.classes.length){setStatus("No active classes are available to your account.");select.disabled=true;return;}
    if(state.me.role!=="student")$("showReports").hidden=false;
    state.classId=state.classes[0].id;$("chatClassTitle").textContent=state.classes[0].name;select.value=state.classId;await load();select.addEventListener("change",async()=>{state.classId=select.value;$("chatClassTitle").textContent=state.classes.find(c=>c.id===state.classId)?.name||"Class conversation";await load();});
    $("chatForm").addEventListener("submit",submit);$("chatMessages").addEventListener("click",onMessages);$("chatSearch").addEventListener("input",render);$("refreshChat").addEventListener("click",load);$("showReports").addEventListener("click",loadReports);$("closeReports").addEventListener("click",()=>$("chatReportsPanel").hidden=true);$("chatText").addEventListener("input",()=>{const now=Date.now();if(now-state.lastTyping>4000){state.lastTyping=now;sendTyping(true);}});$("menuButton")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
    state.timer=window.setInterval(load,5000);window.addEventListener("beforeunload",()=>{window.clearInterval(state.timer);sendTyping(false);});
    document.querySelectorAll(".role-label").forEach(n=>n.textContent=state.me.role==="admin"?"Administrator":state.me.role==="teacher"?"Teacher":"Student");
  }catch(e){setStatus(e.message||"Unable to initialise ChitChat.");}}
  init();
})();
