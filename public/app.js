// SunoMusic front-end. Talks only to our own Netlify Functions under /api/*,
// which hold the SunoAPI key server-side.

const $ = (s, el = document) => el.querySelector(s);
const STORE_KEY = "sunomusic.jobs.v1";
const POLL_MS = 5000;
const MAX_WAIT_MS = 15 * 60 * 1000;
const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR", "TIMEOUT"]);
const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing music",
  FIRST_SUCCESS: "Finishing",
  SUCCESS: "Ready",
  CREATE_TASK_FAILED: "Failed to start",
  GENERATE_AUDIO_FAILED: "Generation failed",
  CALLBACK_EXCEPTION: "Failed",
  SENSITIVE_WORD_ERROR: "Blocked: sensitive content",
  TIMEOUT: "Timed out",
};

const IDEAS = [
  "A dreamy lo-fi hip hop track for late night studying",
  "An epic orchestral anthem for a fantasy battle",
  "A heartfelt acoustic ballad about missing home",
  "A high-energy EDM banger with a huge drop",
  "A 90s style R&B slow jam about first love",
  "A country song about a dog who loves road trips",
];
const STYLES = ["pop", "lo-fi", "rock", "hip hop", "EDM", "jazz", "acoustic", "cinematic", "synthwave", "R&B", "afrobeats", "country"];

// ---------- state ----------
let mode = "simple";
let vocalGender = "";
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
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

async function refreshCredits() {
  try {
    const { credits } = await api("/api/credits");
    $("#credits").textContent = `${Number(credits).toLocaleString()} credits`;
  } catch {
    $("#credits").textContent = "credits unavailable";
  }
}

// ---------- form UI ----------
function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === m;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".simple-only").forEach((el) => (el.hidden = m !== "simple"));
  document.querySelectorAll(".custom-only").forEach((el) => (el.hidden = m !== "custom"));
  syncInstrumental();
}

function syncInstrumental() {
  const inst = $("#instrumental").checked;
  $("#lyrics").disabled = inst;
  $("#lyrics").placeholder = inst ? "Instrumental — no lyrics needed" : "[Verse]\nNeon lights across the bay...\n\n[Chorus]\n...";
}

function chips(container, list, onPick) {
  for (const text of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = text;
    b.addEventListener("click", () => onPick(text));
    container.appendChild(b);
  }
}

function showError(msg) {
  const el = $("#error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  const l = btn.querySelector(".label") || btn;
  if (busy) {
    btn.dataset.orig = l.textContent;
    l.innerHTML = `<span class="spinner"></span> ${label}`;
  } else {
    l.textContent = btn.dataset.orig || l.textContent;
  }
}

function buildRequest() {
  const instrumental = $("#instrumental").checked;
  const model = $("#model").value;
  if (mode === "simple") {
    const prompt = $("#prompt").value.trim();
    if (!prompt) throw new Error("Describe the song you want.");
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
  if (!instrumental && !req.lyrics) throw new Error("Add lyrics, use “Write lyrics with AI”, or turn on Instrumental.");
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
    const job = {
      taskId,
      createdAt: Date.now(),
      label: req.title || req.prompt,
      style: req.style || "",
      status: "PENDING",
      tracks: [],
    };
    jobs.unshift(job);
    save();
    render();
    poll(job);
    refreshCredits();
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(btn, false);
  }
}

// ---------- AI lyrics ----------
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDone = (s) => s === "SUCCESS" || FAILED.has(s);

function poll(job) {
  if (pollers.has(job.taskId) || isDone(job.status)) return;
  pollers.set(job.taskId, true);
  (async () => {
    let failures = 0;
    while (!isDone(job.status)) {
      if (Date.now() - job.createdAt > MAX_WAIT_MS) {
        job.status = "TIMEOUT";
        break;
      }
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

// ---------- library rendering ----------
let current = null; // { taskId, id }

function fmtDur(s) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function render() {
  const root = $("#songs");
  root.querySelectorAll(".song").forEach((n) => n.remove());
  $("#empty").hidden = jobs.length > 0;
  $("#clearBtn").hidden = jobs.length === 0;

  const tpl = $("#songTpl");
  for (const job of jobs) {
    const failed = FAILED.has(job.status);
    const list = job.tracks.length ? job.tracks : [{ id: `${job.taskId}-a` }, { id: `${job.taskId}-b` }];
    const shown = failed && !job.tracks.length ? list.slice(0, 1) : list;

    for (const t of shown) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      const src = t.audioUrl || t.streamUrl;
      const img = $("img", node);
      if (t.imageUrl) img.src = t.imageUrl;
      $(".title", node).textContent = t.title || job.label || "Untitled";
      $(".tags", node).textContent = t.tags || job.style || "";

      const meta = $(".meta", node);
      const badge = document.createElement("span");
      badge.className = "badge";
      if (failed) {
        badge.classList.add("failed");
        badge.textContent = STATUS_TEXT[job.status] || job.status;
        if (job.error) badge.title = job.error;
      } else if (t.audioUrl && job.status === "SUCCESS") {
        badge.classList.add("ready");
        badge.textContent = "Ready";
      } else {
        badge.classList.add("working");
        badge.innerHTML = `<span class="spinner"></span> `;
        badge.append(src ? "Streaming preview" : STATUS_TEXT[job.status] || "Working");
      }
      meta.append(badge);
      if (t.duration) meta.append(fmtDur(t.duration));

      const play = $(".play", node);
      play.disabled = !src;
      if (current && current.id === t.id) {
        node.classList.add("playing");
        if (!$("#audio").paused) play.textContent = "❚❚";
      }
      play.addEventListener("click", () => playTrack(job, t));

      const dl = $(".dl", node);
      if (t.audioUrl) dl.href = t.audioUrl; else dl.setAttribute("aria-disabled", "true");

      const lyrBtn = $(".lyr", node);
      const view = $(".lyrics-view", node);
      if (t.prompt) {
        view.textContent = t.prompt;
        lyrBtn.addEventListener("click", () => (view.hidden = !view.hidden));
      } else {
        lyrBtn.hidden = true;
      }

      root.appendChild(node);
    }
  }
}

function playTrack(job, t) {
  const audio = $("#audio");
  if (current && current.id === t.id) {
    if (audio.paused) audio.play(); else audio.pause();
    return;
  }
  current = { taskId: job.taskId, id: t.id };
  audio.src = t.audioUrl || t.streamUrl;
  $("#pTitle").textContent = t.title || job.label || "Untitled";
  $("#pTags").textContent = t.tags || "";
  $("#pCover").src = t.imageUrl || "";
  $("#player").hidden = false;
  audio.play().catch(() => {});
  render();
}

// ---------- wire up ----------
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("#instrumental").addEventListener("change", syncInstrumental);
$("#form").addEventListener("submit", onSubmit);
$("#aiLyricsBtn").addEventListener("click", () => {
  $("#aiLyricsBox").hidden = !$("#aiLyricsBox").hidden;
  if (!$("#aiLyricsBox").hidden) $("#lyricsPrompt").focus();
});
$("#aiLyricsGo").addEventListener("click", generateLyrics);
$("#lyricsPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateLyrics(); } });

document.querySelectorAll("#vocalGender button").forEach((b) =>
  b.addEventListener("click", () => {
    vocalGender = b.dataset.v;
    document.querySelectorAll("#vocalGender button").forEach((x) => x.classList.toggle("active", x === b));
  })
);
for (const [id, out] of [["styleWeight", "styleWeightOut"], ["weirdness", "weirdnessOut"]]) {
  $("#" + id).addEventListener("input", (e) => {
    e.target.dataset.touched = "1";
    $("#" + out).textContent = Math.round(e.target.value * 100) + "%";
  });
}

chips($("#ideaChips"), IDEAS, (t) => { $("#prompt").value = t; $("#prompt").focus(); });
chips($("#styleChips"), STYLES, (t) => {
  const el = $("#style");
  const parts = el.value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.includes(t)) parts.push(t);
  el.value = parts.join(", ");
});

$("#clearBtn").addEventListener("click", () => {
  if (!confirm("Remove all songs from this list? (They stay downloadable only if you saved them.)")) return;
  jobs = [];
  save();
  render();
});

$("#audio").addEventListener("pause", render);
$("#audio").addEventListener("play", render);

setMode("simple");
render();
jobs.forEach(poll);
refreshCredits();
