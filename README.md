# ICTD Risk Register — سجل المخاطر (v1.1)

| File | Where it goes |
|---|---|
| `apps-script/Code.gs` | Apps Script project of the sheet → file **Code.gs** (contains the 44 seed risks — keep off GitHub) |
| `apps-script/Index.html` | Apps Script project → **File → New → HTML** named exactly `Index` |
| `index.html` + `assets/` | GitHub Pages — ITOC sign-in screen that opens the register |

Sheet: https://docs.google.com/spreadsheets/d/110jrIGTFvsEVQ8pJH0oXLtwfejDKDSLHEdT_kzF2LlY/edit
Register (exec): https://script.google.com/a/macros/sr.edu.sa/s/AKfycby5E2RGOAn6vtxyLvuj3R0UZwFO94brbEtjuKijk8GL1FJLM4Re4hdGFB7EW183QGEI/exec

## Update steps
1. Sheet → Extensions → Apps Script. Replace **Code.gs**; add HTML file **Index** with `apps-script/Index.html`. Save.
2. Run `setup()` once if not done (loads the 44 risks).
3. Deploy → **Manage deployments** → ✏️ Edit → Version: **New version** → Execute as **Me**, Access **Anyone within Sulaiman Al Rajhi University** → Deploy. (Keeps the same URL.)
4. Upload `index.html` + `assets/` (sru-logo.png, ictd-logo.png, itoc-logo.png) to `ictsru.github.io/ICTD/risk-register/`.
