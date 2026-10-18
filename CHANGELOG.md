# CHANGELOG — ICTD Risk Register (سجل المخاطر)

## v1.5 — 2026-10-18
- Removed the names Omar Saleh, Nora Al-Zahrani, Ahmed Al-Rashidi, Khalid Mansour, Sara Al-Otaibi from the register (7 risks: RR-036…RR-041, RR-043):
  reporter → blank, action owner → «غير محدد».
- Seed data updated; one-time automatic clean-up of the live `Risks` and `Lists` tabs on the first page load after the update (`cleanup_names_v15`).
- Header showed "Owner" instead of the owner's name: the owner row in `AllowedUsers` is renamed to Mohamed ElMahdy, and the placeholder "Owner" is never displayed.

## v1.4 — 2026-10-18
- Applied **SRU Secure Access Kit v1.4**:
  - Access check in `doGet` (domain + `AllowedUsers` list, `ACCESS_MODE = 'LIST'`); `requireSruUser_()` on every `api()` call.
  - `Denied.html` for non-SRU / not-listed accounts; logged as مرفوض / غير مدرج.
  - `AccessLog` (timestamp, date, time, day, email, result, version; 30-min de-dup) replaces the earlier `SignIns` tab.
  - `Logos.html` (shared SRU/ICTD/ITOC logos) replaces the logos embedded in Index; Index is now an HtmlService template.
  - Sheet menu: register setup, access list setup, 30-day summary, purge old logs, show URL.
  - GitHub landing replaced with the kit's standard page (CONFIG filled; "skip this screen" option).
- Admin role now comes from `AllowedUsers` (role = admin) + `OWNER_EMAILS` instead of a hard-coded list; names come from the `name` column.
- Risks are rendered into the page on load (no extra round trip).
- First visit also creates `AllowedUsers` (owner + 13 ICTD accounts from `DEFAULT_ALLOWED`).

## v1.3 — 2026-10-18
- Official logos (SRU, ICTD, ITOC) embedded directly in Index.html and the GitHub sign-in page — no external hosting needed.
- Header band: SRU logo right, ICTD logo left; ITOC logo on the sign-in card and at the footer bottom-left (linked to the ITOC forms hub).
- GitHub sign-in page now shows the SRU + ICTD logos above the ITOC mark.

## v1.2 — 2026-10-18
- Fixed "Cannot read properties of null (reading 'appendRow')" at sign-in: the SignIns tab did not exist because setup() had not been run.
- Self-setup: on the first call the script creates any missing tab (Risks, SignIns, Audit, Lists) and seeds the 44 risks automatically.
- Spreadsheet fallback: if the script is not bound to the sheet, it opens it by ID (110jrIGT…).

## v1.1 — 2026-10-18
- Fixed "Access blocked: Authorization Error (400 invalid_request)": removed client-side Google Sign-In (OAuth client ID / JavaScript origins) entirely.
- The register now runs from Apps Script (HtmlService) at the domain-only /exec URL; Google signs users in before the page loads.
- Server identifies users with Session.getActiveUser(), re-checks @sr.edu.sa on every call, and logs each sign-in to `SignIns`.
- GitHub `index.html` is now the ITOC sign-in screen, with a button that opens the register.
- Non-SRU accounts see a clear message and a "switch account" button; the top-bar button became «تبديل الحساب».
- Logos load from `https://ictsru.github.io/ICTD/risk-register/assets/` (text fallbacks until uploaded).

## v1.0 — 2026-10-18
- First release: HTML front end + Google Sheets back end; 44 risks imported from the workbook; dashboard, 5×5 matrix, register, add/edit/delete, CSV, print, audit trail.
