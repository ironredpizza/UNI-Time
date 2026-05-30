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
let sortDirection = 1;
let expandedSet = new Set();
let gistToken = localStorage.getItem("uni_gist_token") || "";
let gistId = localStorage.getItem("uni_gist_id") || "";
let gistSynced = null;
let syncDebounce = null;

// Expose app API to sync.js
window.UniApp = {
  get state() { return state; },
  get goals() { return goals; },
  render
};

function save(skipYjsPush) {
  state.goals = goals;
  localStorage.setItem("uni_v3", JSON.stringify(state));
  scheduleSync();
  if (!skipYjsPush && window.YjsSync) window.YjsSync.pushState(state);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function visibleGoals() {
  let list = [...goals];
  if (activeFilter !== "ALL" && activeFilter !== "SORT_PROGRESS" && activeFilter !== "SORT_SHORT" && activeFilter !== "SORT_RECENT") {
    list = list.filter(g => g.cat === activeFilter);
  }
  const pinned = list.filter(g => g.pinned);
  const unpinned = list.filter(g => !g.pinned);
  function sortBy(cmp) {
    pinned.sort((a, b) => sortDirection * cmp(a, b));
    unpinned.sort((a, b) => sortDirection * cmp(a, b));
  }
  if (activeFilter === "SORT_PROGRESS") {
    sortBy((a, b) => (a.done/a.est) - (b.done/b.est));
  } else if (activeFilter === "SORT_SHORT") {
    sortBy((a, b) => a.est - b.est);
  } else if (activeFilter === "SORT_RECENT") {
    sortBy((a, b) => (new Date(b.lastModified||0)) - (new Date(a.lastModified||0)));
  }
  return [...pinned, ...unpinned];
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const total = goals.reduce((s,g) => s + g.est,  0);
  const done  = goals.reduce((s,g) => s + g.done, 0);
  const pct   = total ? ((done/total)*100).toFixed(1) : 0;

  document.getElementById("progressText").textContent = done.toFixed(2) + " / " + total + " hrs";
  document.getElementById("fill").style.width = pct + "%";
  document.getElementById("percent").textContent = pct + "% Complete";

  // Timeline projections
  const s = state.settings;
  const today = new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.max(1, daysBetween(s.startDate, today));
  const daysLeft = Math.max(0, daysBetween(today, s.endDate));
  const currentRate = done / daysElapsed;
  const requiredRate = daysLeft > 0 ? (total - done) / daysLeft : 0;
  const projected = currentRate > 0 ? addDays(today, Math.ceil((total - done) / currentRate)) : "—";

  document.getElementById("daysLeft").textContent = daysLeft;
  document.getElementById("dailyTarget").textContent = s.dailyTarget + "h";
  document.getElementById("rateNeeded").textContent = requiredRate.toFixed(1) + "h";
  document.getElementById("yourPace").textContent = currentRate.toFixed(1) + "h";

  // Target markers
  const totalDays = daysBetween(s.startDate, s.endDate);
  const targetTodayPct = totalDays > 0 ? Math.min(Math.round((daysElapsed / totalDays) * 100), 100) : 0;
  const dayOfWeek = new Date().getDay();
  const daysToSun = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const targetWeekPct = totalDays > 0 ? Math.min(Math.round(((daysElapsed + daysToSun) / totalDays) * 100), 100) : 0;

  const barLabels = document.getElementById("barLabels");
  if (totalDays > 0 && s.startDate && s.endDate) {
    barLabels.style.display = "";
    const lt = document.getElementById("labelToday"), lw = document.getElementById("labelWeek");
    const it = document.getElementById("lineToday"), iw = document.getElementById("lineWeek");
    lt.textContent = targetTodayPct + "%"; lt.style.left = targetTodayPct + "%";
    lw.textContent = targetWeekPct + "%"; lw.style.left = targetWeekPct + "%";
    it.style.left = targetTodayPct + "%";
    iw.style.left = targetWeekPct + "%";
  } else {
    barLabels.style.display = "none";
  }

  const suggestionEl = document.getElementById("suggestion");
  if (daysLeft === 0) {
    suggestionEl.textContent = "End date has passed. Update your schedule in Settings.";
  } else if (currentRate < requiredRate) {
    suggestionEl.innerHTML = `<span style="color:var(--need)">⚠ Speed up!</span> Averaging <b>${currentRate.toFixed(1)}h/day</b>, need <b>${requiredRate.toFixed(1)}h/day</b> to finish by ${s.endDate}.`;
  } else if (currentRate >= requiredRate && requiredRate > 0) {
    suggestionEl.innerHTML = `<span style="color:var(--fun)">✓ On track!</span> Projected finish: <b>${projected}</b> (ahead of ${s.endDate})`;
  } else {
    suggestionEl.innerHTML = `<span style="color:var(--fun)">✓ On track!</span> Keep going!`;
  }

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  visibleGoals().forEach(g => {
    const idx  = goals.indexOf(g);
    const pct2 = g.est ? Math.min((g.done/g.est)*100, 100) : 0;
    const remaining = g.est - g.done;

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
        <button class="btn-pin" data-idx="${idx}" title="${g.pinned ? 'Unpin' : 'Pin'}">${g.pinned ? '●' : '○'}</button>
      </div>
      <div class="goal-bar-track">
        <div class="goal-bar-fill" style="width:${pct2}%"></div>
      </div>
      <div class="goal-footer">
        <span class="goal-pct">${pct2.toFixed(0)}%</span>
        <span class="goal-remaining">${remaining.toFixed(1)}h left</span>
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

  // Pin toggle
  const pinBtn = e.target.closest(".btn-pin");
  if (pinBtn) {
    e.stopPropagation();
    const idx = parseInt(pinBtn.dataset.idx, 10);
    const g = goals[idx];
    if (!g) return;
    g.pinned = !g.pinned;
    g.lastModified = new Date().toISOString();
    save();
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
const LABELS = { SORT_PROGRESS: "By Progress", SORT_SHORT: "Shortest", SORT_RECENT: "Recent" };

document.querySelector(".filter-bar").addEventListener("click", function(e) {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  const filter = btn.dataset.filter;
  const isSort = filter in LABELS;
  if (isSort && activeFilter === filter) {
    sortDirection *= -1;
  } else {
    sortDirection = 1;
    activeFilter = filter;
  }
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".filter-btn[data-filter]").forEach(b => {
    const f = b.dataset.filter;
    if (f in LABELS) {
      b.textContent = f === activeFilter ? LABELS[f] + (sortDirection === 1 ? " ▲" : " ▼") : LABELS[f];
    }
  });
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

  const weeklyHtml = buildWeeklyHtml();
  document.getElementById("overviewContent").innerHTML = statsHtml + listHtml + weeklyHtml;
  document.getElementById("overviewModal").classList.add("open");
}

function closeOverview(e) {
  if (e && e.target !== document.getElementById("overviewModal")) return;
  document.getElementById("overviewModal").classList.remove("open");
}

// ── Weekly Analysis ───────────────────────────────────────────────────────────
function buildWeeklyHtml() {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hours = state.dailyLog[key] || 0;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    days.push({ key, dayName, hours });
  }
  const t = state.settings.dailyTarget;
  const total = days.reduce((s, d) => s + d.hours, 0);
  const wkTarget = t * 7;
  const pct = wkTarget > 0 ? Math.min((total/wkTarget)*100, 100) : 0;
  let html = '<div class="weekly-section"><div class="ov-stat-label" style="margin:12px 0 8px;text-align:center">Weekly Progress</div><div class="weekly-grid">';
  days.forEach(d => {
    const met = d.hours >= t;
    html += `<div class="weekly-day"><div class="weekly-day-name">${d.dayName}</div><div class="weekly-bar-wrap"><div class="weekly-bar-fill" style="width:${Math.min((d.hours/t)*100,100)}%;background:${met ? 'var(--fun)' : 'var(--need)'}"></div></div><div class="weekly-hours">${d.hours.toFixed(1)}h</div></div>`;
  });
  html += `</div><div class="weekly-total">Total: ${total.toFixed(1)}h / ${wkTarget.toFixed(1)}h (${pct.toFixed(0)}%)</div></div>`;
  return html;
}

// ── Timeline helpers ──────────────────────────────────────────────────────────
function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date.toISOString().slice(0, 10);
}

// ── Settings Modal ─────────────────────────────────────────────────────────────
function openSettingsModal() {
  document.getElementById("settingsStartDate").value = state.settings.startDate;
  document.getElementById("settingsEndDate").value = state.settings.endDate;
  document.getElementById("settingsDailyTarget").value = state.settings.dailyTarget;
  document.getElementById("githubToken").value = gistToken;
  document.getElementById("gistId").value = gistId;
  document.getElementById("gistConnectBtn").textContent = gistToken && gistId ? "Reconnect" : "Connect";
  document.getElementById("gistRemoveBtn").style.display = gistToken && gistId ? "" : "none";
  document.getElementById("gistConnectBtn").disabled = false;
  document.getElementById("settingsModal").classList.add("open");
}

function closeSettingsModal(e) {
  if (e && e.target !== document.getElementById("settingsModal")) return;
  document.getElementById("settingsModal").classList.remove("open");
}

function saveSettings() {
  const startDate = document.getElementById("settingsStartDate").value;
  const endDate = document.getElementById("settingsEndDate").value;
  const dailyTarget = parseFloat(document.getElementById("settingsDailyTarget").value);
  if (!startDate || !endDate || isNaN(dailyTarget) || dailyTarget <= 0) {
    alert("Enter valid values."); return;
  }
  if (new Date(startDate) >= new Date(endDate)) {
    alert("End date must be after start date."); return;
  }
  state.settings = { startDate, endDate, dailyTarget };
  save();
  document.getElementById("settingsModal").classList.remove("open");
  render();
}

function connectGist() {
  const token = document.getElementById("githubToken").value.trim();
  const id = document.getElementById("gistId").value.trim();
  if (!token) { alert("Enter a GitHub token."); return; }
  gistToken = token;
  localStorage.setItem("uni_gist_token", token);
  document.getElementById("gistConnectBtn").disabled = true;
  document.getElementById("gistConnectBtn").textContent = "Connecting...";
  (async () => {
    try {
      if (id) {
        gistId = id;
        localStorage.setItem("uni_gist_id", id);
        await syncToGist();
      } else {
        const payload = {
          app: "uni-time",
          exportedAt: new Date().toISOString(),
          data: { version: state.version, goals: state.goals, settings: state.settings, dailyLog: state.dailyLog }
        };
        const res = await fetch("https://api.github.com/gists", {
          method: "POST",
          headers: { Authorization: `token ${gistToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ description: "UNI Time sync data", public: false,
            files: { "uni-time.json": { content: JSON.stringify(payload, null, 2) } } })
        });
        if (!res.ok) throw new Error(`GitHub ${res.status}`);
        const gist = await res.json();
        gistId = gist.id;
        localStorage.setItem("uni_gist_id", gistId);
        document.getElementById("gistId").value = gistId;
        gistSynced = payload.exportedAt;
        updateSyncIndicator("connected");
      }
      document.getElementById("gistConnectBtn").disabled = false;
      document.getElementById("gistConnectBtn").textContent = "Reconnect";
      document.getElementById("gistRemoveBtn").style.display = "";
    } catch (e) {
      document.getElementById("gistConnectBtn").disabled = false;
      document.getElementById("gistConnectBtn").textContent = "Retry";
      updateSyncIndicator("error", e.message);
    }
  })();
}

function removeGist() {
  if (!confirm("Disconnect GitHub sync?")) return;
  gistToken = "";
  gistId = "";
  gistSynced = null;
  localStorage.removeItem("uni_gist_token");
  localStorage.removeItem("uni_gist_id");
  updateSyncIndicator("disconnected");
  document.getElementById("githubToken").value = "";
  document.getElementById("gistId").value = "";
  document.getElementById("gistConnectBtn").textContent = "Connect";
  document.getElementById("gistRemoveBtn").style.display = "none";
}

function updateSyncIndicator(status, msg) {
  const el = document.getElementById("syncIndicator");
  if (!el) return;
  el.className = "sync-indicator " + status;
  el.title = status === "connected" ? "Synced to GitHub" : status === "syncing" ? "Syncing..." : status === "error" ? "Sync error: " + (msg || "") : "Sync not configured";
}

// ── P2P Sync Modal ─────────────────────────────────────────────────────────────
function openSyncModal() {
  const phrase = window.YjsSync ? window.YjsSync.getPhrase() : null;
  document.getElementById('syncPanelNotConnected').style.display = phrase ? 'none' : '';
  document.getElementById('syncPanelConnected').style.display = phrase ? '' : 'none';
  if (phrase) {
    document.getElementById('syncPhraseDisplay').textContent = phrase;
    if (window.QRCodeUtil) {
      const url = location.origin + location.pathname + '?sync=' + encodeURIComponent(phrase);
      window.QRCodeUtil.render(url, 'qrContainer');
    }
    updateP2PStatus();
  }
  document.getElementById('syncModal').classList.add('open');
}

function closeSyncModal(e) {
  if (e && e.target !== document.getElementById('syncModal')) return;
  document.getElementById('syncModal').classList.remove('open');
}

function createSyncRoom() {
  const phrase = window.Passphrase ? window.Passphrase.generate() : 'room-' + Math.random().toString(36).slice(2, 10);
  if (window.YjsSync) {
    window.YjsSync.createRoom(phrase);
    openSyncModal();
  }
}

function joinSyncRoom() {
  const phrase = document.getElementById('syncPhraseInput').value.trim();
  if (!phrase) return;
  if (window.YjsSync) {
    window.YjsSync.createRoom(phrase);
    openSyncModal();
  }
}

function leaveSyncRoom() {
  if (!confirm('Leave sync room? Other devices will stop syncing.')) return;
  if (window.YjsSync) window.YjsSync.leaveRoom();
  openSyncModal();
}

function copySyncPhrase() {
  const text = document.getElementById('syncPhraseDisplay').textContent;
  navigator.clipboard.writeText(text).then(() => {
    // Brief toast-like feedback
    const btn = document.querySelector('.btn-copy');
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = old, 1200);
  }).catch(() => alert('Phrase: ' + text));
}

function updateP2PStatus() {
  if (!window.YjsSync) return;
  const { status, peers } = window.YjsSync.getStatus();
  const dot = document.getElementById('p2pStatusDot');
  const text = document.getElementById('p2pStatusText');
  const count = document.getElementById('p2pPeerCount');
  if (dot) dot.className = 'sync-dot ' + (status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'off');
  if (text) text.textContent = status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Offline';
  if (count) count.textContent = peers > 0 ? '(' + peers + ' peer' + (peers === 1 ? '' : 's') + ')' : '';
}

// ── Yjs P2P event listeners ────────────────────────────────────────────────────
window.addEventListener('yjs-remote-update', (e) => {
  const { goals: remoteGoals, settings: remoteSettings, dailyLog: remoteDailyLog } = e.detail;
  goals = remoteGoals;
  state.goals = goals;
  state.settings = remoteSettings;
  state.dailyLog = remoteDailyLog;
  localStorage.setItem("uni_v3", JSON.stringify(state));
  render();
});

window.addEventListener('yjs-status', (e) => {
  updateP2PStatus();
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    ["editModal","addModal","overviewModal","settingsModal","syncModal"].forEach(id =>
      document.getElementById(id).classList.remove("open")
    );
  }
  if (e.key === "Enter") {
    if (document.getElementById("editModal").classList.contains("open")) saveEdit();
    if (document.getElementById("addModal").classList.contains("open"))  confirmAdd();
  }
});

// ── GitHub Gist Sync ─────────────────────────────────────────
async function scheduleSync() {
  clearTimeout(syncDebounce);
  if (gistToken && gistId) {
    syncDebounce = setTimeout(syncToGist, 3000);
  }
}

async function syncToGist() {
  if (!gistToken || !gistId) return;
  updateSyncIndicator("syncing");
  const payload = {
    app: "uni-time",
    exportedAt: new Date().toISOString(),
    data: { version: state.version, goals: state.goals, settings: state.settings, dailyLog: state.dailyLog }
  };
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers: { Authorization: `token ${gistToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "uni-time.json": { content: JSON.stringify(payload, null, 2) } } })
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    gistSynced = payload.exportedAt;
    updateSyncIndicator("connected");
  } catch (e) {
    updateSyncIndicator("error", e.message);
  }
}

async function syncFromGist() {
  if (!gistToken || !gistId) return;
  updateSyncIndicator("syncing");
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `token ${gistToken}` }
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const gist = await res.json();
    const remote = JSON.parse(gist.files["uni-time.json"].content);
    const remoteTime = new Date(remote.exportedAt).getTime();
    const localTime = gistSynced ? new Date(gistSynced).getTime() : 0;
    if (remoteTime > localTime) {
      state = remote.data;
      localStorage.setItem("uni_v3", JSON.stringify(state));
      goals = state.goals;
      gistSynced = remote.exportedAt;
      render();
    }
    updateSyncIndicator("connected");
  } catch (e) {
    updateSyncIndicator("error", e.message);
  }
}

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

// Auto-join from URL ?sync=phrase
const urlParams = new URLSearchParams(location.search);
const syncPhrase = urlParams.get('sync');
if (syncPhrase && window.YjsSync) {
  window.YjsSync.createRoom(syncPhrase);
  history.replaceState({}, '', location.pathname);
}

// Init existing P2P sync
if (window.YjsSync) window.YjsSync.init();

// Init Gist sync
if (gistToken && gistId) syncFromGist();