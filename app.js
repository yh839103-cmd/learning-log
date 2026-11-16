// 我的學習紀錄：Supabase 登入 + 每人只看自己的紀錄（RLS）
// 延伸功能：編輯、學習時數、分類標籤、連續打卡、搜尋、深色模式
const $ = (id) => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const TAGS = ["程式", "英文", "數學", "專業課", "其他"];
const DAY = 24 * 60 * 60 * 1000;

let allLogs = [];      // 目前使用者的全部紀錄
let tagFilter = "全部"; // 目前選的分類

function showMsg(text, isError = false) {
  const m = $("msg");
  m.textContent = text;
  m.classList.toggle("error", isError);
  m.classList.toggle("hidden", !text);
}

// --- 深色模式（不需要登入也能切換） ---
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("themeBtn").textContent = theme === "dark" ? "☀️" : "🌙";
}
let savedTheme = null;
try { savedTheme = localStorage.getItem("theme"); } catch (_) {}
applyTheme(savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (_) {}
});

// --- 檢查設定 ---
const url = (cfg.SUPABASE_URL || "").trim();
const key = (cfg.SUPABASE_PUBLISHABLE_KEY || "").trim();
if (key.startsWith("sb_secret_") || key.includes("service_role")) {
  showMsg("⚠️ config.js 填的是 secret key！請改用 publishable key，並到 Supabase 作廢這把 secret key。", true);
  throw new Error("secret key in config");
}
if (!url.startsWith("https://") || url.includes("你的專案") || !key || key.includes("貼在這裡")) {
  showMsg("設定還沒完成：請在 config.js 填入 Project URL 和 publishable key。", true);
  throw new Error("config not set");
}

const sb = window.supabase.createClient(url, key);

// 分類選單與篩選按鈕
function fillTagSelect(select, value = "其他") {
  select.innerHTML = "";
  for (const t of TAGS) {
    const o = document.createElement("option");
    o.value = o.textContent = t;
    if (t === value) o.selected = true;
    select.append(o);
  }
}
fillTagSelect($("tag"), "程式");

function renderChips() {
  const box = $("tagFilter");
  box.innerHTML = "";
  for (const t of ["全部", ...TAGS]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (t === tagFilter ? " on" : "");
    b.textContent = t;
    b.addEventListener("click", () => { tagFilter = t; renderChips(); renderList(); });
    box.append(b);
  }
}

// --- 畫面切換 ---
function render(session) {
  const loggedIn = !!session;
  $("authView").classList.toggle("hidden", loggedIn);
  $("appView").classList.toggle("hidden", !loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("userEmail").textContent = loggedIn ? session.user.email : "";
  if (loggedIn) { renderChips(); loadLogs(); } else { allLogs = []; }
}

// --- 登入 / 註冊 / 登出 ---
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginBtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(), password: $("password").value,
  });
  $("loginBtn").disabled = false;
  showMsg(error ? "登入失敗：" + error.message : "", !!error);
});

$("signupBtn").addEventListener("click", async () => {
  const email = $("email").value.trim(), password = $("password").value;
  if (!email || password.length < 6) return showMsg("請輸入 Email 和至少 6 碼密碼。", true);
  $("signupBtn").disabled = true;
  const { data, error } = await sb.auth.signUp({ email, password });
  $("signupBtn").disabled = false;
  if (error) return showMsg("註冊失敗：" + error.message, true);
  showMsg(data.session ? "註冊成功，已登入！" : "註冊成功！請到信箱點確認信後再登入。");
});

$("logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  showMsg("已登出。");
});

// --- 讀取 ---
async function loadLogs() {
  const { data, error } = await sb.from("learning_logs")
    .select("id, title, note, minutes, tag, created_at")
    .order("created_at", { ascending: false });
  if (error) return showMsg("讀取失敗：" + error.message + "（可能要重跑 schema.sql）", true);
  allLogs = data;
  renderStats();
  renderList();
}

// --- 統計：連續天數、最近 7 天筆數與時數 ---
const dayKey = (d) => new Date(d).toLocaleDateString("sv-SE"); // YYYY-MM-DD（本地時間）

function renderStats() {
  const since = Date.now() - 7 * DAY;
  const recent = allLogs.filter((l) => new Date(l.created_at).getTime() >= since);
  const mins = recent.reduce((sum, l) => sum + (l.minutes || 0), 0);
  $("statCount").textContent = recent.length;
  $("statTime").textContent = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? (mins % 60) + "m" : ""}` : `${mins}m`;

  // 連續打卡：從今天往回數；今天還沒寫就從昨天開始算
  const days = new Set(allLogs.map((l) => dayKey(l.created_at)));
  let cursor = Date.now();
  if (!days.has(dayKey(cursor))) cursor -= DAY;
  let streak = 0;
  while (days.has(dayKey(cursor))) { streak++; cursor -= DAY; }
  $("statStreak").textContent = streak;
}

// --- 清單（套用搜尋與分類篩選） ---
function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const shown = allLogs.filter((l) =>
    (tagFilter === "全部" || l.tag === tagFilter) &&
    (!q || l.title.toLowerCase().includes(q) || (l.note || "").toLowerCase().includes(q))
  );

  const list = $("logList");
  list.innerHTML = "";
  for (const log of shown) list.append(viewItem(log));

  $("count").textContent = shown.length === allLogs.length
    ? `（${allLogs.length} 筆）` : `（${shown.length} / ${allLogs.length} 筆）`;
  const empty = $("empty");
  empty.textContent = allLogs.length ? "沒有符合的紀錄。" : "還沒有紀錄，先存一筆吧！";
  empty.classList.toggle("hidden", shown.length > 0);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function viewItem(log) {
  const li = el("li");
  const box = el("div");
  const d = el("div", "d");
  d.append(el("span", "badge", log.tag || "其他"));
  if (log.minutes) d.append(el("span", "", `⏱️ ${log.minutes} 分鐘`));
  d.append(el("span", "", new Date(log.created_at).toLocaleString("zh-TW")));
  box.append(el("div", "t", log.title), el("div", "n", log.note || ""), d);

  const actions = el("div", "actions");
  const edit = el("button", "ghost small", "編輯");
  edit.addEventListener("click", () => li.replaceWith(editItem(log)));
  const del = el("button", "danger small", "刪除");
  del.addEventListener("click", () => deleteLog(log.id));
  actions.append(edit, del);

  li.append(box, actions);
  return li;
}

// --- 編輯（就地展開表單） ---
function editItem(log) {
  const li = el("li", "editing");
  const form = el("form");
  const title = el("input"); title.value = log.title; title.required = true; title.maxLength = 100;
  const minutes = el("input"); minutes.type = "number"; minutes.min = 0; minutes.max = 1440; minutes.step = 5; minutes.value = log.minutes || 0;
  const tag = el("select"); fillTagSelect(tag, log.tag || "其他");
  const note = el("textarea"); note.rows = 3; note.maxLength = 2000; note.value = log.note || "";

  const lbl = (text, input) => { const l = el("label", "", text + " "); l.append(input); return l; };
  const two = el("div", "row two"); two.append(lbl("分鐘", minutes), lbl("分類", tag));
  const btns = el("div", "row");
  const save = el("button", "", "儲存修改"); save.type = "submit";
  const cancel = el("button", "ghost", "取消"); cancel.type = "button";
  cancel.addEventListener("click", () => li.replaceWith(viewItem(log)));
  btns.append(save, cancel);
  form.append(lbl("標題", title), two, lbl("心得", note), btns);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    save.disabled = true;
    const { error } = await sb.from("learning_logs").update({
      title: title.value.trim(),
      note: note.value.trim() || null,
      minutes: Math.max(0, Math.min(1440, parseInt(minutes.value, 10) || 0)),
      tag: tag.value,
    }).eq("id", log.id);
    save.disabled = false;
    if (error) return showMsg("修改失敗：" + error.message, true);
    showMsg("");
    loadLogs();
  });

  li.append(form);
  return li;
}

// --- 新增 / 刪除 ---
$("logForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.from("learning_logs").insert({
    title: $("title").value.trim(),
    note: $("note").value.trim() || null,
    minutes: Math.max(0, Math.min(1440, parseInt($("minutes").value, 10) || 0)),
    tag: $("tag").value,
  });
  btn.disabled = false;
  if (error) return showMsg("儲存失敗：" + error.message, true);
  $("title").value = ""; $("note").value = "";
  showMsg("");
  loadLogs();
});

async function deleteLog(id) {
  const { error } = await sb.from("learning_logs").delete().eq("id", id);
  if (error) return showMsg("刪除失敗：" + error.message, true);
  loadLogs();
}

$("search").addEventListener("input", renderList);

// --- 啟動 ---
sb.auth.getSession().then(({ data }) => render(data.session));
sb.auth.onAuthStateChange((_event, session) => render(session));
