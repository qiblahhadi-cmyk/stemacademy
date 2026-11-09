const resources=[
{id:1,title:"Motion: lesson outline",grade:"9",type:"Lesson outline",topic:"Motion",description:"Introduce distance, displacement, speed and velocity with classroom examples."},
{id:2,title:"Units and measurement notes",grade:"9",type:"Study notes",topic:"Physical quantities",description:"A short outline for discussing SI units, prefixes and measurement."},
{id:3,title:"Force and motion activity",grade:"9",type:"Class activity",topic:"Force",description:"A teacher-led classroom discussion using everyday examples of pushes and pulls."},
{id:4,title:"Waves: lesson outline",grade:"10",type:"Lesson outline",topic:"Waves",description:"Introduce wave motion, basic terms and examples for classroom explanation."},
{id:5,title:"Light revision notes",grade:"10",type:"Study notes",topic:"Light",description:"A concise revision outline for reflection and refraction concepts."},
{id:6,title:"Electricity concept activity",grade:"10",type:"Class activity",topic:"Electricity",description:"A classroom question-and-discussion activity about simple electric circuits."}
];
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function updateCounts(){$("resourceCount").textContent=resources.length;$("grade9Count").textContent=resources.filter(r=>r.grade==="9").length;$("grade10Count").textContent=resources.filter(r=>r.grade==="10").length;}
function render(){
 const q=$("resourceSearch").value.trim().toLowerCase(),grade=$("courseGrade").value,type=$("resourceType").value;
 const rows=resources.filter(r=>(grade==="all"||r.grade===grade)&&(type==="all"||r.type===type)&&(!q||(r.title+" "+r.topic+" "+r.description).toLowerCase().includes(q)));
 $("resourceGrid").innerHTML=rows.length?rows.map(r=>`<article class="resource-card"><div class="resource-card-top"><span class="resource-type">${escapeHTML(r.type)}</span><span class="resource-grade">Grade ${r.grade}</span></div><h3>${escapeHTML(r.title)}</h3><p class="resource-topic">${escapeHTML(r.topic)}</p><p class="resource-description">${escapeHTML(r.description)}</p><button class="table-action" type="button" data-resource-detail="${r.id}">View details</button></article>`).join(""):'<div class="empty-resource">No learning items match these filters.</div>';
 $("resourceResultCount").textContent=`Showing ${rows.length} of ${resources.length} learning items.`;updateCounts();
}
["resourceSearch","courseGrade","resourceType"].forEach(id=>$(id).addEventListener(id==="resourceSearch"?"input":"change",render));
$("resourceGrid").addEventListener("click",event=>{const btn=event.target.closest("[data-resource-detail]");if(!btn)return;const r=resources.find(x=>x.id===Number(btn.dataset.resourceDetail));if(!r)return;$("resourceDetailTitle").textContent=r.title;$("resourceDetailContent").innerHTML=`<div class="detail-field"><span>Class</span><p>Grade ${r.grade} · Section A</p></div><div class="detail-field"><span>Type</span><p>${escapeHTML(r.type)}</p></div><div class="detail-field"><span>Chapter or topic</span><p>${escapeHTML(r.topic)}</p></div><div class="detail-field"><span>Description</span><p>${escapeHTML(r.description||"No description provided.")}</p></div><div class="detail-demo-note">Preview entry only. No file or external learning resource is attached.</div>`;$("resourceDetail").showModal();});
const dialog=$("resourceDialog"),form=$("resourceForm");
$("addResource").addEventListener("click",()=>{form.reset();$("resourceFeedback").textContent="";dialog.showModal();});
const close=()=>dialog.close();$("closeResource").addEventListener("click",close);$("cancelResource").addEventListener("click",close);
form.addEventListener("submit",event=>{event.preventDefault();const title=$("resourceTitle").value.trim(),topic=$("resourceTopic").value.trim();if(!title||!topic){$("resourceFeedback").textContent="Please enter a title and topic.";return;}resources.unshift({id:Math.max(0,...resources.map(r=>r.id))+1,title,grade:$("resourceGrade").value,type:$("resourceKind").value,topic,description:$("resourceDescription").value.trim()});close();render();});
$("closeResourceDetail").addEventListener("click",()=>$("resourceDetail").close());$("doneResourceDetail").addEventListener("click",()=>$("resourceDetail").close());
$("menuButton")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
render();