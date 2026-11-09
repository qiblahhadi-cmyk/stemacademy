const sample = {
  classes: [
    {name:"Section A",grade:"9",students:3,teacher:"Sample Teacher",status:"Active",detail:"Grade 9 classroom"},
    {name:"Section A",grade:"10",students:3,teacher:"Sample Teacher",status:"Active",detail:"Grade 10 classroom"}
  ],
  students: [
    {name:"Sample Student 01",grade:"9",className:"Section A",status:"Active",detail:"Demo student record"},
    {name:"Sample Student 02",grade:"9",className:"Section A",status:"Active",detail:"Demo student record"},
    {name:"Sample Student 03",grade:"9",className:"Section A",status:"Active",detail:"Demo student record"},
    {name:"Sample Student 04",grade:"10",className:"Section A",status:"Active",detail:"Demo student record"},
    {name:"Sample Student 05",grade:"10",className:"Section A",status:"Active",detail:"Demo student record"},
    {name:"Sample Student 06",grade:"10",className:"Section A",status:"Active",detail:"Demo student record"}
  ],
  teachers: [
    {name:"Sample Teacher",subject:"Physics",classes:"Grade 9, Grade 10",status:"Active",detail:"Demo teacher record"}
  ]
};
let activeTab = "classes";
const $ = id => document.getElementById(id);
const head = $("tableHead");
const body = $("tableBody");

function cell(value, primary=false, secondary="") {
  const td = document.createElement("td");
  if (primary) {
    const strong = document.createElement("span");
    strong.className = "record-primary";
    strong.textContent = value;
    td.append(strong);
    if (secondary) {
      const small = document.createElement("small");
      small.className = "record-secondary";
      small.textContent = secondary;
      td.append(small);
    }
  } else td.textContent = value;
  return td;
}
function statusCell(status) {
  const td = document.createElement("td");
  const pill = document.createElement("span");
  pill.className = "status-pill";
  pill.textContent = status;
  td.append(pill);
  return td;
}
function render() {
  const records = sample[activeTab];
  const query = $("searchInput").value.trim().toLowerCase();
  const grade = $("gradeFilter").value;
  const filtered = records.filter(record => {
    const matchesText = Object.values(record).some(value => String(value).toLowerCase().includes(query));
    return matchesText && (grade === "all" || record.grade === grade || (activeTab === "teachers" && record.classes?.includes(`Grade ${grade}`)));
  });
  const headers = {
    classes:["Class","Grade","Students","Teacher","Status"],
    students:["Student","Grade","Class","Record type","Status"],
    teachers:["Teacher","Subject","Assigned classes","Record type","Status"]
  };
  head.replaceChildren();
  const headerRow = document.createElement("tr");
  headers[activeTab].forEach(label => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headerRow.append(th);
  });
  head.append(headerRow);
  body.replaceChildren();
  filtered.forEach(record => {
    const row = document.createElement("tr");
    if (activeTab === "classes") {
      row.append(cell(record.name, true, record.detail), cell(`Grade ${record.grade}`), cell(String(record.students)), cell(record.teacher), statusCell(record.status));
    } else if (activeTab === "students") {
      row.append(cell(record.name, true, record.detail), cell(`Grade ${record.grade}`), cell(record.className), cell("Student demo"), statusCell(record.status));
    } else {
      row.append(cell(record.name, true, record.detail), cell(record.subject), cell(record.classes), cell("Teacher demo"), statusCell(record.status));
    }
    body.append(row);
  });
  if (!filtered.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty-row";
    td.textContent = "No matching demo records. Try changing your search or grade filter.";
    row.append(td);
    body.append(row);
  }
  $("resultCount").textContent = `Showing ${filtered.length} of ${records.length} demo ${activeTab} records`;
  $("gradeFilter").hidden = activeTab === "teachers";
  document.querySelectorAll("[data-tab]").forEach(button => {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  $("addButtonText").textContent = activeTab === "classes" ? "Add class" : activeTab === "students" ? "Add student" : "Add teacher";
  $("gradeCount").textContent = new Set(sample.classes.map(item => item.grade)).size;
  $("classCount").textContent = sample.classes.length;
  $("studentCount").textContent = sample.students.length;
  $("teacherCount").textContent = sample.teachers.length;
}
function openEntryDialog() {
  const dialog = $("recordDialog");
  const isClass = activeTab === "classes";
  $("dialogTitle").textContent = isClass ? "Add class" : activeTab === "students" ? "Add student" : "Add teacher";
  $("nameLabel").textContent = isClass ? "Class name" : activeTab === "students" ? "Student display name" : "Teacher display name";
  $("recordName").placeholder = isClass ? "e.g. Section B" : activeTab === "students" ? "e.g. Sample Student 07" : "e.g. Sample Teacher 02";
  $("gradeLabel").hidden = activeTab === "teachers";
  $("recordGrade").hidden = activeTab === "teachers";
  $("recordName").value = "";
  $("formFeedback").textContent = "";
  dialog.showModal();
  $("recordName").focus();
}
function closeDialog() { $("recordDialog").close(); }
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
  activeTab = button.dataset.tab;
  $("searchInput").value = "";
  $("gradeFilter").value = "all";
  render();
}));
$("searchInput").addEventListener("input", render);
$("gradeFilter").addEventListener("change", render);
$("addButton").addEventListener("click", openEntryDialog);
$("closeDialog").addEventListener("click", closeDialog);
$("cancelDialog").addEventListener("click", closeDialog);
$("recordForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("recordName").value.trim();
  if (!name) { $("formFeedback").textContent = "Please enter a name."; return; }
  if (activeTab === "classes") {
    const grade = $("recordGrade").value;
    if (sample.classes.some(item => item.name.toLowerCase() === name.toLowerCase() && item.grade === grade)) {
      $("formFeedback").textContent = "That demo class already exists in this grade.";
      return;
    }
    sample.classes.push({name,grade,students:0,teacher:"Not assigned",status:"Active",detail:"Added in this temporary demo"});
  } else if (activeTab === "students") {
    sample.students.push({name,grade:$("recordGrade").value,className:"Not assigned",status:"Active",detail:"Added in this temporary demo"});
  } else {
    sample.teachers.push({name,subject:"Not assigned",classes:"Not assigned",status:"Active",detail:"Added in this temporary demo"});
  }
  closeDialog();
  render();
});
$("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
render();