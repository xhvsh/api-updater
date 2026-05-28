// configuration stuff
const GIST_ID = "ec578df51c8684fd9729ee86958c4dbc";
const GIST_FILE = "api.json";
const API_URL = `https://api.github.com/gists/${GIST_ID}`;
const LS_KEY = "gdg_key";

// Bruteforce protection
const MAX_ATTEMPTS = 3; // max failed logins
const LOCKOUT_MS = 600000; // lockout time
const ATTEMPT_KEY = "gdg_attempts";
const LOCKOUT_KEY = "gdg_lockout";

// state
let ghToken = "";
let apiData = []; // [{ phrase, explanation }, ...]
let originalData = [];
let dragSrcIdx = null;
let hasUnsaved = false;
let searchTerm = "";

// dom helpers
const $ = (id) => document.getElementById(id);

function setLoading(show, text = "Loading...") {
  $("loading-text").textContent = text;
  $("loading").style.display = show ? "flex" : "none";
}

function toast(msg, type = "info") {
  const icons = { success: "✓", error: "✗", info: "&#x2139;" };
  const el = document.createElement("div");
  el.className = `toast-item ${type}`;
  el.innerHTML = `<span>${icons[type]}</span>${escHtml(msg)}`;
  $("toast").appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function showConfirm(title, msg) {
  return new Promise((resolve) => {
    $("dialog-title").textContent = title;
    $("dialog-msg").textContent = msg;
    $("dialog").style.display = "flex";

    // Replace nodes to strip old listeners
    const yes = $("dialog-confirm");
    const no = $("dialog-cancel");
    const yesClone = yes.cloneNode(true);
    const noClone = no.cloneNode(true);
    yes.replaceWith(yesClone);
    no.replaceWith(noClone);

    const done = (val) => {
      $("dialog").style.display = "none";
      resolve(val);
    };
    $("dialog-confirm").onclick = () => done(true);
    $("dialog-cancel").onclick = () => done(false);
  });
}

function markUnsaved(val = true) {
  hasUnsaved = val;
  $("unsaved-dot").classList.toggle("show", val);
}

function deepCopy(x) {
  return JSON.parse(JSON.stringify(x));
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function autoResize(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

// silly bruteforce protection made by ai lol (its easily bypassed by clearing localStorage)

/** Returns remaining lockout ms, or 0 if not locked. */
function getLockoutRemaining() {
  const until = parseInt(localStorage.getItem(LOCKOUT_KEY) ?? "0", 10);
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Returns current failed attempt count. */
function getAttempts() {
  return parseInt(localStorage.getItem(ATTEMPT_KEY) ?? "0", 10);
}

/** Record a failed attempt; triggers lockout if limit hit. */
function recordFailedAttempt() {
  const attempts = getAttempts() + 1;
  localStorage.setItem(ATTEMPT_KEY, attempts);
  if (attempts >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, Date.now() + LOCKOUT_MS);
    localStorage.setItem(ATTEMPT_KEY, "0");
  }
}

/** Clear fail counter after a successful login. */
function clearAttempts() {
  localStorage.removeItem(ATTEMPT_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

/** Format milliseconds as "Xm Ys". */
function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** Show lockout message and count down on the error element. */
let lockoutTimer = null;

function startLockoutUI() {
  if (lockoutTimer) clearInterval(lockoutTimer);
  const errEl = $("login-error");
  const btn = $("login-btn");
  btn.disabled = true;

  lockoutTimer = setInterval(() => {
    const rem = getLockoutRemaining();
    if (rem <= 0) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
      btn.disabled = false;
      errEl.style.display = "none";
      return;
    }
    errEl.textContent = `Too many failed attempts. Try again in ${formatMs(rem)}.`;
    errEl.style.display = "block";
  }, 500);

  // Trigger immediately
  const rem = getLockoutRemaining();
  errEl.textContent = `Too many failed attempts. Try again in ${formatMs(rem)}.`;
  errEl.style.display = "block";
}

// api
async function loadGist() {
  setLoading(true, "Fetching data...");
  try {
    const res = await fetch(API_URL, {
      headers: {
        Authorization: `token ${ghToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid key.");
    }
    if (!res.ok) throw new Error(`Network error (${res.status})`);

    const json = await res.json();
    const raw = json.files?.[GIST_FILE]?.content;
    if (!raw) throw new Error("Data file not found.");

    const parsed = JSON.parse(raw);
    apiData = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    originalData = deepCopy(apiData);
    markUnsaved(false);
    renderItems();
    toast("Loaded successfully", "success");
  } catch (err) {
    toast(err.message, "error");
    throw err;
  } finally {
    setLoading(false);
  }
}

async function pushGist() {
  setLoading(true, "Pushing changes...");
  try {
    const res = await fetch(API_URL, {
      method: "PATCH",
      headers: {
        Authorization: `token ${ghToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        files: {
          [GIST_FILE]: {
            content: JSON.stringify({ data: apiData }, null, 2),
          },
        },
      }),
    });

    if (res.status === 401 || res.status === 403) throw new Error("Invalid key.");
    if (!res.ok) throw new Error(`Push failed (${res.status})`);

    originalData = deepCopy(apiData);
    markUnsaved(false);
    toast("API updated successfully!", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setLoading(false);
  }
}

// render
function renderItems() {
  const list = $("items-list");
  $("item-count").textContent = apiData.length;

  // Remove old cards, keep the empty-state div
  list.querySelectorAll(".item-card").forEach((c) => c.remove());

  const filtered = apiData.map((item, i) => ({ item, i })).filter(({ item }) => !searchTerm || item.phrase?.toLowerCase().includes(searchTerm) || item.explanation?.toLowerCase().includes(searchTerm));

  $("empty-state").style.display = apiData.length === 0 ? "flex" : "none";

  filtered.forEach(({ item, i }) => list.appendChild(buildCard(item, i)));
}

function buildCard(item, index) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.dataset.index = index;
  card.draggable = true;

  const isFirst = index === 0;
  const isLast = index === apiData.length - 1;

  card.innerHTML = `
    <div class="item-inner">
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="item-index">#${String(index + 1).padStart(2, "0")}</div>
      <div class="item-fields">
        <div class="field-row">
          <div class="field-key">phrase</div>
          <div class="field-val">
            <input
              type="text"
              class="phrase-input"
              spellcheck="false"
              placeholder="Short phrase..."
              value="${escHtml(item.phrase ?? "")}"
            />
          </div>
        </div>
        <div class="field-row">
          <div class="field-key">explanation</div>
          <div class="field-val">
            <textarea
              class="expl-textarea"
              rows="1"
              spellcheck="false"
              placeholder="Explanation..."
            >${escHtml(item.explanation ?? "")}</textarea>
          </div>
        </div>
      </div>
      <div class="item-actions">
        <button class="item-btn mv up-btn"  title="Move up"   ${isFirst ? "disabled" : ""}>↑</button>
        <button class="item-btn mv dn-btn"  title="Move down" ${isLast ? "disabled" : ""}>↓</button>
        <button class="item-btn dup dup-btn" title="Duplicate">⧉</button>
        <button class="item-btn del del-btn" title="Delete">✕</button>
      </div>
    </div>`;

  const phraseInput = card.querySelector(".phrase-input");
  const explTa = card.querySelector(".expl-textarea");

  // auto-resize explanation
  setTimeout(() => autoResize(explTa), 0);

  // prevent newlines in phrase
  phraseInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  phraseInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)
      .getData("text")
      .replace(/[\r\n]+/g, " ")
      .trim();
    document.execCommand("insertText", false, text);
  });

  phraseInput.addEventListener("input", () => {
    apiData[Number(card.dataset.index)].phrase = phraseInput.value;
    markUnsaved();
  });

  explTa.addEventListener("input", () => {
    autoResize(explTa);
    apiData[Number(card.dataset.index)].explanation = explTa.value;
    markUnsaved();
  });

  // action buttons
  card.querySelector(".del-btn").addEventListener("click", async () => {
    const i = Number(card.dataset.index);
    const ok = await showConfirm("Delete item?", `Remove #${i + 1}: "${apiData[i].phrase || "(empty)"}"?`);
    if (!ok) return;
    apiData.splice(i, 1);
    markUnsaved();
    renderItems();
    toast("Item deleted", "info");
  });

  card.querySelector(".dup-btn").addEventListener("click", () => {
    const i = Number(card.dataset.index);
    apiData.splice(i + 1, 0, deepCopy(apiData[i]));
    markUnsaved();
    renderItems();
    toast("Item duplicated", "info");
  });

  card.querySelector(".up-btn").addEventListener("click", () => {
    const i = Number(card.dataset.index);
    if (i === 0) return;
    [apiData[i - 1], apiData[i]] = [apiData[i], apiData[i - 1]];
    markUnsaved();
    renderItems();
  });

  card.querySelector(".dn-btn").addEventListener("click", () => {
    const i = Number(card.dataset.index);
    if (i >= apiData.length - 1) return;
    [apiData[i], apiData[i + 1]] = [apiData[i + 1], apiData[i]];
    markUnsaved();
    renderItems();
  });

  // drag n drop
  card.addEventListener("dragstart", (e) => {
    dragSrcIdx = Number(card.dataset.index);
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    document.querySelectorAll(".item-card").forEach((c) => c.classList.remove("drag-above", "drag-below"));
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const { top, height } = card.getBoundingClientRect();
    const mid = top + height / 2;
    document.querySelectorAll(".item-card").forEach((c) => c.classList.remove("drag-above", "drag-below"));
    card.classList.add(e.clientY < mid ? "drag-above" : "drag-below");
  });

  card.addEventListener("dragleave", () => card.classList.remove("drag-above", "drag-below"));

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-above", "drag-below");

    const targetIdx = Number(card.dataset.index);
    if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;

    const { top, height } = card.getBoundingClientRect();
    const mid = top + height / 2;
    let insertAt = e.clientY < mid ? targetIdx : targetIdx + 1;

    const [moved] = apiData.splice(dragSrcIdx, 1);
    if (insertAt > dragSrcIdx) insertAt--;
    apiData.splice(insertAt, 0, moved);

    dragSrcIdx = null;
    markUnsaved();
    renderItems();
  });

  return card;
}

// auth
async function doLogin() {
  const errEl = $("login-error");
  errEl.style.display = "none";

  // Check lockout first
  const rem = getLockoutRemaining();
  if (rem > 0) {
    startLockoutUI();
    return;
  }

  const key = $("key-input").value.trim();
  if (!key) {
    errEl.textContent = "Please enter your key.";
    errEl.style.display = "block";
    return;
  }

  ghToken = key;

  try {
    await loadGist();

    // Success — clear lockout, save if remembered
    clearAttempts();
    if ($("remember-key").checked) {
      localStorage.setItem(LS_KEY, ghToken);
    } else {
      localStorage.removeItem(LS_KEY);
    }

    // Show editor
    $("login-screen").style.display = "none";
    $("editor-screen").style.display = "flex";
    $("key-display").textContent = ghToken.slice(0, 4) + "••••" + ghToken.slice(-3);
  } catch {
    ghToken = "";
    recordFailedAttempt();

    const attempts = getAttempts();
    const newLockout = getLockoutRemaining();

    if (newLockout > 0) {
      startLockoutUI();
    } else {
      const left = MAX_ATTEMPTS - attempts;
      errEl.textContent = `Incorrect key. ${left} attempt${left !== 1 ? "s" : ""} remaining.`;
      errEl.style.display = "block";
    }
  }
}

async function doLogout() {
  if (hasUnsaved) {
    const ok = await showConfirm("Unsaved changes", "You have unsaved changes. Logout anyway?");
    if (!ok) return;
  }
  localStorage.removeItem(LS_KEY);
  ghToken = "";
  apiData = [];
  originalData = [];
  markUnsaved(false);
  $("editor-screen").style.display = "none";
  $("login-screen").style.display = "flex";
  $("key-input").value = "";
  $("login-error").style.display = "none";
  toast("Logged out", "info");
}

// init
document.addEventListener("DOMContentLoaded", () => {
  // Restore saved key
  const saved = localStorage.getItem(LS_KEY);
  if (saved) $("key-input").value = saved;

  // Resume lockout if page was refreshed mid-lockout
  if (getLockoutRemaining() > 0) startLockoutUI();

  // Toggle key visibility
  $("toggle-vis").addEventListener("click", () => {
    const inp = $("key-input");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  // Login
  $("login-btn").addEventListener("click", doLogin);
  $("key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  // Logout
  $("logout-btn").addEventListener("click", doLogout);

  // Add item
  const addItem = () => {
    apiData.push({ phrase: "", explanation: "" });
    markUnsaved();
    renderItems();
    setTimeout(() => {
      const cards = document.querySelectorAll(".item-card");
      if (cards.length) {
        cards[cards.length - 1].querySelector(".phrase-input")?.focus();
      }
    }, 50);
  };
  $("add-btn").addEventListener("click", addItem);
  $("add-btn-bottom").addEventListener("click", addItem);

  // Revert
  const revert = async () => {
    if (!hasUnsaved) return;
    const ok = await showConfirm("Revert changes", "Discard all unsaved changes?");
    if (!ok) return;
    apiData = deepCopy(originalData);
    markUnsaved(false);
    renderItems();
    toast("Changes reverted", "info");
  };
  $("cancel-btn").addEventListener("click", revert);
  $("cancel-btn-2").addEventListener("click", revert);

  // Push
  $("update-btn").addEventListener("click", pushGist);

  // Reload from API
  $("refresh-btn").addEventListener("click", async () => {
    if (hasUnsaved) {
      const ok = await showConfirm("Reload", "Unsaved changes will be lost. Continue?");
      if (!ok) return;
    }
    await loadGist();
  });

  // Search / filter
  $("search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderItems();
  });

  // Warn on accidental close with unsaved changes
  window.addEventListener("beforeunload", (e) => {
    if (hasUnsaved) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
});
