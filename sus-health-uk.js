/* sus-health-uk.js - Sustainability Phase 4, UK desktop (PREBUILD-CHECK-V53 §9 row 4): farm health and targets.
 * Overview (the Today strip, six headline numbers, one chart), carbon, energy, water, nature, targets and the baseline.
 *
 * Behind SUS_FLAGS.pilot like the rest of Sustainability (sus-page-uk.js); nothing here runs or shows with the flag off.
 * The compliance-ownership rule (14 Nov 2026): the modules own the records and Sustainability summarises and links back.
 *   - Money owns the bills: fuel litres and the kWh on electricity bills (transactions.quantity + unit 'kWh', no new column),
 *     bought feed. The £ figures are shown as the app already records them: no new VAT logic (B5 is with the accountant).
 *   - Crops owns fertiliser and lime (crop inputs with N% and the amount), the water meter readings and the licence.
 *   - Livestock owns the stock (the footprint keeps stock away and leaves out other people's stock on our land).
 *   - Sustainability holds only what has no home module: habitats, solar generation, targets and the baseline year.
 * Every figure comes from one place: susCompute() (sus-page-uk.js) calls healthCompute() here once per change, and the
 * Overview tile, the area tabs, the workings and sus_results all read that object (the one-figure rule).
 * The factor set and the N2O method in use are on screen. Last year is worked out with this year's set; a stored figure
 * made with another set is shown as it was until the farmer recalculates it on purpose, and the screen then says so.
 */
(function (W) {
  'use strict';
  var EN = function () { return W.SusEngineUK || null; };
  var LAW = function () { return W.SUS_LAW || null; };
  var FAC = function () { return W.SUS_FACTORS || null; };
  var A = function () { return W._susApi || null; };
  function on() { return !!(W.SUS_FLAGS && W.SUS_FLAGS.pilot); }
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function N(x, dp) { var v = Number(x); if (!isFinite(v)) return ''; return v.toLocaleString('en-GB', { maximumFractionDigits: dp == null ? 0 : dp, minimumFractionDigits: 0 }); }
  function num(v) { if (v === '' || v == null) return null; var x = Number(v); return isFinite(x) ? x : null; }
  function D(x) { try { return x ? (typeof W.dispDate === 'function' ? W.dispDate(x) : x) : ''; } catch (er) { return x || ''; } }
  function gbp(x) { var v = Number(x); return isFinite(v) ? '£' + Math.round(v).toLocaleString('en-GB') : ''; }
  function pl(n, one, many) { n = Math.round(Number(n) || 0); return N(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pill(st) { return '<span class="sus-st ' + st[0] + '">' + e(st[1]) + '</span>'; }
  function est() { return '<span class="sus-tag">Estimate</span>'; }
  function iso(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function txnIso(d) { try { if (typeof W.aiTxnISO === 'function') return W.aiTxnISO(d) || ''; } catch (er) {} var t = Date.parse(d); return isNaN(t) ? '' : iso(t); }
  var _ui = { tab: 'ov', year: null, work: null, chart: 'c', hf: null, sf: null, tf: null };

  /* ── what the modules hold, per year (plain data, so the inputs hash sees every change) ── */
  var LIME = function () { var F = FAC(), o = {}; ((F && F.factors) || []).forEach(function (f) { if (f.lime) o[f.label.toLowerCase()] = f.lime; }); return o; };
  function limeKind(product) { var p = String(product || '').toLowerCase().trim(); if (!p) return null; var L = LIME(); if (L[p]) return L[p]; return /dolomit|magnesian lime/.test(p) ? 'dolomite' : /\blime\b|limestone|chalk|calcium carbonate|calcified seaweed/.test(p) ? 'limestone' : null; }
  function fertForm(x) {
    var nf = x.nForm || null; if (nf === 'urea_untreated') return 'urea'; if (nf === 'urea_protected') return 'urea_protected'; if (nf === 'urea_liquid') return 'uan';
    var p = String(x.product || '').toLowerCase();
    if (/protected urea|nbpt|inhibitor/.test(p)) return 'urea_protected'; if (/\buan\b|urea ammonium nitrate|nitroflo/.test(p)) return 'uan'; if (/urea/.test(p)) return 'urea';
    if (/calcium ammonium nitrate|\bcan\b/.test(p)) return 'can'; if (/ammonium nitrate|\ban\b|nitram|extran|prilled n/.test(p)) return 'an';
    if (/ammonium sulphate|\bdap\b|\bmap\b|ammonium phosphate|\bas\b 21/.test(p)) return 'as';
    return null;
  }
  function fuelKind(desc) { var d = String(desc || '').toLowerCase();
    if (/kerosene|heating oil|burning oil|kero\b/.test(d)) return ['kerosene', false]; if (/\blpg\b|propane|calor/.test(d)) return ['lpg', false];
    if (/petrol|unleaded/.test(d)) return ['petrol', false]; if (/derv|road diesel|white diesel/.test(d)) return ['diesel', false];
    if (/red diesel|gas ?oil/.test(d)) return ['gas_oil', false]; if (/diesel/.test(d)) return ['gas_oil', true]; return null; }
  function litres(t) { var u = String(t.unit || '').trim(); if (!(Number(t.qty) > 0)) return null; if (/^(l|litre|litres|liter|liters)$/i.test(u)) return Number(t.qty); if (/^(m3|cubic)/i.test(u)) return Number(t.qty) * 1000; return null; }
  function healthInputs(c0) {
    var ap = A(), out = { fert: {}, lime: {}, fuel: {}, fuelLog: {}, elec: {}, feed: {}, solar: {}, water: null, hab: [], set: {} }; if (!ap) return out;
    var lands = {}; ap.landsAll().forEach(function (l) { lands[String(l.id)] = l; });
    ((W.ST_CROP && W.ST_CROP.inputs) || []).forEach(function (x) {
      if (!x || x.kind !== 'fertiliser' || x.removed || !/^\d{4}-\d{2}-\d{2}/.test(String(x.date || '')) || x.applied === false) return;
      var y = String(x.date).slice(0, 4), l = lands[String(x.land)] || null, ha = num(x.areaHa) || (l ? num(l.area) : null), lk = limeKind(x.product);
      if (lk) { var q = num(x.qty), u = x.qtyUnit, t = u === 't/ha' && ha > 0 ? q * ha : u === 't' ? q : u === 'kg/ha' && ha > 0 ? q * ha / 1000 : u === 'kg' ? q / 1000 : null;
        (out.lime[y] = out.lime[y] || []).push({ id: x.id, date: x.date, product: x.product, tonnes: t, kind: lk, field: l ? l.name : '' }); return; }
      if (x.organicKind) return;
      var r = EN().inputN({ applied: x.applied, n_pct: x.nPct, qty: x.qty, qty_unit: x.qtyUnit, area_ha: ha, kg_per_l: null }, FAC());
      (out.fert[y] = out.fert[y] || []).push({ id: x.id, date: x.date, product: x.product, field: l ? l.name : '', ha: ha, kgN: r && r.kgN != null ? r.kgN : null, form: fertForm(x), why: r && r.refused ? r.refused : null });
    });
    ((W.ST && W.ST.txns) || []).forEach(function (t) {
      if (!t || t.type !== 'expense') return; var d = txnIso(t.date); if (!d) return; var y = d.slice(0, 4), cat = String(t.cat || '');
      if (cat === 'Fuel & Oil') { var fk = fuelKind(t.desc), l = litres(t); if (fk && l) (out.fuel[y] = out.fuel[y] || []).push({ date: d, desc: String(t.desc || '').slice(0, 80), litres: l, fuel: fk[0], assumed: fk[1], amt: Number(t.amt) || 0 }); }
      else if (cat === 'Electricity') { var kw = /^kwh$/i.test(String(t.unit || '').trim()) && Number(t.qty) > 0 ? Number(t.qty) : null;
        (out.elec[y] = out.elec[y] || []).push({ date: d, desc: String(t.desc || '').slice(0, 80), amt: Number(t.amt) || 0, kwh: kw }); }
      else if (cat === 'Animal Feed') { var u = String(t.unit || '').toLowerCase(), q = Number(t.qty), tn = q > 0 ? (/^(t|tonne|tonnes|ton)$/.test(u) ? q : /^kg$/.test(u) ? q / 1000 : null) : null;
        if (tn) (out.feed[y] = out.feed[y] || []).push({ date: d, desc: String(t.desc || '').slice(0, 80), tonnes: tn, kind: /soya/i.test(t.desc || '') ? 'soya' : 'compound', amt: Number(t.amt) || 0 }); }
    });
    ((W.ST_FUEL && W.ST_FUEL.issues) || []).forEach(function (i) { if (!i || !(Number(i.litres) > 0) || !/^\d{4}/.test(String(i.date || ''))) return; var y = String(i.date).slice(0, 4); out.fuelLog[y] = (out.fuelLog[y] || 0) + Number(i.litres); });
    var s = ap.S(); (s ? s.solar : []).forEach(function (r) { if (!r || !/^\d{4}(-\d{2})?$/.test(String(r.period || ''))) return; var y = r.period.slice(0, 4);
      (out.solar[y] = out.solar[y] || []).push({ id: r.id, period: r.period, gen: num(r.genKwh) || 0, exp: num(r.expKwh) || 0 }); });
    var cc = W.ST_CROP && W.ST_CROP.compliance;
    out.water = cc ? { readings: (cc.waterReadings || []).map(function (r) { return { date: r.date, m3: r.m3 }; }), licence: cc.waterLicence || '', authorised: num(cc.waterAuthorised) } : null;
    out.hab = (s ? s.habitats : []).filter(function (h) { return h && !h.removed; }).map(function (h) { return { id: h.id, kind: h.kind, name: h.name || '', length_m: h.lengthM, area_ha: h.areaHa, land: h.land, photo: !!h.photo }; });
    /* -439-sus6 (owner decision "habitats" a): the dated history, removed ones included, so the baseline is real */
    out.habAll = (s ? s.habitats : []).filter(function (h) { return h; }).map(function (h) { return { kind: h.kind, length_m: h.lengthM, area_ha: h.areaHa, removed: !!h.removed, added_on: h.addedOn || null,
      history: Array.isArray(h.history) ? h.history.map(function (x) { return { on: x.on, length_m: x.lengthM, area_ha: x.areaHa, removed: !!x.removed, unsure: x.unsure === true }; }) : null }; });   /* -445: unsure = already there, no gain */
    var st = ap.set(); out.set = { targets: st.targets || {}, baselineYear: st.baselineYear || null, reviewedAt: st.targetsReviewedAt || null, recalc: (st.setup && st.setup.recalc) || {} };
    out.farmedHa = 0; ap.landsAll().forEach(function (l) { if (l.planted0) out.farmedHa += Number(l.area) || 0; });
    return out;
  }

  /* ── the one computation for Phase 4 (called inside susCompute) ── */
  var METRICS = {
    carbon: { n: 'Carbon, whole farm', u: ' t CO₂e', low: true, dp: 0 },
    carbonHa: { n: 'Carbon per hectare', u: ' t CO₂e/ha', low: true, dp: 1 },
    nHa: { n: 'Fertiliser N per hectare', u: ' kg N/ha', low: true, dp: 0 },
    grid: { n: 'Electricity bought', u: ' kWh', low: true, dp: 0 },
    solar: { n: 'Power from your own solar', u: '%', low: false, dp: 0 },
    water: { n: 'Water taken', u: ' m³', low: true, dp: 0 },
    habitat: { n: 'Habitat share of the farm', u: '%', low: false, dp: 1 }
  };
  function solarFor(rows) { if (!rows || !rows.length) return null; var yr = rows.filter(function (r) { return r.period.length === 4; }), mo = rows.filter(function (r) { return r.period.length === 7; });
    var use = yr.length ? yr : mo, g = 0, x = 0; use.forEach(function (r) { g += r.gen; x += r.exp; }); return { generatedKwh: g, exportedKwh: x, months: mo.length, both: !!(yr.length && mo.length) }; }
  function yearFp(c, P, y) {
    var E = EN(), L = LAW(), F = FAC(), inp = c.inputs, fert = (P.fert[y] || []), lime = (P.lime[y] || []), fuel = (P.fuel[y] || []), elec = (P.elec[y] || []), feed = (P.feed[y] || []);
    var fuelRows = fuel.map(function (f) { return { litres: f.litres, fuel: f.fuel, assumed: f.assumed, from: 'bills' }; }), fuelFrom = fuel.length ? 'bills' : null;
    if (!fuel.length && P.fuelLog[y] > 0) { fuelRows = [{ litres: P.fuelLog[y], fuel: 'gas_oil', assumed: true, from: 'log' }]; fuelFrom = 'log'; }
    var kwh = 0, noK = 0, gbpE = 0; elec.forEach(function (b) { if (b.kwh > 0) kwh += b.kwh; else noK++; gbpE += b.amt; });
    var so = solarFor(P.solar[y]);
    var fp = E.footprint({ nation: c.nation, year: y, today: c.today, method: null, rainMm: inp.rainNormal || null, assume: inp.assume || {},
      stock: { herds: inp.herds, animals: inp.animals, moves: inp.moves, batches: inp.batches, counts: inp.counts, opts: inp.opts, housing: inp.housing },
      fertiliser: fert.filter(function (r) { return r.kgN > 0; }).map(function (r) { return { kgN: r.kgN, kgNHa: r.ha > 0 ? r.kgN / r.ha : null, form: r.form, label: r.product }; }),
      fuel: fuelRows, electricity: { kwh: kwh, bills: elec.length, billsNoKwh: noK }, solar: so || {}, lime: lime.filter(function (r) { return r.tonnes > 0; }).map(function (r) { return { tonnes: r.tonnes, kind: r.kind }; }),
      feed: feed.map(function (f) { return { tonnes: f.tonnes, kind: f.kind, label: f.desc }; }) }, L, F);
    var fertMissing = fert.filter(function (r) { return !(r.kgN >= 0) || r.kgN === null; }).length, limeMissing = lime.filter(function (r) { return !(r.tonnes > 0); }).length;
    if (fertMissing) fp.missing.push('fertiliser: ' + pl(fertMissing, 'record') + ' without N% or an amount');
    if (limeMissing) fp.missing.push('lime: ' + pl(limeMissing, 'record') + ' without the tonnes');
    if (so && so.both) fp.estimates.push('solar: a whole-year figure and monthly figures both typed, so the whole-year one is used');
    if (fuelFrom === 'log') fp.estimates.push('fuel from the litres issued in the fuel log (no litres on the fuel bills)');
    var ha = c.holdingHa || null, fN = 0; fert.forEach(function (r) { if (r.kgN > 0) fN += r.kgN; });
    /* -440 (UX-33): organic manure spread in the year (the NVZ record rows: Crops inputs and Livestock spreading), so the one N headline includes it */
    var oN = 0; ((c.n && c.n.rec && c.n.rec.rows) || []).forEach(function (r) { if (r && /organic/i.test(String(r.type || '')) && String(r.date || '').slice(0, 4) === String(y) && r.kgN > 0) oN += r.kgN; });
    var any = fert.length || lime.length || fuel.length || elec.length || feed.length || (P.fuelLog[y] > 0) || (so && so.generatedKwh > 0);
    return { fp: fp, y: y, perHa: ha && fp.total ? fp.total / ha : null, ha: ha, fert: fert, lime: lime, fuel: fuel, fuelFrom: fuelFrom, fuelLog: P.fuelLog[y] || 0, elec: elec, elecGbp: gbpE, elecNoKwh: noK, feed: feed, solar: so,
             nHa: P.farmedHa > 0 && fN > 0 ? fN / P.farmedHa : (fN > 0 ? null : 0), fN: fN, oN: oN, allHa: P.farmedHa > 0 && (fN + oN) > 0 ? (fN + oN) / P.farmedHa : null, hasRecords: !!(any || oN) };
  }
  function healthCompute(c) {
    if (!on() || !EN() || !LAW() || !FAC() || !c || !c.inputs || !c.inputs.p4) return null;
    var E = EN(), P = c.inputs.p4, Y = c.year, out = { years: {}, Y: Y, P: Y - 1 };
    var M = E.n2oMethod(FAC());
    out.method = M; out.set = (FAC().id + '-' + FAC().version); out.setFull = out.set + '/' + (M ? M.id : '');
    var want = [Y, Y - 1]; var by = num(P.set.baselineYear); if (by && by < Y && want.indexOf(by) < 0) want.push(by);
    want.forEach(function (y) { out.years[y] = yearFp(c, P, y); });
    out.firstYear = !out.years[Y - 1].hasRecords;
    var Wt = P.water; out.water = {};
    want.forEach(function (y) { out.water[y] = Wt ? E.waterUse({ readings: Wt.readings, year: y, authorisedM3: Wt.authorised, nation: c.nation }, LAW()) : null; });
    out.waterLicence = Wt ? Wt.licence : '';
    out.hab = E.habitatSummary(P.hab, c.holdingHa);
    var hDays = want.map(function (y) { return y === Y ? c.today : y + '-12-31'; });
    out.habHist = E.habitatHistory(P.habAll || [], c.holdingHa, hDays);
    /* metric values per year, for the tiles, the chart and the targets (one figure everywhere) */
    out.val = function (k, y) { var R = out.years[y]; if (!R) return null;
      if (k === 'carbon') return R.fp.total > 0 ? R.fp.total : null; if (k === 'carbonHa') return R.perHa; if (k === 'nHa') return R.nHa || null;
      if (k === 'grid') return R.fp.energy.gridKwh || null; if (k === 'solar') return R.fp.energy.solarShare != null ? R.fp.energy.solarShare * 100 : null;
      if (k === 'water') { var w = out.water[y]; return w && w.m3 != null ? w.m3 : null; }
      if (k === 'habitat') { var hh = out.habHist && out.habHist.at[y === Y ? c.today : y + '-12-31']; return hh && hh.pct != null && hh.features ? hh.pct : null; } return null; };
    /* stored figures for last year: a figure made with another factor set is kept as it was until recalculated on purpose */
    var ap = A(), res = (ap && ap.S()) ? ap.S().results : [], rc = P.set.recalc || {};
    out.stored = {};
    [Y - 1].concat(by && by < Y - 1 ? [by] : []).forEach(function (y) {
      var row = res.filter(function (r) { return r.id === y + ':footprint_t'; })[0];
      out.stored[y] = row && row.factorSet && row.factorSet !== out.setFull ? { value: row.value, set: row.factorSet, at: row.at } : null;
      out.years[y].recalc = rc[y] || null;
    });
    /* targets */
    var T = P.set.targets || {}, items = T.items || {};
    out.targets = Object.keys(METRICS).filter(function (k) { return items[k] && num(items[k].v) !== null; }).map(function (k) {
      var t = items[k], m = METRICS[k], b = num(P.set.baselineYear), base = k === 'habitat' ? num(t.base) : (b ? out.val(k, b) : null);
      return { k: k, n: m.n, t: t, p: E.targetProgress({ unit: m.u, dp: m.dp, lowerIsBetter: m.low, base: base, baseYear: k === 'habitat' ? (t.baseYear || b) : b, now: out.val(k, Y), nowYear: Y, target: num(t.v), byYear: num(t.by) }) };
    });
    out.reviewBy = T.reviewBy || null; out.reviewedAt = P.set.reviewedAt || null; out.baselineYear = num(P.set.baselineYear);
    out.reviewDue = !!(out.reviewBy && out.reviewBy <= c.today);
    /* rows for sus_results (persisted by sus-page-uk.js with the factor set; last year never overwritten across sets) */
    var rows = [], R = out.years[Y], RL = out.years[Y - 1], fs = out.setFull, cut = function (o) { var s = JSON.stringify(o); return s.length > 200 ? s.slice(0, 200) : s; };
    var srcTxt = function (fp) { var o = {}; Object.keys(fp.src).forEach(function (s) { o[s] = Math.round(fp.src[s] * 10) / 10; }); return cut(o); };
    var fst = function (fp) { return fp.total ? (Object.keys(fp.srcStatus).some(function (s) { return fp.srcStatus[s] === 'estimate'; }) ? 'estimate' : 'verified') : 'missing'; };
    rows.push({ m: 'footprint_t', v: R.fp.total || null, t: srcTxt(R.fp), st: fst(R.fp), p: Y, set: fs });
    rows.push({ m: 'footprint_t_ha', v: R.perHa, t: null, st: null, p: Y, set: fs });
    rows.push({ m: 'electricity_kwh', v: R.fp.energy.gridKwh || null, t: R.elecNoKwh ? R.elecNoKwh + ' bills without kWh' : null, st: R.elecNoKwh ? 'missing' : null, p: Y, set: fs });
    rows.push({ m: 'solar_share', v: R.fp.energy.solarShare, t: R.solar ? cut({ gen: R.solar.generatedKwh, exp: R.solar.exportedKwh }) : null, st: null, p: Y, set: fs });
    rows.push({ m: 'water_m3', v: out.water[Y] ? out.water[Y].m3 : null, t: null, st: out.water[Y] && out.water[Y].share != null ? (out.water[Y].share > 1 ? 'over' : 'within') : null, p: Y, set: fs });
    rows.push({ m: 'habitat_ha', v: out.hab.features ? out.hab.areaHa : null, t: out.hab.features ? cut({ hedge_m: out.hab.hedgeM, pct: out.hab.pct == null ? null : Math.round(out.hab.pct * 10) / 10 }) : null, st: null, p: Y, set: fs });
    rows.push({ m: 'fert_n_kg_ha', v: R.nHa || null, t: null, st: null, p: Y, set: fs });
    if (RL.hasRecords) rows.push({ m: 'footprint_t', v: RL.fp.total || null, t: srcTxt(RL.fp), st: fst(RL.fp), p: Y - 1, set: fs, keepSet: true, recalc: RL.recalc });
    out.persist = rows.filter(function (r) { return r.v != null || r.m === 'footprint_t'; });
    out.any = !!(R.hasRecords || RL.hasRecords || out.hab.features || (out.water[Y] && out.water[Y].readings) || R.fp.livestock.cattleN || R.fp.livestock.sheepN || Object.keys(R.fp.src).length);
    return out;
  }

  /* ── the page: tabs over the Phase 1 and 2 summary ── */
  var TABS = [['ov', 'Overview'], ['c', 'Carbon'], ['e', 'Energy'], ['w', 'Water'], ['na', 'Nature'], ['t', 'Targets'], ['ask', 'Who’s asking'], ['jobs', 'Jobs and sources']];   /* Phase 5: Who's asking (sus-asks-uk.js) */
  function wrap(c, phase1) {
    var H = c && c.h; if (!H) return phase1;
    var Y = _ui.year && H.years[_ui.year] ? _ui.year : H.Y;
    var tabs = '<div class="sus-seg sus-tabs" role="tablist" aria-label="Sustainability">' + TABS.map(function (t) { var o = _ui.tab === t[0]; return '<button type="button" role="tab" data-sh="tab" data-v="' + t[0] + '" class="' + (o ? 'on' : '') + '" aria-selected="' + o + '">' + e(t[1]) + '</button>'; }).join('') + '</div>';
    var body = '';
    if (_ui.tab === 'ov') body = overview(c, H, Y, phase1.tiles);
    else if (_ui.tab === 'c') body = carbonTab(c, H, Y);
    else if (_ui.tab === 'e') body = energyTab(c, H, Y);
    else if (_ui.tab === 'w') body = waterTab(c, H, Y);
    else if (_ui.tab === 'na') body = natureTab(c, H);
    else if (_ui.tab === 't') body = targetsTab(c, H);
    else if (_ui.tab === 'ask') body = (typeof W.susAsksHtml === 'function') ? W.susAsksHtml(c) : '';
    else body = phase1.jobs + phase1.where + sourcesCard(c, H, Y);   /* -440 (UX-23): the factor set, the method and the factor table, for an adviser */
    return phase1.setup + tabs + (_ui.tab === 'ov' || _ui.tab === 'c' || _ui.tab === 'e' || _ui.tab === 'w' ? yearBar(H, Y) : '') + body;
  }
  function setupDone() { try { var st = A().set().setup || {}; return !!st.finishedAt; } catch (er) { return true; } }
  function setLine(H) { var M = H.method; return 'Factor set ' + H.set + ' (DESNZ 2026, IPCC 2019 Refinement, UK GHG inventory 2026). Nitrous oxide method: ' + (M ? M.label + (M.status === 'confirmed' ? '' : ', not decided yet') : 'none') + '.'; }
  function yearBar(H, Y) {
    var ys = [H.Y - 1, H.Y], h = '<div class="sus-card sus-yb"><div class="sus-seg" role="group" aria-label="Year">' + ys.map(function (y) { var o = y === Y; return '<button type="button" data-sh="year" data-v="' + y + '" class="' + (o ? 'on' : '') + '" aria-pressed="' + o + '">' + y + '</button>'; }).join('') + '</div>';
    /* -440 (UX-23): the factor-set line lives in Jobs and sources, not on every tab */
    if (Y !== H.Y) {
      var s = H.stored[Y], rc = H.years[Y].recalc;
      if (s) h += '<p class="sus-mini sus-warn"><b>Your ' + Y + ' figure (' + N(s.value) + ' t) was worked out with ' + e(s.set) + '.</b> It stays as it was until you choose to recalculate it with this year’s set. <button class="btn-sec sm" data-sh="recalc" data-v="' + Y + '">Recalculate ' + Y + ' with this year’s set</button></p>';
      else if (rc) h += '<p class="sus-mini"><b>' + Y + ' was recalculated on purpose with ' + e(rc.to) + ' on ' + e(D(rc.on)) + '</b> (it was ' + e(rc.from) + '), so it compares like for like with ' + H.Y + '.</p>';
      else h += '<p class="sus-mini">' + Y + ' is worked out with the same factor set as ' + H.Y + ', so the two years compare like for like.</p>';
    }
    return h + '</div>';
  }
  function firstYearCard(H) {
    var R = H.years[H.Y], miss = R.fp.missing.slice(); if (!H.hab.features) miss.push('nature: no hedges, woodland, ponds or margins recorded'); var w = H.water[H.Y]; if (H.waterLicence && !(w && w.readings >= 2)) miss.push('water: fewer than two meter readings');
    if (!H.targets.length) miss.push('targets: none set (nothing is set for you)');
    return '<div class="sus-card sus-first"><b>First year: there is no ' + H.P + ' to compare with yet.</b><p class="sus-mini">The figures below are ' + H.Y + ' only.' + (!setupDone() ? '' : miss.length ? ' Still missing: ' + e(miss.join('; ')) + '.' : ' Nothing is missing for ' + H.Y + '.') + '</p></div>';
  }
  /* Overview: the Today strip, six numbers that open their workings and switch the one chart, then the manure tiles */
  function overview(c, H, Y, p1tiles) {
    var h = today(c, H);
    if (H.firstYear) h += firstYearCard(H);
    var T = tiles(c, H, Y);
    h += '<div class="sus-tiles sus-six">' + T.map(function (t) { var o = _ui.work === t.k; return '<button type="button" class="sus-tile sus-tbtn' + (o ? ' on' : '') + '" data-sh="work" data-v="' + t.k + '" aria-expanded="' + o + '"><span class="sus-k">' + e(t.n) + '</span><b class="sus-big">' + e(t.big) + '</b>' + pill(t.st) + '<span class="sus-mini">' + e(t.line) + '</span><span class="sus-lnk">' + (o ? 'Hide the workings' : 'See the workings') + '</span></button>'; }).join('') + '</div>';
    if (_ui.work) { var w = T.filter(function (t) { return t.k === _ui.work; })[0]; if (w) h += '<div class="sus-card sus-work" id="sus-work"><h3>' + e(w.n) + ', ' + (w.yearless ? 'as of today' : Y) + ': the workings</h3>' + w.work() + '</div>'; }
    h += chart(c, H, Y);
    h += '<h3 class="sus-h">' + (c.stock && !c.stock.any ? 'Livestock and nitrogen' : c.stock && !c.stock.slurry ? 'Manure and nitrogen' : 'Manure, the store and nitrogen') + '</h3>' + p1tiles;   /* -440 (UX-10, UX-26) */
    return h;
  }
  function today(c, H) {
    var open = c.jobs.filter(function (j) { return j.open; }), law = open.filter(function (j) { return j.kind === 'law'; }), R = H.years[H.Y], miss = [];
    var mo = c.today.slice(0, 7), w = H.water[H.Y];
    if (R.elecNoKwh) miss.push('the kWh on ' + pl(R.elecNoKwh, 'electricity bill'));
    if (!R.fuel.length && !R.fuelLog) miss.push('fuel litres');
    if (R.fert.some(function (r) { return r.kgN === null; })) miss.push('N on ' + pl(R.fert.filter(function (r) { return r.kgN === null; }).length, 'fertiliser record'));
    if (H.waterLicence && w && !((W.ST_CROP && W.ST_CROP.compliance && W.ST_CROP.compliance.waterReadings) || []).some(function (r) { return String(r.date || '').slice(0, 7) === mo; })) miss.push('this month’s water meter reading');
    if (H.reviewDue) miss.push('your targets review (due ' + D(H.reviewBy) + ')');
    var d = new Date(c.today + 'T12:00:00'), day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    var h = '<div class="sus-card sus-today"><div class="sus-gh"><div><span class="sus-k">' + e(day) + '</span><b class="sus-big">' + (open.length ? pl(open.length, 'job') + ' to do' : 'Nothing to do') + '</b></div>' + pill(typeof W.susLawPill === 'function' ? W.susLawPill(c.jobs) : law.length ? ['a', pl(law.length, 'job') + ' by law'] : ['g', 'Nothing by law']) + '</div>';
    /* -440 (UX-25): until setup is done the tiles' "Not started" says it once; no second and third "missing" list */
    if (setupDone()) h += '<p class="sus-mini">' + (miss.length ? 'Missing this year: ' + e(miss.join(', ')) + '.' : 'Nothing missing from this year’s records.') + '</p>';
    if (open.length) h += '<ol class="sus-ul">' + open.slice(0, 3).map(function (j) { return '<li>' + (j.cta ? '<button type="button" class="sus-lnk" style="font-weight:700;text-align:left" data-sa="jobgo" data-v="' + e(j.cta) + '">' + e(j.title) + '</button>' : '<b>' + e(j.title) + '</b>') + ' <span class="sus-mini">' + e(j.kind === 'law' ? 'By law' : j.kind === 'scheme' ? 'Scheme' : 'Setup') + '</span></li>'; }).join('') + '</ol><button class="sus-lnk" data-sh="tab" data-v="jobs">See all the jobs</button>';
    return h + '</div>';
  }
  function cmp(H, k, Y, fmt) { if (H.firstYear || Y !== H.Y || ((k === 'carbon' || k === 'carbonHa') && H.stored[Y - 1])) return null; var a = H.val(k, Y), b = H.val(k, Y - 1); if (a == null || b == null || !b) return null; var p = Math.round((a - b) / Math.abs(b) * 100); return p === 0 ? 'the same as ' + (Y - 1) : (p > 0 ? '+' : '') + p + '% on ' + (Y - 1); }
  function better(k, a, b) { var lo = METRICS[k] ? METRICS[k].low : true; return lo ? a <= b : a >= b; }
  function tiles(c, H, Y) {
    var R = H.years[Y], fp = R.fp, out = [], tgt = function (k) { var t = H.targets.filter(function (x) { return x.k === k; })[0]; return t ? ' Target: ' + t.p.word.toLowerCase() + '.' : ''; };
    /* 1. carbon */
    var big = Object.keys(fp.src).sort(function (a, b) { return fp.src[b] - fp.src[a]; })[0], hasEst = Object.keys(fp.srcStatus).some(function (s) { return fp.srcStatus[s] === 'estimate'; });
    var ch = cmp(H, 'carbon', Y), old = H.stored[Y];
    if (old) out.push({ k: 'c', n: 'Carbon', big: N(old.value) + ' t CO₂e', st: ['a', 'Earlier factor set'], line: 'Worked out with ' + old.set + '. Recalculate it with this year’s set to compare like for like.', work: function () { return carbonWork(c, H, Y); } });
    else out.push({ k: 'c', n: 'Carbon', big: fp.total > 0 ? N(fp.total) + ' t CO₂e' : 'Not worked out yet', st: fp.total > 0 ? (hasEst ? ['a', 'Includes estimates'] : ['g', 'From your records']) : ['n', 'Missing'],
      line: fp.total > 0 ? 'Whole farm' + (R.perHa ? ', ' + N(R.perHa, 1) + ' t per hectare' + (!(Number((window.ST || {}).farmHa) > 0) ? ' (no farm size in Settings yet, so over the rented land only)' : '') : '') + '. Biggest: ' + big.toLowerCase() + ' (' + Math.round(fp.src[big] / fp.total * 100) + '%).' + (ch ? ' ' + ch + '.' : '') + tgt('carbon') : 'Add fertiliser, fuel, power or stock and it appears here.', work: function () { return carbonWork(c, H, Y); } });
    /* 2. nitrogen */
    /* -440 (UX-33): one N headline with the manure in it: fertiliser and organic manure, per hectare farmed */
    var nh = R.nHa, chN = cmp(H, 'nHa', Y), allH = R.allHa, fa = c.inputs.p4.farmedHa;
    out.push({ k: 'n', n: 'Nitrogen', big: allH ? N(allH) + ' kg N per ha' : (R.fert.length ? 'N missing on records' : 'Nothing spread on fields yet'), st: allH ? (chN && !R.oN ? (better('nHa', H.val('nHa', Y), H.val('nHa', Y - 1)) ? ['g', 'Lower than ' + (Y - 1)] : ['a', 'Higher than ' + (Y - 1)]) : ['g', 'From Crops']) : ['n', 'Not started'],
      line: allH ? N(R.fN) + ' kg of N from fertiliser' + (R.oN ? ' and ' + N(R.oN) + ' kg from organic manure' : '') + ' over ' + N(fa, 1) + ' ha farmed.' + (chN && !R.oN ? ' ' + chN + '.' : '') + tgt('nHa') : ((c.manure && c.manure.kg > 0) ? 'Livestock manure is on the farm (Manure nitrogen, below); this tile counts what is spread on fields. ' : '') + 'Log fertiliser and manure spread in Crops with the N and the amount.', work: function () { return nWork(c, H, Y); } });
    /* 3. soil (as of today) */
    var S0 = c.n && c.n.soil, nf = S0 ? (S0.fields || []).length : 0;
    out.push({ k: 's', n: 'Soil', yearless: true, big: S0 ? N(Math.max(0, nf - S0.due - S0.missing)) + ' of ' + N(nf) + ' fields tested in time' : 'No crop fields yet', st: S0 ? (S0.due + S0.missing ? [S0.law ? 'r' : 'a', pl(S0.due + S0.missing, 'field') + ' due' + (S0.law ? ' by law' : '')] : ['g', 'Up to date']) : ['n', 'Not started'],
      line: S0 ? S0.label + '.' : 'Add fields in Crops and their soil tests.', work: function () { return soilWork(c); } });
    /* 4. nature (as of today) */
    var hb = H.hab;
    out.push({ k: 'na', n: 'Nature', yearless: true, big: hb.features ? (hb.overFarm ? N(hb.areaHa, 1) + ' ha of habitat' : hb.pct != null ? N(hb.pct, 1) + '% of the farm is habitat' : N(hb.areaHa, 1) + ' ha of habitat') : 'Nothing recorded yet', st: hb.features ? (hb.overFarm ? ['a', 'Check the areas'] : ['g', 'Recorded']) : ['n', 'Not started'],   /* -447: never over 100% */
      line: hb.features ? (hb.overFarm ? 'More habitat than farm: check the areas or the farm size. ' : '') + N(hb.areaHa, 1) + ' ha of woodland, ponds and margins' + (hb.hedgeM ? ', and ' + N(hb.hedgeM / 1000, 1) + ' km of hedges' : '') + '.' + tgt('habitat') : 'Add hedges, woods, ponds and margins under Nature.', work: function () { return natureWork(H); } });
    /* 5. energy */
    var en = fp.energy, sh = en.solarShare;
    out.push({ k: 'e', n: 'Energy', big: sh != null && en.solarUsedKwh > 0 ? Math.round(sh * 100) + '% of power from your solar' : (en.gridKwh ? N(en.gridKwh) + ' kWh bought' : (R.elec.length ? 'kWh missing on the bills' : 'No power bills yet')),
      st: R.elecNoKwh ? ['a', 'kWh missing on ' + pl(R.elecNoKwh, 'bill')] : (R.elec.length ? ['g', 'From your bills'] : ['n', 'Not started']),
      line: (en.gridKwh ? N(en.gridKwh) + ' kWh bought' + (R.elecGbp ? ' for ' + gbp(R.elecGbp) + ' as recorded' : '') + '. ' : '') + (en.solarKwh ? N(en.solarKwh) + ' kWh from the panels.' : 'No solar generation recorded.') + tgt('solar'), work: function () { return energyWork(c, H, Y); } });
    /* 6. water */
    var wt = H.water[Y];
    out.push({ k: 'w', n: 'Water', big: wt && wt.m3 != null ? N(wt.m3) + ' m³ taken' : (wt && wt.readings ? 'One reading so far' : 'No meter readings'), st: wt && wt.share != null ? (wt.share > 1 ? ['r', 'Over the licence'] : ['g', Math.round(wt.share * 100) + '% of the licence']) : (wt && wt.m3 != null ? ['g', 'From your meter'] : ['n', 'Not started']),
      line: wt && wt.m3 != null ? 'From ' + pl(wt.readings, 'meter reading') + ' in Crops.' + (wt.authorisedM3 ? ' Licence ' + N(wt.authorisedM3) + ' m³ a year.' : '') + tgt('water') : 'Meter readings and the licence live in Crops, Compliance.', work: function () { return waterWork(c, H, Y); } });
    return out;
  }

  /* ── workings ── */
  function table(head, rows, numCols) { numCols = numCols || []; return '<div class="sus-scroll"><table class="sus-t"><tr>' + head.map(function (x, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + e(x) + '</th>'; }).join('') + '</tr>' +
    rows.map(function (r) { return '<tr' + (r._tot ? ' class="tot"' : '') + '>' + r.map(function (x, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="n"' : '') + '>' + (x && typeof x === 'object' && 'html' in x ? x.html : e(x)) + '</td>'; })   /* -440 (UX-06): an empty html cell printed [object Object] */.join('') + '</tr>'; }).join('') + '</table></div>'; }
  function H_(s) { return { html: s }; }
  function srcTable(fp) {
    var ks = Object.keys(fp.src).sort(function (a, b) { return fp.src[b] - fp.src[a]; });
    var rows = ks.map(function (s) { return [s, N(fp.src[s], 1), Math.round(fp.src[s] / fp.total * 100) + '%', H_(fp.srcStatus[s] === 'estimate' ? est() : '<span class="sus-mini">Official factors</span>')]; });
    var t = ['Total', N(fp.total, 1), '100%', '']; t._tot = 1; rows.push(t);
    return table(['Source', 't CO₂e', 'Share', ''], rows, [1, 2]);
  }
  function carbonWork(c, H, Y) {
    var fp = H.years[Y].fp; if (!(fp.total > 0)) return '<p class="sus-mini">Nothing to work out yet. ' + e(fp.missing.join('; ')) + '.</p>';
    var h = H.stored[Y] ? '<p class="sus-mini sus-warn">Your stored ' + Y + ' figure is ' + N(H.stored[Y].value) + ' t, made with ' + e(H.stored[Y].set) + '. With this year’s set it would be ' + N(fp.total) + ' t, as below. It changes only if you recalculate it.</p>' : '';
    h += srcTable(fp);
    h += '<p class="sus-mini">The full workings, line by line, are under Carbon; the factors and their sources under Jobs and sources.</p><button class="btn-sec sm" data-sh="tab" data-v="c">Open Carbon</button>';
    return h;
  }
  function factorsTable(fp) {
    var ids = Object.keys(fp.used).filter(function (k) { return fp.rows.some(function (r) { return r.factors.indexOf(k) >= 0; }); });
    return table(['Factor', 'Value', 'Status', 'Source'], ids.map(function (k) { var f = fp.used[k]; return [f.label, N(f.value, 5) + ' ' + (f.unit || ''), H_(f.status === 'estimate' ? est() : f.status === 'verified' ? 'Official source' : e(f.status)), f.source || '']; }));
  }
  function carbonTab(c, H, Y) {
    var R = H.years[Y], fp = R.fp, h = '';
    if (H.firstYear) h += firstYearCard(H);
    h += '<div class="sus-card"><div class="sus-gh"><div><span class="sus-k">Carbon footprint, ' + Y + '</span><b class="sus-big">' + (fp.total > 0 ? N(fp.total) + ' t CO₂e' : 'Not worked out yet') + '</b>' + (R.perHa ? '<p class="sus-mini">' + N(R.perHa, 1) + ' t CO₂e per hectare over ' + N(R.ha, 1) + ' ha</p>' : '') + '</div>' +
      pill(fp.total > 0 ? (Object.keys(fp.srcStatus).some(function (s) { return fp.srcStatus[s] === 'estimate'; }) ? ['a', 'Includes estimates'] : ['g', 'From your records']) : ['n', 'Missing']) + '</div>';
    if (Y !== H.Y && H.stored[Y]) h += '<p class="sus-mini sus-warn">Shown below with this year’s set; your stored ' + Y + ' figure is ' + N(H.stored[Y].value) + ' t (' + e(H.stored[Y].set) + ').</p>';
    if (fp.total > 0) h += srcTable(fp);
    /* -440 (UX-23): the nitrous oxide method, the comparison method and the factor table are under Jobs and sources */
    h += '<p class="sus-mini"><b>Scope.</b> ' + e(fp.scope) + '</p></div>';
    if (fp.rows.length) h += '<div class="sus-card"><h3>Line by line</h3>' + table(['Source', 'What', 'Amount', 'Factor', 't CO₂e', ''], fp.rows.map(function (r) { return [r.src, r.what, N(r.qty, r.qty < 10 ? 2 : 0) + ' ' + r.unit, r.factor, N(r.t, 2), H_(r.status === 'estimate' || r.estimate ? est() : '<span class="sus-mini">Official factor</span>')]; }), [2, 4]) + '</div>';
    var tags = fp.estimates.slice(); if (tags.length || fp.missing.length || fp.notCounted.length) {
      h += '<div class="sus-card"><h3>What rests on estimates, and what is missing</h3>' + (tags.length ? '<p class="sus-est">' + est() + ' ' + e(tags.join('; ')) + '.</p>' : '') +
        (fp.missing.length ? '<p class="sus-mini"><b>Missing:</b> ' + e(fp.missing.join('; ')) + '.</p>' : '') + (fp.notCounted.length ? '<p class="sus-mini"><b>Recorded but not counted:</b> ' + e(fp.notCounted.join('; ')) + '.</p>' : '') +
        /* -439-sus6 (source audit S14): a labelled assumption the farmer ticks, never a silent default */
        ((fp.asks || []).indexOf('fert-mfg') >= 0 || A().set().assumeAnMfg ? '<label class="sus-f sus-cb"><input type="checkbox" data-sh-change="anmfg"' + (A().set().assumeAnMfg ? ' checked' : '') + '><span>No checked manufacture figure for some products (ammonium sulphate, DAP, MAP, compounds): use ammonium nitrate’s (a labelled assumption)</span></label>' : '') + '</div>'; }
    h += '<div class="sus-card"><h3>Where the records are</h3><ul class="sus-ul"><li>Fertiliser and lime: Crops, Inputs (with the N% and the amount). <button class="sus-lnk" data-sh="go" data-v="crop">Open Crops</button></li><li>Fuel and electricity: the bills in Money (litres and kWh), or the fuel log. <button class="sus-lnk" data-sh="go" data-v="money">Open Money</button></li><li>Stock: Livestock, with stock away kept in and other people’s stock left out. <button class="sus-lnk" data-sh="go" data-v="livestock">Open Livestock</button></li></ul></div>';
    return h;
  }
  /* -440 (UX-23): the technical sources in one place (Jobs and sources), for the farmer's adviser */
  function sourcesCard(c, H, Y) {
    var fp = H.years[Y] && H.years[Y].fp; if (!fp) return '';
    var h = '<div class="sus-card"><h3>Carbon: the factors and the method</h3><p class="sus-mini">' + e(setLine(H)) + '</p>';
    h += '<p class="sus-mini"><b>Nitrous oxide method: ' + e(fp.method.label) + '</b>' + (fp.method.status === 'confirmed' ? '' : ' (not decided yet)') + '. ' + e(fp.method.note || '') + '</p>';
    var alt = altMethod(c, H, Y); if (alt) h += '<p class="sus-mini">For comparison only: with ' + e(alt.label) + ' the total would be ' + N(alt.total) + ' t' + (alt.status === 'pending' ? ' (that method is not decided yet)' : '') + '.</p>';
    if (fp.rows.length) h += '<details class="sus-det"><summary>The factors used, with their sources</summary>' + factorsTable(fp) + '</details>';
    return h + '</div>';
  }
  var _alt = { key: null, v: null };
  function altMethod(c, H, Y) {
    var F = FAC(), M = F.methods && F.methods.n2o; if (!M) return null; var other = Object.keys(M.options).filter(function (k) { return k !== H.method.id; })[0]; if (!other) return null;
    var key = c.hash + ':' + Y + ':' + other; if (_alt.key === key) return _alt.v;
    var R = H.years[Y], inp = c.inputs, fp = EN().footprint({ nation: c.nation, year: Y, today: c.today, method: other, rainMm: inp.rainNormal || null, assume: inp.assume || {}, stock: { herds: inp.herds, animals: inp.animals, moves: inp.moves, batches: inp.batches, counts: inp.counts, opts: inp.opts, housing: inp.housing },
      fertiliser: R.fert.filter(function (r) { return r.kgN > 0; }).map(function (r) { return { kgN: r.kgN, kgNHa: r.ha > 0 ? r.kgN / r.ha : null, form: r.form }; }), fuel: R.fuel.length ? R.fuel.map(function (f) { return { litres: f.litres, fuel: f.fuel }; }) : (R.fuelLog ? [{ litres: R.fuelLog, fuel: 'gas_oil' }] : []),
      electricity: { kwh: R.fp.energy.gridKwh }, lime: R.lime.filter(function (r) { return r.tonnes > 0; }).map(function (r) { return { tonnes: r.tonnes, kind: r.kind }; }) }, LAW(), F);
    _alt = { key: key, v: fp.total > 0 ? { label: M.options[other].label, status: M.options[other].status, total: fp.total } : null }; return _alt.v;
  }
  function nWork(c, H, Y) {
    var R = H.years[Y]; if (!R.fert.length) return '<p class="sus-mini">No fertiliser spread in ' + Y + ' yet. Log it in Crops, Inputs, with the N% and the amount.</p>';
    var h = table(['Date', 'Field', 'Product', 'kg N', ''], R.fert.map(function (r) { return [D(r.date), r.field, r.product, r.kgN == null ? 'Missing' : N(r.kgN), r.why || '']; }).concat([(function () { var t = ['Total', '', '', N(R.fN), '']; t._tot = 1; return t; })()]), [3]);
    h += '<p class="sus-mini">Per hectare: ' + N(R.fN) + ' kg over ' + N(c.inputs.p4.farmedHa, 1) + ' ha of fields with a crop or grass. The crop N max and the 250 kg field limit are in Crops, Compliance.</p><button class="btn-sec sm" data-sh="go" data-v="crops">Open Crops, Compliance</button>';
    return h;
  }
  function soilWork(c) {
    var S0 = c.n && c.n.soil; if (!S0) return '<p class="sus-mini">No crop fields yet.</p>';
    var st = { ok: 'Up to date', due: 'Due', missing: 'Never tested' };
    return table(['Field', 'Last test', 'Next due', ''], (S0.fields || []).map(function (f) { return [f.name, f.last ? D(f.last) : 'None', f.dueOn ? D(f.dueOn) : '', st[f.state] || f.state || '']; })) +
      '<p class="sus-mini">' + e(S0.label) + '. ' + pl((S0.fields || []).length, 'field') + ': ' + N(S0.due) + ' due, ' + N(S0.missing) + ' never tested.</p><button class="btn-sec sm" data-sh="go" data-v="soil">Open the soil tests in Crops</button>';
  }
  function natureWork(H) {
    var hb = H.hab; if (!hb.features) return '<p class="sus-mini">Nothing recorded yet.</p><button class="btn-sec sm" data-sh="tab" data-v="na">Add habitat</button>';
    var rows = Object.keys(hb.byKind).map(function (k) { var x = hb.byKind[k]; return [hb.kinds[k], N(x.n), k === 'hedge' ? N(x.m) + ' m' : N(x.ha, 2) + ' ha']; });
    var hh = H.habHist, bY = num(H.set && H.set.baselineYear) || (H.Y - 1), b0 = hh && hh.at[bY + '-12-31'], nowH = hh && hh.at[Object.keys(hh.at).sort().slice(-1)[0]];
    var since = b0 && nowH ? '<p class="sus-mini">Since the end of ' + bY + ': ' + (nowH.areaHa - b0.areaHa >= 0 ? '+' : '') + N(nowH.areaHa - b0.areaHa, 2) + ' ha of area habitat and ' + (nowH.hedgeM - b0.hedgeM >= 0 ? '+' : '') + N(nowH.hedgeM - b0.hedgeM) + ' m of hedge, from the dated changes.' + (hh.dated ? '' : ' Some features have no date: they count as there all along.') + '</p>' : '';
    return table(['Kind', 'Features', 'Size'], rows, [1, 2]) + since + '<p class="sus-mini">Habitat share = ' + N(hb.areaHa, 2) + ' ha of area habitat over ' + (H && H.years[H.Y].ha ? N(H.years[H.Y].ha, 1) + ' ha' : 'the farm’s hectares') + '. Hedges are counted by length, never turned into an area. Removals by hedges and woods are never subtracted from the carbon.</p>';
  }
  function energyWork(c, H, Y) {
    var R = H.years[Y], en = R.fp.energy, h = '';
    h += table(['Line', 'Figure', 'From'], [['Electricity bought', N(en.gridKwh) + ' kWh', pl(R.elec.length, 'bill') + (R.elecNoKwh ? ', ' + R.elecNoKwh + ' without the kWh' : '')], ['Paid for it', R.elecGbp ? gbp(R.elecGbp) : '', 'as recorded in Money (no VAT worked out here)'],
      ['Solar generated', N(en.solarKwh) + ' kWh', R.solar ? 'your readings' : 'none recorded'], ['Solar exported', N(en.exportKwh) + ' kWh', ''], ['Solar used on the farm', N(en.solarUsedKwh) + ' kWh', 'generated less exported'],
      ['Share from your solar', en.solarShare != null ? Math.round(en.solarShare * 100) + '%' : '', 'solar used ÷ (solar used + bought)']].concat(Object.keys(en.fuel).map(function (f) { return [{ gas_oil: 'Red diesel', diesel: 'Road diesel', petrol: 'Petrol', kerosene: 'Heating oil', lpg: 'LPG' }[f] || f, N(en.fuel[f]) + ' litres', R.fuelFrom === 'log' ? 'the fuel log' : 'fuel bills']; })), [1]);
    return h + '<button class="btn-sec sm" data-sh="tab" data-v="e">Open Energy</button>';
  }
  function waterWork(c, H, Y) {
    var wt = H.water[Y]; if (!wt || !wt.readings) return '<p class="sus-mini">No meter readings yet. They live in Crops, Compliance, with the licence.</p><button class="btn-sec sm" data-sh="go" data-v="crops">Open Crops, Compliance</button>';
    return table(['Line', 'Figure'], [['Taken in ' + Y, wt.m3 == null ? 'Needs two readings' : N(wt.m3) + ' m³'], ['Licence', wt.authorisedM3 ? N(wt.authorisedM3) + ' m³ a year' : 'none recorded'], ['Share of the licence', wt.share != null ? Math.round(wt.share * 100) + '%' : ''],
      ['Busiest stretch', wt.peakPerDay != null ? N(wt.peakPerDay, 1) + ' m³ a day' : ''], ['The rule here', wt.rule && wt.rule.label ? (wt.rule.notifyLabel ? wt.rule.notifyLabel + '. ' : '') + wt.rule.label + (wt.rule.status === 'pending' ? ' (to confirm)' : '') : '']], [1]) +
      (wt.resets ? '<p class="sus-mini">' + pl(wt.resets, 'reading') + ' lower than the one before (a new meter?) not counted.</p>' : '') + '<button class="btn-sec sm" data-sh="tab" data-v="w">Open Water</button>';
  }

  /* the one chart: the tile picked; carbon by source (this year against last), the rest by year */
  function chart(c, H, Y) {
    var k = _ui.work && ['c', 'n', 'e', 'w', 'na'].indexOf(_ui.work) >= 0 ? _ui.work : 'c', Wd = 640, h = '<div class="sus-card sus-chart"><h3>';
    if (k === 'c') {
      var a = H.years[Y].fp, b = H.years[Y - 1] && !H.stored[Y - 1] && !H.stored[Y] ? H.years[Y - 1].fp : null, ks = Object.keys(a.src).concat(b ? Object.keys(b.src) : []).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort(function (x, y) { return (a.src[y] || 0) - (a.src[x] || 0); });
      h += 'Carbon by source, ' + Y + (b && b.total > 0 && !H.firstYear ? ' against ' + (Y - 1) : '') + '</h3>';
      if (!ks.length) return h + '<p class="sus-mini">Nothing to draw yet.</p></div>';
      var mx = 0; ks.forEach(function (s) { mx = Math.max(mx, a.src[s] || 0, b ? b.src[s] || 0 : 0); });
      var row = 34, H0 = ks.length * row + 30, L = 150, Rr = 70, iw = Wd - L - Rr, svg = '';
      ks.forEach(function (s, i) { var y0 = 14 + i * row, va = a.src[s] || 0, vb = b && !H.firstYear ? b.src[s] || 0 : null;
        svg += '<text x="' + (L - 8) + '" y="' + (y0 + 15) + '" text-anchor="end" font-size="12" fill="var(--t2)">' + e(s) + '</text>';
        if (vb != null) svg += '<rect x="' + L + '" y="' + (y0 + 1) + '" width="' + (vb / mx * iw).toFixed(1) + '" height="8" rx="3" fill="var(--br)"/>';
        svg += '<rect x="' + L + '" y="' + (y0 + 10) + '" width="' + Math.max(1, va / mx * iw).toFixed(1) + '" height="14" rx="4" fill="var(--gl)"/>';
        svg += '<text x="' + (L + va / mx * iw + 6).toFixed(1) + '" y="' + (y0 + 22) + '" font-size="12" font-weight="700" fill="var(--t1)">' + N(va) + ' t</text>'; });
      h += '<svg viewBox="0 0 ' + Wd + ' ' + H0 + '" width="100%" role="img" aria-label="Carbon by source">' + svg + '</svg>';
      h += '<p class="sus-mini">Green: ' + Y + '.' + (b && !H.firstYear ? ' Grey: ' + (Y - 1) + ', same factor set.' : '') + ' Total ' + N(a.total) + ' t.</p>';
      return h + '</div>';
    }
    var map = { n: 'nHa', e: 'solar', w: 'water', na: 'habitat' }, m = METRICS[map[k]], ys = [Y - 1, Y], vals = ys.map(function (y) { return H.val(map[k], y); });
    h += e(m.n) + ', by year</h3>';
    if (vals.every(function (v) { return v == null; })) return h + '<p class="sus-mini">Nothing to draw yet.</p></div>';
    var mx2 = Math.max.apply(null, vals.map(function (v) { return v || 0; })) || 1, s2 = '', bw = 120;
    ys.forEach(function (y, i) { var v = vals[i], x = 120 + i * 220, hh = v == null ? 0 : v / mx2 * 140;
      s2 += v == null ? '<text x="' + (x + bw / 2) + '" y="150" text-anchor="middle" font-size="12" fill="var(--t3)">No figure</text>' : '<rect x="' + x + '" y="' + (170 - hh).toFixed(1) + '" width="' + bw + '" height="' + hh.toFixed(1) + '" rx="6" fill="' + (y === Y ? 'var(--gl)' : 'var(--br)') + '"/><text x="' + (x + bw / 2) + '" y="' + (164 - hh).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="var(--t1)">' + N(v, m.dp) + m.u + '</text>';
      s2 += '<text x="' + (x + bw / 2) + '" y="190" text-anchor="middle" font-size="12" fill="var(--t2)">' + y + '</text>'; });
    return h + '<svg viewBox="0 0 ' + Wd + ' 200" width="100%" role="img" aria-label="' + e(m.n) + ' by year">' + s2 + '</svg>' + (k === 'na' ? '<p class="sus-mini">Habitat has no history yet: this year only.</p>' : '') + '</div>';
  }

  /* ── area tabs ── */
  function energyTab(c, H, Y) {
    var R = H.years[Y], ap = A(), s = ap.S(), h = '<div class="sus-card"><h3>Energy, ' + Y + '</h3>' + energyWork(c, H, Y).replace(/<button[^>]*data-v="e"[^>]*>[^<]*<\/button>/, '') + '<p class="sus-mini">The £ figures are as the bills were recorded in Money. VAT on power is not worked out here: that question is with the accountant.</p></div>';
    h += '<div class="sus-card"><h3>Electricity bills in ' + Y + '</h3>' + (R.elec.length ? table(['Date', 'Bill', '£ as recorded', 'kWh'], R.elec.map(function (b) { return [D(b.date), b.desc, gbp(b.amt), b.kwh ? N(b.kwh) : 'Missing']; }), [2, 3]) + '<p class="sus-mini">Add the kWh to a bill by editing it in Money (Quantity, unit kWh).</p>' : '<p class="sus-mini">No bills in the Electricity category yet. When you add one in Money, put the kWh from the bill in Quantity with the unit kWh.</p>') + '<button class="btn-sec sm" data-sh="go" data-v="money">Open Money</button></div>';
    var list = (s ? s.solar : []).slice().sort(function (a, b) { return a.period < b.period ? 1 : -1; });
    h += '<div class="sus-card" id="sus-solar"><h3>Solar generation</h3><p class="sus-mini">Read the total off the inverter or the generation meter: a whole year, or month by month. Bought electricity comes from the bills, not from here.</p>';
    h += list.length ? table(['Period', 'Generated', 'Exported', ''], list.map(function (r) { return [r.period, N(r.genKwh) + ' kWh', r.expKwh != null ? N(r.expKwh) + ' kWh' : '', H_('<button class="sus-lnk" data-sh="sdel" data-v="' + e(r.id) + '">Remove</button>')]; }), [1, 2]) : '<p class="sus-mini">No readings yet.</p>';
    if (_ui.sf) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>Year or month</span><input type="month" id="sus-s-mo"></label><label class="sus-f"><span>or the whole year</span><input type="number" id="sus-s-yr" min="2015" max="2100" placeholder="e.g. ' + Y + '"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>Generated, kWh</span><input type="number" min="0" step="1" id="sus-s-gen"></label><label class="sus-f"><span>Exported, kWh (optional)</span><input type="number" min="0" step="1" id="sus-s-exp"></label></div><div class="sus-bt"><button class="btn-pri sm" data-sh="ssave">Save</button><button class="btn-sec sm" data-sh="scancel">Cancel</button></div></div>';
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sh="sopen">Add a solar reading</button></div>';
    h += '</div><div class="sus-card"><h3>Fuel in ' + Y + '</h3>' + (R.fuel.length ? table(['Date', 'Bill', 'Fuel', 'Litres'], R.fuel.map(function (f) { return [D(f.date), f.desc, { gas_oil: 'Red diesel', diesel: 'Road diesel', petrol: 'Petrol', kerosene: 'Heating oil', lpg: 'LPG' }[f.fuel] + (f.assumed ? ' (assumed)' : ''), N(f.litres)]; }), [3]) :
      (R.fuelLog ? '<p class="sus-mini">No litres on the fuel bills, so the fuel log is used: ' + N(R.fuelLog) + ' litres issued to machines.</p>' : '<p class="sus-mini">No litres yet. Put the litres on fuel bills in Money (Quantity, unit litre), or log fuel used in the fuel log.</p>')) + '</div>';
    return h;
  }
  function waterTab(c, H, Y) {
    var wt = H.water[Y], cc = W.ST_CROP && W.ST_CROP.compliance, rs = cc ? (cc.waterReadings || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }) : [];
    var h = '<div class="sus-card"><h3>Water, ' + Y + '</h3>' + waterWork(c, H, Y).replace(/<button[^>]*data-v="w"[^>]*>[^<]*<\/button>/, '') + '<p class="sus-mini">The readings and the licence (' + e(H.waterLicence || 'no number recorded') + ') are one record, kept with Crops, Compliance. Add a reading here or there; nothing is logged twice.</p>' +
      /* -440 (UX-42): a dairy or pig farm with a borehole adds its meter reading here, without going into Crops */
      '<div class="sus-row3"><label class="sus-f"><span>Reading date</span><input type="date" id="cwr-date" max="' + e(c.today) + '"></label><label class="sus-f"><span>Meter reading, m³</span><input type="number" min="0" id="cwr-m3"></label></div><div class="sus-bt"><button class="btn-sec sm" data-sh="wadd">Add the reading</button>' + (W.entOn && !W.entOn('crops') ? '' : '<button class="sus-lnk" data-sh="go" data-v="crops">The licence, in Crops</button>') + '</div></div>';
    if (rs.length) h += '<div class="sus-card"><h3>Meter readings</h3>' + table(['Date', 'Reading'], rs.slice(0, 24).map(function (r) { return [D(r.date), N(r.m3) + ' m³']; }), [1]) + '</div>';
    return h;
  }
  function habUnsure(x) { return !!(x && Array.isArray(x.history) && x.history.some(function (y) { return y && y.unsure === true; })); }
  var KINDS = [['hedge', 'Hedge (length)'], ['woodland', 'Woodland (area)'], ['pond', 'Pond or wet ground (area)'], ['margin', 'Field margin or buffer strip (area)'], ['other', 'Other habitat (area)']];
  function natureTab(c, H) {
    var ap = A(), s = ap.S(), list = (s ? s.habitats : []).filter(function (x) { return x && !x.removed; }), lands = ap.landsAll(), ln = function (id) { var l = lands.filter(function (x) { return String(x.id) === String(id); })[0]; return l ? l.name : ''; };
    var h = '<div class="sus-card"><h3>Nature</h3>' + natureWork(H).replace(/<button[^>]*data-v="na"[^>]*>[^<]*<\/button>/, '') + '</div><div class="sus-card" id="sus-hab"><h3>Hedges, woods, ponds and margins</h3>';
    h += list.length ? table(['Kind', 'Name', 'Field', 'Size', 'Photo', ''], list.map(function (x) { return [{ hedge: 'Hedge', woodland: 'Woodland', pond: 'Pond or wet ground', margin: 'Margin', other: 'Other' }[x.kind] || x.kind, x.name, ln(x.land), x.kind === 'hedge' ? N(x.lengthM) + ' m' : N(x.areaHa, 2) + ' ha',
      H_(x.photo ? '<button class="sus-lnk" data-sh="hphoto" data-v="' + e(x.id) + '">View</button>' : '<label class="sus-lnk">Add<input type="file" accept="image/*" hidden data-sh-file="' + e(x.id) + '"></label>'), H_((habUnsure(x) ? '<button class="sus-chip" data-sh="hask" data-v="' + e(x.id) + '">New this year? Answer</button> ' : '') + '<button class="sus-lnk" data-sh="hchg" data-v="' + e(x.id) + '">Change size</button> <button class="sus-lnk" data-sh="hdel" data-v="' + e(x.id) + '">Remove</button>')]; }), [3]) : '<p class="sus-mini">Nothing recorded yet.</p>';
    var hcx = _ui.hc ? list.filter(function (x) { return x.id === _ui.hc; })[0] : null;
    if (hcx) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>New ' + (hcx.kind === 'hedge' ? 'length, metres' : 'area, hectares') + '</span><input type="number" min="0" step="' + (hcx.kind === 'hedge' ? '1' : '0.01') + '" id="sus-hc-size"></label><label class="sus-f"><span>Changed on</span><input type="date" id="sus-hc-on" value="' + e(A().today()) + '"></label></div><div class="sus-bt"><button class="btn-pri sm" data-sh="hchgsave" data-v="' + e(hcx.id) + '">Save the change</button><button class="btn-sec sm" data-sh="hchg" data-v="' + e(hcx.id) + '">Cancel</button></div><p class="sus-mini">Each change keeps its date, so progress since your baseline is real.</p></div>';
    /* -445 (decision 4): "Not sure" is asked again from the list; "No, new this year" asks the date (today to start with) */
    var hax = _ui.ha ? list.filter(function (x) { return x.id === _ui.ha; })[0] : null;
    if (hax) h += '<div class="sus-form"><div class="sus-q"><span class="sus-ql">Was ' + e(hax.name || 'it') + ' there before ' + e(String(H.Y)) + '?</span><div class="sus-seg" role="group" aria-label="There before this year">' + [['yes', 'Yes, it was already there'], ['no', 'No, new this year']].map(function (o) { var x = _ui.haB === o[0]; return '<button type="button" data-sh="habefore" data-v="' + o[0] + '" class="' + (x ? 'on' : '') + '" aria-pressed="' + x + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      (_ui.haB === 'no' ? '<label class="sus-f"><span>When was it planted, dug or made?</span><input type="date" id="sus-ha-on" value="' + e(A().today()) + '" min="' + e(A().today().slice(0, 4)) + '-01-01" max="' + e(A().today()) + '"></label>' : '') + '</div>' +
      '<div class="sus-bt"><button class="btn-pri sm" data-sh="hasave" data-v="' + e(hax.id) + '">Save</button><button class="btn-sec sm" data-sh="hask" data-v="' + e(hax.id) + '">Cancel</button></div></div>';
    var hist = (s ? s.habitats : []).filter(function (x) { return x && Array.isArray(x.history) && x.history.length; });
    if (hist.length) h += '<details class="sus-det"><summary>History of changes</summary><ul class="sus-ul">' + [].concat.apply([], hist.map(function (x) { return x.history.map(function (y) { return [y.on, (x.name || ({ hedge: 'Hedge', woodland: 'Woodland', pond: 'Pond', margin: 'Margin', other: 'Habitat' }[x.kind] || x.kind)) + ': ' + (y.removed ? 'removed' : x.kind === 'hedge' ? N(y.lengthM) + ' m' : N(y.areaHa, 2) + ' ha')]; }); })).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).map(function (r) { return '<li>' + e(D(r[0]) + ': ' + r[1]) + '</li>'; }).join('') + '</ul></details>';
    if (_ui.hf) { var k = _ui.hf.kind || '';
      h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>Kind</span><select id="sus-h-kind" data-sh-change="hkind"><option value="">Choose</option>' + KINDS.map(function (o) { return '<option value="' + o[0] + '"' + (k === o[0] ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join('') + '</select></label>' +
        '<label class="sus-f"><span>Name (optional)</span><input type="text" maxlength="120" id="sus-h-name"></label><label class="sus-f"><span>Field</span><select id="sus-h-land"><option value="">Not answered</option>' + lands.map(function (l) { return '<option value="' + e(l.id) + '" data-k="' + e(l.kind) + '">' + e(l.name) + '</option>'; }).join('') + '</select></label></div>' +
        (k ? '<div class="sus-row3"><label class="sus-f"><span>' + (k === 'hedge' ? 'Length, metres' : 'Area, hectares') + '</span><input type="number" min="0" step="' + (k === 'hedge' ? '1' : '0.01') + '" id="sus-h-size"></label></div><div class="sus-q"><span class="sus-ql">Was it there before ' + e(String(H.Y)) + '?</span><div class="sus-seg" role="group" aria-label="There before this year">' + [['yes', 'Yes, it was already there'], ['no', 'No, new this year'], ['unsure', 'Not sure']].map(function (o) { var x = _ui.hf.before === o[0]; return '<button type="button" data-sh="hbefore" data-v="' + o[0] + '" class="' + (x ? 'on' : '') + '" aria-pressed="' + x + '">' + o[1] + '</button>'; }).join('') + '</div>' +
          (_ui.hf.before === 'unsure' ? '<p class="sus-mini">We count it as already there, so no gain is claimed. It shows “New this year? Answer” on the list until you know.</p>' : _ui.hf.before ? '<label class="sus-f"><span>' + (_ui.hf.before === 'no' ? 'When was it planted, dug or made?' : 'There since (optional; leave blank if you don’t know)') + '</span><input type="date" id="sus-h-on" max="' + e(A().today()) + '"></label>' : '') + '</div>' : '') +   /* -440 (UX-12): never dated today for the farmer */
        '<div class="sus-bt"><button class="btn-pri sm" data-sh="hsave">Save</button><button class="btn-sec sm" data-sh="hcancel">Cancel</button></div><p class="sus-mini">A photo can be added once it is saved. Photos are kept in your farm’s private files.</p></div>'; }
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sh="hopen">Add a hedge, wood, pond or margin</button></div>';
    return h + '</div>';
  }
  function targetsTab(c, H) {
    /* -440 (UX-12): only years that hold records can be a baseline (this year always can); a farm in its first year sees only this year */
    var ap = A(), st = ap.set(), T = st.targets || {}, items = T.items || {}, Y = H.Y, by = H.baselineYear, years = [Y - 3, Y - 2, Y - 1].filter(function (y) { return H.years[y] && H.years[y].hasRecords; }).concat([Y]);
    if (by && years.indexOf(by) < 0) years.unshift(by);
    var h = '<div class="sus-card"><h3>Baseline and targets</h3><p class="sus-mini">Nothing is set for you. Pick the year to measure from, then set only the targets you want. Progress is worked out against a straight line from the baseline to the target year, and every year is worked out the same way, so they compare like for like.</p>';
    h += '<div class="sus-q"><span class="sus-ql">Baseline year</span><div class="sus-seg" role="group" aria-label="Baseline year">' + years.map(function (y) { var o = by === y; return '<button type="button" data-sh="base" data-v="' + y + '" class="' + (o ? 'on' : '') + '" aria-pressed="' + o + '">' + y + '</button>'; }).join('') + '</div>' + (by ? '' : '<p class="sus-mini">Not chosen yet.</p>') + '</div>';
    if (years.length === 1) h += '<p class="sus-mini">Your first year with records is ' + Y + ', so it is the only baseline you can choose.</p>';
    if (by && by < Y) { var Rb = H.years[by]; h += '<p class="sus-mini">' + by + ': ' + (Rb && Rb.hasRecords && Rb.fp.total > 0 ? N(Rb.fp.total) + ' t CO₂e' : 'no records for ' + by + ', so no figure') + '.</p>'; }
    h += '</div><div class="sus-card"><h3>Targets</h3>';
    var rows = Object.keys(METRICS).filter(function (k) { return k !== 'carbonHa'; }).map(function (k) {
      var m = METRICS[k], t = items[k], p = H.targets.filter(function (x) { return x.k === k; })[0], now = H.val(k, Y);
      return '<div class="sus-trow"><div><b>' + e(m.n) + '</b><p class="sus-mini">Now: ' + (now == null ? 'no figure yet' : N(now, m.dp) + m.u) + (t ? '. Target ' + N(t.v, m.dp) + m.u + ' by ' + e(t.by) + ', set ' + e(D(t.setOn)) : '') + '</p>' +
        (k === 'habitat' && H.hab && H.hab.hedgeM ? '<p class="sus-mini">Hedges count by length, not area, so the ' + N(H.hab.hedgeM / 1000, 1) + ' km of hedge is not in this share.</p>' : '')   /* -440 (UX-41) */ + (p ? '<p class="sus-mini">' + pill(p.p.status === 'met' || p.p.status === 'on' ? ['g', p.p.word] : p.p.status === 'behind' ? ['a', p.p.word] : ['n', p.p.word]) + ' ' + e(p.p.words) + '</p>' : '') + '</div>' +
        '<div class="sus-tset"><label class="sus-f"><span>Target' + (m.u ? ' (' + m.u.trim() + ')' : '') + '</span><input type="number" step="any" min="0" id="sus-t-v-' + k + '" value="' + (t ? e(t.v) : '') + '"></label><label class="sus-f"><span>By</span><input type="number" min="' + (Y + 1) + '" max="2060" id="sus-t-by-' + k + '" value="' + (t ? e(t.by) : '') + '" placeholder="year"></label>' +
        '<button class="btn-sec sm" data-sh="tset" data-v="' + k + '">' + (t ? 'Change' : 'Set') + '</button>' + (t ? '<button class="sus-lnk" data-sh="tdel" data-v="' + k + '">Remove</button>' : '') + '</div></div>';
    }).join('');
    h += rows + '</div><div class="sus-card"><h3>Review</h3><p class="sus-mini">' + (H.reviewedAt ? 'Last reviewed ' + e(D(H.reviewedAt)) + '. ' : 'Not reviewed yet. ') + (H.reviewBy ? 'Next review ' + e(D(H.reviewBy)) + (H.reviewDue ? ' (due now).' : '.') : 'No review date set.') + '</p>' +
      '<div class="sus-bt"><label class="sus-f"><span>Review the targets on</span><input type="date" id="sus-t-rev" value="' + e(H.reviewBy || '') + '"></label><button class="btn-sec sm" data-sh="trev">Save the review date</button><button class="btn-sec sm" data-sh="tdone">Reviewed today</button></div></div>';
    return h;
  }

  /* ── actions ── */
  function S() { return A().S(); }
  function saveP(msg) { A().save(msg); }
  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-sh]') : null; if (!b || !on() || !A()) return;
    var a = b.getAttribute('data-sh'), v = b.getAttribute('data-v') || '', s = S(), st = A().set(); if (!s) return;
    var redraw = function () { try { W.susRedraw(); } catch (er) {} };
    switch (a) {
      case 'tab': _ui.tab = v; redraw(); try { var p = document.getElementById('pg-sustain'); if (p && p.scrollIntoView && v !== 'ov') p.scrollIntoView({ block: 'start' }); } catch (er) {} return;
      case 'year': _ui.year = +v; redraw(); return;
      case 'work': _ui.work = _ui.work === v ? null : v; redraw(); return;
      case 'go': goTo(v); return;
      case 'recalc': recalc(+v); return;
      case 'sopen': _ui.sf = true; redraw(); return;
      case 'scancel': _ui.sf = null; redraw(); return;
      case 'ssave': solarSave(); return;
      case 'sdel': A().removeRow('solar', v); saveP('Removed'); return;
      case 'hopen': _ui.hf = { kind: '' }; redraw(); return;
      case 'wadd': if (typeof W.cropAddWaterReading === 'function') { var wd = (document.getElementById('cwr-date') || {}).value; if (wd && wd > A().today()) { W.toast && W.toast('That date has not happened yet', 'info'); return; } try { W.cropAddWaterReading(); } catch (er) { console.warn('water reading', er); } redraw(); } return;
      case 'hbefore': if (_ui.hf) { _ui.hf.before = v; redraw(); } return;
      case 'hcancel': _ui.hf = null; redraw(); return;
      case 'hask': _ui.ha = _ui.ha === v ? null : v; _ui.haB = null; redraw(); return;
      case 'habefore': _ui.haB = v; redraw(); return;
      case 'hasave': habAnswer(v); return;
      case 'hsave': habSave(); return;
      case 'hdel': if (W.susArmed && !W.susArmed(b)) return; var hx = S().habitats.filter(function (x) { return x.id === v; })[0]; if (hx) { hx.history = (hx.history || []).concat([{ on: A().today(), removed: true }]); hx.removed = true; } saveP('Removed today (kept in the history)'); return;
      case 'hchg': _ui.hc = _ui.hc === v ? null : v; redraw(); return;
      case 'hchgsave': habChange(v); return;
      case 'hphoto': photoView(v); return;
      case 'base': st.baselineYear = +v; saveP('Baseline year ' + v); return;
      case 'tset': targetSet(v); return;
      case 'tdel': var T = st.targets = Object.assign({}, st.targets || {}); T.items = Object.assign({}, T.items || {}); delete T.items[v]; saveP('Target removed'); return;
      case 'trev': var rv = (document.getElementById('sus-t-rev') || {}).value || ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(rv)) { W.toast && W.toast('Choose the review date', 'info'); return; }
        st.targets = Object.assign({}, st.targets || {}, { reviewBy: rv }); saveP('Review date saved'); return;
      case 'tdone': st.targetsReviewedAt = A().today(); saveP('Marked as reviewed today'); return;
    }
  }
  function onChange(ev) {
    var t = ev.target; if (!t || !on() || !A()) return;
    if (t.getAttribute && t.getAttribute('data-sh-change') === 'hkind' && _ui.hf) { _ui.hf.kind = t.value; var nm = (document.getElementById('sus-h-name') || {}).value, ld = (document.getElementById('sus-h-land') || {}).value; _ui.hf.name = nm; _ui.hf.land = ld; W.susRedraw();
      setTimeout(function () { var a = document.getElementById('sus-h-name'), b = document.getElementById('sus-h-land'); if (a && nm) a.value = nm; if (b && ld) b.value = ld; }, 0); return; }
    if (t.getAttribute && t.getAttribute('data-sh-change') === 'anmfg') { A().set().assumeAnMfg = !!t.checked; A().save('Saved'); return; }
    var fid = t.getAttribute && t.getAttribute('data-sh-file'); if (fid) photoAdd(fid, t);
  }
  function goTo(v) {
    if (v === 'crops' || v === 'soil') { try { W._susApi.goTo(v); } catch (er) {} return; }
    if (v === 'crop') { W.nav('crop'); return; }
    if (v === 'money') { try { W.nav('expenses'); } catch (er) {} return; }
    if (v === 'livestock') { W.nav('livestock'); return; }
  }
  function recalc(y) {
    var c = W.susCompute(), H = c && c.h; if (!H || !H.stored[y]) return;
    var st = A().set(), su = st.setup = Object.assign({}, st.setup || {}), rc = su.recalc = Object.assign({}, su.recalc || {});
    rc[y] = { from: H.stored[y].set, to: H.setFull, on: A().today(), was: H.stored[y].value };
    var row = S().results.filter(function (r) { return r.id === y + ':footprint_t'; })[0]; if (row) { row.factorSet = H.setFull; row.hash = 'recalc'; row._new = true; }
    saveP(y + ' recalculated with this year’s factor set');
  }
  function solarSave() {
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var mo = v('sus-s-mo'), yr = v('sus-s-yr'), g = num(v('sus-s-gen')), x = num(v('sus-s-exp')), per = /^\d{4}-\d{2}$/.test(mo) ? mo : (/^\d{4}$/.test(yr) ? yr : null);
    if (!per) { W.toast && W.toast('Choose the month, or type the year', 'info'); return; }
    if (g === null || g < 0 || g > 1e8) { W.toast && W.toast('Type the kWh generated', 'info'); return; }
    if (x !== null && (x < 0 || x > g)) { W.toast && W.toast('Exported can’t be more than generated', 'info'); return; }
    var s = S(); if (s.solar.some(function (r) { return r.period === per; })) { W.toast && W.toast('There is already a reading for ' + per + ': remove it first', 'info'); return; }
    s.solar.push({ id: A().uid('so'), period: per, genKwh: g, expKwh: x, on: A().today(), _new: true }); _ui.sf = null; saveP('Solar reading saved');
  }
  function habChange(id) {
    var hx = S().habitats.filter(function (x) { return x.id === id; })[0]; if (!hx) return;
    var sz = num((document.getElementById('sus-hc-size') || {}).value), on = (document.getElementById('sus-hc-on') || {}).value || '';
    if (!(sz > 0)) { W.toast && W.toast(hx.kind === 'hedge' ? 'Type the new length in metres' : 'Type the new area in hectares', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > A().today()) { W.toast && W.toast('Choose the date it changed', 'info'); return; }
    if (!Array.isArray(hx.history) || !hx.history.length) hx.history = [{ on: hx.addedOn || '2000-01-01', lengthM: hx.lengthM, areaHa: hx.areaHa }];
    hx.history.push({ on: on, lengthM: hx.kind === 'hedge' ? sz : null, areaHa: hx.kind === 'hedge' ? null : sz });
    hx.history.sort(function (a, b) { return a.on < b.on ? -1 : 1; }); var last = hx.history[hx.history.length - 1]; hx.lengthM = last.lengthM; hx.areaHa = last.areaHa;
    _ui.hc = null; saveP('Change saved with its date');
  }
  function habSave() {
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var k = v('sus-h-kind'), sz = num(v('sus-h-size')), land = v('sus-h-land'), lo = land ? A().landsAll().filter(function (l) { return String(l.id) === land; })[0] : null;
    if (!k) { W.toast && W.toast('Choose the kind', 'info'); return; }
    if (sz === null || !(sz > 0) || sz > (k === 'hedge' ? 1e6 : 1e5)) { W.toast && W.toast(k === 'hedge' ? 'Type the length in metres' : 'Type the area in hectares', 'info'); return; }
    if (k !== 'hedge' && lo && lo.area > 0 && sz > lo.area) { W.toast && W.toast('That is more than the field’s ' + N(lo.area, 2) + ' ha', 'info'); return; }
    var bf = _ui.hf && _ui.hf.before; if (!bf) { W.toast && W.toast('Was it there before this year?', 'info'); return; }
    var on = /^\d{4}-\d{2}-\d{2}$/.test(v('sus-h-on')) ? v('sus-h-on') : null; if (on && on > A().today()) { W.toast && W.toast('The date can’t be in the future', 'info'); return; }
    if (bf === 'no' && !on) { W.toast && W.toast('When was it planted, dug or made?', 'info'); return; }
    if (bf === 'no' && on < A().today().slice(0, 4) + '-01-01') { W.toast && W.toast('That date is before this year. Choose “it was already there”', 'info'); return; }
    if (bf === 'yes' && on && on >= A().today().slice(0, 4) + '-01-01') { W.toast && W.toast('That date is this year. Choose “new this year”', 'info'); return; }
    if (bf === 'unsure') on = null;   /* -445 (decision 4): "Not sure" is saved like "already there, no date", marked unsure */
    /* -440 (UX-12): "already there" with no date counts as there all along (no gain is claimed); a new one keeps its real date */
    S().habitats.push({ id: A().uid('hb'), kind: k, name: v('sus-h-name').slice(0, 120), lengthM: k === 'hedge' ? sz : null, areaHa: k === 'hedge' ? null : sz, land: land || null, landKind: lo ? lo.kind : null,
      addedOn: on, history: [Object.assign({ on: on || '2000-01-01', lengthM: k === 'hedge' ? sz : null, areaHa: k === 'hedge' ? null : sz }, bf === 'unsure' ? { unsure: true } : {})], _new: true });
    _ui.hf = null; saveP('Saved');
  }
  /* -445 (decision 4): the answer to a "Not sure". Yes: already there (2000-01-01 stays, unsure cleared). No: new this year, on the date given. */
  function habAnswer(id) {
    var hx = S().habitats.filter(function (x) { return x.id === id; })[0]; if (!hx || !_ui.haB) { W.toast && W.toast('Was it there before this year?', 'info'); return; }
    var hs = Array.isArray(hx.history) && hx.history.length ? hx.history : [{ on: '2000-01-01', lengthM: hx.lengthM, areaHa: hx.areaHa }];
    hs = hs.map(function (y) { var o = Object.assign({}, y); delete o.unsure; return o; });
    if (_ui.haB === 'no') { var on = (document.getElementById('sus-ha-on') || {}).value || '', t = A().today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > t) { W.toast && W.toast('When was it planted, dug or made?', 'info'); return; }
      if (on < t.slice(0, 4) + '-01-01') { W.toast && W.toast('That date is before this year. Choose “it was already there”', 'info'); return; }
      hs[0].on = on; hx.addedOn = on; hs.sort(function (a, b) { return a.on < b.on ? -1 : 1; }); }
    hx.history = hs; _ui.ha = null; _ui.haB = null; saveP('Saved');
  }
  function targetSet(k) {
    var m = METRICS[k], vv = num((document.getElementById('sus-t-v-' + k) || {}).value), by = num((document.getElementById('sus-t-by-' + k) || {}).value), c = W.susCompute(), H = c && c.h; if (!m || !H) return;
    if (vv === null || vv < 0 || (m.u === '%' && vv > 100)) { W.toast && W.toast('Type the target figure', 'info'); return; }
    if (!(by > H.Y && by <= 2060) || Math.floor(by) !== by) { W.toast && W.toast('Type the year to reach it by (after ' + H.Y + ')', 'info'); return; }
    var st = A().set(), T = st.targets = Object.assign({}, st.targets || {}); T.items = Object.assign({}, T.items || {});
    T.items[k] = { v: vv, by: by, setOn: A().today(), base: k === 'habitat' ? (H.val('habitat', num(H.set && H.set.baselineYear) || H.Y) != null ? H.val('habitat', num(H.set && H.set.baselineYear) || H.Y) : H.val('habitat', H.Y)) : null, baseYear: k === 'habitat' ? ((num(H.set && H.set.baselineYear) && H.val('habitat', num(H.set.baselineYear)) != null) ? num(H.set.baselineYear) : H.Y) : null };
    saveP('Target saved' + (H.baselineYear ? '' : '. Choose a baseline year to see progress'));
  }
  function photoAdd(id, input) {
    var f = input.files && input.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { W.toast && W.toast('Choose a photo', 'info'); return; }
    if (f.size > 8 * 1024 * 1024) { W.toast && W.toast('That photo is over 8 MB', 'info'); return; }
    var h = S().habitats.filter(function (x) { return x.id === id; })[0]; if (!h) return;
    var AI = W.AI, fid = AI && AI.farm && AI.farm.active ? AI.farm.active() : null;
    if (!fid || !AI.storage || W.__AI_GUEST) { W.toast && W.toast('Photos are kept in your farm’s private files: sign in to add one', 'info'); return; }
    var path = AI.storage.path(fid, 'sustainability', 'habitats', f.name || 'photo.jpg');
    AI.storage.upload(path, f, f.type).then(function (stored) { h.photo = stored; h.photoName = String(f.name || 'photo').slice(0, 120); saveP('Photo added'); })
      .catch(function () { W.toast && W.toast('The photo could not be uploaded. Try again when you are online', 'error'); });
  }
  function photoView(id) {
    var h = S().habitats.filter(function (x) { return x.id === id; })[0]; if (!h || !h.photo) return; var AI = W.AI;
    if (!AI || !AI.storage) return;
    AI.storage.signedUrl(h.photo, 600).then(function (u) { try { W.open(u, '_blank', 'noopener'); } catch (er) {} }).catch(function () { W.toast && W.toast('Could not open the photo', 'error'); });
  }
  /* the kWh on an electricity bill: Money's own Quantity + unit, with a kWh unit added for the pilot */
  function expUnit(cat) {
    if (!on()) return; var u = document.getElementById('ae-unit'); if (!u) return;
    if (!Array.prototype.some.call(u.options, function (o) { return o.value === 'kWh'; })) { var o = document.createElement('option'); o.value = 'kWh'; o.textContent = 'kWh'; u.appendChild(o); }
    if (cat === 'Electricity') { u.value = 'kWh'; var q = document.getElementById('ae-qty'); if (q) q.placeholder = 'kWh on the bill'; }
  }
  var _wired = false;
  function wire() { if (_wired) return; var el = document.getElementById('pg-sustain'); if (!el) return; _wired = true; el.addEventListener('click', onClick); el.addEventListener('change', onChange); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 0);

  /* styles */
  try {
    var css = '.sus-tabs{margin:0 0 14px}.sus-tabs button{font-size:13px;padding:8px 13px}.sus-yb{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}.sus-yb .sus-mini{flex:1;min-width:240px;margin:0}' +
      '.sus-warn{background:var(--ap);border-radius:8px;padding:8px 10px;color:#5C3D00}.sus-first{border-color:var(--am);background:var(--ap)}.sus-today .sus-big{display:block}' +
      '.sus-tbtn{text-align:left;cursor:pointer;font:inherit;color:inherit}.sus-tbtn.on{box-shadow:0 0 0 2px var(--gl) inset}.sus-tbtn:focus-visible{outline:2px solid var(--gm);outline-offset:2px}' +
      '.sus-h{font-size:13px;font-weight:800;color:var(--t2);margin:18px 0 10px;text-transform:uppercase;letter-spacing:.04em}.sus-chart svg{display:block;max-width:100%;height:auto}' +
      '.sus-trow{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--br2)}.sus-trow:first-of-type{border-top:0}.sus-tset{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.sus-tset input{width:110px}' +
      '@media (max-width:640px){.sus-trow{flex-direction:column}.sus-tabs{display:flex;overflow-x:auto;flex-wrap:nowrap}}';
    var stl = document.createElement('style'); stl.id = 'sus-health-css'; stl.textContent = css; (document.head || document.documentElement).appendChild(stl);
  } catch (er) {}

  W.susHealthTiles = tiles;   /* Phase 5: the packs read the same tiles (one figure everywhere) */
  W.susHealthInputs = healthInputs; W.susHealthCompute = healthCompute; W.susHealthWrap = wrap; W.susExpUnit = expUnit; W.susLimeKind = limeKind; W._susHealthUi = _ui;
}(typeof window !== 'undefined' ? window : this));
