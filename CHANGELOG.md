# CHANGELOG — ICTD Risk Register (سجل المخاطر)

## v1.1 — 2026-10-18
- Fixed "Access blocked: Authorization Error (400 invalid_request)": removed client-side Google Sign-In (OAuth client ID / JavaScript origins) entirely.
- The register now runs from Apps Script (HtmlService) at the domain-only /exec URL; Google signs users in before the page loads.
- Server identifies users with Session.getActiveUser(), re-checks @sr.edu.sa on every call, and logs each sign-in to `SignIns`.
- GitHub `index.html` is now the ITOC sign-in screen, with a button that opens the register.
- Non-SRU accounts see a clear message and a "switch account" button; the top-bar button became «تبديل الحساب».
- Logos load from `https://ictsru.github.io/ICTD/risk-register/assets/` (text fallbacks until uploaded).

## v1.0 — 2026-10-18
- First release: HTML front end + Google Sheets back end; 44 risks imported from the workbook; dashboard, 5×5 matrix, register, add/edit/delete, CSV, print, audit trail.
