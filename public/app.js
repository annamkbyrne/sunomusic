// SunoMusic front-end. Talks only to our own Netlify Functions under /api/*,
// which hold the SunoAPI key server-side.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const STORE_KEY = "sunomusic.jobs.v1";
const POLL_MS = 5000;
const MAX_WAIT_MS = 15 * 60 * 1000;
const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "TIMEOUT"]);
const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Composing",
  FIRST_SUCCESS: "Finishing",
  SUCCESS: "Ready",
  CREATE_TASK_FAILED: "Failed to start",
  GENERATE_AUDIO_FAILED: "Failed",
  CALLBACK_EXCEPTION: "Failed",
  SENSITIVE_WORD_ERROR: "Blocked content",
  TIMEOUT: "Timed out",
};

const HEROES = [
  { eyebrow: "Starter Idea", title: "Late-Night Lo-Fi", sub: "Chill beats to study to", big: "Lo-Fi\nNights", cap: "Dusty drums, warm keys and vinyl crackle.", colors: ["#4b6cb7", "#9b59b6"], prompt: "A dreamy lo-fi hip hop track for late night studying, soft piano, vinyl crackle, mellow drums" },
  { eyebrow: "Starter Idea", title: "Summer Anthem", sub: "Feel-good pop", big: "Summer\nPop", cap: "A sing-along chorus made for road trips.", colors: ["#ff5f6d", "#ffc371"], prompt: "An upbeat summer pop anthem about road-tripping with friends, catchy sing-along chorus, bright synths, female vocals" },
  { eyebrow: "Starter Idea", title: "Epic Cinematic", sub: "Orchestral score", big: "Epic\nScore", cap: "Huge strings, brass and pounding drums.", colors: ["#141e30", "#c0392b"], prompt: "An epic orchestral cinematic anthem for a fantasy battle, soaring strings, choir, thundering percussion", instrumental: true },
  { eyebrow: "Starter Idea", title: "Slow-Jam R&B", sub: "Smooth and soulful", big: "R&B\nSoul", cap: "90s-inspired grooves about first love.", colors: ["#8e2de2", "#f953c6"], prompt: "A 90s style R&B slow jam about first love, smooth male vocals, lush harmonies, laid-back groove" },
  { eyebrow: "Starter Idea", title: "Festival EDM", sub: "Big-room energy", big: "Drop\nIt", cap: "Build-ups and a massive drop.", colors: ["#00c6ff", "#7b2ff7"], prompt: "A high-energy festival EDM banger with a long build-up and a huge drop, euphoric synth leads" },
  { eyebrow: "Starter Idea", title: "Front-Porch Country", sub: "Acoustic storytelling", big: "Back\nRoads", cap: "Banjo, slide guitar and a good story.", colors: ["#c79081", "#dfa579"], prompt: "A feel-good country song about a dog who loves road trips, acoustic guitar, banjo, warm male vocals" },
];
const STYLES = ["pop", "lo-fi", "rock", "hip hop", "EDM", "jazz", "acoustic", "cinematic", "synthwave", "R&B", "afrobeats", "country"];

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  lyrics: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

// ---------- state ----------
let mode = "simple";
let vocalGender = "";
let query = "";
let jobs = load();
const pollers = new Map();

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 100))); } catch { /* storage unavailable */ }
}

// ---------- api ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

async function refreshCredits() {
  const el = $("#credits span");
  try {
    const { credits } = await api("/api/credits");
    el.textContent = `${Number(credits).toLocaleString()} credits`;
  } catch {
    el.textContent = "Credits unavailable";
  }
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDone = (s) => s === "SUCCESS" || FAILED.has(s);
function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function gradientFor(seed) {
  const h = hash(seed);
  const a = h % 360, b = (a + 40 + (h >> 9) % 80) % 360;
  return `linear-gradient(${135 + (h % 90)}deg, hsl(${a} 78% 58%), hsl(${b} 72% 42%))`;
}
function fmtTime(s) {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function setPct(range) {
  const pct = ((range.value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty("--pct", `${pct}%`);
}

// ---------- routing ----------
function route() {
  const view = location.hash === "#library" ? "library" : "create";
  $("#view-create").hidden = view !== "create";
  $("#view-library").hidden = view !== "library";
  $$("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  window.scrollTo({ top: 0 });
}

// ---------- hero cards ----------
function renderHeroes() {
  const row = $("#heroRow");
  for (const h of HEROES) {
    const card = el("button", "hero");
    card.type = "button";
    card.innerHTML = `
      <div class="eyebrow"></div>
      <div class="h-title"></div>
      <div class="h-sub"></div>
      <div class="h-art"><div class="big"></div><div class="cap"></div></div>`;
    $(".eyebrow", card).textContent = h.eyebrow;
    $(".h-title", card).textContent = h.title;
    $(".h-sub", card).textContent = h.sub;
    $(".h-art", card).style.background = `linear-gradient(135deg, ${h.colors[0]}, ${h.colors[1]})`;
    $(".big", card).innerText = h.big;
    $(".cap", card).textContent = h.cap;
    card.addEventListener("click", () => {
      setMode("simple");
      $("#prompt").value = h.prompt;
      $("#instrumental").checked = Boolean(h.instrumental);
      syncInstrumental();
      $("#makeTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => $("#prompt").focus({ preventScroll: true }), 350);
    });
    row.appendChild(card);
  }
}

// ---------- form ----------
function setMode(m) {
  mode = m;
  $$(".tabs button").forEach((t) => {
    const on = t.dataset.mode === m;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  $$(".simple-only").forEach((n) => (n.hidden = m !== "simple"));
  $$(".custom-only").forEach((n) => (n.hidden = m !== "custom"));
  syncInstrumental();
}

function syncInstrumental() {
  const inst = $("#instrumental").checked;
  $("#lyrics").disabled = inst;
  $("#lyrics").placeholder = inst ? "Instrumental — no lyrics needed" : "[Verse]\nNeon lights across the bay...\n\n[Chorus]\n...";
}

function showError(msg) {
  $("#error").textContent = msg || "";
  $("#error").hidden = !msg;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  const l = $(".label", btn) || btn;
  if (busy) {
    btn.dataset.orig = l.textContent;
    l.innerHTML = `<span class="spinner"></span> ${label}`;
  } else if (btn.dataset.orig) {
    l.textContent = btn.dataset.orig;
  }
}

function buildRequest() {
  const instrumental = $("#instrumental").checked;
  const model = $("#model").value;
  if (mode === "simple") {
    const prompt = $("#prompt").value.trim();
    if (!prompt) throw new Error("Describe the song you want, or pick a starter idea above.");
    return { customMode: false, instrumental, model, prompt };
  }
  const req = {
    customMode: true,
    instrumental,
    model,
    title: $("#title").value.trim(),
    style: $("#style").value.trim(),
    lyrics: instrumental ? undefined : $("#lyrics").value.trim(),
    negativeTags: $("#negativeTags").value.trim() || undefined,
    vocalGender: vocalGender || undefined,
  };
  if ($("#styleWeight").dataset.touched === "1") req.styleWeight = Number($("#styleWeight").value);
  if ($("#weirdness").dataset.touched === "1") req.weirdnessConstraint = Number($("#weirdness").value);
  if (!req.title) throw new Error("Give your song a title.");
  if (!req.style) throw new Error("Describe the style of music.");
  if (!instrumental && !req.lyrics) throw new Error("Add lyrics, tap “Write with AI”, or turn on Instrumental.");
  return req;
}

async function onSubmit(e) {
  e.preventDefault();
  showError("");
  let req;
  try { req = buildRequest(); } catch (err) { return showError(err.message); }

  const btn = $("#createBtn");
  setBusy(btn, true, "Starting…");
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body: JSON.stringify(req) });
    const job = { taskId, createdAt: Date.now(), label: req.title || req.prompt, style: req.style || "", status: "PENDING", tracks: [] };
    jobs.unshift(job);
    save();
    render();
    poll(job);
    refreshCredits();
    $("#recentWrap").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false);
  }
}

async function generateLyrics() {
  const prompt = $("#lyricsPrompt").value.trim() || $("#title").value.trim();
  if (!prompt) return showError("Tell the AI what the lyrics should be about.");
  showError("");
  const btn = $("#aiLyricsGo");
  setBusy(btn, true, "Writing…");
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: JSON.stringify({ prompt }) });
    const started = Date.now();
    while (Date.now() - started < 3 * 60 * 1000) {
      await sleep(3000);
      const r = await api(`/api/lyrics?taskId=${encodeURIComponent(taskId)}`);
      if (r.status === "SUCCESS" && r.lyrics.length) {
        const best = r.lyrics.find((l) => l.text) || r.lyrics[0];
        $("#lyrics").value = best.text || "";
        if (!$("#title").value.trim() && best.title) $("#title").value = best.title;
        $("#aiLyricsBox").hidden = true;
        return;
      }
      if (/FAIL|ERROR|EXCEPTION/.test(r.status)) throw new Error(r.errorMessage || "Lyrics generation failed.");
    }
    throw new Error("Lyrics are taking too long. Please try again.");
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false);
  }
}

// ---------- polling ----------
function poll(job) {
  if (pollers.has(job.taskId) || isDone(job.status)) return;
  pollers.set(job.taskId, true);
  (async () => {
    let failures = 0;
    while (!isDone(job.status)) {
      if (Date.now() - job.createdAt > MAX_WAIT_MS) { job.status = "TIMEOUT"; break; }
      try {
        const r = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
        failures = 0;
        job.status = r.status;
        job.error = r.errorMessage;
        if (r.tracks.length) job.tracks = r.tracks;
        save();
        render();
      } catch (err) {
        if (++failures >= 6) { job.status = "TIMEOUT"; job.error = err.message; break; }
      }
      if (!isDone(job.status)) await sleep(POLL_MS);
    }
    pollers.delete(job.taskId);
    save();
    render();
    refreshCredits();
  })();
}

// ---------- library data ----------
function items() {
  const out = [];
  for (const job of jobs) {
    const failed = FAILED.has(job.status);
    if (job.tracks.length) {
      for (const t of job.tracks) out.push({ job, t, failed });
    } else {
      const n = failed ? 1 : 2;
      for (let i = 0; i < n; i++) out.push({ job, t: { id: `${job.taskId}-${i}` }, failed, placeholder: true });
    }
  }
  return out;
}
const srcOf = (t) => t.audioUrl || t.streamUrl || "";
const titleOf = ({ job, t }) => t.title || job.label || "Untitled";
const subOf = ({ job, t }) => t.tags || job.style || "AI Generated";
function matches(it) {
  if (!query) return true;
  return `${titleOf(it)} ${subOf(it)} ${it.t.prompt || ""}`.toLowerCase().includes(query);
}

// ---------- rendering ----------
function artFor(it, { fab = true } = {}) {
  const art = el("div", "art");
  const { t, job } = it;
  if (it.placeholder && !it.failed) art.classList.add("shimmer");
  else if (t.imageUrl) {
    const img = el("img");
    img.alt = "";
    img.loading = "lazy";
    img.src = t.imageUrl;
    img.onerror = () => img.remove();
    art.append(img);
  }
  if (!t.imageUrl && !(it.placeholder && !it.failed)) {
    art.style.background = gradientFor(t.id || job.taskId);
    const g = el("div", "gen");
    g.textContent = titleOf(it);
    art.append(g);
  }
  if (it.failed) {
    const s = el("div", "state");
    s.textContent = STATUS_TEXT[job.status] || "Failed";
    if (job.error) s.title = job.error;
    art.append(s);
  } else if (!srcOf(t)) {
    const s = el("div", "state", `<span class="spinner"></span>`);
    s.append(STATUS_TEXT[job.status] || "Working");
    art.append(s);
  } else if (fab) {
    art.append(el("div", "overlay"));
    const b = el("button", "play-fab", isCurrent(t) && !audio.paused ? ICON.pause : ICON.play);
    b.setAttribute("aria-label", `Play ${titleOf(it)}`);
    b.addEventListener("click", (e) => { e.stopPropagation(); playItem(it); });
    art.append(b);
  }
  return art;
}

function albumTile(it) {
  const n = el("div", "album");
  if (isCurrent(it.t)) n.classList.add("playing");
  n.append(artFor(it));
  const ti = el("div", "a-title");
  ti.textContent = titleOf(it);
  const su = el("div", "a-sub");
  su.textContent = it.placeholder ? (it.failed ? "Generation failed" : "Creating…") : subOf(it);
  n.append(ti, su);
  return n;
}

function songRow(it) {
  const n = el("div", "row");
  if (isCurrent(it.t)) n.classList.add("playing");
  n.append(artFor(it));
  const tx = el("div", "r-text");
  const ti = el("div", "r-title");
  ti.textContent = titleOf(it);
  if (it.failed) ti.append(el("span", "badge failed", STATUS_TEXT[it.job.status] || "Failed"));
  else if (it.job.status !== "SUCCESS") ti.append(el("span", "badge working", srcOf(it.t) ? "Preview" : STATUS_TEXT[it.job.status] || "Working"));
  const su = el("div", "r-sub");
  su.textContent = subOf(it);
  tx.append(ti, su);
  const dur = el("div", "r-dur");
  dur.textContent = it.t.duration ? fmtTime(it.t.duration) : "";
  n.append(tx, dur, moreMenu(it));
  n.addEventListener("dblclick", () => srcOf(it.t) && playItem(it));
  return n;
}

function moreMenu(it) {
  const wrap = el("div", "menu-wrap");
  const btn = el("button", "icon-btn", ICON.more);
  btn.setAttribute("aria-label", "More");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = $(".menu", wrap);
    closeMenus();
    if (open) return;
    const m = el("div", "menu");
    const add = (icon, label, fn, disabled) => {
      const b = el("button", "", icon);
      b.append(label);
      if (disabled) b.setAttribute("aria-disabled", "true");
      b.addEventListener("click", () => { closeMenus(); fn(); });
      m.append(b);
    };
    add(ICON.play, "Play", () => playItem(it), !srcOf(it.t));
    if (it.t.audioUrl) {
      const a = el("a", "", ICON.dl);
      a.append("Download MP3");
      a.href = it.t.audioUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.download = "";
      m.append(a);
    } else add(ICON.dl, "Download MP3", () => {}, true);
    add(ICON.lyrics, "View Lyrics", () => showLyrics(it), !it.t.prompt);
    add(ICON.link, "Copy Audio Link", () => navigator.clipboard?.writeText(it.t.audioUrl), !it.t.audioUrl);
    add(ICON.trash, "Remove", () => removeJob(it.job));
    wrap.append(m);
  });
  wrap.append(btn);
  return wrap;
}
function closeMenus() { $$(".menu").forEach((m) => m.remove()); }

function showLyrics(it) {
  $("#lyricsTitle").textContent = titleOf(it);
  $("#lyricsBody").textContent = it.t.prompt || "";
  $("#lyricsDialog").showModal();
}

function removeJob(job) {
  if (!confirm(`Remove “${job.label || "this song"}” from your library?`)) return;
  jobs = jobs.filter((j) => j !== job);
  save();
  render();
}

function render() {
  const all = items();
  const visible = all.filter(matches);

  $("#recentWrap").hidden = all.length === 0;
  $("#recentShelf").replaceChildren(...all.slice(0, 12).map(albumTile));
  $("#songGrid").replaceChildren(...visible.map(songRow));

  $("#libraryGrid").replaceChildren(...visible.map(albumTile));
  $("#libraryEmpty").hidden = visible.length > 0;
  $("#emptyTitle").textContent = all.length ? "No results" : "No songs yet";
  $("#emptyText").textContent = all.length ? `Nothing matches “${query}”.` : "Songs you create will appear here.";
  $(".empty .btn", $("#view-library")).hidden = all.length > 0;
  $("#clearBtn").hidden = all.length === 0;
}

// ---------- player ----------
const audio = $("#audio");
let current = null; // { taskId, id }

const isCurrent = (t) => current && current.id === t.id;
const queue = () => items().filter((it) => srcOf(it.t));

function playItem(it) {
  if (isCurrent(it.t)) {
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
    return;
  }
  current = { taskId: it.job.taskId, id: it.t.id };
  audio.src = srcOf(it.t);
  $("#pTitle").textContent = titleOf(it);
  $("#pSub").textContent = subOf(it);
  const art = $("#pArt");
  art.replaceChildren();
  art.style.background = "";
  if (it.t.imageUrl) {
    const img = el("img");
    img.alt = "";
    img.src = it.t.imageUrl;
    art.append(img);
  } else {
    art.style.background = gradientFor(it.t.id);
  }
  const dl = $("#pDl");
  if (it.t.audioUrl) dl.href = it.t.audioUrl; else dl.removeAttribute("href");
  $("#player").dataset.empty = "false";
  audio.play().catch(() => {});
  render();
}

function step(dir) {
  const q = queue();
  if (!q.length) return;
  const i = q.findIndex((it) => isCurrent(it.t));
  const next = q[(i + dir + q.length) % q.length];
  if (next) playItem(next);
}

function syncPlayer() {
  $("#player").classList.toggle("is-playing", !audio.paused);
  $("#pPlay").setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  render();
}

audio.addEventListener("play", syncPlayer);
audio.addEventListener("pause", syncPlayer);
audio.addEventListener("ended", () => step(1));
audio.addEventListener("timeupdate", () => {
  const seek = $("#pSeek");
  if (seek.dataset.drag === "1") return;
  const d = audio.duration;
  seek.value = Number.isFinite(d) && d > 0 ? (audio.currentTime / d) * 1000 : 0;
  setPct(seek);
  $("#pCur").textContent = fmtTime(audio.currentTime);
  $("#pDur").textContent = fmtTime(d);
});
$("#pSeek").addEventListener("input", (e) => {
  e.target.dataset.drag = "1";
  setPct(e.target);
});
$("#pSeek").addEventListener("change", (e) => {
  e.target.dataset.drag = "0";
  if (Number.isFinite(audio.duration)) audio.currentTime = (e.target.value / 1000) * audio.duration;
});
$("#pVol").addEventListener("input", (e) => { audio.volume = Number(e.target.value); setPct(e.target); });
$("#pPlay").addEventListener("click", () => {
  if (!current) { const q = queue(); if (q[0]) playItem(q[0]); return; }
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
});
$("#pPrev").addEventListener("click", () => (audio.currentTime > 3 ? (audio.currentTime = 0) : step(-1)));
$("#pNext").addEventListener("click", () => step(1));

// ---------- wire up ----------
$$(".tabs button").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("#instrumental").addEventListener("change", syncInstrumental);
$("#form").addEventListener("submit", onSubmit);
$("#aiLyricsBtn").addEventListener("click", () => {
  $("#aiLyricsBox").hidden = !$("#aiLyricsBox").hidden;
  if (!$("#aiLyricsBox").hidden) $("#lyricsPrompt").focus();
});
$("#aiLyricsGo").addEventListener("click", generateLyrics);
$("#lyricsPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateLyrics(); } });

$$("#vocalGender button").forEach((b) =>
  b.addEventListener("click", () => {
    vocalGender = b.dataset.v;
    $$("#vocalGender button").forEach((x) => x.classList.toggle("active", x === b));
  })
);
for (const [id, out] of [["styleWeight", "styleWeightOut"], ["weirdness", "weirdnessOut"]]) {
  const r = $("#" + id);
  setPct(r);
  r.addEventListener("input", () => {
    r.dataset.touched = "1";
    setPct(r);
    $("#" + out).textContent = Math.round(r.value * 100) + "%";
  });
}
setPct($("#pVol"));
setPct($("#pSeek"));

for (const s of STYLES) {
  const b = el("button", "chip");
  b.type = "button";
  b.textContent = s;
  b.addEventListener("click", () => {
    const parts = $("#style").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.includes(s)) parts.push(s);
    $("#style").value = parts.join(", ");
  });
  $("#styleChips").append(b);
}

$("#search").addEventListener("input", (e) => {
  query = e.target.value.trim().toLowerCase();
  if (query && location.hash !== "#library") location.hash = "#library";
  render();
});
$("#clearBtn").addEventListener("click", () => {
  if (!confirm("Remove all songs from your library? Download anything you want to keep first.")) return;
  jobs = [];
  save();
  render();
});
$("#sideCreate").addEventListener("click", () => setTimeout(() => $("#makeTitle").scrollIntoView({ behavior: "smooth" }), 0));
$("#lyricsClose").addEventListener("click", () => $("#lyricsDialog").close());
$("#lyricsDialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
document.addEventListener("click", closeMenus);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenus();
  if (e.code === "Space" && current && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) {
    e.preventDefault();
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }
});
window.addEventListener("hashchange", route);

renderHeroes();
setMode("simple");
route();
render();
jobs.forEach(poll);
refreshCredits();
