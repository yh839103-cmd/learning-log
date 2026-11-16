// 我的學習紀錄：Supabase 登入 + 每人只看自己的紀錄（RLS）
const $ = (id) => document.getElementById(id);
const cfg = window.APP_CONFIG || {};

function showMsg(text, isError = false) {
  const m = $("msg");
  m.textContent = text;
  m.classList.toggle("error", isError);
  m.classList.toggle("hidden", !text);
}

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

// --- 畫面切換 ---
function render(session) {
  const loggedIn = !!session;
  $("authView").classList.toggle("hidden", loggedIn);
  $("appView").classList.toggle("hidden", !loggedIn);
  $("userBar").classList.toggle("hidden", !loggedIn);
  $("userEmail").textContent = loggedIn ? session.user.email : "";
  if (loggedIn) loadLogs();
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

// --- 讀取 / 新增 / 刪除 ---
async function loadLogs() {
  const { data, error } = await sb.from("learning_logs")
    .select("id, title, note, created_at")
    .order("created_at", { ascending: false });
  if (error) return showMsg("讀取失敗：" + error.message + "（可能要重跑 schema.sql）", true);

  const list = $("logList");
  list.innerHTML = "";
  for (const log of data) {
    const li = document.createElement("li");
    const box = document.createElement("div");
    const t = document.createElement("div"); t.className = "t"; t.textContent = log.title;
    const n = document.createElement("div"); n.className = "n"; n.textContent = log.note || "";
    const d = document.createElement("div"); d.className = "d";
    d.textContent = new Date(log.created_at).toLocaleString("zh-TW");
    box.append(t, n, d);
    const del = document.createElement("button");
    del.textContent = "刪除";
    del.addEventListener("click", () => deleteLog(log.id));
    li.append(box, del);
    list.append(li);
  }
  // 最近 7 天統計（顯示在清單上方）
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = data.filter((l) => new Date(l.created_at).getTime() >= since);
  const days = new Set(recent.map((l) => new Date(l.created_at).toLocaleDateString("zh-TW"))).size;
  let stats = $("stats");
  if (!stats) {
    stats = document.createElement("p");
    stats.id = "stats";
    stats.style.cssText = "background:#eef6f0;color:#2f6f4e;padding:10px 14px;border-radius:8px;margin:0 0 12px;font-weight:600;";
    list.before(stats);
  }
  stats.textContent = `📊 最近 7 天：${recent.length} 筆紀錄，${days} 天有學習`;

  $("count").textContent = `（${data.length} 筆）`;
  $("empty").classList.toggle("hidden", data.length > 0);
}

$("logForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.from("learning_logs").insert({
    title: $("title").value.trim(), note: $("note").value.trim() || null,
  });
  btn.disabled = false;
  if (error) return showMsg("儲存失敗：" + error.message, true);
  $("logForm").reset();
  showMsg("");
  loadLogs();
});

async function deleteLog(id) {
  const { error } = await sb.from("learning_logs").delete().eq("id", id);
  if (error) return showMsg("刪除失敗：" + error.message, true);
  loadLogs();
}

// --- 啟動 ---
sb.auth.getSession().then(({ data }) => render(data.session));
sb.auth.onAuthStateChange((_event, session) => render(session));
