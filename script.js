// config
const SUPABASE_URL = "https://qaamikaezvpvpjfthyel.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhYW1pa2FlenZwdnBqZnRoeWVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjEzNDQsImV4cCI6MjA5NTk5NzM0NH0.ehhuxetOIiu2MTJMO4RR5hIt5RaDkfkV6_uDUbz2PqQ";
const STORAGE_KEY = "gdg_remember";

const GIST_ID = "ec578df51c8684fd9729ee86958c4dbc";
const GIST_FILE = "api.json";
const GIST_URL = `https://api.github.com/gists/${GIST_ID}`;

const PUBLIC_HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// icons
let successIcon = `<i class="fa-solid fa-circle-check"></i>`;
let errorIcon = `<i class="fa-solid fa-circle-xmark"></i>`;
let infoIcon = `<i class="fa-solid fa-circle-info"></i>`;
let warningIcon = `<i class="fa-solid fa-square-xmark"></i>`

// Public raw gist URL - no auth required, readable by anyone
const GIST_RAW_URL = "https://gist.githubusercontent.com/xhvsh/ec578df51c8684fd9729ee86958c4dbc/raw/api.json";

// states
let ghToken = "";
let apiData = [];
let originalData = [];
let dragSrcIdx = null;
let hasUnsaved = false;
let searchTerm = "";
let filterNoExpl = false;
let isGuest = false;

// remove old key system
localStorage.removeItem("gdg_key");

// helpers
const $ = (id) => document.getElementById(id);

function setLoading(show, text = "Loading...") {
  const overlay = $("loading-overlay");
  const p = overlay.querySelector("p");
  if (p) p.textContent = text;
  overlay.classList.toggle("hidden", !show);
}

/* Toast (plain, auto-dismiss) */
function toast(msg, type = "info") {
  const labels = { success: "Success", error: "Error", info: "Info" };
  const icons = { success: successIcon, error: errorIcon, info: infoIcon };
  _spawnToast(labels[type] ?? "Info", msg, type, 3400, false);
}

/* Alert toast (requires dismiss, resolves promise on close) */
function showAlert(msg, type = "info") {
  return new Promise((resolve) => {
    const labels = { success: "Done", error: "Error", info: "Note" };
    _spawnToast(labels[type] ?? "Note", msg, type, 5000, true, resolve);
  });
}

function _spawnToast(title, msg, type, duration, dismissable, onClose) {
  const icons = { success: successIcon, error: errorIcon, info: infoIcon };
  const container = $("toast");

  const el = document.createElement("div");
  el.className = `toast-item ${type}${dismissable ? " alert-toast" : ""}`;
  el.style.setProperty("--duration", duration + "ms");

  el.innerHTML = `
    <span class="toast-icon">${icons[type] ?? infoIcon}</span>
    <div class="toast-body">
      <div class="toast-title">${escHtml(title)}</div>
      <div class="toast-msg">${escHtml(msg)}</div>
    </div>
    <button class="toast-close" title="Dismiss">✕</button>
    <div class="toast-progress"></div>`;

  container.appendChild(el);

  const dismiss = () => {
    el.style.animation = "toastOut .22s ease forwards";
    setTimeout(() => {
      el.remove();
      if (onClose) onClose();
    }, 220);
  };

  el.querySelector(".toast-close").addEventListener("click", dismiss);

  // auto-dismiss
  const timer = setTimeout(dismiss, duration);
  el.querySelector(".toast-close").addEventListener("click", () => clearTimeout(timer), { once: true });
}

/* Confirm modal */
function showConfirm(title, msg) {
  return new Promise((resolve) => {
    $("confirm-message").textContent = `${title} - ${msg}`;
    $("confirm-modal").classList.remove("hidden");

    const yes = $("confirm-yes");
    const no = $("confirm-no");
    const yesClone = yes.cloneNode(true);
    const noClone = no.cloneNode(true);
    yes.replaceWith(yesClone);
    no.replaceWith(noClone);

    const done = (val) => {
      $("confirm-modal").classList.add("hidden");
      resolve(val);
    };
    $("confirm-yes").onclick = () => done(true);
    $("confirm-no").onclick = () => done(false);
    $("confirm-modal").onclick = (e) => {
      if (e.target === $("confirm-modal")) done(false);
    };
  });
}

function markUnsaved(val = true) {
  hasUnsaved = val;
  const dot = $("unsaved-dot");
  if (dot) dot.classList.toggle("show", val);
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

/* REMEMBER-ME (stores username + password) */

function saveCredentials(username, password) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password }));
  } catch (_) {}
}
function loadCredentials() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch (_) {
    return null;
  }
}
function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

/* REGISTER FIELD VALIDATION */

const USERNAME_RE = /^[a-zA-Z0-9_\.\-]+$/;

function setFieldError(inputId, errorId, msgs) {
  const input = $(inputId);
  const err   = $(errorId);
  const list = Array.isArray(msgs) ? msgs.filter(Boolean) : (msgs ? [msgs] : []);
  if (list.length > 0) {
    input.classList.add("input-invalid");
    input.classList.remove("input-valid");
    err.innerHTML = list.map(m => `<span>${warningIcon} ${m}</span>`).join("<br>");
  } else {
    input.classList.remove("input-invalid");
    if (input.value.length > 0) input.classList.add("input-valid");
    err.textContent = "";
  }
}

function clearFieldState(inputId, errorId) {
  const input = $(inputId);
  const err   = $(errorId);
  input.classList.remove("input-invalid", "input-valid");
  err.textContent = "";
}

function validateUsername(val) {
  const errors = [];
  if (!val)                          errors.push(`Username is required.`);
  else {
    if (val.length < 3)              errors.push(`Must be at least 3 characters.`);
    if (val.length > 20)             errors.push(`Must be 20 characters or fewer.`);
    if (!USERNAME_RE.test(val))      errors.push(`Only letters, numbers, _ - . allowed.`);
  }
  return errors;
}

function validatePassword(val) {
  const errors = [];
  if (!val)              errors.push(`Password is required.`);
  else {
    if (val.length < 8)  errors.push(`Must be at least 8 characters.`);
  }
  return errors;
}

function validateRepeat(pw, repeat) {
  const errors = [];
  if (!repeat)             errors.push(`Please repeat your password.`);
  else if (pw !== repeat)  errors.push(`Passwords do not match.`);
  return errors;
}

/* AUTH SCREENS */

function showScreen(id) {
  document.querySelectorAll(".auth-screen").forEach((s) => s.classList.add("hidden"));
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

/* REGISTER */

async function register() {
  const username   = $("reg-username").value.trim();
  const password   = $("reg-password").value;
  const repeat     = $("reg-repeat").value;
  const accessCode = $("reg-code").value.trim();

  // Run all validations and show errors
  const uErr = validateUsername(username);
  const pErr = validatePassword(password);
  const rErr = validateRepeat(password, repeat);
  setFieldError("reg-username", "err-username", uErr);
  setFieldError("reg-password", "err-password", pErr);
  setFieldError("reg-repeat",   "err-repeat",   rErr);
  if (uErr || pErr || rErr) return;

  if (!accessCode) return showAlert("Please enter your access code.", "error");

  setLoading(true, "Registering...");
  try {
    const res = await fetch(`${SUPABASE_URL}/register`, {
      method: "POST",
      headers: PUBLIC_HEADERS,
      body: JSON.stringify({ username, password, accessCode }),
    });
    const data = await res.json();
    if (!res.ok) return showAlert(data.error || "Registration failed.", "error");

    $("login-username").value = username;
    showScreen("login-screen");
    showAlert("Registration successful! Please log in.", "success");
  } catch (err) {
    showAlert("Network error: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

/* LOGIN */

async function login() {
  const username = $("login-username").value.trim();
  const password = $("login-password").value;
  const remember = $("remember-me").checked;

  if (!username || !password) return showAlert("Please enter your username and password.", "error");

  setLoading(true, "Logging in...");
  try {
    const res = await fetch(`${SUPABASE_URL}/login`, {
      method: "POST",
      headers: PUBLIC_HEADERS,
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAlert(data.error || "Login failed.", "error");

    const token = data.apiKey || "";
    if (remember) saveCredentials(username, password);
    else clearCredentials();

    enterApp(username, token, false, true);
  } catch (err) {
    showAlert("Network error: " + err.message, "error");
    setLoading(false);
  }
}

/* GUEST MODE */

function enterGuest() {
  isGuest = true;
  enterApp("Guest", "", true);
}

/* APP ENTRY / LOGOUT */

function enterApp(username, token, guestMode = false, keepLoading = false) {
  ghToken = token;
  isGuest = guestMode;

  $("auth-wrapper").classList.add("hidden");
  $("app").classList.remove("hidden");

  // Username display
  const userDisplay = $("logged-in-user");
  userDisplay.innerHTML = `<i class="fa-solid fa-${guestMode ? "eye" : "circle-user"}"></i> ${username}`;
  if (guestMode) userDisplay.classList.add("guest");
  else userDisplay.classList.remove("guest");

  $("welcome-username").textContent = username;

  // Status badge
  const badge = $("status-badge");
  if (guestMode) {
    badge.innerHTML = '<span class="status-dot"></span>Preview';
    badge.classList.add("preview");
  } else {
    badge.innerHTML = '<span class="status-dot"></span>Live';
    badge.classList.remove("preview");
  }

  // Guest banner
  if (guestMode) {
    loadGuestData();
  } else {
    loadGist(keepLoading);
  }

  // Push to API button
  const updateBtn = $("updateApi");
  if (guestMode) {
    updateBtn.disabled = true;
    updateBtn.classList.add("guest-disabled");
    updateBtn.title = "Login to push changes to the API";
    updateBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-lock"></i> Push to API';
  } else {
    updateBtn.disabled = false;
    updateBtn.classList.remove("guest-disabled");
    updateBtn.title = "";
    updateBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-paper-plane"></i> Push to API';
  }

  // Logout/Login button: in guest mode show "Login" with green highlight
  const logoutBtn = $("logout-btn");
  if (guestMode) {
    logoutBtn.textContent = "Login";
    logoutBtn.classList.add("guest-login-btn");
  } else {
    logoutBtn.textContent = "Logout";
    logoutBtn.classList.remove("guest-login-btn");
  }
}

async function logout() {
  if (hasUnsaved && !isGuest) {
    const ok = await showConfirm("Unsaved changes", "You have unsaved changes. Logout anyway?");
    if (!ok) return;
  }
  ghToken = "";
  apiData = [];
  originalData = [];
  isGuest = false;
  filterNoExpl = false;
  const filterBtn = $("filter-no-expl");
  if (filterBtn) filterBtn.classList.remove("active");
  markUnsaved(false);
  $("app").classList.add("hidden");
  $("auth-wrapper").classList.remove("hidden");
  showScreen("login-screen");
  $("item-container").innerHTML = `<div class="empty-state"><span>◇</span><p>No items loaded</p></div>`;
  updateCount();
  // Reset guest-specific UI
  $("guest-banner").classList.add("hidden");
  $("logged-in-user").classList.remove("guest");
  const badge = $("status-badge");
  badge.innerHTML = '<span class="status-dot"></span>Live';
  badge.classList.remove("preview");
  const updateBtn = $("updateApi");
  updateBtn.disabled = false;
  updateBtn.classList.remove("guest-disabled");
  updateBtn.title = "";
  updateBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-paper-plane"></i> Push to API';
  // Reset logout button
  const logoutBtn = $("logout-btn");
  logoutBtn.textContent = "Logout";
  logoutBtn.classList.remove("guest-login-btn");
}

/* GIST API */

async function loadGuestData() {
  const _t0 = Date.now();
  setLoading(true, "Loading preview...");
  try {
    const res = await fetch(GIST_RAW_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    const parsed = await res.json();
    apiData = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    originalData = deepCopy(apiData);
    markUnsaved(false);
    renderItems();
    toast(`Preview loaded in ${Date.now() - _t0}ms - read only`, "info");
  } catch (err) {
    toast("Could not load preview data: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

async function loadGist(continueLoading = false) {
  const _t0 = Date.now();
  setLoading(true, continueLoading ? "Loading content..." : "Fetching data...");
  try {
    const res = await fetch(GIST_URL, {
      headers: {
        Authorization: `token ${ghToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API key.");
    if (!res.ok) throw new Error(`Network error (${res.status})`);

    const json = await res.json();
    const raw = json.files?.[GIST_FILE]?.content;
    if (!raw) throw new Error("Data file not found.");

    const parsed = JSON.parse(raw);
    apiData = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
    originalData = deepCopy(apiData);
    markUnsaved(false);
    renderItems();
    toast(`Loaded successfully in ${Date.now() - _t0}ms`, "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setLoading(false);
  }
}

async function pushGist() {
  // Guard: should never be reachable for guests, but just in case
  if (isGuest) {
    toast("Login to push changes to the API.", "error");
    return;
  }

  const _t0 = Date.now();
  setLoading(true, "Pushing changes...");
  try {
    const res = await fetch(GIST_URL, {
      method: "PATCH",
      headers: {
        Authorization: `token ${ghToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        files: { [GIST_FILE]: { content: JSON.stringify({ data: apiData }, null, 2) } },
      }),
    });
    if (res.status === 401 || res.status === 403) throw new Error("Invalid API key.");
    if (!res.ok) throw new Error(`Push failed (${res.status})`);

    originalData = deepCopy(apiData);
    markUnsaved(false);
    toast(`API updated successfully in ${Date.now() - _t0}ms`, "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setLoading(false);
  }
}

/* RENDER */

function updateCount() {
  $("item-count").textContent = `${apiData.length} items`;
}

function renderItems() {
  const container = $("item-container");
  updateCount();
  container.querySelectorAll(".item-card").forEach((c) => c.remove());

  const filtered = apiData
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => {
      // text search
      if (searchTerm && !item.phrase?.toLowerCase().includes(searchTerm) && !item.explanation?.toLowerCase().includes(searchTerm)) {
        return false;
      }
      // no-explanation filter
      if (filterNoExpl && item.explanation && item.explanation.trim() !== "") {
        return false;
      }
      return true;
    });

  const empty =
    container.querySelector(".empty-state") ||
    (() => {
      const d = document.createElement("div");
      d.className = "empty-state";
      d.innerHTML = `<span>◇</span><p>No items loaded</p>`;
      container.appendChild(d);
      return d;
    })();
  empty.style.display = apiData.length === 0 ? "flex" : "none";

  filtered.forEach(({ item, i }) => container.appendChild(buildCard(item, i)));
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
      <div class="drag-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></div>
      <div class="item-index">#${String(index + 1).padStart(2, "0")}</div>
      <div class="item-fields">
        <div class="field-row">
          <div class="field-key">phrase</div>
          <div class="field-val">
            <input type="text" class="phrase-input" spellcheck="false"
              placeholder="Short phrase..." value="${escHtml(item.phrase ?? "")}" />
          </div>
        </div>
        <div class="field-row">
          <div class="field-key">explanation</div>
          <div class="field-val">
            <textarea class="expl-textarea" rows="1" spellcheck="false"
              placeholder="Explanation...">${escHtml(item.explanation ?? "")}</textarea>
          </div>
        </div>
      </div>
      <div class="item-actions">
        <button class="item-btn up-btn"  title="Move up"   ${isFirst ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
        <button class="item-btn dn-btn"  title="Move down" ${isLast ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
        <button class="item-btn dup-btn" title="Duplicate"><i class="fa-solid fa-clone"></i></button>
        <button class="item-btn del-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;

  const phraseInput = card.querySelector(".phrase-input");
  const explTa = card.querySelector(".expl-textarea");

  setTimeout(() => autoResize(explTa), 0);

  phraseInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
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

  // drag & drop
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
    document.querySelectorAll(".item-card").forEach((c) => c.classList.remove("drag-above", "drag-below"));
    card.classList.add(e.clientY < top + height / 2 ? "drag-above" : "drag-below");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-above", "drag-below"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-above", "drag-below");
    const targetIdx = Number(card.dataset.index);
    if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
    const { top, height } = card.getBoundingClientRect();
    let insertAt = e.clientY < top + height / 2 ? targetIdx : targetIdx + 1;
    const [moved] = apiData.splice(dragSrcIdx, 1);
    if (insertAt > dragSrcIdx) insertAt--;
    apiData.splice(insertAt, 0, moved);
    dragSrcIdx = null;
    markUnsaved();
    renderItems();
  });

  return card;
}

/* INIT */

document.addEventListener("DOMContentLoaded", () => {
  $("go-register").addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("register-screen");
    // Reset register form state
    ["reg-username", "reg-password", "reg-repeat"].forEach((id, i) => {
      clearFieldState(id, ["err-username", "err-password", "err-repeat"][i]);
      $(id).value = "";
    });
    $("reg-code").value = "";
  });
  $("go-login").addEventListener("click", (e) => {
    e.preventDefault();
    showScreen("login-screen");
  });

  document.querySelectorAll(".toggle-pw").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.target);
      input.type = input.type === "password" ? "text" : "password";
    });
  });

  // Live validation on register fields
  $("reg-username").addEventListener("input", () => {
    const v = $("reg-username").value.trim();
    setFieldError("reg-username", "err-username", validateUsername(v));
    if (!v) clearFieldState("reg-username", "err-username");
  });
  $("reg-password").addEventListener("input", () => {
    const v = $("reg-password").value;
    setFieldError("reg-password", "err-password", validatePassword(v));
    if (!v) clearFieldState("reg-password", "err-password");
    // Re-check repeat if already touched
    const r = $("reg-repeat").value;
    if (r) setFieldError("reg-repeat", "err-repeat", validateRepeat(v, r));
  });
  $("reg-repeat").addEventListener("input", () => {
    const r = $("reg-repeat").value;
    const p = $("reg-password").value;
    setFieldError("reg-repeat", "err-repeat", validateRepeat(p, r));
    if (!r) clearFieldState("reg-repeat", "err-repeat");
  });

  $("register-btn").addEventListener("click", register);
  $("login-btn").addEventListener("click", login);
  $("logout-btn").addEventListener("click", logout);
  $("guest-btn").addEventListener("click", enterGuest);

  // "Login to edit" link inside the guest banner goes back to login
  $("guest-login-link").addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

  ["login-username", "login-password"].forEach((id) => {
    $(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") login();
    });
  });

  $("search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderItems();
  });

  // No-explanation filter toggle
  $("filter-no-expl").addEventListener("click", () => {
    filterNoExpl = !filterNoExpl;
    $("filter-no-expl").classList.toggle("active", filterNoExpl);
    renderItems();
  });

  const addItem = () => {
    apiData.push({ phrase: "", explanation: "" });
    markUnsaved();
    renderItems();
    setTimeout(() => {
      const cards = document.querySelectorAll(".item-card");
      if (cards.length) cards[cards.length - 1].querySelector(".phrase-input")?.focus();
    }, 50);
  };
  $("addField").addEventListener("click", addItem);

  const revert = async () => {
    if (!hasUnsaved) return;
    const ok = await showConfirm("Revert changes", "Discard all unsaved changes?");
    if (!ok) return;
    apiData = deepCopy(originalData);
    markUnsaved(false);
    renderItems();
    toast("Changes reverted", "info");
  };
  $("cancelChanges").addEventListener("click", revert);

  $("updateApi").addEventListener("click", () => {
    if (isGuest) {
      toast("Login required to push changes to the API.", "error");
      return;
    }
    pushGist();
  });

  $("reloadApi").addEventListener("click", async () => {
    if (isGuest) {
      toast("Guest mode - reload is not available.", "info");
      return;
    }
    if (hasUnsaved) {
      const ok = await showConfirm("Reload", "Unsaved changes will be lost. Continue?");
      if (!ok) return;
    }
    await loadGist();
  });

  window.addEventListener("beforeunload", (e) => {
    if (hasUnsaved && !isGuest) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // Pre-fill from remember-me (no auto-login)
  const saved = loadCredentials();
  if (saved?.username) {
    $("login-username").value = saved.username;
    $("remember-me").checked = true;
  }
  if (saved?.password) {
    $("login-password").value = saved.password;
  }
});