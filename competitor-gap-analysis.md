# AgriInsights UK — Competitor Gap Analysis (Oct 2026)

Lean pass: codebase grep plus about 15 web searches, using search snippets only. A **?** means unverified. Re-check pricing and claims before quoting them publicly.

## Where we already win
- **One app covers finance and compliance.** Accounts, VAT, MTD reports, payroll, livestock, crop and orchard compliance (PPP/EAMU), NVZ, rainfall, loans and assets. Rivals split this across 3–5 tools: Figured + Xero + Greenlight + Herdwatch.
- **Farm-specific tax built in.** Herd basis, capital allowances, partnerships (profit allocation, Class 4), closing stock, and SFI/delinked income. Generic Xero, QuickBooks and Sage lack this.
- **Records rivals keep separate.** Compliance audit packs and withdrawal-period registers, which Figured and Farmplan don't do.
- **Statement import.** Bank import from CSV, PDF and images, plus co-op and remittance imports.
- **Year locking.** Financial-year lock is in place.

## Gaps (sorted by impact)
| # | Gap | Who has it | Our state | Impact | Effort |
|---|---|---|---|---|---|
| 1 | **HMRC-recognised MTD ITSA and VAT submission** (mandatory since Apr 2026 for >£50k) | Landmark, Farmplan, Xero/QB/Sage | Reports only; `ukMtdSubmit` is a stub | 5 | L (HMRC API plus recognition) |
| 2 | **Spreadsheet-style budget grid**: editable month cells, fill-right, % uplift, paste from Excel | Figured (core selling point) | Annual target plus a monthly pattern only | 5 | M |
| 3 | **Named scenarios side by side** (price, yield, interest) and 5–10 yr plans | Figured | Partial (planning forecast toggle) | 5 | M |
| 4 | **Bank feeds** (Open Banking via TrueLayer/GoCardless) | Xero, Figured via Xero | CSV/PDF upload only | 5 | M |
| 5 | **XLSX import/export** with column mapping that keeps formulas on export | Xero/QB; advisers expect it | CSV only, no SheetJS | 4 | S |
| 6 | **Real adviser/accountant/bank roles**: invite, read-only, comment, audit trail | Figured, Xero | Single-user; accountant pack is export-only | 4 | M |
| 7 | **Xero/QuickBooks two-way sync** (lets us sit beside an accountant's ledger, as Figured does) | Figured | None | 4 | M–L |
| 8 | **Carbon footprint / emissions report** (supermarket and processor demand) | Trinity AgTech Sandy | None | 4 | M (use the Farm Carbon Toolkit/Agrecalc method) |
| 9 | **Overhead allocation per enterprise/field**, break-evens, cost per litre/tonne/head | Farmplan, Figured | Gross margins only | 3 | S–M |
| 10 | **Offline data entry** (queue and sync) for yard and field use | fieldmargin, Herdwatch apps | App shell only; Supabase calls fail offline | 3 | M |
| 11 | **Live benchmarking** vs AHDB/FBS and peer cohort | Farmplan ◐ | Static reference figures | 3 | M |
| 12 | **BCMS/ScotEID live movement sync** | Breedr, Herdwatch | Mentions only | 3 | M |
| 13 | **IHT / APR / BPR planning** (relief caps since Apr 2026) and succession | Nobody does this well, so an open opportunity | None | 3 | S–M |
| 14 | **Machinery cost per hour and contracting invoicing** | Farmplan ◐ | None | 2 | S |
| 15 | **Mapping and field boundaries** (RPA land parcels) | fieldmargin, Greenlight | NVZ map only | 2 | M |

## Spreadsheet features in detail (Figured parity and beyond)
Build a single **grid component** and reuse it on Budgets, Planning and Cashflow:
- Rows are categories or enterprises; columns are months; there are totals rows and columns.
- Interactions: inline edit, keyboard navigation, drag-fill and fill-right, % uplift on a row, paste a range from Excel, multi-cell select, and undo/redo.
- Simple formulas (`=prev*1.03`, `=yield*price*ha`) and driver rows (head × price, ha × t/ha × £/t).
- Scenario tabs (Base / Optimistic / Bad year) with variance columns, and a budget-vs-actual overlay.
- Export to XLSX with live formulas (SheetJS), and import from XLSX/CSV with a column-mapping step.

## Market openings (rivals' weak spots)
1. **Cost.** Farmplan is £198–£1,425/yr plus support charges. Undercut it and bundle the compliance features.
2. **Fragmentation.** Farmers juggle a records app, accounts software and spreadsheets. Our pitch: "one app, no spreadsheets".
3. **Deadlines.** MTD ITSA is forcing sole-trader farmers to switch software now. This window closes in about 12 months.
4. **SFI income.** SFI and delinked cashflow tracking is mostly manual. Lean into it.
5. **Inheritance tax.** APR/BPR changes leave a planning gap that nobody fills.

## Suggested roadmap
- **Quick wins (≤2 wks):** XLSX import/export (#5), machinery costing (#14), overhead allocation and break-evens (#9), IHT/APR estimator (#13).
- **90 days:** budget grid and scenarios (#2, #3), adviser roles and comments (#6), bank feeds (#4). Start the HMRC MTD recognition process now (#1); it has a long lead time.
- **6–12 months:** HMRC submission live, Xero sync (#7), carbon report (#8), offline sync (#10), live benchmarking (#11), BCMS (#12).

## Positioning once shipped
- "Figured's budgeting plus Farmplan's accounts plus your compliance records, in one app, for less."
- "The only farm app that files your MTD return *and* writes your Red Tractor audit pack."
- "Budget like a spreadsheet, without the spreadsheet."

## Sources (leads)
figured.com/figured-xero · capterra.co.uk/software/146757/figured · accountingweb.co.uk/reviews/making-tax-digital/farmplan · capterra.co.uk/software/2873/gatekeeper · rentalbux.com/mtd-software/landmarkkeyprime · capterra.com/p/163565/fieldmargin · herdwatch.com/en-uk · fwi.co.uk/livestock/beef/breedr-launches-cattle-trading-platform · farminguk.com (Trinity AgTech Sandy) · agworld.com/eu/landing/gbcomingsoon · forums.aat.org.uk/Forum/discussion/comment/445287 · sterlingandwells.com/blogs/making-tax-digital-mtd-for-farmers-2026
