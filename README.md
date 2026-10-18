# ICTD Risk Register — سجل المخاطر (v1.4)
Built on **SRU Secure Access Kit v1.4** (Apps Script web app limited to @sr.edu.sa + access list + access log).

| Path | Where it goes |
|---|---|
| `apps-script/Code.gs` | Apps Script → Code.gs (holds the 44 seed risks — keep off GitHub) |
| `apps-script/Index.html` | Apps Script → HTML file **Index** |
| `apps-script/Logos.html` | Apps Script → HTML file **Logos** (new) |
| `apps-script/Denied.html` | Apps Script → HTML file **Denied** (new) |
| `github-landing/` | GitHub repo `ictsru/RiskRegister` (or `ICTD/risk-register/`) → enable Pages |

Sheet: https://docs.google.com/spreadsheets/d/110jrIGTFvsEVQ8pJH0oXLtwfejDKDSLHEdT_kzF2LlY/edit

## Update steps (≈5 min, URL stays the same)
1. Sheet → Extensions → Apps Script: replace **Code.gs** and **Index**; add HTML files **Logos** and **Denied** (exact names).
2. Deploy → Manage deployments → ✏️ → Version: **New version** — Execute as **Me**, access **Anyone within Sulaiman Al Rajhi University**.
3. Open the register once with your own account: it creates `Risks` (44 risks), `Audit`, `Lists`, `AllowedUsers` (owner + 13 ICTD accounts) and `AccessLog`.
4. Reload the sheet → menu **ICTD Risk Register**: access-list setup, 30-day access summary, purge old logs, web-app URL.
5. Upload `github-landing/` to GitHub Pages.

## Access & roles
- `ACCESS_MODE = 'LIST'`: only **active** rows in `AllowedUsers` (+ `OWNER_EMAILS`) can open it. Use `'DOMAIN'` to open it to every @sr.edu.sa account.
- `role = admin` in `AllowedUsers` → can edit/delete any risk (incl. the 44 imported). `user` → add risks, edit/delete own.
- The `name` column is used as the display name / reporter name.
- Changes apply within 2 minutes. Every server call re-checks the list.
