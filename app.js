// ── Default goals ──────────────────────────────────────────────────────────────
const DEFAULT_GOALS = [
  {cat:"NEED",  name:"O Levels electricity concepts",       est:7},
  {cat:"NEED",  name:"O Levels & Poly math",                est:30},
  {cat:"NEED",  name:"Basic HTML/Python/CSS",               est:25},
  {cat:"GOOD",  name:"Feynman-level electricity explanations", est:10},
  {cat:"GOOD",  name:"Basic JS + Odin first project",       est:10},
  {cat:"GOOD",  name:"O Levels physics",                    est:4},
  {cat:"GOOD",  name:"Poly module concepts + flashcards",   est:6},
  {cat:"EXTRA", name:"Internship concepts review",          est:4},
  {cat:"EXTRA", name:"Overview of all modules",             est:3},
  {cat:"EXTRA", name:"Uni module concepts",                 est:7},
  {cat:"EXTRA", name:"Uni module flashcards",               est:5},
  {cat:"EXTRA", name:"Prompting & AI",                      est:2},
  {cat:"FUN",   name:"5 electricians",                      est:3},
  {cat:"FUN",   name:"Inventions",                          est:3},
  {cat:"FUN",   name:"Veritasium",                          est:6},
  {cat:"FUN",   name:"Code Parade",                         est:10},
  {cat:"FUN",   name:"Excel fix",                           est:4}
];

const CAT_COLORS = {
  NEED: "#ff6b6b", GOOD: "#ffd166", EXTRA: "#74b3ff", FUN: "#56e39f"
};

// ── State ──────────────────────────────────────────────────────────────────────
function getDefaultSettings() {
  return {
    startDate: "2026-05-07",
    endDate: "2026-07-25",
    dailyTarget: 2
  };
}

function loadState() {
  const raw = localStorage.getItem("uni_v3");
  if (raw) {
    try { const p = JSON.parse(raw); if (p && p.version === 3) return p; } catch(e) {}
  }
  const v2 = localStorage.getItem("uni_v2");
  if (v2) {
    try {
      const g = JSON.parse(v2).map(x => ({
        cat: x.cat, name: x.name, est: x.est, done: x.done || 0,
        pinned: false, subtasks: [],
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      }));
      const s = { version: 3, goals: g, settings: getDefaultSettings(), dailyLog: {} };
      localStorage.setItem("uni_v3", JSON.stringify(s));
      return s;
    } catch(e) {}
  }
  const old = localStorage.getItem("uni");
  const h = old ? JSON.parse(old) : {};
  const g = DEFAULT_GOALS.map(x => ({
    cat: x.cat, name: x.name, est: x.est, done: h[x.name] || 0,
    pinned: false, subtasks: [],
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  }));
  const s = { version: 3, goals: g, settings: getDefaultSettings(), dailyLog: {} };
  localStorage.setItem("uni_v3", JSON.stringify(s));
  return s;
}

let state = loadState();
let goals = state.goals;
let activeFilter = "ALL";
let expandedSet = new Set();

function save() {
  state.goals = goals;
  localStorage.setItem("uni_v3", JSON.stringify(state));
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function visibleGoals() {
  let list = [...goals];
  if (activeFilter === "SORT_PROGRESS") {
    list.sort((a, b) => (a.done/a.est) - (b.done/b.est));
  } else if (activeFilter === "SORT_SHORT") {
    list.sort((a, b) => a.est - b.est);
  } else if (activeFilter !== "ALL") {
    list = list.filter(g => g.cat === activeFilter);
  }
  return list;
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const total = goals.reduce((s,g) => s + g.est,  0);
  const done  = goals.reduce((s,g) => s + g.done, 0);
  const pct   = total ? ((done/total)*100).toFixed(1) : 0;

  document.getElementById("progressText").textContent = done.toFixed(2) + " / " + total + " hrs";
  document.getElementById("fill").style.width = pct + "%";
  document.getElementById("percent").textContent = pct + "% Complete";
  document.getElementById("planned").textContent = total + "h";
  document.getElementById("buffer").textContent  = (178-total).toFixed(0) + "h";

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  visibleGoals().forEach(g => {
    const idx  = goals.indexOf(g);
    const pct2 = g.est ? Math.min((g.done/g.est)*100, 100) : 0;

    const div = document.createElement("div");
    div.className = "goal";
    div.dataset.cat = g.cat;
    div.dataset.idx = idx;

    const isExpanded = expandedSet.has(idx);
    const allocated = g.subtasks ? g.subtasks.reduce((s, x) => s + x.est, 0) : 0;
    const unallocated = Math.max(0, g.est - allocated);

    div.innerHTML = `
      <div class="goal-top">
        <div class="goal-meta">
          <div class="goal-cat">${escHtml(g.cat)}</div>
          <div class="goal-name">${escHtml(g.name)}</div>
        </div>
        <div class="goal-hours">
          <div class="goal-hours-val">${g.done.toFixed(1)} / ${g.est}</div>
          <div class="goal-hours-label">hours</div>
        </div>
        <button class="btn-expand" data-idx="${idx}">${isExpanded ? '▲' : '▼'}</button>
      </div>
      <div class="goal-bar-track">
        <div class="goal-bar-fill" style="width:${pct2}%"></div>
      </div>
      <div class="goal-footer">
        <span class="goal-pct">${pct2.toFixed(0)}%</span>
        ${unallocated > 0 ? `<span class="goal-unalloc">${unallocated.toFixed(1)}h unallocated</span>` : ''}
        <div class="goal-actions">
          <input class="goal-input goal-time-input" data-idx="${idx}"
            type="number" min="0" step="1" placeholder="mins" />
          <button class="btn-time sub" data-idx="${idx}" data-action="sub" title="Subtract">−</button>
          <button class="btn-time add" data-idx="${idx}" data-action="add" title="Add">+</button>
        </div>
      </div>
      ${isExpanded ? `<div class="goal-subtasks">${renderSubtasksHtml(g, idx)}</div>` : ''}
    `;

    // Long press logic
    let pressTimer = null;
    let didLongPress = false;

    function startPress() {
      didLongPress = false;
      div.classList.add("pressing");
      pressTimer = setTimeout(() => {
        didLongPress = true;
        div.classList.remove("pressing");
        openEditModal(idx);
      }, 500);
    }

    function cancelPress() {
      clearTimeout(pressTimer);
      div.classList.remove("pressing");
    }

    div.addEventListener("touchstart",  startPress,  { passive: true });
    div.addEventListener("touchend",    cancelPress);
    div.addEventListener("touchmove",   cancelPress, { passive: true });
    div.addEventListener("mousedown",   startPress);
    div.addEventListener("mouseup",     cancelPress);
    div.addEventListener("mouseleave",  cancelPress);

    grid.appendChild(div);
  });
}

// ── Grid click delegation (time, expand, subtasks) ─────────────────────────────
document.getElementById("grid").addEventListener("click", function(e) {
  // Expand / collapse
  const expandBtn = e.target.closest(".btn-expand");
  if (expandBtn) {
    e.stopPropagation();
    const idx = parseInt(expandBtn.dataset.idx, 10);
    expandedSet.has(idx) ? expandedSet.delete(idx) : expandedSet.add(idx);
    render();
    return;
  }

  // Time buttons (main + subtask)
  const btn = e.target.closest(".btn-time");
  if (btn) {
    e.stopPropagation();
    const idx = parseInt(btn.dataset.idx, 10);
    const g = goals[idx];
    if (!g) return;

    const container = btn.closest(".goal-actions, .subtask-actions");
    const input = container.querySelector(".goal-time-input, .subtask-time-input");
    const val = parseFloat(input ? input.value : 0);
    if (isNaN(val) || val <= 0) return;
    const hrs = val / 60;

    const sidx = btn.dataset.sidx;
    if (sidx !== undefined) {
      const st = g.subtasks[parseInt(sidx, 10)];
      if (!st) return;
      st.done = Math.max(0, st.done + (btn.dataset.action === "add" ? hrs : -hrs));
    } else {
      g.done = Math.max(0, g.done + (btn.dataset.action === "add" ? hrs : -hrs));
    }

    g.lastModified = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);
    state.dailyLog[today] = (state.dailyLog[today] || 0) + hrs;
    save();
    if (input) input.value = "";
    render();
    return;
  }

  // Delete subtask
  const delBtn = e.target.closest(".btn-subtask-del");
  if (delBtn) {
    e.stopPropagation();
    const idx = parseInt(delBtn.dataset.idx, 10);
    const sidx = parseInt(delBtn.dataset.sidx, 10);
    const g = goals[idx];
    if (!g || !g.subtasks[sidx]) return;
    if (!confirm(`Delete "${g.subtasks[sidx].name}"?`)) return;
    g.subtasks.splice(sidx, 1);
    g.lastModified = new Date().toISOString();
    save();
    render();
    return;
  }
});

// ── Enter-to-Add (press Enter in time input → trigger +) ──────────────────────
document.getElementById("grid").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    const input = e.target.closest(".goal-time-input, .subtask-time-input");
    if (input) {
      e.preventDefault();
      const container = input.closest(".goal-actions, .subtask-actions");
      const addBtn = container.querySelector(".btn-time.add");
      if (addBtn) addBtn.click();
    }
  }
});

// ── Filter bar ─────────────────────────────────────────────────────────────────
document.querySelector(".filter-bar").addEventListener("click", function(e) {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  render();
});

// ── Edit Modal ─────────────────────────────────────────────────────────────────
let editTarget = null;

function openEditModal(idx) {
  editTarget = idx;
  const g = goals[idx];
  document.getElementById("editName").value = g.name;
  document.getElementById("editCat").value  = g.cat;
  document.getElementById("editEst").value  = g.est;
  document.getElementById("editModal").classList.add("open");
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById("editModal")) return;
  document.getElementById("editModal").classList.remove("open");
  editTarget = null;
}

function saveEdit() {
  if (editTarget === null) return;
  const g = goals[editTarget];
  if (!g) return;
  const newName = document.getElementById("editName").value.trim();
  const newCat  = document.getElementById("editCat").value;
  const newEst  = parseFloat(document.getElementById("editEst").value);
  if (!newName || isNaN(newEst) || newEst <= 0) return;
  if (newName !== g.name && goals.some(x => x.name === newName)) {
    alert("A goal with that name already exists."); return;
  }
  g.name = newName; g.cat = newCat; g.est = newEst;
  save();
  document.getElementById("editModal").classList.remove("open");
  editTarget = null;
  render();
}

function confirmDelete() {
  if (editTarget === null) return;
  const name = goals[editTarget].name;
  if (!confirm('Delete "' + name + '"?')) return;
  goals.splice(editTarget, 1);
  save();
  document.getElementById("editModal").classList.remove("open");
  editTarget = null;
  render();
}

// ── Add Modal ──────────────────────────────────────────────────────────────────
function openAddModal() {
  document.getElementById("addName").value = "";
  document.getElementById("addCat").value  = "NEED";
  document.getElementById("addEst").value  = "5";
  document.getElementById("addModal").classList.add("open");
  setTimeout(() => document.getElementById("addName").focus(), 100);
}

function closeAddModal(e) {
  if (e && e.target !== document.getElementById("addModal")) return;
  document.getElementById("addModal").classList.remove("open");
}

function confirmAdd() {
  const name = document.getElementById("addName").value.trim();
  const cat  = document.getElementById("addCat").value;
  const est  = parseFloat(document.getElementById("addEst").value);
  if (!name) { alert("Please enter a name."); return; }
  if (goals.some(g => g.name === name)) { alert("Name already exists."); return; }
  if (isNaN(est) || est <= 0) { alert("Enter a valid hours estimate."); return; }
  goals.push({ cat, name, est, done: 0, pinned: false, subtasks: [], createdAt: new Date().toISOString(), lastModified: new Date().toISOString() });
  save();
  document.getElementById("addModal").classList.remove("open");
  render();
}

// ── Overview (long press on progress bar) ─────────────────────────────────────
let progressPressTimer = null;

document.getElementById("progressCard").addEventListener("touchstart", function() {
  progressPressTimer = setTimeout(openOverview, 500);
}, { passive: true });

document.getElementById("progressCard").addEventListener("touchend",  function() { clearTimeout(progressPressTimer); });
document.getElementById("progressCard").addEventListener("touchmove", function() { clearTimeout(progressPressTimer); }, { passive: true });
document.getElementById("progressCard").addEventListener("mousedown", function() {
  progressPressTimer = setTimeout(openOverview, 500);
});
document.getElementById("progressCard").addEventListener("mouseup",   function() { clearTimeout(progressPressTimer); });

function openOverview() {
  const total = goals.reduce((s,g) => s + g.est,  0);
  const done  = goals.reduce((s,g) => s + g.done, 0);
  const remaining = total - done;

  const catTotals = {};
  goals.forEach(g => {
    if (!catTotals[g.cat]) catTotals[g.cat] = { done: 0, est: 0 };
    catTotals[g.cat].done += g.done;
    catTotals[g.cat].est  += g.est;
  });

  let statsHtml = '<div class="overview-stats">';
  statsHtml += `<div class="ov-stat"><div class="ov-stat-label">Done</div><div class="ov-stat-val">${done.toFixed(1)}h</div></div>`;
  statsHtml += `<div class="ov-stat"><div class="ov-stat-label">Remaining</div><div class="ov-stat-val">${remaining.toFixed(1)}h</div></div>`;

  Object.entries(catTotals).forEach(([cat, v]) => {
    const p = v.est ? ((v.done/v.est)*100).toFixed(0) : 0;
    const col = CAT_COLORS[cat] || "#fff";
    statsHtml += `<div class="ov-stat"><div class="ov-stat-label" style="color:${col}">${cat}</div><div class="ov-stat-val">${p}%</div></div>`;
  });

  statsHtml += '</div>';

  // Sort goals by least progress for the overview list
  const sorted = [...goals].sort((a,b) => (a.done/a.est) - (b.done/b.est));

  let listHtml = '<div class="ov-list">';
  sorted.forEach(g => {
    const p   = g.est ? Math.min((g.done/g.est)*100, 100) : 0;
    const col = CAT_COLORS[g.cat] || "#fff";
    listHtml += `
      <div class="ov-row">
        <div class="ov-dot" style="background:${col}"></div>
        <div class="ov-name">${escHtml(g.name)}</div>
        <div class="ov-bar-wrap"><div class="ov-bar-fill" style="width:${p}%;background:${col}"></div></div>
        <div class="ov-pct">${p.toFixed(0)}%</div>
      </div>`;
  });
  listHtml += '</div>';

  document.getElementById("overviewContent").innerHTML = statsHtml + listHtml;
  document.getElementById("overviewModal").classList.add("open");
}

function closeOverview(e) {
  if (e && e.target !== document.getElementById("overviewModal")) return;
  document.getElementById("overviewModal").classList.remove("open");
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    ["editModal","addModal","overviewModal"].forEach(id =>
      document.getElementById(id).classList.remove("open")
    );
  }
  if (e.key === "Enter") {
    if (document.getElementById("editModal").classList.contains("open")) saveEdit();
    if (document.getElementById("addModal").classList.contains("open"))  confirmAdd();
  }
});

// ── Export / Import ────────────────────────────────────────
function exportData() {
  const payload = {
    app: "uni-time",
    version: 1,
    exportedAt: new Date().toISOString(),
    goals: goals
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `uni-time-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData() {
  document.getElementById("importPicker").click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);

      let imported;
      if (Array.isArray(data)) {
        imported = data;
      } else if (data && data.app === "uni-time" && Array.isArray(data.goals)) {
        imported = data.goals;
      } else {
        alert("Invalid backup file. Expected a goals array or a uni-time backup.");
        return;
      }

      for (const g of imported) {
        if (!g.cat || !g.name || typeof g.est !== "number" || typeof g.done !== "number") {
          alert("Invalid goal data in file.");
          return;
        }
      }

      if (!confirm(`Import ${imported.length} goals? This will replace your current data.`)) return;

      const now = new Date().toISOString();
      goals.length = 0;
      imported.forEach(g => {
        goals.push({
          cat: g.cat, name: g.name, est: g.est, done: g.done || 0,
          pinned: g.pinned || false,
          subtasks: g.subtasks || [],
          createdAt: g.createdAt || now,
          lastModified: g.lastModified || now
        });
      });
      save();
      render();
    } catch (err) {
      alert("Could not read file: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// ── Subtask helpers ─────────────────────────────────────────
function renderSubtasksHtml(goal, idx) {
  let html = '';
  if (goal.subtasks && goal.subtasks.length > 0) {
    goal.subtasks.forEach((st, si) => {
      const p = st.est ? Math.min((st.done / st.est) * 100, 100) : 0;
      html += `
        <div class="subtask-row">
          <div class="subtask-info">
            <span class="subtask-name">${escHtml(st.name)}</span>
            <span class="subtask-hours">${st.done.toFixed(1)} / ${st.est}h</span>
            <span class="subtask-pct">${p.toFixed(0)}%</span>
          </div>
          <div class="subtask-bar-track">
            <div class="subtask-bar-fill" style="width:${p}%"></div>
          </div>
          <div class="subtask-actions">
            <input class="goal-input subtask-time-input" data-idx="${idx}" data-sidx="${si}"
              type="number" min="0" step="1" placeholder="mins" />
            <button class="btn-time sub" data-idx="${idx}" data-sidx="${si}" data-action="sub" title="Subtract">−</button>
            <button class="btn-time add" data-idx="${idx}" data-sidx="${si}" data-action="add" title="Add">+</button>
            <button class="btn-subtask-del" data-idx="${idx}" data-sidx="${si}" title="Delete">✕</button>
          </div>
        </div>`;
    });
  }
  const allocated = goal.subtasks ? goal.subtasks.reduce((s, st) => s + st.est, 0) : 0;
  const unallocated = Math.max(0, goal.est - allocated);
  html += `
    <div class="subtask-summary">
      <span>Allocated: ${allocated.toFixed(1)}h / ${goal.est.toFixed(1)}h</span>
      <span class="${unallocated > 0 ? 'subtask-unalloc' : 'subtask-full'}">
        ${unallocated > 0 ? `Unallocated: ${unallocated.toFixed(1)}h` : 'Fully allocated'}
      </span>
    </div>
    <button class="btn-add-subtask" onclick="showAddSubtaskForm(${idx})">+ Add Subtask</button>
    <div id="subtask-form-${idx}" class="subtask-form" style="display:none">
      <input id="subtask-name-${idx}" class="modal-input" placeholder="Subtask name" />
      <div class="subtask-form-row">
        <input id="subtask-est-${idx}" class="modal-input" type="number" min="0.5" step="0.5" placeholder="Est. hours" />
        <button class="btn-save" onclick="confirmAddSubtask(${idx})">Add</button>
        <button class="btn-cancel" onclick="hideAddSubtaskForm(${idx})">Cancel</button>
      </div>
    </div>`;
  return html;
}

function showAddSubtaskForm(idx) {
  document.getElementById(`subtask-form-${idx}`).style.display = "flex";
}

function hideAddSubtaskForm(idx) {
  document.getElementById(`subtask-form-${idx}`).style.display = "none";
}

function confirmAddSubtask(idx) {
  const name = document.getElementById(`subtask-name-${idx}`).value.trim();
  const est = parseFloat(document.getElementById(`subtask-est-${idx}`).value);
  if (!name || isNaN(est) || est <= 0) { alert("Enter a name and valid hours."); return; }
  const g = goals[idx];
  g.subtasks.push({ name, est, done: 0 });
  const allocated = g.subtasks.reduce((s, st) => s + st.est, 0);
  if (allocated > g.est) g.est = allocated;
  g.lastModified = new Date().toISOString();
  save();
  render();
}

// ── Init ────────────────────────────────────────────────────
render();