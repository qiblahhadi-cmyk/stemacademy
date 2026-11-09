// Illustrative planning structure only. Verify every chapter against the current AJK Board textbook before use.
const curriculum = {
  "9": [
    {title:"Physical Quantities and Measurement",topics:["Physical quantities and SI units","Measuring instruments","Scientific notation and significant figures"],objectives:["Identify physical quantities and their SI units.","Select suitable instruments for basic measurements.","Record measurements using appropriate precision."]},
    {title:"Kinematics",topics:["Types of motion","Distance, displacement, speed and velocity","Acceleration and motion graphs"],objectives:["Differentiate distance from displacement.","Calculate speed, velocity and acceleration.","Interpret simple motion graphs."]},
    {title:"Dynamics",topics:["Force and inertia","Newton’s laws of motion","Momentum and conservation of momentum"],objectives:["Describe the effect of a resultant force.","Apply Newton’s laws to simple situations.","Explain momentum and its conservation."]}
  ],
  "10": [
    {title:"Simple Harmonic Motion and Waves",topics:["Periodic motion","Simple harmonic motion","Wave properties"],objectives:["Describe periodic and simple harmonic motion.","Relate frequency, time period and amplitude.","Explain basic properties of waves."]},
    {title:"Sound",topics:["Production and propagation of sound","Characteristics of sound waves","Echoes and applications"],objectives:["Explain how sound is produced and transmitted.","Compare pitch, loudness and quality.","Describe echoes and practical uses of sound."]},
    {title:"Geometrical Optics",topics:["Reflection of light","Refraction of light","Lenses and image formation"],objectives:["Apply the laws of reflection.","Describe refraction using basic ray diagrams.","Explain image formation by simple lenses."]}
  ]
};
const $ = id => document.getElementById(id);
let selectedChapter = 0;
function render() {
 const grade=$("gradeSelect").value, chapters=curriculum[grade];
 $("chapterCount").textContent=chapters.length;
 $("topicCount").textContent=chapters.reduce((sum,item)=>sum+item.topics.length,0);
 $("objectiveCount").textContent=chapters.reduce((sum,item)=>sum+item.objectives.length,0);
 if(selectedChapter>=chapters.length) selectedChapter=0;
 const list=$("chapterList"); list.replaceChildren();
 chapters.forEach((chapter,index)=>{
  const card=document.createElement("article"); card.className="chapter-card"+(index===selectedChapter?" selected":"");
  const button=document.createElement("button"); button.type="button"; button.className="chapter-toggle"; button.setAttribute("aria-expanded",String(index===selectedChapter));
  const number=document.createElement("span"); number.className="chapter-number"; number.textContent=String(index+1).padStart(2,"0");
  const title=document.createElement("span"); title.className="chapter-title"; title.textContent=chapter.title;
  const meta=document.createElement("small"); meta.textContent=chapter.topics.length+" topics";
  const arrow=document.createElement("span"); arrow.className="chapter-arrow"; arrow.textContent=index===selectedChapter?"−":"+";
  button.append(number,title,meta,arrow); button.addEventListener("click",()=>{selectedChapter=index;render();}); card.append(button);
  if(index===selectedChapter){const topics=document.createElement("ol");topics.className="topic-list";chapter.topics.forEach(topic=>{const li=document.createElement("li");li.textContent=topic;topics.append(li);});card.append(topics);}
  list.append(card);
 });
 const current=chapters[selectedChapter]; $("objectiveChapter").textContent=current.title;
 const objectives=$("objectiveList");objectives.replaceChildren();
 current.objectives.forEach(text=>{const li=document.createElement("li");li.textContent=text;objectives.append(li);});
}
$("gradeSelect").addEventListener("change",()=>{selectedChapter=0;render();});
$("menuButton").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
render();