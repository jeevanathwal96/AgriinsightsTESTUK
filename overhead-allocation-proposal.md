# Proposal: Overhead Allocation & Break-even Prices

**Goal:** show each enterprise's real profit after its share of fixed costs, and the price per tonne, litre, head or kg it needs to break even. Farmplan and Figured both offer this (gap #9 in `competitor-gap-analysis.md`). We can do it better because our gross margins already reconcile back to the farm's net margin.

## 1. What the farmer gets
On the Profit page, a new **"Full cost & break-even"** view sits under the existing Gross Margins.

| Enterprise | Output | Variable | **Gross margin** | Overheads share | **Net margin** | Volume | **Cost /unit** | Price achieved | **Break-even price** | Break-even yield |
|---|---|---|---|---|---|---|---|---|---|---|
| Winter wheat (120 ha) | £198k | £84k | £114k | £71k | **£43k** | 1,020 t | £152/t | £194/t | **£152/t** | 6.9 t/ha |
| Dairy (180 cows) | £720k | £390k | £330k | £255k | **£75k** | 1.58m L | 41.5p/L | 45.6p/L | **41.5p/L** | 7,950 L/cow |

There are three break-even levels, because farmers and banks ask different questions:
1. **Cash break-even**: variable costs plus overheads, with depreciation left out. *"Can I pay the bills?"*
2. **Full-cost break-even**: adds depreciation and finance interest. *"Am I making a profit?"* This is the default.
3. **Economic break-even**: adds a notional rent on owned land and unpaid family labour, at rates the user chooses. *"Is it worth doing?"* This matches AHDB costings.

Each enterprise also gets a traffic light: green when the price achieved is more than 10% above break-even, amber within ±10%, and red below. There is also a sensitivity slider ("price −10%", "yield −15%"), so farmers can see their risk before a bad year.

## 2. How overheads get split
Each fixed-cost category gets an **allocation driver**. The defaults below are sensible, and the user can override them per category, per season:

| Driver | How it works | Default for |
|---|---|---|
| **Area (ha)** | By hectares farmed. Forage area goes to the livestock that use it. | Rent, land drainage, machinery depreciation and repairs (arable), contract work |
| **Livestock units (LU)** | Head × standard LU factor (dairy cow 1.0, suckler 0.75, ewe 0.11 …) | Buildings, vet retainer |
| **Labour hours / % time** | The user says "Tom: 70% dairy, 30% arable" | Wages, NI, pension (uses existing worker records) |
| **Share of output (£)** | By each enterprise's share of output | Admin, accountancy, insurance, bank charges, telephone |
| **Gross margin share** | By each enterprise's share of gross margin | Option for the general farm overhead pot |
| **Manual %** | User types the percentages | Anything |
| **Direct** | Already tagged to one enterprise; no split | Fixed costs tagged at entry (`fixedTagged` already exists) |

Rules:
- Costs tagged to an enterprise stay there (direct). Only untagged fixed costs get split.
- **Allocations always add up to 100%.** Any rounding remainder goes to the largest enterprise. The sum of net margins must equal the farm net margin from `ukGrossMargins().netMargin`. The page shows "✓ reconciles to your accounts" (or explains the difference).
- Capital spending is never allocated, but **depreciation** from the Asset Register is, using each asset's enterprise tag (otherwise the area driver).
- Loan interest (not repayments) is allocated. We already strip out principal with `ukAllowableExpense`.
- An enterprise with no area or head gets nothing from those drivers, and the screen warns about it.

## 3. Volumes (needed for the "per unit" figures)
We take volumes from data we already hold before asking the user:
- **Crops**: harvest yield records (`ST_CROP`), or sold tonnes from sales transactions, or else a manual estimate (t/ha × ha).
- **Dairy**: litres from milk statements and co-op imports.
- **Beef and sheep**: kg deadweight or liveweight sold, or head sold. The livestock trading statement already has these.
- **Orchards**: pack-out tonnes and trays (the Pack-out & Returns module).

Each volume shows where it came from (📄 records / ✏️ estimate), and break-evens built on estimates are labelled as estimates.

## 4. Build plan (fits the current code)
| Step | Work | Where | Effort |
|---|---|---|---|
| 1 | `ukOverheadRules(season)` returns the driver for each fixed category, with defaults by category and stored overrides | new, next to `ukCostClass` (index-uk.html ~56058) | S |
| 2 | `ukFullCost(season, opts)` takes `ukGrossMargins()` rows and adds `overheads`, `byCat`, `depreciation`, `interest`, `netMargin`, `volume`, `costPerUnit`, `breakEven{cash,full,economic}` | new, after `ukGrossMargins` (~56381) | M |
| 3 | Driver inputs: area from `ST_CROP.lands` / `ST_FRUIT.blocks` (already read); LU from `ST_LS.herd` × LU table; labour % from worker records | reuse existing loops | S |
| 4 | Storage: Supabase table `overhead_rules(farm_id, season, category, method, shares jsonb)` with RLS, plus a data-service method | `ai-data-uk.js` | S |
| 5 | UI: a full-cost table, an allocation editor (one row per category, with a driver dropdown and editable % per enterprise), break-even tiles, a sensitivity slider and a reconciliation check | Profit page | M |
| 6 | Outputs: a PDF "Enterprise costings" report plus CSV export through `ukGrossMarginCsv`, and the bank-ready pack gains break-evens | reports | S |
| 7 | Tests: allocations sum to 100%; net margins sum to the farm net margin; zero-volume and zero-area cases; a season with no fixed costs | | S |

**Total: about 2–3 weeks for one developer.**

## 5. Edge cases to handle
- Forage area shared by dairy, beef and sheep: split it by LU grazing days, or default to LU.
- Fallow land, planned crops and set-aside or SFI land: exclude from the area driver. SFI income is its own "enterprise" (Environmental schemes).
- Mixed seasons (harvest year vs financial year): use the same `seasonOf()` as gross margins.
- No volume: show cost per ha or per head instead of per tonne or litre, with a "Add your yield" prompt.
- Partnerships: the full cost is unchanged. Profit sharing happens after this, in `ukProfitAllocationCsv`.

## 6. Why this beats competitors
- **It reconciles to the accounts.** The numbers tie back to the farm's net profit, unlike costings worked out in a spreadsheet.
- **Defaults do most of the work.** Most farms get a useful answer with zero setup; Farmplan needs an adviser to set this up.
- **Volumes come from existing records.** Yield, milk and pack-out data are already in the app, so there's no re-keying.
- **It feeds other screens.** The same numbers drive the bank pack and loan affordability. Later they can feed the budget grid ("what price do I need next year?").

## 7. Acceptance criteria
- [ ] With no setup, every enterprise with output shows a net margin and a break-even, using default drivers.
- [ ] The sum of enterprise net margins plus untagged items equals the farm net margin, to the pound.
- [ ] The user can change a category's driver or manual % and see the figures update instantly; the change is saved per season.
- [ ] Break-even shows in the right unit (£/t, p/L, £/head, p/kg dw, £/ha) with the volume source marked.
- [ ] The PDF and CSV exports include allocation basis notes, for an accountant or bank.
