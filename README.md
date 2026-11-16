# 我的學習紀錄（W11）

純 HTML/CSS/JS 網站：GitHub 存程式、Cloudflare 上線、Supabase 管登入與資料庫。

## 檔案
- `index.html` 頁面　`style.css` 樣式　`app.js` 登入與紀錄邏輯
- `config.js` 只放 Project URL 與 **publishable key**（可公開）
- `schema.sql` 在 Supabase SQL Editor 執行：建 `learning_logs` 表 + RLS 門禁

## 安全
- secret key 不進網頁、不進 GitHub、不貼給 AI。
- RLS 規則讓每個人只看得到、改得到自己的紀錄。
