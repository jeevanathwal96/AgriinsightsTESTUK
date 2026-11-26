/* sus-engine-uk.js - the one Sustainability calculation engine (UK), Phase 0.
 *
 * PREBUILD-CHECK-V53 §4.3 and the 14 Nov 2026 ownership decision: the modules (Crops, Livestock, Orchards) own the records
 * and the actions; this file works out every rule once; Sustainability only shows a read-only summary.
 *
 * Rules for this file:
 *   - pure functions: no DOM, no ST, no storage, no network, no clock. `today` is always passed in (an ISO date 'YYYY-MM-DD').
 *   - every legal value comes from the versioned law table (data/sus-law-uk-2026.1.json), passed in as `law`. Nothing legal is
 *     typed into this file. Every result says which law_set it used and cites the row.
 *   - bad input (negative or fractional head, blank dates) is ignored or refused, never NaN and never a throw.
 *   - UMD: a browser global (SusEngineUK), CommonJS (node tests) and the phone's vendored copy (08-mobile/src/core/sus/engine-uk.js,
 *     byte-identical, SHA-256 pinned) all load this same text.
 * Phase 0 covers: nation keys, the one NVZ answer, livestock manure N by class and month, NI batches, the occupier rule,
 * storage need and the full-by date, and the sheep and goat inventory return.
 * Phase 2 adds: crop N max (nmax), the closed period for one spreading (closedPeriodHit, also behind Rainfall's RN_CLOSED),
 * kg N in a crop input (inputN), the 250 kg/ha field limit (fieldOrganicN), the RB209 N plan by SNS Index (nPlan), the
 * Red Tractor urea check (ureaCheck), soil tests by nation (soilDue), the NVZ records and their CSV, and the nitrogen jobs.
 * Phase 5 adds: who is asking from the ledger with its evidence (askDetect), the send guard (canSend), the preview hash
 *   (sha256 of the canonical payload: previewHash) and calculator inputs in each tool's order (exportInputs), never our figure.
 * Phase 4 adds: the carbon footprint (footprint, with the N2O method chosen in the factor table), footprint groups by month
 * (stockGroups), water use from meter readings (waterUse), habitats (habitatSummary) and target progress in words (targetProgress).
 * -438-sus5r (register option C, signed off 15 Nov 2026): the keeper's register belongs to Livestock and never feeds the
 * figures. parseRegisterCsv reads the file (species from the columns, holding check, year of birth, whole-herd snapshots, only
 * the kept columns); registerCompare checks it against Livestock on the file's date and says what a difference would do to a
 * legal answer; legalJobs takes one register job per species and folds the "doesn't add up" job for that species into it.
 * Phase 1 and 1b add: cattle and sheep through the year from the Livestock module (stockRecords,
 * yearManure), GB and NI pig and poultry batches, other species as counts, manure moved on and off, slurry into the store
 * and the store plan, the pre-filled sheep return, the register CSV reader, the legal and setup jobs, and the inputs hash.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SusEngineUK = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = '0.7.2';   /* 0.7.2 (-446, 25 Nov 2026): web-test P0s - the 250 kg field limit follows the NVZ answer, the slurry need leaves out straw/FYM groups and adds the farmer's washings and dirty-yard rain, closed-period breaches in the records, jobs and packs. 0.7.1 (-445, 24 Nov 2026): recordLate, scotZone, the scot-zone setup job, habitat "not sure" */
  var DAY = 86400000;

  /* ── small helpers ─────────────────────────────────────────────────────────── */
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null); }
  function head(v) { var n = num(v); return (n === null || n < 0) ? 0 : n; }   // head counts: negative or junk counts as none
  /* -447 (audit P1-6): a real calendar day only. Date.UTC rolls 2026-02-31 into 3 March and 2026-13-05 into January 2027, so the
     date must come back unchanged from the round trip. */
  function isoOk(s) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); return !isNaN(t) && iso(t) === s; }
  /* -447 (audit P1-5): the first day of "any 12 months" ending on s - the day after the same date a year before (29 Feb counts back
     to 28 Feb). A fixed 364 days left out the 366th day of a window that holds 29 February. */
  function yearFrom(s) { var y = +s.slice(0, 4) - 1, md = s.slice(5); if (md === '02-29') md = '02-28'; return addDays(y + '-' + md, 1); }
  function toT(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function iso(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
  function addDays(s, n) { return iso(toT(s) + n * DAY); }
  function daysBetween(a, b) { return Math.round((toT(b) - toT(a)) / DAY); }   // b - a
  function r2(x) { return Math.round(x * 100) / 100; }
  var MONFULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function lawSet(law) { return (law && law.id && law.version) ? law.id + '-' + law.version : null; }
  function cite(row) { return row ? { source: row.source, source_url: row.source_url, status: row.status, checked_on: row.checked_on } : null; }

  /* 'England' | 'eng' | 'E' ... -> 'E' | 'W' | 'S' | 'N' | null */
  function nationKey(n) {
    var s = String(n || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'e' || s === 'eng' || /england/.test(s)) return 'E';
    if (s === 'w' || s === 'wal' || /wales|cymru/.test(s)) return 'W';
    if (s === 's' || s === 'sco' || /scot/.test(s)) return 'S';
    if (s === 'n' || s === 'ni' || /northern ireland/.test(s)) return 'N';
    return null;
  }
  function nat(law, n) { var k = nationKey(n); return (k && law && law.nations) ? law.nations[k] : null; }

  /* ── C2: the one NVZ answer ────────────────────────────────────────────────────
     in: { nation, confirmed: true|false|null (the farmer's answer, ST_RAIN.nvz), legacyTick: the old Crops tick (only `true`
           ever counted, as production did), map: {checked, hit, name} (Defra / Scottish Government point lookup, a suggestion) }
     out: { inNvz: true|false|null, how: 'whole-territory'|'confirmed'|'legacy-crops-tick'|'unknown'|'no-nation',
            suggestion: true|false|null, editable }
     Wales and Northern Ireland are whole-territory (every farm follows the programme), so the answer is fixed there.
     England and Scotland: the farmer's confirmed answer; the map is only ever a suggestion (C5: it is a point, not each field). */
  function nvzStatus(inp, law) {
    inp = inp || {};
    var k = nationKey(inp.nation), N = k && law && law.nations ? law.nations[k] : null;
    var map = inp.map && inp.map.checked ? !!inp.map.hit : null;
    if (!k) return { inNvz: (inp.confirmed === true || inp.confirmed === false) ? inp.confirmed : (inp.legacyTick === true ? true : null), how: 'no-nation', suggestion: map, editable: true };
    var whole = N ? N.nvz_scope === 'whole_territory' : (k === 'W' || k === 'N');
    if (whole) return { inNvz: true, how: 'whole-territory', suggestion: null, editable: false };
    if (inp.confirmed === true || inp.confirmed === false) return { inNvz: inp.confirmed, how: 'confirmed', suggestion: map, editable: true };
    if (inp.legacyTick === true) return { inNvz: true, how: 'legacy-crops-tick', suggestion: map, editable: true };
    return { inNvz: null, how: 'unknown', suggestion: map, editable: true };
  }

  /* ── livestock manure N ───────────────────────────────────────────────────────── */
  function bands(nation, law) { var N = nat(law, nation); return N ? N.manure_n.bands.value : null; }

  /* The legal row for one animal of a given age (months) and role, in its nation. Returns the per_head key or null.
     role: cattle 'suckler'|'dairy'|'bull_breeding'|'bull_beef'|'beef'|'dairy_young'; sheep 'ewe'|'ram'|'lamb'|'store'.
     opts: { size: 'le500'|'gt500' (suckler), eweSize: 'lt60'|'ge60', yieldBand: 'lt6000'|'6000_9000'|'gt9000' } */
  function classKey(nation, species, role, ageMonths, opts, law) {
    var k = nationKey(nation), b = bands(k, law); opts = opts || {};
    var a = num(ageMonths); if (a === null || a < 0 || !b) return null;
    if (species === 'cattle') {
      if (k === 'N') {
        if (role === 'dairy' && a >= 24) return 'dairy_cow';
        if (role === 'suckler' && a >= 24) return 'suckler_gt2';
        if (role === 'bull_breeding' && a >= 24) return 'bull_breeding';
        if (role === 'bull_beef' && a < 13) return 'bull_beef_0_13';
        if (a < 6) return 'calf_0_6';
        if (a < 12) return 'calf_6_12';
        if (role === 'dairy' || role === 'dairy_young') return a < 24 ? 'dairy_heifer_1_2' : 'dairy_heifer_gt2';
        return a < 24 ? 'cattle_1_2' : 'cattle_gt2';
      }
      if (a < b.calf_under) return 'calf';
      if (role === 'dairy' && a >= b.mid_under) return opts.yieldBand === 'lt6000' ? 'dairy_lt6000' : opts.yieldBand === '6000_9000' ? 'dairy_6000_9000' : 'dairy_gt9000';
      if (role === 'suckler' && a >= b.mid_under) return opts.size === 'le500' ? 'suckler_le500' : 'suckler_gt500';
      if (role === 'bull_breeding') return a >= b.mid_under ? 'bull_breeding' : 'bull_breeding_young';
      if (role === 'bull_beef') return 'bull_nonbreeding';
      if (role === 'dairy' || role === 'dairy_young') return a < b.young_under ? 'dairy_young' : 'dairy_heifer';
      if (a < b.young_under) return 'beef_young';
      if (a < b.mid_under) return 'beef_mid';
      return 'beef_older';
    }
    if (species === 'sheep') {
      if (k === 'N') {
        if (role === 'ram') return 'ram';
        if (a < 6) return 'lamb_0_6';
        if (a < 12) return role === 'ewe' ? 'ewe' : 'lamb_6_12';
        return 'ewe';
      }
      if (role === 'ram') return 'ram';                                    // own weight, never the ewe band (R3)
      if (role === 'ewe') return opts.eweSize === 'lt60' ? 'ewe_lt60' : 'ewe_ge60';
      if (a < 6) return 'lamb_suckled';                                   // inside the ewe figure in GB (R4)
      if (a < 9) return 'sheep_6_9m';
      return 'sheep_9m_plus';
    }
    return null;
  }

  function rate(nation, key, law) {
    var N = nat(law, nation); if (!N || !key) return null;
    var r = N.manure_n.per_head[key]; return r ? r : null;
  }

  /* Head by legal class for each calendar month of a period, day-weighted (an animal here 15 of 30 days is half a head).
     animals: [{ species:'cattle'|'sheep', role, dob:'YYYY-MM-DD', on:'YYYY-MM-DD' (arrived; default dob), off:'YYYY-MM-DD' (left; exclusive),
                 n: how many (default 1), opts }]
     from: first day of the period (e.g. '2025-11-01'); months: how many (default 12).
     Returns [{ month:'YYYY-MM', days, classes:{ key: head } }]. */
  function monthlyClasses(nation, animals, from, months, law) {
    var out = [], nm = months > 0 ? Math.min(60, Math.floor(months)) : 12;
    if (!isoOk(from) || !nationKey(nation)) return out;
    var y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    for (var i = 0; i < nm; i++) {
      var s = Date.UTC(y, m + i, 1), e = Date.UTC(y, m + i + 1, 1), days = Math.round((e - s) / DAY), cls = {};
      (animals || []).forEach(function (a) {
        /* Phase 1: a record may carry a fixed age (a class count with no birth dates: the age is the class's, all year) and
           a sign (-1 = our stock away, counted off this holding; the default +1). */
        if (!a) return;
        var fixed = num(a.age);
        if ((!isoOk(a.dob) && (fixed === null || fixed < 0))) return;
        var n = head(a.n == null ? 1 : a.n); if (!n) return;
        if (a.sign === -1) n = -n;
        var dob = isoOk(a.dob) ? toT(a.dob) : null;
        var on = isoOk(a.on) ? toT(a.on) : (dob !== null ? dob : -Infinity), off = isoOk(a.off) ? toT(a.off) : Infinity;
        for (var t = Math.max(s, on); t < Math.min(e, off); t += DAY) {
          var age;
          if (dob !== null) { var d = new Date(t), b = new Date(dob);
            age = (d.getUTCFullYear() - b.getUTCFullYear()) * 12 + (d.getUTCMonth() - b.getUTCMonth()) - (d.getUTCDate() < b.getUTCDate() ? 1 : 0); }
          else age = fixed;
          var key = classKey(nation, a.species, a.role, age, a.opts, law); if (!key) continue;
          cls[key] = (cls[key] || 0) + n / days;
        }
      });
      Object.keys(cls).forEach(function (k) { cls[k] = Math.max(0, Math.round(cls[k] * 1e6) / 1e6); if (!cls[k]) delete cls[k]; });
      out.push({ month: iso(s).slice(0, 7), days: days, classes: cls });
    }
    return out;
  }

  /* Average head per class over a monthlyClasses() result (the year's average is what the limit uses). */
  function averageClasses(monthly) {
    var t = {}, n = (monthly || []).length; if (!n) return t;
    monthly.forEach(function (m) { Object.keys(m.classes).forEach(function (k) { t[k] = (t[k] || 0) + m.classes[k]; }); });
    Object.keys(t).forEach(function (k) { t[k] = t[k] / n; });
    return t;
  }

  /* NI batches (Table 1b per pig for the stage; Table 1c per 1,000 birds a crop or a week).
     batch: { species:'pig'|'poultry', type, stage (table key), placed, cleared (inclusive), n, deaths, where:'house'|'range' }
     Effective head = placed - deaths/2. Weekly rows use the days on the farm, inclusive of both dates. */
  function niBatchN(batch, law) {
    var N = nat(law, 'N'); if (!N || !batch) return null;
    var M = N.manure_n, D = M.defaults || {}, b = batch, nPl = head(b.n), dead = Math.min(head(b.deaths), nPl);
    /* -439-sus6 (source audit L16): no mortality rule in Tables 1b/1c. "How many went off the farm from this batch?" is asked;
       until it is answered every pig or bird placed is counted (the higher figure, a labelled assumption the farmer ticks). */
    var offN = num(b.off_n), offOk = offN !== null && offN >= 0 && offN <= nPl;
    var nE = offOk ? offN : nPl - dead * (M.deaths_rule ? num(M.deaths_rule.value) || 0 : 0), row = null, key = null, answered = true, per;
    if (b.species === 'pig') {
      key = M.per_batch_pig[b.stage] ? b.stage : (b.type === 'weaners' ? D.weaner_stage_unanswered : D.pig_stage_unanswered);
      answered = !!M.per_batch_pig[b.stage]; row = M.per_batch_pig[key]; per = 'pig';
    } else if (b.species === 'poultry') {
      if (b.type === 'layers') key = b.where === 'range' ? 'layer_fr' : 'layer';
      else if (M.per_week_poultry[b.stage]) key = b.stage;
      else if (M.per_crop_poultry[b.stage]) key = b.stage;
      else if (b.type === 'broilers') { key = b.where === 'range' ? 'broiler_fr' : 'broiler_conv'; answered = b.where === 'range'; }
      else if (b.type === 'turkeys') { key = D.turkey_stage_unanswered; answered = false; }
      else if (b.type === 'ducks') key = 'duck_fattening';
      else if (M.per_week_poultry[b.type]) key = b.type;
      row = M.per_week_poultry[key] || M.per_crop_poultry[key]; per = row ? row.per : null;
    }
    if (!row) return null;
    var kg, weeks = null;
    if (per === 'pig') kg = nE * row.value;
    else if (per === 'crop') kg = nE / 1000 * row.value;
    else {
      if (!isoOk(b.placed) || !isoOk(b.cleared) || daysBetween(b.placed, b.cleared) < 0) return { key: key, label: row.label, rate: row.value, per: per, effectiveHead: nE, kg: null, refused: 'placed and cleared dates needed' };
      weeks = (daysBetween(b.placed, b.cleared) + 1) / 7; kg = nE / 1000 * row.value * weeks;
    }
    return { key: key, label: row.label, rate: row.value, per: per, unit: row.unit, effectiveHead: nE, weeks: weeks, kg: r2(kg), kgExact: kg,
             estimate: !answered || !offOk, why: answered ? (offOk ? null : 'how many went off the farm not answered, so every one placed is counted') : (per === 'pig' ? 'stage not answered, so the highest legal figure' : 'stage not answered, so the highest legal figure'),
             offAnswered: offOk, cite: cite(row), law_set: lawSet(law) };
  }

  /* Whole-farm manure N against the 170 kg/ha holding limit.
     inp: { nation, rows:[{ key, head, label? }] (average head by legal class), batchesKg: [kg...] (NI batches already worked out),
            holdingHa (own + rented / at disposal) }
     Every row: head x the legal rate = kg, with its citation. */
  function manureN(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation), rows = [], tot = 0;
    if (!k || !law) return { refused: 'nation and law needed' };
    (inp.rows || []).forEach(function (r) {
      if (!r) return; var h = head(r.head), R = rate(k, r.key, law); if (!R || !h) return;
      var kg = h * R.value; tot += kg;
      rows.push({ key: r.key, label: r.label || R.label, head: h, rate: R.value, kg: kg, cite: cite(R) });
    });
    (inp.batchesKg || []).forEach(function (x) { var v = num(x); if (v !== null && v > 0) tot += v; });
    /* Phase 1b: rows worked out elsewhere (batches, other species, figures with no legal row such as alpacas, tagged), and
       manure moved on or off the holding (imports add, exports take away; never below nothing). */
    (inp.extraRows || []).forEach(function (r) { var v = r ? num(r.kg) : null; if (v === null || v <= 0) return; tot += v; rows.push(r); });
    var adj = num(inp.adjustKg); if (adj !== null) tot = Math.max(0, tot + adj);
    var ha = num(inp.holdingHa), lim = law.limits.whole_farm_manure_n.value;
    var perHa = (ha && ha > 0) ? tot / ha : null;
    return { nation: k, kg: tot, holdingHa: (ha && ha > 0) ? ha : null, perHa: perHa, perHaShown: perHa === null ? null : Math.round(perHa),
             limit: lim, over: perHa !== null && perHa > lim, rows: rows, adjustKg: adj || 0, law_set: lawSet(law),
             /* -440 (UX-23): cite the farm's own nation only, never all four instruments */
             cite: (function () { var L0 = law.limits.whole_farm_manure_n, c0 = cite(L0); if (c0 && L0.source_by_nation && L0.source_by_nation[k]) c0.source = L0.source_by_nation[k]; return c0; })() };
  }

  /* R6 occupier rule. Stock on land counts on the holding of whoever has the land at their disposal.
     inp: { ours: our animals?, onOurHolding: on land we own or rent?, occupier: 'us'|'them'|null }
     out: { limit: counts toward OUR 170 kg limit (true/false/null = ask), footprint: in OUR footprint, ask } */
  function countsOnHolding(inp) {
    inp = inp || {};
    var occ = inp.occupier === 'us' || inp.occupier === 'them' ? inp.occupier : null;
    if (!occ) return { limit: null, footprint: !!inp.ours, ask: 'Who has the land at their disposal while the stock is there?' };
    return { limit: occ === 'us', footprint: !!inp.ours, ask: null };
  }

  /* ── storage ─────────────────────────────────────────────────────────────────────
     inp: { nation, nvz: true|false|null, kind: 'cattle'|'pig'|'poultry', builtOrChanged: 'YYYY-MM-DD'|null,
            places: { sow, finisher, poultry } (NI small-unit exception), hasPigOrPoultry (NI), winterFrom: year the store winter starts }
     out: { days, applies, label, cite, why } - days null when no statutory minimum applies. */
  function storageRule(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation), N = nat(law, k);
    if (!N) return { days: null, applies: false, why: 'nation not known' };
    var kind = inp.kind === 'pig' || inp.kind === 'poultry' ? inp.kind : 'cattle', S = N.storage;
    var nv = nvzStatus({ nation: k, confirmed: inp.nvz }, law).inNvz;
    var out = function (row, days, why) { return { days: days, applies: days !== null, label: row ? row.label : null, cite: cite(row), why: why || null, law_set: lawSet(law) }; };
    var wy = num(inp.winterFrom) || 2026;
    var winDays = function (row) { var v = row.value; return daysBetween(wy + '-' + v.from, (v.to < v.from ? wy + 1 : wy) + '-' + v.to) + 1; };
    if (k === 'N') {
      var pp = inp.places || {}, sm = S.nvz.small_unit_places.value;
      var small = (kind === 'pig' && head(pp.sow) < sm.sow && head(pp.finisher) < sm.finisher) || (kind === 'poultry' && head(pp.poultry) < sm.poultry);
      if (kind === 'cattle') return out(S.nvz.cattle, S.nvz.cattle.value);   // 22 weeks for all holdings (reg 17(3))
      if (small) return out(S.nvz.small_unit_places, S.nvz.cattle.value, 'under the place thresholds: 22 weeks');
      return out(S.nvz[kind], S.nvz[kind].value);
    }
    if (nv === true) {
      var r = S.nvz[kind]; return out(r, r.basis === 'window' ? winDays(r) : r.value);
    }
    if (nv === null) return { days: null, applies: null, why: 'NVZ answer missing: confirm it first', law_set: lawSet(law) };
    var off = S.off_nvz; if (!off) return out(null, null, 'no off-NVZ storage period');
    var ro = off[kind];
    if (!ro) return out(null, null, kind === 'poultry' ? 'no off-NVZ storage period for poultry manure' : 'no statutory minimum');
    if (ro.basis === 'months' || ro.basis === 'worst_months') {   // SSAFO, England: stores built or substantially changed since 1 Mar 1991 only
      if (!isoOk(inp.builtOrChanged)) return { days: null, applies: null, label: ro.label, cite: cite(ro), why: 'build date not answered: SSAFO applies only to stores built or changed since 1 March 1991', law_set: lawSet(law) };
      if (inp.builtOrChanged < ro.built_after) return out(ro, null, 'built before 1 March 1991 and not changed: no statutory minimum');
      /* -439-sus6 (source audit L5): "any four month period" = the worst (highest-inflow) 4 months of the year, not 4 months from 1 Oct */
      var o4 = out(ro, Math.round(ro.value * 365.25 / 12)); if (ro.basis === 'worst_months') o4.worst = true; return o4;
    }
    return out(ro, ro.value);
  }

  /* Store forecast. inp: { capacityM3, fillM3 (today), inflowPerDay: [12] m3 a day by calendar month (Jan..Dec; housed head x legal
     excreta + rain on open stores + washings, worked out by the caller), today, ruleDays, ruleFrom: 'YYYY-MM-DD' (start of the store winter) }
     out: { needM3 (the rule's period), meets, fullBy (first day the fill reaches capacity, looking up to 400 days ahead), pct } */
  function storeForecast(inp) {
    inp = inp || {};
    var cap = num(inp.capacityM3), fill = num(inp.fillM3), flow = inp.inflowPerDay;
    if (!cap || cap <= 0 || !isoOk(inp.today) || !flow || flow.length !== 12) return { refused: 'capacity, today and 12 monthly inflows needed' };
    var f = Math.max(0, fill || 0), t = inp.today, fullBy = null;   // fill null = not known: no full-by date (owner decision "fill" a)
    var at = function (s) { var v = num(flow[+s.slice(5, 7) - 1]); return v && v > 0 ? v : 0; };
    if (f >= cap) fullBy = t;
    for (var i = 0; i < 400 && !fullBy; i++) { f += at(t); if (f >= cap) fullBy = t; t = addDays(t, 1); }
    var need = null, rd = num(inp.ruleDays), worstFrom = null;
    if (rd && rd > 0 && inp.ruleWorst && isoOk(inp.ruleFrom)) {          // the highest inflow over any rd-day window starting in the year
      for (var w0 = 0, d0 = inp.ruleFrom; w0 < 365; w0++, d0 = addDays(d0, 1)) { var sm = 0; for (var j2 = 0, d2 = d0; j2 < rd; j2++, d2 = addDays(d2, 1)) sm += at(d2); if (need === null || sm > need + 1e-9) { need = sm; worstFrom = d0; } }
    } else if (rd && rd > 0 && isoOk(inp.ruleFrom)) { need = 0; for (var j = 0, d = inp.ruleFrom; j < rd; j++, d = addDays(d, 1)) need += at(d); }
    var known = fill !== null && fill !== undefined;
    if (!known) fullBy = null;
    return { capacityM3: cap, pct: known ? Math.round(Math.max(0, fill) / cap * 100) : null, fullBy: fullBy, needM3: need === null ? null : r2(need), meets: need === null ? null : need <= cap, worstFrom: worstFrom };
  }

  /* ── C1: the sheep and goat inventory return, by nation ──────────────────────────
     out: { nation, year, countFrom, countTo, dueBy, acceptedUntil, route, label, state, daysToCount, daysToDue, cite, law_set }
     state: 'upcoming' (before the count) | 'count' (count day / window) | 'return' (counted, return not yet due)
            | 'overdue' (after the due date; shown for a month, or until ScotEID closes) */
  function sheepReturn(nation, today, law, species) {
    var k = nationKey(nation), N = nat(law, k);
    if (!N || !isoOk(today)) return null;
    /* -439-sus6 (source audit L15): NI goats have their own row, due 5 January; sheep stay 1-5 Dec and 30 Dec */
    var R = species === 'goats' && N.goat_return ? N.goat_return : N.sheep_return, v = R.value, y = +today.slice(0, 4);
    var cyc = function (yr) {
      var c = { year: yr, countFrom: yr + '-' + v.count_from, countTo: yr + '-' + v.count_to, dueBy: (v.due_next_year ? yr + 1 : yr) + '-' + v.due,
                acceptedUntil: v.accepted_until ? (yr + 1) + '-' + v.accepted_until : null };
      c.showUntil = c.acceptedUntil && c.acceptedUntil > addDays(c.dueBy, 31) ? c.acceptedUntil : addDays(c.dueBy, 31);
      return c;
    };
    var c = cyc(y - 1); if (today > c.showUntil) c = cyc(y);
    var st = today < c.countFrom ? 'upcoming' : today <= c.countTo ? 'count' : today <= c.dueBy ? 'return' : 'overdue';
    return { nation: k, year: c.year, countFrom: c.countFrom, countTo: c.countTo, dueBy: c.dueBy, acceptedUntil: c.acceptedUntil,
             stillAccepted: st === 'overdue' ? !!(c.acceptedUntil && today <= c.acceptedUntil) : null,
             route: R.route, label: R.label, species: R.species || ['sheep', 'goats'], state: st,
             daysToCount: daysBetween(today, c.countFrom), daysToDue: daysBetween(today, c.dueBy),
             cite: cite(R), review_by: R.review_by || null, law_set: lawSet(law) };
  }

  /* ══ Phase 1 and 1b (PREBUILD-CHECK-V53 §9 rows 1 and 1b) ═════════════════════════════════════════════════════════
     Everything below still follows the file's rules: pure, no clock, no DOM, legal values from `law`, other factors
     from `factors` (data/sus-factors-uk-2026.1.json), bad input ignored. */
  function fac(factors, id) {
    var l = factors && factors.factors; if (!l) return null;
    if (!factors._byId) { var m = {}; l.forEach(function (f) { m[f.id] = f; }); try { Object.defineProperty(factors, '_byId', { value: m, enumerable: false }); } catch (e) { factors._byId = m; } }
    return factors._byId[id] || null;
  }
  function facV(factors, id) { var f = fac(factors, id); return f ? num(f.value) : null; }
  function str(v, max) { var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim(); return max && s.length > max ? s.slice(0, max) : s; }
  function yearDays(y) { return daysBetween(y + '-01-01', (y + 1) + '-01-01'); }
  function clipDays(a, b, y) {             // inclusive days of [a,b] inside calendar year y
    var s = y + '-01-01', e = y + '-12-31'; if (!isoOk(a) || !isoOk(b) || b < a) return 0;
    var lo = a > s ? a : s, hi = b < e ? b : e; return hi < lo ? 0 : daysBetween(lo, hi) + 1;
  }

  /* ── which herd is which (production `herds.type`, ANIMAL_TYPES) ─────────────────────────────────────────────── */
  function herdKind(type) {
    var t = String(type || '').toLowerCase();
    if (!t) return null;
    if (/lamb/.test(t) && /store|finish/.test(t)) return 'store_lambs';
    if (/^rams?\b|\brams?$/.test(t)) return 'rams';
    if (/ewe|sheep|flock|tup/.test(t)) return 'ewes';
    if (/goat/.test(t)) return 'goats';
    if (/deer|venison/.test(t)) return 'deer';
    if (/horse|pony|livery|donkey/.test(t)) return 'horses';
    if (/alpaca|llama/.test(t)) return 'camelids';
    if (/sow|pig|boar|swine/.test(t)) return 'pigs';
    if (/broiler|layer|hen|poultry|turkey|duck|geese|goose|chicken/.test(t)) return 'poultry';
    if (/dairy youngstock/.test(t)) return 'dairy_young';
    if (/dairy/.test(t)) return 'dairy';
    if (/store|finishing/.test(t) && /cattle|beef|steer/.test(t)) return 'store_cattle';
    if (/suckler|beef|cattle|cow|bull|steer|heifer/.test(t)) return 'suckler';
    return null;
  }
  var KIND_SPECIES = { suckler: 'cattle', store_cattle: 'cattle', dairy: 'cattle', dairy_young: 'cattle', ewes: 'sheep', rams: 'sheep', store_lambs: 'sheep',
                       goats: 'goat', deer: 'deer', horses: 'horse', camelids: 'camelid', pigs: 'pig', poultry: 'poultry' };
  var KIND_PRIMARY = { suckler: 'cows', store_cattle: 'steers', dairy: 'cows', dairy_young: 'heifers', ewes: 'ewes', rams: 'rams', store_lambs: 'lambs' };
  var KIND_YOUNG = { suckler: 'calves', store_cattle: 'calves', dairy: 'calves', dairy_young: 'calves', ewes: 'lambs', rams: 'lambs', store_lambs: 'lambs' };
  /* role and a typical age (months) for a class with no birth dates; lambs get a spring birth date instead (they age). */
  function classRole(kind, cls) {
    var c = String(cls || KIND_PRIMARY[kind] || '');
    switch (kind) {
      case 'suckler': return c === 'cows' ? ['suckler', 60] : c === 'heifers' ? ['suckler', 18] : c === 'steers' ? ['beef', 18] : c === 'bulls' ? ['bull_breeding', 36] : c === 'calves' ? ['beef', 4] : ['suckler', 60];
      case 'store_cattle': return c === 'bulls' ? ['bull_beef', 15] : c === 'calves' ? ['beef', 4] : ['beef', 18];
      case 'dairy': return c === 'cows' ? ['dairy', 60] : c === 'heifers' ? ['dairy_young', 18] : c === 'calves' ? ['dairy_young', 4] : c === 'bulls' ? ['bull_breeding', 36] : c === 'steers' ? ['beef', 18] : ['dairy', 60];
      case 'dairy_young': return c === 'calves' ? ['dairy_young', 4] : ['dairy_young', 14];
      case 'ewes': return c === 'rams' ? ['ram', 36] : c === 'wethers' ? ['store', 12] : c === 'lambs' ? ['lamb', 3] : ['ewe', 36];
      case 'rams': return ['ram', 36];
      case 'store_lambs': return ['store', 7];
    }
    return null;
  }
  function ageAt(dob, day) { var d = new Date(toT(day)), b = new Date(toT(dob)); return (d.getUTCFullYear() - b.getUTCFullYear()) * 12 + (d.getUTCMonth() - b.getUTCMonth()) - (d.getUTCDate() < b.getUTCDate() ? 1 : 0); }
  /* an animal with a birth date: its role from the herd and its sex or class */
  function animalRole(kind, a, day) {
    var sp = KIND_SPECIES[kind], cls = a.cls, sex = String(a.sex || '').toUpperCase().charAt(0), age = isoOk(a.dob) && isoOk(day) ? ageAt(a.dob, day) : null;
    if (cls) { var r = classRole(kind, cls); if (r) return r[0]; }
    if (sp === 'cattle') {
      if (age !== null && age < 6) { var rc = classRole(kind, 'calves'); if (rc) return rc[0]; }   /* -439-sus6: a calf matches the calves class, not the cows */
      if (sex === 'M') return (kind === 'suckler' || kind === 'dairy') && age !== null && age >= 24 ? 'bull_breeding' : 'beef';
      return kind === 'dairy' || kind === 'dairy_young' ? 'dairy' : kind === 'store_cattle' ? 'beef' : 'suckler';
    }
    if (sp === 'sheep') { if (age !== null && age < 12) return 'lamb'; return sex === 'M' ? 'ram' : 'ewe'; }
    return null;
  }
  /* lambs counted from a class: born on the 1st of the farm's lambing month (the setup question), else 1 April, tagged (source audit S23) */
  function springDob(today, lm) { var m = num(lm), md = (m >= 1 && m <= 12 ? ('0' + Math.floor(m)).slice(-2) : '04') + '-01', y = +today.slice(0, 4); return (today >= y + '-' + md ? y : y - 1) + '-' + md; }

  /* ── stockRecords: cattle and sheep from the Livestock module, as monthlyClasses records ──
     inp: { herds:[{id,type,qty,classes:[{k,n}],removed}], animals:[{herd,tag,sex,cls,dob,status}], moves:[{herd,reason,qty,cls,date}],
            spans:[{kind:'away'|'notours', species, role, n, from, to, occupier}], from, today, opts:{ size, eweSize, yieldBand } }
     out: { records, exceptions:[{what, herd, n}], estimate:{ classAges, lambDates }, sources:{cattle:'livestock'|null, sheep:...} }
     -438-sus5r (register option C, signed off 15 Nov 2026): the keeper's register never feeds the figures. Livestock is the one
     source; the register is a check (registerCompare) and a quick way to fill or correct Livestock. An `inp.register` is ignored. */
  var ARRIVE = { born: 1, bought: 1, moved_in: 1, purchased: 1, 'in': 1 };
  var LEAVE = { sold: 1, died: 1, slaughter: 1, moved_out: 1, dead: 1, culled: 1, 'out': 1 };
  function stockRecords(inp) {
    inp = inp || {};
    var out = [], exc = [], est = { classAges: false, lambDates: false, lambCarry: false, lambsAtFoot: false, lambsAsk: false }, src = { cattle: null, sheep: null };
    var from = isoOk(inp.from) ? inp.from : null, today = isoOk(inp.today) ? inp.today : null, opts = inp.opts || {};
    if (!from || !today) return { records: out, exceptions: exc, estimate: est, sources: src };
    (inp.herds || []).forEach(function (h) {
      if (!h || h.removed) return; var kind = herdKind(h.type), sp = KIND_SPECIES[kind];
      if (sp !== 'cattle' && sp !== 'sheep') return;
      src[sp] = 'livestock';
      var cnt = {}, cls = (h.classes && h.classes.length) ? h.classes : [{ k: KIND_PRIMARY[kind], n: h.qty }];
      cls.forEach(function (c) { if (c && c.k) cnt[c.k] = (cnt[c.k] || 0) + Math.floor(head(c.n)); });
      var push = function (k, rec) { rec.species = sp; rec.herd = h.id; rec.opts = opts; rec.cls = k; out.push(rec); };
      /* -439-sus6 (register-build bug, fixed as a class): moves are read BEFORE the animals. An animal whose own arrival
         (its birth, or a purchase or move in) is also a move in this period is one animal, not two: the move gives up one
         head to that animal (matched by tag, then by date: born on its birth date, bought on its arrival date), and the
         animal's record starts on the move date. Any herd, any arrival reason, any year inside the period. */
      var hMoves = (inp.moves || []).filter(function (m) { return m && String(m.herd) === String(h.id) && isoOk(m.date) && m.date >= from && m.date <= today && !m.toCls; })
        .map(function (m) { return { m: m, left: Math.floor(head(m.qty)), why: String(m.reason || '').toLowerCase() }; });
      var claim = function (a) {
        var tg = a.tag ? tagKey(a.tag) : null, arr = isoOk(a.on) ? a.on : (isoOk(a.arrived) ? a.arrived : null), hit = null;
        hMoves.forEach(function (x) {
          if (hit || !ARRIVE[x.why] || x.left <= 0) return;
          if (tg && x.m.tag && tagKey(x.m.tag) === tg) { hit = x; return; }
          if (x.m.tag && tg) return;
          if (x.why === 'born' && x.m.date === a.dob) hit = x; else if (x.why !== 'born' && arr && x.m.date === arr) hit = x;
        });
        if (hit) hit.left--;
        return hit;
      };
      (inp.animals || []).forEach(function (a) {
        if (!a || String(a.herd) !== String(h.id) || !isoOk(a.dob) || /sold|dead|died|gone|off|left/i.test(String(a.status || ''))) return;
        var role = animalRole(kind, a, today), age = ageAt(a.dob, today), k = a.cls || (function () {
          var best = null, gap = Infinity;          // the class of the same role whose usual age is nearest this animal's
          for (var c in cnt) { var r = classRole(kind, c); if (r && r[0] === role && cnt[c] > 0 && Math.abs(r[1] - age) < gap) { gap = Math.abs(r[1] - age); best = c; } }
          if (age < 12) for (var c2 in cnt) { var r3 = classRole(kind, c2); if (r3 && r3[1] < 24 && cnt[c2] > 0 && Math.abs(r3[1] - age) < gap) { gap = Math.abs(r3[1] - age); best = c2; } }   /* -439-sus6: a young animal goes to the young class nearest its age */
          return best; })();
        var mv = claim(a);
        if (k && cnt[k] > 0) { cnt[k]--; var rec = { role: role, dob: a.dob, n: 1, src: 'animal' }; if (mv && mv.why !== 'born') rec.on = mv.m.date; push(k, rec); }
      });
      hMoves.forEach(function (x) {
        var m = x.m, q = x.left, why = x.why; if (!(q > 0)) return;
        if (ARRIVE[why]) {
          var k = m.cls || (why === 'born' ? KIND_YOUNG[kind] : KIND_PRIMARY[kind]), r = classRole(kind, k) || classRole(kind);
          var take = Math.min(q, cnt[k] || 0); cnt[k] = (cnt[k] || 0) - take;
          /* -441b (real-DB retest 16 Nov): a herd kept as one head count (no class breakdown) already counts its arrivals in that
             count. A birth on it named "calves" found no calves class and was flagged "3 more calves arriving than are in the count"
             on every such herd. Take the arrivals out of the head count instead; they keep their own class and birth date. */
          if (take < q && !(h.classes && h.classes.length)) { var pk = KIND_PRIMARY[kind], t2 = Math.min(q - take, cnt[pk] || 0); if (t2 > 0) { cnt[pk] -= t2; take += t2; } }
          if (take < q) exc.push({ what: 'arrivals not in the count', herd: h.id, species: sp, cls: k, n: q - take });
          if (take) push(k, why === 'born' ? { role: r[0], dob: m.date, on: m.date, n: take, src: 'move' } : { role: r[0], age: r[1], on: m.date, n: take, src: 'move' });
        } else if (LEAVE[why]) {
          var k2 = m.cls || KIND_PRIMARY[kind], r2 = classRole(kind, k2) || classRole(kind);
          push(k2, { role: r2[0], age: r2[1], off: m.date, n: q, src: 'move' });
        }
      });
      Object.keys(cnt).forEach(function (k) {
        var n = cnt[k]; if (!(n > 0)) return; var r = classRole(kind, k); if (!r) return;
        if (r[0] === 'lamb') { est.lambDates = true; var sd = springDob(today, opts.lambingMonth); push(k, { role: 'lamb', dob: sd, n: n, src: 'class', estimate: true });
          /* -447 (audit P1-1): the lambs counted today were born this spring; before that day the farm carried last year's crop (hoggs,
             ewe lambs, stores). They are counted at today's number, a year older, until this year's lambing - an estimate, said. */
          if (sd.slice(5) !== '01-01') { est.lambCarry = true; push(k, { role: 'lamb', dob: (+sd.slice(0, 4) - 1) + sd.slice(4), off: sd, n: n, src: 'class', estimate: true }); } }
        else { est.classAges = true; push(k, { role: r[0], age: r[1], n: n, src: 'class', estimate: true }); }
      });
      /* -447 (audit P1-2, P1-3): a flock kept as ewes and rams has lambs at foot that no class or record holds. The footprint counts
         lambs on their own (UK inventory), and so does the NI manure table (NISR 2019/81 Sch 2 Table 1a); in GB the ewe figure takes
         them in to 6 months. The farmer's lambs reared per ewe give them, born on the lambing day and counted to 6 months old;
         after that they are not counted (no sale age is known). Not answered: nothing invented - asked, and said. */
      if (kind === 'ewes' && (cnt.ewes || 0) > 0 && !(cnt.lambs > 0) && !out.some(function (x) { return String(x.herd) === String(h.id) && x.role === 'lamb'; })) {
        var lpe = num(opts.lambsPerEwe);
        if (lpe !== null && lpe >= 0) { if (lpe > 0) { var ld = springDob(today, opts.lambingMonth), lo = (+ld.slice(5, 7) + 6 > 12 ? (+ld.slice(0, 4) + 1) + '-' + ('0' + (+ld.slice(5, 7) - 6)).slice(-2) : ld.slice(0, 4) + '-' + ('0' + (+ld.slice(5, 7) + 6)).slice(-2)) + '-01';
            est.lambsAtFoot = true; push('lambs', { role: 'lamb', dob: ld, off: lo, n: Math.round(cnt.ewes * lpe), src: 'answer', estimate: true }); } }
        else est.lambsAsk = true;
      }
    });
    (inp.spans || []).forEach(function (s) {
      if (!s || (s.species !== 'cattle' && s.species !== 'sheep') || !isoOk(s.from)) return;
      var n = Math.floor(head(s.n)); if (!n || !s.role) return;
      var occ = s.occupier === 'us' || s.occupier === 'them' ? s.occupier : null;
      if (s.kind === 'away' && occ === 'us') return;              // we occupy that land too: it is still our holding
      if (s.kind === 'notours' && occ === 'them') return;         // they keep the land at their disposal: their holding
      var r = classRole(s.species === 'cattle' ? 'suckler' : 'ewes', null);
      out.push({ species: s.species, role: s.role, age: num(s.age) !== null ? num(s.age) : (s.role === 'lamb' ? 3 : r ? (s.role === 'beef' ? 18 : 36) : 36),
                 on: s.from, off: isoOk(s.to) ? addDays(s.to, 1) : null, n: n, sign: s.kind === 'away' ? -1 : 1, src: s.kind, opts: opts });
    });
    return { records: out, exceptions: exc, estimate: est, sources: src };
  }

  /* head of each role on one day (the sheep count day, "in today") */
  function headOn(records, day, species) {
    var o = {}; if (!isoOk(day)) return o;
    (records || []).forEach(function (r) {
      if (!r || (species && r.species !== species)) return;
      var on = isoOk(r.on) ? r.on : (isoOk(r.dob) ? r.dob : null), off = isoOk(r.off) ? r.off : null;
      if (on && day < on) return; if (off && day >= off) return;
      var n = head(r.n) * (r.sign === -1 ? -1 : 1), role = r.role;
      if (role === 'lamb' && isoOk(r.dob) && ageAt(r.dob, day) >= 12) role = 'ewe';
      o[role] = (o[role] || 0) + n;
    });
    Object.keys(o).forEach(function (k) { o[k] = Math.max(0, Math.round(o[k])); });
    return o;
  }

  /* ── GB pig and poultry batches (England, Wales, Scotland: Schedule 1 per place a year) and NI batches (Table 1b/1c) ──
     batch: { species, type, stage, placed, cleared, n, deaths, where:'house'|'range'|'field', repeats, empty_weeks,
              holding:'own'|'other', occupier:'us'|'them' }
     The year's occupied days (repeats run on after the empty weeks) x effective head (deaths at half) / days in the year. */
  var GB_PIG = { sow: 'sow', sows: 'sow', gilts: 'maiden_gilt', maiden_gilt: 'maiden_gilt', boar: 'boar_150_plus', boars: 'boar_150_plus',
                 pig_7_13: 'pig_7_13', pig_13_31: 'pig_13_31', pig_31_66: 'pig_31_66', pig_66_plus: 'pig_66_plus', boar_66_150: 'boar_66_150', boar_150_plus: 'boar_150_plus' };
  var GB_POULTRY = { layers: null, pullets: 'pullet', broilers: 'broiler', breeders: 'breeder_ge25', breeder_lt25: 'breeder_lt25', breeder_ge25: 'breeder_ge25',
                     turkeys: 'turkey_m', turkey_m: 'turkey_m', turkey_f: 'turkey_f', ducks: 'duck', duck: 'duck' };
  function batchCycles(b, y) {
    if (!isoOk(b.placed)) return [];
    var cl = isoOk(b.cleared) && b.cleared >= b.placed ? b.cleared : y + '-12-31', len = daysBetween(b.placed, cl) + 1, gap = Math.max(0, Math.floor(head(b.empty_weeks))) * 7;
    var out = [], s = b.placed;
    for (var i = 0; i < 60; i++) {
      var e = addDays(s, len - 1); out.push([s, e]);
      if (!b.repeats || !isoOk(b.cleared)) break;
      s = addDays(e, gap + 1); if (s > y + '-12-31') break;
    }
    return out;
  }
  function batchN(nation, b, year, law) {
    var k = nationKey(nation); if (!k || !b || !law) return null;
    var y = num(year); if (!y) return null;
    var cyc = batchCycles(b, y), days = 0; cyc.forEach(function (c) { days += clipDays(c[0], c[1], y); });
    var occ = countsOnHolding({ ours: true, onOurHolding: b.holding !== 'other', occupier: b.holding === 'other' ? (b.occupier || null) : 'us' });
    var onOurs = b.holding === 'other' ? occ.limit : true;
    if (k === 'N') {
      var tot = 0, one = null;
      cyc.forEach(function (c) {
        var part = clipDays(c[0], c[1], y); if (!part) return;
        var r = niBatchN({ species: b.species, type: b.type, stage: b.stage, placed: c[0], cleared: c[1], n: b.n, deaths: b.deaths, off_n: b.off_n, where: b.where }, law);
        if (!r || r.kg === null) return; one = r;
        var full = daysBetween(c[0], c[1]) + 1;
        tot += r.per === 'week' ? r.kgExact * (part / full) : r.kgExact * (part / full);   // a crop or stage spread over its days on the farm
      });
      if (!one) return null;
      return { key: one.key, label: one.label, rate: one.rate, per: one.per, unit: one.unit, effectiveHead: one.effectiveHead, cycles: cyc.length, daysInYear: days,
               kg: onOurs === false ? 0 : r2(tot), kgExact: onOurs === false ? 0 : tot, onOurHolding: onOurs, ask: occ.ask, estimate: one.estimate, why: one.why, cite: one.cite, law_set: lawSet(law) };
    }
    var N = nat(law, k), key = null, answered = true;
    if (b.species === 'pig') {
      key = GB_PIG[b.stage] || GB_PIG[b.type] || null;
      if (!key) { key = b.type === 'weaners' ? 'pig_13_31' : 'pig_66_plus'; answered = false; }
    } else if (b.species === 'poultry') {
      if (b.type === 'layers') key = b.where === 'range' || b.where === 'field' ? 'layer_free' : 'layer_caged';
      else { key = GB_POULTRY[b.stage] || GB_POULTRY[b.type] || null; if (b.type === 'turkeys' && !GB_POULTRY[b.stage]) answered = false; }
    }
    var R = key ? N.manure_n.per_head[key] : null; if (!R) return null;
    var nPl = head(b.n), dead = Math.min(head(b.deaths), nPl), nE = nPl - dead / 2;
    var avg = nE * days / yearDays(y), kg = avg * R.value;
    return { key: key, label: R.label, rate: R.value, per: 'place', unit: R.unit, effectiveHead: nE, averageHead: avg, cycles: cyc.length, daysInYear: days,
             kg: onOurs === false ? 0 : r2(kg), kgExact: onOurs === false ? 0 : kg, onOurHolding: onOurs, ask: occ.ask,
             estimate: !answered, why: answered ? null : (b.species === 'pig' ? 'weight band not answered yet, so the higher figure' : 'sex not answered yet, so the higher figure'),
             cite: cite(R), law_set: lawSet(law) };
  }

  /* ── other species as counts (goats, deer, horses, donkeys, alpacas, llamas). NI horses by age. ──
     count: { species, age_band:'gt3'|'2_3'|'1_2'|'u1' (NI horses), milking (NI goats), n, ownership:'ours'|'notours', occupier }
     Alpacas and llamas have no legal figure: the factor table's estimate, tagged. */
  function countN(nation, c, law, factors) {
    var k = nationKey(nation); if (!k || !c || !law) return null;
    var n = head(c.n); if (!n) return null;
    if (c.ownership === 'notours' && c.occupier === 'them') return { kg: 0, head: n, onOurHolding: false };
    var key = null, est = false, R = null, rateV = null, label = null, cit = null;
    var sp = String(c.species || '').toLowerCase();
    if (k === 'N') {
      if (sp === 'goat') key = c.milking === false ? 'goat_nonmilking' : 'goat_milking';
      else if (sp === 'horse') { key = { gt3: 'horse_gt3', '2_3': 'horse_2_3', '1_2': 'horse_1_2', u1: 'horse_u1' }[c.age_band] || 'horse_gt3'; if (!c.age_band) est = true; }
      else if (sp === 'donkey' || sp === 'pony') key = 'donkey_small_pony';
      else if (sp === 'deer') key = 'deer_red_gt2';
    } else {
      if (sp === 'goat') key = 'goat'; else if (sp === 'horse' || sp === 'donkey' || sp === 'pony') key = 'horse';
      else if (sp === 'deer') key = c.red === false ? 'deer_other' : 'deer_red';
    }
    if (key) { R = nat(law, k).manure_n.per_head[key]; if (R) { rateV = R.value; label = R.label; cit = cite(R); } }
    if (!R && (sp === 'alpaca' || sp === 'llama')) {
      /* -439-sus6 (source audit S9): no official figure. A labelled assumption the farmer ticks ("we scale the goat figure by
         weight"); until ticked the animals are listed as needing an answer and nothing is added. */
      var f = fac(factors, 'est.n.' + sp);
      if (f && c.assumeProxy !== true) return { key: 'est_' + sp, label: f.label, head: n, rate: null, kg: null, ask: 'camelid', estimate: true, why: 'no official figure for ' + sp + 's: tick the goat-based assumption to count them', onOurHolding: true };
      if (f) { rateV = num(f.value); label = f.label; est = true; cit = { source: f.source, source_url: f.source_url, status: f.status, checked_on: f.checked_on }; key = 'est_' + sp; }
    }
    if (rateV === null) return null;
    return { key: key, label: label, head: n, rate: rateV, kg: n * rateV, estimate: est, why: est ? (sp === 'horse' ? 'age not answered yet, so the over-3 figure' : 'no official figure: the goat figure scaled by weight (your tick)') : null, cite: cit, onOurHolding: true };
  }

  /* ── manure moved on or off the holding (clear-outs, exports, imports) ──
     move: { kind:'export'|'import'|'spread'|'clear-out', qty, unit:'t'|'m3', manure:'cattle_fym'|'pig_fym'|'sheep_fym'|'horse_fym'|'duck_fym'|
             'poultry_20'|'poultry_40'|'poultry_60'|'poultry_80'|'cattle_slurry_6'|'pig_slurry_4', kg_n (typed beats the factor), moved_on }
     A spread or a clear-out to our own heap moves nothing off the holding; an export takes it away, an import adds it. */
  var MANURE_N = { cattle_fym: 'rb209.fym.cattle.total_n', pig_fym: 'rb209.fym.pig.total_n', sheep_fym: 'rb209.fym.sheep.total_n', horse_fym: 'rb209.fym.horse.total_n',
                   duck_fym: 'rb209.fym.duck.total_n', poultry_20: 'rb209.poultry.dm20.total_n', poultry_40: 'rb209.poultry.dm40.total_n',
                   poultry_60: 'rb209.poultry.dm60.total_n', poultry_80: 'rb209.poultry.dm80.total_n', cattle_slurry_6: 'rb209.cattle_slurry.dm6.total_n',
                   pig_slurry_4: 'rb209.pig_slurry.dm4.total_n' };
  function manureMoveN(m, factors) {
    if (!m) return null; var typed = num(m.kg_n), q = head(m.qty);
    var f = MANURE_N[m.manure] ? fac(factors, MANURE_N[m.manure]) : null;
    var kg = typed !== null && typed >= 0 ? typed : (f && q ? q * num(f.value) : null);
    if (kg === null) return { kg: null, sign: 0, why: 'amount or type missing' };
    var sign = m.kind === 'export' ? -1 : m.kind === 'import' ? 1 : 0;
    return { kg: r2(kg), sign: sign, typed: typed !== null, factor: f ? { id: f.id, value: f.value, unit: f.unit } : null };
  }

  /* ── the whole year: classes by month, manure N over the holding, with the reasons for every estimate ──
     inp: { nation, year, today, herds, animals, moves, spans, batches, counts, manureMoves, opts, holdingHa } */
  function yearManure(inp, law, factors) {
    inp = inp || {}; var k = nationKey(inp.nation), y = num(inp.year);
    if (!k || !law || !y || !isoOk(inp.today)) return { refused: 'nation, year, today and law needed' };
    if (inp.today < y + '-01-01') return { refused: 'the year has not started yet' };   /* -447 (audit P2): no whole-year figure for a year still to come */
    var from = y + '-01-01', st = stockRecords({ herds: inp.herds, animals: inp.animals, moves: inp.moves, spans: inp.spans, from: from, today: inp.today, opts: inp.opts });
    var monthly = monthlyClasses(k, st.records, from, 12, law), avg = averageClasses(monthly);
    var rows = Object.keys(avg).map(function (key) { return { key: key, head: avg[key] }; });
    var extra = [], est = [], asks = [];
    (inp.batches || []).forEach(function (b) {
      var r = batchN(k, b, y, law); if (!r) return;
      if (r.onOurHolding === null) asks.push({ what: 'occupier', batch: b.local_id || null });
      if (r.estimate) est.push(r.why);
      if (b.fromHerd) est.push('pigs and poultry from today\u2019s head count for the whole year; add batches for accuracy');
      if (r.kg > 0) extra.push({ key: r.key, label: r.label + (b.name ? ' (' + str(b.name, 60) + ')' : ''), head: r.averageHead != null ? r.averageHead : r.effectiveHead, rate: r.rate, kg: r.kgExact, per: r.per, estimate: !!(r.estimate || b.fromHerd), cite: r.cite, batch: b.local_id || null });
    });
    (inp.counts || []).forEach(function (c) {
      var r = countN(k, c, law, factors); if (r && r.ask) { asks.push({ what: r.ask, species: c.species }); est.push(r.why); } if (!r || !(r.kg > 0)) return;
      if (r.estimate) est.push(r.why);
      if (c.fromHerd) est.push('other stock from today\u2019s head count in Livestock');
      extra.push({ key: r.key, label: r.label, head: r.head, rate: r.rate, kg: r.kg, estimate: !!(r.estimate || c.fromHerd), cite: r.cite, count: true });
    });
    var adj = 0; (inp.manureMoves || []).forEach(function (m) {
      if (!m || !isoOk(m.moved_on) || m.moved_on.slice(0, 4) !== String(y)) return;
      var r = manureMoveN(m, factors); if (r && r.kg !== null) adj += r.sign * r.kg;
    });
    var res = manureN({ nation: k, rows: rows, extraRows: extra, adjustKg: adj, holdingHa: inp.holdingHa }, law);
    var o = inp.opts || {};
    if (st.estimate.classAges) est.push('ages taken from today’s class counts');
    if (st.estimate.lambCarry) est.push('last year\'s lambs (hoggs, ewe lambs, stores) counted at today\'s number until this year\'s lambing');
    if (st.estimate.lambDates) est.push('lambs counted as born on 1 ' + (num((inp.opts || {}).lambingMonth) >= 1 ? MONFULL[num(inp.opts.lambingMonth) - 1] + ' (your lambing month)' : 'April (lambing month not answered)'));
    if (inp.today < y + '-12-31' && inp.today >= from) est.push('the rest of the year uses today’s numbers');
    var has = function (re) { return rows.some(function (r) { return re.test(r.key); }); };
    if (k !== 'N' && !o.size && has(/^suckler_/)) est.push('suckler size not answered, so the higher figure');
    if (k !== 'N' && !o.eweSize && has(/^ewe_/)) est.push('ewe size not answered, so the higher figure');
    if (k !== 'N' && !o.yieldBand && has(/^dairy_(lt|60|gt)/)) est.push('milk yield not answered, so the higher figure');
    if (st.estimate.lambsAtFoot) est.push('lambs at foot from your lambs reared per ewe, counted from lambing to 6 months old');
    if (st.estimate.lambsAsk) { est.push('lambs at foot not counted until you say how many lambs you rear per ewe'); asks.push({ what: 'lambsPerEwe' }); }
    res.monthly = monthly; res.average = avg; res.sources = st.sources; res.exceptions = st.exceptions; res.records = st.records;
    res.estimates = est.filter(function (x, i) { return x && est.indexOf(x) === i; }); res.asks = asks; res.year = y;
    res.status = res.perHa === null ? 'missing' : res.over ? 'over' : 'within';
    return res;
  }

  /* ── slurry into the store: housed head x the legal excreta volume, plus rain on open stores ──
     inp: { nation, monthly (12 months from 1 Jan), housing:{ group:{ mode:'winter'|'all'|'out', in:'MM-DD', out:'MM-DD' } },
            openAreaM2, rainMm:[12] (Jan..Dec), rainBasis:'wet'|'average', pigFeed:'dry'|'liquid', pigBatches:[batch], year, followers:'dairy'|'beef' }
     Groups: sucklers (suckler cows and their calves and bulls), dairy, followers (every other cattle row). Sheep go to the
     midden, not the slurry store.
     -439-sus6 (owner decision "housing" a, RESEARCH-DECISIONS F5): unanswered housing is the inventory-based estimate for the
     category and nation (housing.days.* in the factor table), centred on 15 January, tagged "Estimate" with its source. No
     invented 1 Nov to 15 Apr. Housed all year is only ever the farmer's own answer. Each nation uses its own excreta rows. */
  var EXCRETA = { suckler_gt500: 'legal.excreta.suckler_gt500', suckler_le500: 'legal.excreta.suckler_le500',
                  dairy_gt9000: 'legal.excreta.dairy_gt9000', dairy_6000_9000: 'legal.excreta.dairy_6000_9000', dairy_lt6000: 'legal.excreta.dairy_lt6000',
                  bull_breeding: 'legal.excreta.bull', bull_breeding_young: 'legal.excreta.bull', bull_nonbreeding: 'legal.excreta.bull',
                  beef_mid: 'legal.excreta.beef_12_24', beef_older: 'legal.excreta.beef_over24', dairy_heifer: 'legal.excreta.dairy_heifer',
                  calf: 'legal.excreta.calf_lt2m', beef_young: 'legal.excreta.calf_2_12m', dairy_young: 'legal.excreta.calf_2_12m' };
  var EXCRETA_W = { beef_older: 'legal.excreta.beef_over24.W' };
  var EXCRETA_NI = { dairy_cow: 'legal.excreta.ni.dairy_cow', suckler_gt2: 'legal.excreta.ni.suckler', cattle_gt2: 'legal.excreta.ni.cattle_gt2', dairy_heifer_gt2: 'legal.excreta.ni.cattle_gt2',
                     bull_breeding: 'legal.excreta.ni.cattle_gt2', cattle_1_2: 'legal.excreta.ni.cattle_1_2', dairy_heifer_1_2: 'legal.excreta.ni.cattle_1_2', bull_beef_0_13: 'legal.excreta.ni.cattle_1_2',
                     calf_6_12: 'legal.excreta.ni.calf_6_12', calf_0_6: 'legal.excreta.ni.calf_0_6' };
  var EXCRETA_NEAREST = { bull_breeding_N: 1, bull_beef_0_13_N: 1 };   // NI has no bull row: the cattle row of the same age, tagged
  function excretaId(k, key) { return k === 'N' ? EXCRETA_NI[key] || null : (k === 'W' && EXCRETA_W[key]) || EXCRETA[key] || null; }
  function excretaGroup(key) { return /^suckler|^bull_breeding/.test(key) ? 'sucklers' : /^dairy_(lt|60|gt)|^dairy_cow$/.test(key) ? 'dairy' : 'followers'; }
  var HOUSE_CAT = { sucklers: 'suckler', dairy: 'dairy' };
  function mdOf(t) { return iso(t).slice(5); }
  /* the default housed window for one group when the farmer gave no dates: the factor table's days for the nation, centred on 15 Jan */
  function housingDefault(group, nation, factors, followers) {
    var k = nationKey(nation), cat = HOUSE_CAT[group] || (followers === 'dairy' ? 'dairy_young' : 'beef'), f = fac(factors, 'housing.days.' + cat);
    var d = f && f.value ? num(f.value[k]) : null; if (!d || !k) return null;
    /* -440 (R8): `out` is the LAST day housed (inclusive), so d days run from `in` to in + d - 1, and the words and the date box agree */
    var c = Date.UTC(2027, 0, 15), s = c - Math.floor(d / 2) * DAY, e = s + (d - 1) * DAY;
    return { mode: 'winter', 'in': mdOf(s), out: mdOf(e), days: d, estimate: true, factor: f.id, source: f.source, status: f.status,
             sourceShort: k === 'S' ? 'Scottish Agricultural Census, June 2026' : 'UK ammonia inventory housing periods (2013 and 2014 reports)' };
  }
  /* every cattle group with an answer or the estimate; ewes housed 42 days before lambing when the lambing month is given */
  function housingResolve(housing, nation, factors, opts) {
    opts = opts || {}; var H = {}, tags = [], miss = [];
    ['sucklers', 'dairy', 'followers'].forEach(function (g) {
      var h = housing && housing[g];
      if (h && h.mode) { H[g] = h; return; }
      var d = housingDefault(g, nation, factors, opts.followers);
      if (d) { H[g] = d; miss.push(g); } });
    /* -440 (UX-52): the words name only the groups the farm has (words(groups)); `estimates` keeps the all-groups line for old readers */
    var GW = { sucklers: 'suckler cows', dairy: 'dairy cows', followers: 'young and finishing cattle' };
    var words = function (gs) { gs = (gs || []).filter(function (g) { return miss.indexOf(g) >= 0; }); return gs.length ? 'housing dates not answered for ' + gs.map(function (g) { return GW[g] || g; }).join(', ') + ': an estimate from the UK inventory and survey data (' + gs.map(function (g) { return H[g].days + ' days, ' + mdWords(H[g]['in']) + ' to ' + mdWords(H[g].out); }).join('; ') + '). Tell us your dates' : null; };
    if (miss.length) tags.push(words(miss));
    var lm = num(opts.lambingMonth), ef = fac(factors, 'housing.ewe_before_lambing');
    /* -440 (UX-28): the ewes are housed to lamb only if the farmer says so; not answered, they are counted in (the higher figure) and it is said */
    if (lm >= 1 && lm <= 12 && ef && opts.ewesIn !== 'no') { var ls = Date.UTC(2027, Math.floor(lm) - 1, 1); H.ewes = { mode: 'winter', 'in': mdOf(ls - num(ef.value) * DAY), out: mdOf(ls), days: num(ef.value), lambing: true, factor: ef.id };
      if (opts.ewesIn !== 'yes') tags.push('whether the ewes come in to lamb not answered, so they are counted as housed ' + num(ef.value) + ' days before lambing (UK inventory)'); }
    return { housing: H, estimated: miss, estimates: tags, words: words };
  }
  function housedDays(h, y, m) {          // days of month m (0-11) of year y the group is in (no answer and no estimate: none)
    if (!h || !h.mode) return 0;
    var s = Date.UTC(y, m, 1), e = Date.UTC(y, m + 1, 1), dim = Math.round((e - s) / DAY);
    if (h.mode === 'all') return dim; if (h.mode === 'out') return 0;
    var hin = /^\d{2}-\d{2}$/.test(h['in'] || '') ? h['in'] : null, hout = /^\d{2}-\d{2}$/.test(h.out || '') ? h.out : null, n = 0;
    if (!hin || !hout) return 0;
    /* -440 (R8): both dates count as housed days (the out date is the last day in; a farmer's turn-out day counts too, the cautious side) */
    for (var t = s; t < e; t += DAY) { var md = iso(t).slice(5); if (hin <= hout ? (md >= hin && md <= hout) : (md >= hin || md <= hout)) n++; }
    return n;
  }
  /* pigs: the legal row for the batch's weight band and feed (source audit L9, NI L10). Unanswered: the highest row, tagged. */
  function pigExcretaId(k, b, feed) {
    var t = String(b.type || ''), st = String(b.stage || ''), liq = feed === 'liquid' || (feed !== 'dry'), wet = liq ? 'liquid' : 'dry';
    if (/sow/.test(t)) return [k === 'N' ? 'legal.excreta.ni.sow' : 'legal.excreta.sow', true];
    if (/gilt/.test(t)) return [k === 'N' ? 'legal.excreta.ni.gilt_boar' : 'legal.excreta.gilt', true];
    if (/boar/.test(t)) return [k === 'N' ? 'legal.excreta.ni.gilt_boar' : (st === 'boar_66_150' ? 'legal.excreta.boar_66_150' : 'legal.excreta.boar_150'), true];
    if (k === 'N') {
      var NI = { w18: 'w18', w35: 'w35', g35: 'g35', w105: 'w105_' + (liq ? 'liquid' : 'meal'), f105: 'f105_' + (liq ? 'liquid' : 'meal'), g105: 'f105_' + (liq ? 'liquid' : 'meal') }[st];
      return NI ? ['legal.excreta.ni.' + NI, feed != null || /^(w18|w35|g35)$/.test(st)] : ['legal.excreta.ni.' + (/weaner/.test(t) ? 'w35' : 'w105_liquid'), false];
    }
    var G = { pig_7_13: 'pig_7_13', pig_13_31: 'pig_13_31', pig_31_66: 'pig_31_66_' + wet, pig_66_plus: 'pig_66_' + wet }[st];
    if (G) return ['legal.excreta.' + G, feed != null || /^pig_(7|13)/.test(st)];
    return ['legal.excreta.' + (/weaner/.test(t) ? 'pig_13_31' : 'pig_66_liquid'), false];
  }
  function slurryInflow(inp, law, factors) {
    inp = inp || {}; var y = num(inp.year), mon = inp.monthly || [], k = nationKey(inp.nation);
    var per = [], rows = [], est = [], nearest = false, pigGuess = false;
    if (!y || mon.length !== 12) return { refused: 'a year of monthly classes needed' };
    var HR = housingResolve(inp.housing, k, factors, { followers: inp.followers }), HS = HR.housing, usedEst = {};
    var area = Math.max(0, num(inp.openAreaM2) || 0), rain = inp.rainMm && inp.rainMm.length === 12 ? inp.rainMm : null;
    /* -446 (web test P0-2): SI 2015/668 reg 25(3) - the store holds "any rainfall, washings or other liquid that enters the vessel
       (either directly or indirectly)". The farmer's own figures, never a default: washings and dairy water in m³ a week, and the
       dirty yard that drains to the store (its rain worked out like the open surface's). */
    var washDay = Math.max(0, num(inp.washM3Wk) || 0) / 7, yard = Math.max(0, num(inp.yardM2) || 0), sysW = {}, sysBoth = {};
    for (var m = 0; m < 12; m++) {
      var dim = mon[m].days, v = 0;
      Object.keys(mon[m].classes).forEach(function (key) {
        var fid = excretaId(k, key); if (!fid) return; var w = facV(factors, fid); if (w === null) return;
        var g = excretaGroup(key), h = HS[g];
        /* -446 (web test P0-3): a group whose housed manure is kept as straw or FYM puts nothing into the slurry store. "Both" and
           an unanswered system are counted in full (the cautious side) and said. */
        if (h && h.system === 'fym') return;
        if (EXCRETA_NEAREST[key + '_' + k]) nearest = true;
        var hd = housedDays(h, y, m); if (!hd) return; if (h && h.estimate) usedEst[g] = 1;
        if (h && h.system === 'both') sysBoth[g] = 1; else if (!h || !h.system) sysW[g] = 1;
        v += mon[m].classes[key] * w / 7 * hd / dim;
      });
      (inp.pigBatches || []).forEach(function (b) {
        if (!b || b.species !== 'pig' || (b.where && b.where !== 'house')) return;
        var px = pigExcretaId(k, b, b.feed || inp.pigFeed || null), w = facV(factors, px[0]); if (w === null) return; if (!px[1]) pigGuess = true;
        var days = 0;
        batchCycles(b, y).forEach(function (c) { var ms = iso(Date.UTC(y, m, 1)), me = iso(Date.UTC(y, m + 1, 1) - DAY); var lo = c[0] > ms ? c[0] : ms, hi = c[1] < me ? c[1] : me; if (hi >= lo) days += daysBetween(lo, hi) + 1; });
        var nE = head(b.n) - Math.min(head(b.deaths), head(b.n)) / 2; v += nE * w / 7 * days / dim;
      });
      var rainV = rain && area ? area * (num(rain[m]) || 0) / 1000 / dim : 0, yardV = rain && yard ? yard * (num(rain[m]) || 0) / 1000 / dim : 0;
      per.push(r2((v + rainV + yardV + washDay) * 1000) / 1000); rows.push({ month: mon[m].month, stockM3: v * dim, rainM3: rainV * dim, yardM3: yardV * dim, washM3: washDay * dim });
    }
    var GW2 = { sucklers: 'suckler cows', dairy: 'dairy cows', followers: 'young and finishing cattle' }, gw = function (o) { return Object.keys(o).map(function (g) { return GW2[g] || g; }).join(', '); };
    if (Object.keys(sysBoth).length) est.push('part of the manure of ' + gw(sysBoth) + ' goes to straw or a heap: all of it is counted in the slurry store (the cautious side)');
    if (Object.keys(sysW).length) est.push('how the housed manure of ' + gw(sysW) + ' is kept is not answered, so it is counted in the slurry store (the cautious side)');
    if (yard && !rain) est.push('no rainfall figures yet, so no rain off the yard');
    if (Object.keys(usedEst).length) { var w0 = HR.words(Object.keys(usedEst)); if (w0) est.push(w0); }   /* -440 (UX-52) */
    if (nearest) est.push('Northern Ireland has no bull row: the cattle row of the same age is used');
    if (pigGuess) est.push('pig weight band or feed not answered, so the highest legal figure');
    if (area && !rain) est.push('no rainfall figures yet, so no rain on the open store');
    if (area && rain && inp.rainBasis !== 'wet') est.push('rain is your average year; the rules expect a wetter (1 in 5) year, so you may need more room');
    if (area && rain && inp.rainBasis === 'wet') est.push('rain on the open store: a 1-in-5 wet year, the season total exceeded in 1 year in 5 at your farm (our method, on gov.uk\'s 1-in-5 guidance)');
    return { perDay: per, rows: rows, estimates: est, housing: HS, housingEstimated: Object.keys(usedEst) };
  }

  /* ── the store plan: rule, fill, full-by date, need against capacity, and the spreading date ──
     inp: { nation, nvz, stores:[{ local_id, kind:'lagoon'|'tank'|'midden'|'heap', capacity_m3, covered, built_or_changed, open_area_m2, removed }],
            readings:[{ store_local_id, read_on, fill_frac }], inflowPerDay:[12], today, kind:'cattle'|'pig'|'poultry', places, hasPigOrPoultry }
     The store winter starts on 1 October (the window rules' first day; Scotland and NI weeks are counted from it too, tagged). */
  function closedSpread(nation, nvz, today, law, land, soil) {
    var N = nat(law, nation); if (!N || !isoOk(today)) return null;
    var C = N.closed.value; if (C.scope === 'nvz' && nvz !== true) return null;
    var pair = C.slurry && C.slurry[land || 'grass'] ? C.slurry[land || 'grass'][soil || 'other'] : null; if (!pair) return null;
    var y = +today.slice(0, 4), md = today.slice(5);
    var f = pair[0], t = pair[1], wraps = t < f, from, to;
    if (wraps) { if (md <= t) { from = (y - 1) + '-' + f; to = y + '-' + t; } else { from = y + '-' + f; to = (y + 1) + '-' + t; } }
    else { from = y + '-' + f; to = y + '-' + t; if (md > t) { from = (y + 1) + '-' + f; to = (y + 1) + '-' + t; } }
    return { from: from, to: to, active: today >= from && today <= to, opensOn: addDays(to, 1), cite: cite(N.closed) };
  }
  /* -439-sus6: the store plan follows the owner's decisions and the source audit.
     - fill: "Unknown" until a reading (no full-by date); the farmer may tick "Assume emptied by 1 October" (inp.assumeEmptied),
       which gives a labelled forecast (decision "fill" a; RESEARCH-DECISIONS D: no published default).
     - open surface: the farmer's own length x width (open_area_m2); no 1 m² per 2.1 m³ rule (source audit S18).
     - Scotland and NI: the weeks run from the farmer's start (inp.weeksFrom 'MM-DD') or the labelled assumption 1 October
       from the law table (decision "weeks", source audit L4).
     - England off-NVZ (SSAFO): the worst 4 months (L5). England and Wales NVZ: the law's own window from 1 October. */
  function storePlan(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation);
    if (!k || !law || !isoOk(inp.today)) return { refused: 'nation, today and law needed' };
    var slurry = (inp.stores || []).filter(function (s) { return s && !s.removed && (s.kind === 'lagoon' || s.kind === 'tank' || s.kind === 'slurry') && head(s.capacity_m3) > 0; });
    var solid = (inp.stores || []).filter(function (s) { return s && !s.removed && (s.kind === 'midden' || s.kind === 'heap'); });
    var est = [], asks = [];
    var built = null, ask = null;
    if (slurry.length) {
      var dates = slurry.map(function (s) { return isoOk(s.built_or_changed) ? s.built_or_changed : null; });
      if (dates.some(function (d) { return d === null; })) ask = 'build';
      else built = dates.sort().slice(-1)[0];          // the newest store decides: SSAFO applies when any store was built or changed since 1991
    }
    var rule = storageRule({ nation: k, nvz: inp.nvz, kind: inp.kind || 'cattle', builtOrChanged: built, places: inp.places, hasPigOrPoultry: inp.hasPigOrPoultry,
                             winterFrom: (+inp.today.slice(5, 7) >= 7 ? +inp.today.slice(0, 4) : +inp.today.slice(0, 4) - 1) }, law);
    var cap = 0, area = 0, noArea = false;
    slurry.forEach(function (s) { cap += head(s.capacity_m3); if (s.covered !== true) { if (num(s.open_area_m2) > 0) area += num(s.open_area_m2); else noArea = true; } });
    if (noArea) { asks.push('area'); est.push('rain on the open store is not worked out until you give its open surface (length × width, or the diameter of a round tank)'); }
    if (slurry.some(function (s) { return s.covered !== true && s.covered !== false; })) est.push('cover not answered, so counted as open to the rain (our cautious rule)');
    var wy = +inp.today.slice(5, 7) >= 7 ? +inp.today.slice(0, 4) : +inp.today.slice(0, 4) - 1, ruleFrom = wy + '-10-01', startAssumed = false;
    if ((k === 'S' || k === 'N') && rule.days) {
      var A = nat(law, k).storage.assumed_start, wf = /^\d{2}-\d{2}$/.test(inp.weeksFrom || '') ? inp.weeksFrom : null;
      var md = wf || (A ? A.value : '10-01'); ruleFrom = (md >= '07-01' ? wy : wy + 1) + '-' + md; startAssumed = !wf;
      est.push(wf ? 'the ' + Math.round(rule.days / 7) + ' weeks run from ' + mdWords(md) + ' (your start)' : 'the law sets ' + Math.round(rule.days / 7) + ' weeks but no start date: assumed from 1 October (you can change it)');
    }
    if (rule.worst) est.push('the 4 months are your worst (fullest) 4 months of the year');
    if (!cap) return { stores: slurry.length, solid: solid.length, capacityM3: 0, rule: rule, ask: ask, asks: asks, status: slurry.length ? 'missing' : 'none', estimates: est, openAreaM2: 0 };
    var fill = null, src = 'unknown';
    var rd = (inp.readings || []).filter(function (r) { return r && isoOk(r.read_on) && r.read_on <= inp.today && num(r.fill_frac) !== null && slurry.some(function (s) { return String(s.local_id) === String(r.store_local_id); }); })
                                 .sort(function (a, b) { return a.read_on < b.read_on ? 1 : -1; })[0];
    var flow = inp.inflowPerDay || [];
    var since = function (d0, f0) { var f1 = f0; for (var d = d0; d < inp.today; d = addDays(d, 1)) f1 += (num(flow[+d.slice(5, 7) - 1]) || 0); return f1; };
    if (rd) { fill = since(rd.read_on, Math.max(0, Math.min(1, num(rd.fill_frac))) * cap); src = 'reading'; }
    else if (inp.assumeEmptied === true) { fill = since(wy + '-10-01', 0); src = 'assumed'; est.push('assumed emptied by 1 October (your tick); a reading beats it'); }
    else asks.push('fill');
    /* -446 (web test P0-2), asked after the earlier questions: until the farmer says whether washings or yard water drain into the store, the need is stock and rain only */
    if (slurry.length && inp.washAsk === 'yes' && inp.washGiven !== true) { asks.push('washings'); est.push('you said washings or yard water drain into the store: they are not counted until you add how much (m³ a week, or the yard area)'); }
    else if (slurry.length && inp.washAsk !== 'no' && inp.washAsk !== 'yes') { asks.push('washings'); est.push('washings, dairy water and rain off dirty yards that drain into the store are not counted until you answer whether any do (the rule counts them, SI 2015/668 reg 25(3))'); }
    var fc = storeForecast({ capacityM3: cap, fillM3: fill, inflowPerDay: flow, today: inp.today, ruleDays: rule.days, ruleFrom: rule.worst ? wy + '-01-01' : ruleFrom, ruleWorst: !!rule.worst });
    if (fc.refused) return { capacityM3: cap, rule: rule, ask: ask, asks: asks, status: 'missing', estimates: est, refused: fc.refused };
    var cs = closedSpread(k, inp.nvz === true || nvzStatus({ nation: k, confirmed: inp.nvz }, law).inNvz === true, inp.today, law, inp.land, inp.soil);
    var opens = cs ? (cs.active ? cs.opensOn : null) : null;
    var PCt = law.product_choices && law.product_choices.store_tight_days ? num(law.product_choices.store_tight_days.value) : 42;   // our rule: warn 6 weeks ahead
    var tight = !!(fc.fullBy && (opens ? fc.fullBy < opens : daysBetween(inp.today, fc.fullBy) < PCt));
    var status = fc.meets === false ? 'short' : fill === null ? 'unknown' : tight ? 'tight' : 'ok';
    return { capacityM3: cap, fillM3: fill === null ? null : Math.round(fill), pct: fill === null ? null : Math.round(Math.min(fill, cap) / cap * 100), fillFrom: src, readOn: rd ? rd.read_on : null,
             fullBy: fc.fullBy, needM3: fc.needM3, meets: fc.meets, ruleFrom: rule.worst ? fc.worstFrom : ruleFrom, startAssumed: startAssumed, rule: rule, ask: ask, asks: asks, closed: cs, spreadFrom: opens,
             weekM3: Math.round((num(flow[+inp.today.slice(5, 7) - 1]) || 0) * 7), openAreaM2: Math.round(area), status: status, tight: tight,
             stores: slurry.length, solid: solid.length, estimates: est, law_set: lawSet(law) };
  }

  /* -439-sus6 (source audit L7; law row rain_wet_year): rain on an open store for a wet year. gov.uk ("Storing organic manures
     in NVZs") says to allow for a wetter than average year (1 in 5); no conversion factor is published. Our method, labelled:
     the 80th percentile of the farm's whole-season rainfall totals over the Rainfall normal's years (ERA5, about 30 seasons),
     divided by the average season, scales the average month. A season total exceeded in 1 year in 5 is the 1-in-5 wet year.
     Without the percentile (an older saved normal, or fewer than 10 seasons) the average is used and said plainly.
     normal: [12] mm (average), band: { p80:[12 cumulative mm] }, years: seasons in the normal.
     out: { mm:[12], basis:'wet'|'average'|null, years, factor } */
  function wetYearRain(normal, band, years) {
    var nOk = normal && normal.length === 12 ? normal : null; if (!nOk) return { mm: null, basis: null, years: 0, factor: null };
    var tot = nOk.reduce(function (a, b) { return a + (num(b) || 0); }, 0), p = band && band.p80 && band.p80.length === 12 ? num(band.p80[11]) : null;
    if (!(tot > 0) || !(p > 0) || !(num(years) >= 10)) return { mm: nOk, basis: 'average', years: num(years) || 0, factor: null };
    var k = Math.max(1, p / tot);
    return { mm: nOk.map(function (v) { return r2((num(v) || 0) * k); }), basis: 'wet', years: num(years), factor: r2(k) };
  }

  /* ── the sheep and goat inventory, pre-filled ──
     The engine's sheepReturn() dates plus our estimate for the count day from the records; a saved count beats the estimate. */
  function sheepReturnPrefill(nation, today, records, saved, law) {
    var R = sheepReturn(nation, today, law); if (!R) return null;
    var day = R.countFrom, h = headOn(records, day, 'sheep');
    var est = { ewes: Math.max(0, (h.ewe || 0)), rams: Math.max(0, (h.ram || 0)), other: Math.max(0, (h.lamb || 0) + (h.store || 0)) };
    var mine = saved && +saved.year === +R.year ? saved : null;
    return { dates: R, estimate: est, counted: mine ? { ewes: head(mine.ewes), rams: head(mine.rams), other: head(mine.other), counted_on: mine.counted_on || null } : null,
             filed: !!(mine && isoOk(mine.filed_on)), filed_on: mine && isoOk(mine.filed_on) ? mine.filed_on : null, filed_via: mine ? (mine.filed_via || null) : null };
  }

  function splitCsv(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) { var ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(function (x) { return x.trim(); });
  }
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(s) {
    s = String(s || '').trim(); if (!s) return null; var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return okDate(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) return okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);   // UK day first
    if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,5})[ \-,]*(\d{2,4})$/))) return MON[m[2].toLowerCase()] ? okDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON[m[2].toLowerCase()], +m[1]) : null;
    return null;
  }
  function okDate(y, mo, d) { if (y < 1980 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null; var t = Date.UTC(y, mo - 1, d), x = new Date(t); if (x.getUTCDate() !== d) return null; return iso(t); }
  /* ── the keeper's own register as CSV (D3; option C, 15 Nov 2026): CTS "Cattle on Holding" / ScotEID page exports, the
     farmer's flock or herd software, or a spreadsheet. Read by the columns, never by system name (BCMS, LIS, ScotEID, APHIS
     and EIDCymru change hands in 2027). Never guesses a date.
     opts: { species:'cattle'|'sheep' (the farmer's choice at import, if any), holding:'12/345/6789' (Settings CPH), nation }
     Returns { rows:[{tag,sex,breed,dob,yob,dam,on,off,n}], refused:[{line,why}], columns, dropped:[headings not kept (decision 9)],
               species, speciesFrom:'column'|'columns'|'tags'|'farmer'|null, ask:'species'|null, clash (the farmer's other choice),
               kind:'snapshot'|'moves', holdings:[digits], wrongHolding:{found,ours}|null, asOf, asOfFrom, dataRows, refusedShare,
               rightFileAsk (more than 1 in 10 rows refused) } */
  var COLS = [['tag', /^(ear|flock|visual|eid|electronic|official|animal|individual|uk|current)? ?tag( no\.?| number| id)?$|^ear ?tag|^eid( no\.?| number)?$|^electronic id|official id|^animal id|individual id|^id$|^uk ?number|^current id/i],
              ['species', /^(species|animal type|type of animal|stock type)$/i], ['sex', /^sex$|gender/i], ['breed', /breed/i],
              ['yob', /year of birth|birth ?year|^yob$|^born \(year\)/i], ['dob', /date of birth|birth ?date|^dob$|^born$|^born on|^birth$/i],
              ['dam', /^(genetic )?dam( tag| id| ear ?tag)?$|^mother/i],
              ['on', /move[ds]? ?on|^on ?date|date (moved )?on|arriv|date in$|moved in|^joined|date of entry|entry date|purchase date|date on holding|^date on/i],
              ['off', /move[ds]? ?off|^off ?date|date (moved )?off|depart|date out$|moved out|date left|^left on|date of death|death date|^died|sold on|sale date|^exit/i],
              ['n', /^(number|no\.? of (animals|sheep|head)|number of (animals|sheep)|count|qty|quantity|head)$/i],
              ['cph', /^(cph|holding( number| no\.?)?|holding cph|keeper cph|location cph|cph number|herd (mark|number)|flock (mark|number))$/i]];
  var OTHER_HOLDING = /(from|to|previous|destination|seller|buyer|sold to|bought from|source|dest|other).*(cph|holding|location|keeper)|keeper name|^name|price|£|value|address|postcode/i;
  var SPECIES_WORD = { cattle: /^(cattle|bovine|cow|cows|bull|bulls|heifer|heifers|steer|steers|calf|calves|beef|dairy)$/i, sheep: /^(sheep|ovine|ewe|ewes|ram|rams|lamb|lambs|tup|tups|hogg|hoggs|wether|wethers|shearling)$/i,
                       goat: /^(goat|goats|caprine|kid|kids|doe|does|buck|bucks)$/i };
  var HINT = { cattle: /genetic dam|surrogate dam|^sire|passport|breed code|bcms|\bcts\b|cattle|bovine|calving|herd ?(mark|number)/i, sheep: /flock|year of birth|ewe|\bram\b|lambing|sheep|ovine|batch|number of (animals|sheep)/i };
  function cphDigits(s) { var d = String(s || '').replace(/[^0-9]/g, ''); return d.length >= 6 && d.length <= 12 ? d : null; }
  function tagKey(t) { return String(t || '').replace(/\s+/g, '').toUpperCase(); }
  function parseRegisterCsv(text, today, opts) {
    opts = opts || {};
    var out = { rows: [], refused: [], columns: {}, dropped: [], species: null, speciesFrom: null, ask: null, clash: null, kind: 'snapshot', holdings: [], wrongHolding: null,
                asOf: null, asOfFrom: null, dataRows: 0, refusedShare: 0, rightFileAsk: false };
    var t0 = isoOk(today) ? today : null, ty = t0 ? +t0.slice(0, 4) : 2100;
    var lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) { out.refused.push({ line: 0, why: 'no rows' }); return out; }
    /* the heading row: the first of the top ten lines with an ear tag column (exports often start with a title and the holding) */
    var hi = 0, sep = ',';
    for (var i0 = 0; i0 < Math.min(10, lines.length); i0++) {
      var sp0 = (lines[i0].split(';').length > lines[i0].split(',').length) ? ';' : (lines[i0].split('\t').length > lines[i0].split(',').length ? '\t' : ',');
      if (splitCsv(lines[i0], sp0).some(function (h) { return COLS[0][1].test(h); })) { hi = i0; sep = sp0; break; }
    }
    var pre = lines.slice(0, hi).join(' '), body = lines.slice(hi + 1);
    if (body.length > 20000) { out.refused.push({ line: 0, why: 'more than 20,000 rows: only the first 20,000 were read' }); body = body.slice(0, 20000); }
    var hdr = splitCsv(lines[hi], sep), idx = {};
    COLS.forEach(function (c) { for (var i = 0; i < hdr.length; i++) { if (c[1].test(hdr[i]) && !OTHER_HOLDING.test(hdr[i]) && !Object.keys(idx).some(function (o) { return idx[o] === i; })) { idx[c[0]] = i; break; } } });
    out.columns = idx;
    var keptIdx = Object.keys(idx).map(function (k) { return idx[k]; });
    out.dropped = hdr.filter(function (h, i) { return keptIdx.indexOf(i) < 0 && String(h).trim() !== ''; });
    out.kind = (idx.on != null || idx.off != null) ? 'moves' : 'snapshot';
    /* the holding: a CPH in the lines above the headings, or a holding column with one value all the way down (other
       holdings in a column are sellers and buyers: dropped, never kept) */
    var hs = {}, m0, reC = /\b(\d{2})\s*\/\s*(\d{3})\s*\/\s*(\d{4})\b/g;
    while ((m0 = reC.exec(pre))) hs[m0[1] + m0[2] + m0[3]] = 1;
    if (idx.cph != null) {
      var vals = {}; body.forEach(function (l) { var v = cphDigits(splitCsv(l, sep)[idx.cph]); if (v) vals[v] = 1; });
      if (Object.keys(vals).length === 1) hs[Object.keys(vals)[0]] = 1;
      delete out.columns.cph;
    }
    out.holdings = Object.keys(hs);
    var ours = cphDigits(opts.holding);
    if (ours && out.holdings.length && out.holdings.indexOf(ours) < 0) {
      out.wrongHolding = { found: out.holdings[0], ours: ours };
      out.refused.push({ line: 0, why: 'this file is for holding ' + out.holdings[0].replace(/^(\d{2})(\d{3})(\d{4})$/, '$1/$2/$3') + ', not this farm (' + ours.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1/$2/$3') + ')' });
      return out;
    }
    /* the species: a species column, else the column set, else (NI only) the tag prefixes, else the farmer's choice, else ask */
    var spCount = { cattle: 0, sheep: 0, goat: 0 };
    if (idx.species != null) body.forEach(function (l) { var v = String(splitCsv(l, sep)[idx.species] || '').trim(); Object.keys(SPECIES_WORD).forEach(function (s) { if (SPECIES_WORD[s].test(v)) spCount[s]++; }); });
    var fromCol = Object.keys(spCount).filter(function (s) { return spCount[s] > 0; }).sort(function (a, b) { return spCount[b] - spCount[a]; })[0] || null;
    var hint = { cattle: hdr.some(function (h) { return HINT.cattle.test(h); }), sheep: hdr.some(function (h) { return HINT.sheep.test(h); }) };
    var fromHdr = hint.cattle && !hint.sheep ? 'cattle' : hint.sheep && !hint.cattle ? 'sheep' : null;
    var fromTags = null;
    if (!fromCol && !fromHdr && nationKey(opts.nation) === 'N' && idx.tag != null) {
      var tc = { cattle: 0, sheep: 0 }; body.slice(0, 200).forEach(function (l) { var tg = tagKey(splitCsv(l, sep)[idx.tag]); if (/^(UK9|XI0)/.test(tg)) tc.cattle++; else if (/^(UK1|XI1|899)/.test(tg)) tc.sheep++; });
      fromTags = tc.cattle > tc.sheep * 4 ? 'cattle' : tc.sheep > tc.cattle * 4 ? 'sheep' : null;
    }
    /* -440 (UX-37): a title above the headings that names the species ("Cattle on Holding", "Flock register") */
    var fromPre = /\b(cattle|bovine|herd)\b/i.test(pre) && !/\b(sheep|flock|goats?)\b/i.test(pre) ? 'cattle' : /\b(sheep|flock)\b/i.test(pre) && !/\b(cattle|bovine)\b/i.test(pre) ? 'sheep' : null;
    var want = opts.species === 'cattle' || opts.species === 'sheep' ? opts.species : null;
    var found = fromCol || fromHdr || fromTags || fromPre;
    if (found === 'goat') { out.refused.push({ line: 0, why: 'a goat register: only cattle and sheep are checked' }); out.species = 'goat'; return out; }
    out.species = found || want; out.speciesFrom = fromCol ? 'column' : fromHdr ? 'columns' : fromTags ? 'tags' : fromPre ? 'title' : want ? 'farmer' : null;
    if (found && want && found !== want) out.clash = want;
    if (!out.species) out.ask = 'species';
    if (idx.tag == null && idx.n == null) { out.refused.push({ line: hi + 1, why: 'no ear tag column' }); return out; }
    if (out.species === 'cattle' && idx.dob == null) { out.refused.push({ line: hi + 1, why: 'no date of birth column: a cattle register always has one' }); return out; }
    /* the rows: only what the check needs is kept (decision 9) */
    /* -440 (R4): the file's date is never a birth date: only a move-on or move-off date can stand for "the latest in the file" */
    var seen = {}, latest = null, see = function (d) { if (d && (!t0 || d <= t0) && (!latest || d > latest)) latest = d; };
    for (var li = 0; li < body.length; li++) {
      var c = splitCsv(body[li], sep), g = function (k) { return idx[k] != null ? (c[idx[k]] == null ? '' : c[idx[k]]) : ''; }, ln = hi + li + 2;
      out.dataRows++;
      if (idx.species != null && out.species) { var sv = String(g('species')).trim(); var other = Object.keys(SPECIES_WORD).filter(function (s) { return s !== out.species && SPECIES_WORD[s].test(sv); })[0];
        if (other) { out.refused.push({ line: ln, why: 'a ' + (other === 'cattle' ? 'cattle' : other) + ' row in a ' + out.species + ' file' }); continue; } }
      var tag = str(g('tag')).replace(/\s+/g, ' ').toUpperCase(), n = idx.n != null ? Math.floor(head(num(g('n')))) : null;
      if (!tag && !(out.species !== 'cattle' && n > 0)) { out.refused.push({ line: ln, why: 'no ear tag' }); continue; }
      if (tag.length > 40) { out.refused.push({ line: ln, why: 'ear tag too long' }); continue; }
      var rawDob = str(g('dob')), dob = rawDob ? parseDate(rawDob) : null;
      if (rawDob && !dob) { out.refused.push({ line: ln, why: 'date of birth missing or not a date' }); continue; }
      if (!dob && out.species === 'cattle') { out.refused.push({ line: ln, why: 'date of birth missing or not a date' }); continue; }
      var rawY = str(g('yob')), yob = null;
      if (rawY) { var ym = /^(\d{4})$/.exec(rawY) || (parseDate(rawY) ? [0, parseDate(rawY).slice(0, 4)] : null); yob = ym && +ym[1] >= 1980 && +ym[1] <= ty ? +ym[1] : null;
        if (!yob) { out.refused.push({ line: ln, why: 'year of birth not a year' }); continue; } }
      if (t0 && dob && dob > t0) { out.refused.push({ line: ln, why: 'born after today' }); continue; }
      var rawOn = str(g('on')), rawOff = str(g('off')), on = rawOn ? parseDate(rawOn) : null, off = rawOff ? parseDate(rawOff) : null;
      if ((rawOn && !on) || (rawOff && !off)) { out.refused.push({ line: ln, why: 'a move date that is not a date' }); continue; }
      if (off && off < (on || dob || '0000')) { out.refused.push({ line: ln, why: 'leaves before it arrives' }); continue; }
      if (tag) { var key = tagKey(tag); if (seen[key]) { out.refused.push({ line: ln, why: 'same ear tag twice' }); continue; } seen[key] = 1; }
      var sx = str(g('sex')).toUpperCase().charAt(0), dam = str(g('dam'), 40).replace(/\s+/g, ' ').toUpperCase();
      var row = { tag: tag || null, sex: sx === 'F' || sx === 'M' ? sx : null, breed: str(g('breed'), 60) || null, dob: dob, yob: yob || (dob ? +dob.slice(0, 4) : null), dam: dam || null, on: on, off: off };
      if (!tag) row.n = n;
      out.rows.push(row); see(on); see(off);
    }
    /* the file's date: one in the lines above the headings, else the latest move date in it (the farmer can change it) */
    var pd = null, re2 = /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2} [A-Za-z]{3,5} \d{4})\b/g, m2;
    var fut = null;   /* -440 (UX-08): a report date after today is said, not silently swapped for a birth date */
    while ((m2 = re2.exec(pre))) { var dd = parseDate(m2[1]); if (dd && t0 && dd > t0) { if (!fut || dd > fut) fut = dd; continue; } if (dd && (!pd || dd > pd)) pd = dd; }
    out.asOfFuture = !pd && fut ? fut : null;
    /* a whole-herd snapshot's latest date is only a birth date, not the day it was downloaded: today then, for the farmer to change */
    /* -440 (R4): no date in the file's own heading = today, which the farmer can change (the latest move date is only a hint) */
    out.latestMove = latest;
    out.asOf = pd || t0; out.asOfFrom = pd ? 'heading' : 'today';
    var bad = out.refused.filter(function (r) { return r.line > 0; }).length;
    out.refusedShare = out.dataRows ? r2(bad / out.dataRows) : 0; out.rightFileAsk = out.dataRows > 0 && bad / out.dataRows > 0.1;
    return out;
  }

  /* ── registerCompare: the register file against Livestock on the file's date (option C, signed off 15 Nov 2026) ──
     The register never feeds the figures; this only says where the two differ. Classes from sex and age, the farm words:
     cattle calves under 6 months, followers 6 to 24 months, females over 2 years, males over 2 years; sheep: ewes and rams
     as one total (lambs are not compared, decision 8). Livestock on the date = today's counts rolled back by the moves since.
     Normal gaps are left out with a count (decision 4): calves younger than the birth registration window, deaths and moves
     still inside their reporting windows (law table, register.*), stock away on another holding (Stock away spans).
     inp: { nation, today, species, asOf, rows, kind, herds:[{id,type,qty,classes,name}], animals:[{id,herd,tag,sex,cls,dob,status}],
            moves:[{id,herd,reason,qty,cls,toCls,date,leaving,corr (a register correction)}], spans, sales:[{ref,herd,date,amt,desc}] (mart payments with no animals out),
            count:{ ewes, rams, counted_on } (sheep: the 1 December count), legal:{ manure (yearManure input), inflow, store, base } }
     out: { status:'match'|'differs'|'setup'|'empty'|'refused', classes, diffs, tags, gaps, away, awayHint, legal, setup, old, ageDays, totals, windows } */
  var RC_LABEL = { calves: 'calves under 6 months', followers: 'followers 6 to 24 months', cows: 'cows and heifers over 2 years', bulls: 'males over 2 years', adults: 'ewes and rams', lambs: 'lambs' };
  var RC_WORD = { calves: ['calf', 'calves'], followers: ['follower', 'followers'], cows: ['cow', 'cows'], bulls: ['bull', 'bulls'], adults: ['ewe or ram', 'ewes and rams'] };
  var CLS_SEX = { cows: 'F', heifers: 'F', ewes: 'F', steers: 'M', bulls: 'M', rams: 'M', wethers: 'M' };
  var RC_LEAVE = { sold: 1, died: 1, dead: 1, slaughter: 1, moved_out: 1, stolen: 1, missing: 1, culled: 1, out: 1 };
  var RC_ARRIVE = { born: 1, bought: 1, moved_in: 1, purchased: 1, 'in': 1 };
  function rcCattle(age, sex) { return age < 6 ? 'calves' : age < 24 ? 'followers' : sex === 'M' ? 'bulls' : 'cows'; }
  function rcOfClass(kind, k) {               /* a Livestock class count -> the register class (typical age), and whether it can sit either side of 2 years */
    var sp = KIND_SPECIES[kind], r = classRole(kind, k) || classRole(kind, null); if (!r) return null;
    if (sp === 'sheep') return { k: r[0] === 'lamb' ? 'lambs' : 'adults', flex: null };
    return { k: rcCattle(r[1], CLS_SEX[k] || null), flex: (k === 'heifers' || k === 'steers') ? (CLS_SEX[k] === 'F' ? 'cows' : 'bulls') : null };
  }
  function rcOfAnimal(sp, a, day) {
    var sex = String(a.sex || CLS_SEX[a.cls] || '').toUpperCase().charAt(0);
    if (sp === 'sheep') { var d0 = isoOk(a.dob) ? a.dob : (a.yob ? a.yob + '-04-01' : null); return !d0 || ageAt(d0, day) >= 12 ? 'adults' : 'lambs'; }
    return isoOk(a.dob) ? rcCattle(ageAt(a.dob, day), sex) : null;
  }
  function lsClassFor(age, sex) { return age < 6 ? 'calves' : sex === 'M' ? (age >= 24 ? 'bulls' : 'steers') : (age >= 24 ? 'cows' : 'heifers'); }
  function registerCompare(inp, law, factors) {
    inp = inp || {}; var k = nationKey(inp.nation), sp = inp.species, day = inp.asOf, t = inp.today;
    if (!k || (sp !== 'cattle' && sp !== 'sheep') || !isoOk(day) || !isoOk(t)) return { status: 'refused', refused: 'nation, species, the file date and today needed' };
    var N0 = law ? nat(law, k) : null, RW = (N0 && N0.register) || {};
    var win = { birth: RW.birth_days ? num(RW.birth_days.value) : 27, death: RW.death_days ? num(RW.death_days.value) : 7,
                move: sp === 'cattle' ? (RW.move_days_cattle ? num(RW.move_days_cattle.value) : 3) : (RW.move_days_sheep ? num(RW.move_days_sheep.value) : 3),
                moveToConfirm: !!((sp === 'cattle' ? RW.move_days_cattle : RW.move_days_sheep) || {}).status && ((sp === 'cattle' ? RW.move_days_cattle : RW.move_days_sheep).status !== 'confirmed') };
    /* -439-sus6 (source audit L14): NI cattle moves, a product choice: late after 7 days, a reminder at 3, and why */
    var MC = sp === 'cattle' ? RW.move_days_cattle : null;
    if (MC && MC.status === 'product_choice') { win.remind = num(MC.remind_days); win.moveToConfirm = false; win.moveNote = 'DAERA’s guidance asks for 3 days; the scheme standard allows 7. We flag a move late after 7 days and remind you at 3 (our rule)'; }
    var out = { species: sp, asOf: day, ageDays: daysBetween(day, t), old: daysBetween(day, t) > 30, windows: win, classes: [], diffs: [], gaps: [], away: [], awayHint: null,
                tags: { level: false, regOnly: [], lsOnly: [] }, legal: null, setup: null, totals: { reg: 0, ls: 0 }, lambs: { reg: 0, ls: 0 }, status: 'match', law_set: lawSet(law) };
    var KEYS = sp === 'cattle' ? ['calves', 'followers', 'cows', 'bulls'] : ['adults'];
    var reg = {}, ls = {}, flex = { cows: 0, bulls: 0 }; KEYS.concat(['lambs']).forEach(function (x) { reg[x] = 0; ls[x] = 0; });
    /* the register on the day */
    var regOn = (inp.rows || []).filter(function (r) {
      if (!r) return false; if (inp.kind === 'snapshot') return true;
      var on = isoOk(r.on) ? r.on : (isoOk(r.dob) ? r.dob : null); return (!on || on <= day) && !(isoOk(r.off) && r.off <= day);
    });
    regOn.forEach(function (r) { var c = rcOfAnimal(sp, r, day) || 'cows'; reg[c] = (reg[c] || 0) + (r.tag ? 1 : Math.max(0, Math.floor(head(r.n)))); });
    /* Livestock on the day: each herd's counts now, rolled back by the moves since the file's date */
    var herds = (inp.herds || []).filter(function (h) { return h && !h.removed && !h.planned && KIND_SPECIES[herdKind(h.type)] === sp; });
    var hIds = {}; herds.forEach(function (h) { hIds[String(h.id)] = h; });
    var perHerd = [], lsTags = {}, tagged = 0, alive = function (a) { return !/sold|dead|died|gone|off|left/i.test(String(a.status || '')); };
    herds.forEach(function (h) {
      var kind = herdKind(h.type), cnt = {}, cls = (h.classes && h.classes.length) ? h.classes : [{ k: KIND_PRIMARY[kind], n: h.qty }];
      cls.forEach(function (c) { if (c && c.k) cnt[c.k] = (cnt[c.k] || 0) + Math.floor(head(c.n)); });
      (inp.moves || []).forEach(function (m) {
        if (!m || String(m.herd) !== String(h.id) || !isoOk(m.date) || m.date <= day || m.date > t) return;
        var q = Math.floor(head(m.qty)), why = String(m.reason || '').toLowerCase(); if (!q) return;
        if (why === 'promote' && m.cls && m.toCls) { cnt[m.toCls] = (cnt[m.toCls] || 0) - q; cnt[m.cls] = (cnt[m.cls] || 0) + q; return; }
        var kk = m.cls || (why === 'born' ? KIND_YOUNG[kind] : KIND_PRIMARY[kind]);
        if (RC_ARRIVE[why]) cnt[kk] = (cnt[kk] || 0) - q; else if (RC_LEAVE[why]) cnt[kk] = (cnt[kk] || 0) + q;
      });
      /* -441b (real-DB retest 16 Nov): a herd kept as one head count holds its recent arrivals inside that count. A birth of 3
         calves on a 48-cow herd read as "51 cows" and "3 calves not in Livestock yet", and offered "Update Livestock to 48" (which
         would drop the calves). Arrivals with a class (a birth is the young class) in the 12 months up to the file's date come out
         of the head count into their own class, as stockRecords does. */
      if (!(h.classes && h.classes.length)) {
        var pk0 = KIND_PRIMARY[kind], yr0 = addDays(day, -365);
        (inp.moves || []).forEach(function (m) {
          if (!m || String(m.herd) !== String(h.id) || !isoOk(m.date) || m.date > day || m.date <= yr0) return;
          var why0 = String(m.reason || '').toLowerCase(); if (!RC_ARRIVE[why0]) return;
          var k0 = m.cls || (why0 === 'born' ? KIND_YOUNG[kind] : null); if (!k0 || k0 === pk0) return;
          var q0 = Math.min(Math.floor(head(m.qty)), cnt[pk0] || 0); if (!(q0 > 0)) return;
          cnt[pk0] -= q0; cnt[k0] = (cnt[k0] || 0) + q0;
        });
      }
      Object.keys(cnt).forEach(function (x) { if (!(cnt[x] > 0)) cnt[x] = 0; });
      var raw = JSON.parse(JSON.stringify(cnt));
      (inp.animals || []).forEach(function (a) {
        if (!a || String(a.herd) !== String(h.id) || !alive(a) || (isoOk(a.dob) && a.dob > day)) return;
        if (a.tag) { lsTags[tagKey(a.tag)] = { tag: a.tag, id: a.id, herd: h.id, cls: a.cls || null, dob: a.dob || null, sex: a.sex || null }; tagged++; }
        var c = rcOfAnimal(sp, a, day); if (!c) return;
        /* its own class, else the class of the same sex whose usual age is nearest this animal's (as stockRecords does) */
        var ag = isoOk(a.dob) ? ageAt(a.dob, day) : (a.yob ? ageAt(a.yob + '-04-01', day) : null), near = function (x) { var r = classRole(kind, x); return r && ag !== null ? Math.abs(r[1] - ag) : 999; };
        var take = a.cls && cnt[a.cls] > 0 ? a.cls : Object.keys(cnt).filter(function (x) { return cnt[x] > 0 && (!CLS_SEX[x] || !a.sex || CLS_SEX[x] === String(a.sex).toUpperCase().charAt(0)); }).sort(function (x, y) { return near(x) - near(y) || cnt[y] - cnt[x]; })[0];
        if (!take) return; cnt[take]--; ls[c] += 1;
      });
      Object.keys(cnt).forEach(function (x) { var m = rcOfClass(kind, x); if (!m || !(cnt[x] > 0)) return; ls[m.k] += cnt[x]; if (m.flex) flex[m.flex] += cnt[x]; });
      perHerd.push({ id: h.id, name: h.name || null, kind: kind, cnt: raw });
    });
    KEYS.forEach(function (x) { out.totals.reg += reg[x]; out.totals.ls += ls[x]; }); out.lambs = { reg: reg.lambs, ls: ls.lambs };
    if (!herds.length || !(out.totals.ls + ls.lambs > 0)) {
      if (!regOn.length) { out.status = 'empty'; return out; }
      /* decision 6a: offered only when the species has nothing in Livestock */
      var su = {}; regOn.forEach(function (r) {
        var x = sp === 'sheep' ? (rcOfAnimal(sp, r, day) === 'lambs' ? 'lambs' : (r.sex === 'M' ? 'rams' : 'ewes')) : lsClassFor(ageAt(r.dob, day), r.sex);
        su[x] = (su[x] || 0) + (r.tag ? 1 : Math.max(0, Math.floor(head(r.n)))); });
      out.status = 'setup'; out.setup = { classes: su, tagged: regOn.filter(function (r) { return r.tag; }).length, total: regOn.reduce(function (a, r) { return a + (r.tag ? 1 : Math.max(0, Math.floor(head(r.n)))); }, 0) };
      return out;
    }
    if (!regOn.length) { out.status = 'empty'; return out; }
    /* the normal gaps, from Livestock's own dated records inside the reporting windows */
    var inWin = function (d, days) { return isoOk(d) && d <= day && daysBetween(d, day) < days; };
    var ev = { young: 0, deaths: {}, offs: {}, ons: {} }, clsOfMove = function (m) { var h = hIds[String(m.herd)]; if (!h) return null; var kind = herdKind(h.type); var kk = m.cls || (String(m.reason) === 'born' ? KIND_YOUNG[kind] : KIND_PRIMARY[kind]); var r = rcOfClass(kind, kk); return r ? r.k : null; };
    var youngTagged = 0;
    (inp.moves || []).forEach(function (m) {
      if (!m || !hIds[String(m.herd)] || m.corr) return;   /* a register correction is the farmer's answer to this check, not a recent event */
      var why = String(m.reason || '').toLowerCase(), q = Math.floor(head(m.qty)); if (!q) return; var c = clsOfMove(m); if (!c) return;
      if (why === 'born' && inWin(m.date, win.birth)) ev.young += q;
      else if ((why === 'died' || why === 'dead' || why === 'slaughter') && inWin(m.date, win.death)) ev.deaths[c] = (ev.deaths[c] || 0) + q;
      else if ((why === 'sold' || (why === 'moved_out' && m.leaving)) && inWin(m.date, win.move)) ev.offs[c] = (ev.offs[c] || 0) + q;
      else if ((why === 'bought' || (why === 'moved_in' && m.leaving)) && inWin(m.date, win.move)) ev.ons[c] = (ev.ons[c] || 0) + q;
    });
    Object.keys(lsTags).forEach(function (x) { if (inWin(lsTags[x].dob, win.birth)) youngTagged++; });
    if (sp === 'cattle') ev.young = Math.max(ev.young, youngTagged);
    /* -440 (R2): the same window the other way: a calf the register already has, born inside the registration window (27 days in GB),
       may not be in Livestock yet either. Not a difference; it is listed as a normal gap. */
    var regYoung = sp === 'cattle' ? regOn.filter(function (r) { return r && isoOk(r.dob) && inWin(r.dob, win.birth) && rcOfAnimal(sp, r, day) === 'calves'; }).reduce(function (a, r) { return a + (r.tag ? 1 : Math.max(0, Math.floor(head(r.n)))); }, 0) : 0;
    var d = {}, small = Math.max(out.totals.reg, out.totals.ls) < 10;
    if (small) { KEYS = ['all']; d.all = out.totals.ls - out.totals.reg; reg.all = out.totals.reg; ls.all = out.totals.ls; }
    else KEYS.forEach(function (x) { d[x] = ls[x] - reg[x]; });
    var gap = function (what, n, c, note) { if (n > 0) out.gaps.push({ what: what, n: n, cls: c, note: note }); };
    var sum = function (o) { return Object.keys(o).reduce(function (a, x) { return a + o[x]; }, 0); };
    var pick = function (o, c) { return small ? sum(o) : (o[c] || 0); };
    KEYS.forEach(function (c) {
      if (d[c] > 0 && sp === 'cattle' && (c === 'calves' || c === 'all')) { var y0 = Math.min(d[c], ev.young); d[c] -= y0; gap('young', y0, c); }
      if (d[c] > 0) { var o0 = Math.min(d[c], pick(ev.ons, c)); d[c] -= o0; gap('moved_on', o0, c); }
      if (d[c] < 0 && sp === 'cattle' && (c === 'calves' || c === 'all')) { var y1 = Math.min(-d[c], regYoung); d[c] += y1; gap('young_reg', y1, c); }
      if (d[c] < 0) { var x0 = Math.min(-d[c], pick(ev.deaths, c)); d[c] += x0; gap('death', x0, c); }
      if (d[c] < 0) { var f0 = Math.min(-d[c], pick(ev.offs, c)); d[c] += f0; gap('moved_off', f0, c); }
    });
    /* stock away on another holding (or a temporary CPH) is off the register; on a TLA (occupier us) it stays on */
    (inp.spans || []).forEach(function (s) {
      if (!s || s.kind !== 'away' || s.species !== sp || s.occupier === 'us' || !isoOk(s.from) || s.from > day || (isoOk(s.to) && s.to < day)) return;
      var left = Math.floor(head(s.n)); if (!left) return;
      var want = small ? 'all' : sp === 'sheep' ? (s.role === 'lamb' ? null : 'adults') : ({ suckler: 'cows', dairy: 'cows', bull_breeding: 'bulls', beef: 'followers', dairy_young: 'followers', calf: 'calves' }[s.role] || null);
      var order = want ? [want].concat(KEYS.filter(function (x) { return x !== want; })) : KEYS;
      var took = 0; order.forEach(function (c) { if (left > 0 && d[c] > 0) { var a0 = Math.min(left, d[c]); d[c] -= a0; left -= a0; took += a0; gap('away', a0, c); } });
      if (took) out.away.push({ n: took, from: s.from, to: s.to || null, where: s.where || null, id: s.id || null });
    });
    /* heifers or steers that Livestock keeps as followers but the register has over 2 years old: not a difference */
    if (sp === 'cattle' && !small) [['cows', 'F'], ['bulls', 'M']].forEach(function (p) {
      var a0 = Math.min(Math.max(0, d.followers), Math.max(0, -d[p[0]]), flex[p[0]]); if (a0 > 0) { d.followers -= a0; d[p[0]] += a0; gap(p[1] === 'F' ? 'heifers_over_2' : 'steers_over_2', a0, p[0]); }
    });
    /* a group that left on one day on the register (move file), with nothing in Livestock and no Stock away: away wintering? */
    if (inp.kind !== 'snapshot') {
      var offs = {}; (inp.rows || []).forEach(function (r) { if (r && isoOk(r.off) && r.off <= day && daysBetween(r.off, day) <= 120) offs[r.off] = (offs[r.off] || 0) + 1; });
      var lsLeft = function (dt) { return (inp.moves || []).some(function (m) { return m && hIds[String(m.herd)] && RC_LEAVE[String(m.reason || '').toLowerCase()] && isoOk(m.date) && Math.abs(daysBetween(m.date, dt)) <= 7; }); };
      var spanNear = function (dt) { return (inp.spans || []).some(function (s) { return s && s.kind === 'away' && s.species === sp && isoOk(s.from) && Math.abs(daysBetween(s.from, dt)) <= 7; }); };
      var big = Object.keys(offs).filter(function (dt) { return offs[dt] >= (sp === 'cattle' ? 5 : 10) && !lsLeft(dt) && !spanNear(dt); }).sort(function (a, b) { return offs[b] - offs[a]; })[0];
      if (big && KEYS.some(function (c) { return d[c] > 0; })) out.awayHint = { n: offs[big], date: big };
    }
    /* the classes and the differences left */
    out.classes = KEYS.map(function (c) { return { k: c, label: c === 'all' ? (sp === 'cattle' ? 'cattle' : 'sheep') : RC_LABEL[c], reg: reg[c], ls: ls[c], left: (ls[c] - reg[c]) - d[c], diff: d[c] }; });
    out.diffs = out.classes.filter(function (x) { return x.diff !== 0; }).map(function (x) {
      var w = x.k === 'all' ? (sp === 'cattle' ? ['animal', 'cattle'] : ['sheep', 'sheep']) : RC_WORD[x.k], n = Math.abs(x.diff);
      var cand = []; perHerd.forEach(function (h) { Object.keys(h.cnt).forEach(function (lk) { var m = rcOfClass(h.kind, lk); if (m && (x.k === 'all' || m.k === x.k || (m.flex === x.k && x.diff < 0))) cand.push({ herd: h.id, name: h.name, cls: lk, n: h.cnt[lk] }); }); });
      if (x.diff > 0) cand = cand.filter(function (c) { return c.n > 0; });
      if (!cand.length && x.diff < 0 && perHerd.length) { var big0 = perHerd.slice().sort(function (a, b) { return sum(b.cnt) - sum(a.cnt); })[0]; cand.push({ herd: big0.id, name: big0.name, cls: sp === 'sheep' ? 'ewes' : ({ calves: 'calves', followers: 'heifers', cows: 'cows', bulls: 'bulls' }[x.k] || 'cows'), n: 0 }); }
      return { k: x.k, label: x.label, reg: x.reg, ls: x.ls, n: x.diff, dir: x.diff > 0 ? 'fewer' : 'more', words: N0w(n) + ' ' + (n === 1 ? w[0] : w[1]),
               title: 'Your ' + sp + ' register shows ' + N0w(n) + ' ' + (x.diff > 0 ? 'fewer ' : 'more ') + (n === 1 ? w[0] : w[1]), sig: sp + ':' + x.k + ':' + x.diff, herds: cand };
    });
    /* mart payments with no animals taken out: the same animals, so the same card (U2) */
    var sl = (inp.sales || []).filter(function (s) { return s && hIds[String(s.herd)] && isoOk(s.date) && s.date <= addDays(day, win.move) && daysBetween(s.date, day) <= 90; });
    if (sl.length) out.diffs.forEach(function (x) { if (x.n > 0) x.sales = sl; });
    /* ear tags, where Livestock keeps them for nearly every animal (decision 3; cattle only, decision 8) */
    if (sp === 'cattle' && !small && out.totals.ls > 0 && tagged >= 0.9 * (out.totals.ls + ls.lambs)) {
      out.tags.level = true;
      var regKeys = {}; regOn.forEach(function (r) { if (r.tag) regKeys[tagKey(r.tag)] = r; });
      Object.keys(regKeys).forEach(function (x) { if (lsTags[x]) return; var r = regKeys[x], age = ageAt(r.dob, day), c = rcOfAnimal(sp, r, day), lk = lsClassFor(age, r.sex);
        var hh = perHerd.filter(function (h) { return h.cnt[lk] != null; })[0] || perHerd.slice().sort(function (a, b) { return sum(b.cnt) - sum(a.cnt); })[0];
        out.tags.regOnly.push({ tag: r.tag, sex: r.sex, breed: r.breed, dob: r.dob, on: r.on || null, dam: r.dam || null, cls: c, lsCls: lk, herd: hh ? hh.id : null, sig: 'tag:' + x + ':reg' }); });
      Object.keys(lsTags).forEach(function (x) { if (regKeys[x]) return; var a = lsTags[x]; if (inWin(a.dob, win.birth)) return;
        out.tags.lsOnly.push({ tag: a.tag, id: a.id, herd: a.herd, cls: a.cls, dob: a.dob, sig: 'tag:' + x + ':ls' }); });
    }
    /* -440 (R3): for a herd kept as counts (no ear tags in Livestock), the register's own animals of each class are listed, so the pop-out
       can show each one (tag, sex, breed, birth date, date on) and the farmer ticks which to add; the tags go in the note */
    if (!out.tags.level && out.diffs.some(function (x) { return x.n < 0; })) {
      out.regByClass = {}; regOn.forEach(function (r) { if (!r || !r.tag || lsTags[tagKey(r.tag)]) return; var c = small ? 'all' : (rcOfAnimal(sp, r, day) || (sp === 'sheep' ? 'adults' : 'cows'));
        var L1 = out.regByClass[c] = out.regByClass[c] || []; if (L1.length >= 500) return; var ag = isoOk(r.dob) ? ageAt(r.dob, day) : null;
        L1.push({ tag: r.tag, sex: r.sex || null, breed: r.breed || null, dob: r.dob || null, on: r.on || null, cls: c,
                  lsCls: sp === 'cattle' ? (ag === null ? 'cows' : lsClassFor(ag, r.sex)) : (ag !== null && ag < 12 ? 'lambs' : r.sex === 'M' ? 'rams' : 'ewes'), sig: 'tag:' + tagKey(r.tag) + ':reg' }); });
    }
    if (sp === 'sheep' && inp.count && (num(inp.count.ewes) !== null || num(inp.count.rams) !== null)) out.count = { n: head(inp.count.ewes) + head(inp.count.rams), on: inp.count.counted_on || null };
    out.status = out.diffs.length || out.tags.regOnly.length || out.tags.lsOnly.length ? 'differs' : 'match';
    /* decision 2a: the figures stay on Livestock; say when the register's numbers would change a legal answer (U17) */
    var L0 = inp.legal;
    if (L0 && L0.manure && out.diffs.length && law) {
      var mi = JSON.parse(JSON.stringify(L0.manure)), hs2 = mi.herds || [];
      out.diffs.forEach(function (x) { var c = x.herds[0]; if (!c) return; var h = hs2.filter(function (q) { return String(q.id) === String(c.herd); })[0]; if (!h) return;
        h.classes = (h.classes && h.classes.length) ? h.classes : [{ k: KIND_PRIMARY[herdKind(h.type)], n: h.qty }];
        var cc = h.classes.filter(function (q) { return q.k === c.cls; })[0]; if (!cc) { cc = { k: c.cls, n: 0 }; h.classes.push(cc); }
        cc.n = Math.max(0, head(cc.n) - x.n); h.qty = h.classes.reduce(function (a, q) { return a + head(q.n); }, 0); });
      var m2 = yearManure(mi, law, factors), base = L0.base || {};
      out.legal = { manure: { perHa: m2.perHa, over: !!m2.over, status: m2.status }, store: null, changes: [], lines: [] };
      var shown = function (v) { return v == null ? null : Math.round(v); };
      if (m2.perHa !== null && base.perHa != null && shown(m2.perHa) !== shown(base.perHa) && (!!m2.over !== !!base.over)) {
        out.legal.changes.push('manure');
        out.legal.lines.push('With the register’s numbers, manure would be ' + shown(m2.perHa) + ' kg N per ha, ' + (m2.over ? 'over' : 'within') + ' the limit.');
      }
      if (L0.inflow && L0.store) {
        var fl = slurryInflow(Object.assign({}, L0.inflow, { monthly: m2.monthly }), law, factors || {});
        var sp2 = storePlan(Object.assign({}, L0.store, { inflowPerDay: fl.perDay || [] }), law);
        out.legal.store = { status: sp2.status, fullBy: sp2.fullBy || null };
        if (base.storeStatus && sp2.status && sp2.status !== base.storeStatus && (sp2.status === 'short' || base.storeStatus === 'short')) {
          out.legal.changes.push('store');
          out.legal.lines.push('With the register’s numbers, the slurry store would be ' + (sp2.status === 'short' ? 'short of the storage rule.' : 'within the storage rule.'));
        }
      }
    }
    return out;
  }
  /* which differences are still open after the farmer's answers for this file (answers: { sig: { a:'right'|'updated'|'added'|
     'later', by, at, until } }). A re-import copies the answers whose difference is unchanged (decision 7a: answered stays
     answered if it is the same; a new one raises the card again). 'later' hides it until `until` (Not now). */
  function registerOpen(cmp, answers, today) {
    var A = answers || {}, items = [];
    ((cmp && cmp.diffs) || []).forEach(function (x) { items.push({ sig: x.sig, kind: 'class', k: x.k, n: x.n }); });
    ((cmp && cmp.tags && cmp.tags.regOnly) || []).forEach(function (x) { items.push({ sig: x.sig, kind: 'tag', side: 'reg', tag: x.tag }); });
    ((cmp && cmp.tags && cmp.tags.lsOnly) || []).forEach(function (x) { items.push({ sig: x.sig, kind: 'tag', side: 'ls', tag: x.tag }); });
    var open = [], done = [], later = [];
    items.forEach(function (it) { var a = A[it.sig];
      if (!a || !a.a) open.push(it); else if (a.a === 'later') { if (isoOk(a.until) && isoOk(today) && a.until > today) later.push(it); else open.push(it); } else done.push(Object.assign({ a: a.a, by: a.by || null, at: a.at || null }, it)); });
    return { open: open, done: done, later: later, any: items.length, status: !items.length ? 'match' : open.length ? 'open' : later.length ? 'later' : 'answered' };
  }
  function carryAnswers(prev, cmp) {        /* the answers from the previous file that still match a difference in the new one */
    var keep = {}, P = prev || {}; registerOpen(cmp, {}, null).open.forEach(function (it) { if (P[it.sig] && P[it.sig].a && P[it.sig].a !== 'later') keep[it.sig] = P[it.sig]; }); return keep;
  }
  function N0w(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ── legal and setup jobs (the subset Phase 1 owns). Feeds sus_tasks and the one attention list. ──
     inp: { nation, today, year, manure (yearManure result), nvz (nvzStatus), store (storePlan), sheep (sheepReturnPrefill or null when no sheep),
            setup:{ rented:'yes'|'no'|'unsure'|null, sizes:{ suckler, ewe, dairy } (true = needed and missing), housing:bool missing, away:'unsure'|null },
            asks:[...], exceptions:[...], states:{ local_id:{ status, until } },
            register:[{ species, title, why, legal }] (registerCompare cards still unanswered: one job per species, and the
            "doesn't add up" job for the same species folds into it, never two) }
     Each job: { local_id, rule_id, kind:'law'|'setup', area, title, why, due, dueIn, status, open, cta } */
  /* -440 (UX-04, fixed as a class): a job the app WORKS OUT (a store short of the rule, manure over 170, a crop over its N max, an
     unanswered setup question) is true while its numbers say so. "Done" can't clear it: the farmer gets "Later" (hidden 14 days) or
     "I've dealt with it" (checked again at once; it stays while the numbers still say so, and goes by itself when they change).
     Only a job the farmer does OUTSIDE the app (filing the sheep or goat return) is closed by Done/Filed. A 'done' saved on a worked-out
     job by an earlier build is read as a re-check, so the job comes back if it is still true. */
  var JOB_ACTS = { 'sheep-return': 1, 'goat-return': 1 };
  function jobState(j, s, t) {
    s = s || {}; var st = s.status || 'open';
    if ((st === 'done' && !JOB_ACTS[j.rule_id]) || st === 'recheck') { j.rechecked = s.status ? true : false; st = 'open'; }
    if (st === 'notforus' && (j.rule_id === 'nvz-answer' || j.rule_id === 'scot-zone')) st = 'open';   /* UX-09: the NVZ answer decides the law; "Not sure" is the answer, never "not for us" */
    j.status = st; j.computed = !JOB_ACTS[j.rule_id]; if (st === 'later' && isoOk(s.until)) j.until = s.until;   /* -441 (UX-04): "Due later" says until when */
    j.open = st === 'open' || (st === 'later' && (!isoOk(s.until) || s.until <= t)); j.dueIn = isoOk(j.due) ? daysBetween(t, j.due) : null;
    return j;
  }
  function legalJobs(inp, law) {
    inp = inp || {}; var t = inp.today, k = nationKey(inp.nation), y = num(inp.year), out = [];
    var D = typeof inp.fmt === 'function' ? inp.fmt : function (x) { return x; };
    if (!isoOk(t) || !k || !law) return out;
    var add = function (j) { jobState(j, (inp.states || {})[j.local_id], t); out.push(j); };
    var M = inp.manure, nv = inp.nvz || {};
    if ((nv.inNvz === null || nv.assumed) && (k === 'E' || k === 'S')) add({ local_id: 'nvz-answer', rule_id: 'nvz-answer', kind: 'setup', area: 'land', title: 'Is the farm in an NVZ?', why: 'The manure limit, the storage rule and the closed periods depend on it. The government map is a suggestion; you confirm it.' + (nv.assumed ? ' Until you know, we use the NVZ rules (the safer ones).' : ''), due: null, cta: 'setup' });
    /* -445 (decision 3): Scotland's zone, asked until answered; "Not sure" uses the north dates (the safe side) and keeps asking */
    var SZ = inp.scotZone; if (k === 'S' && SZ && SZ.ask && nv.inNvz !== false) add({ local_id: 'scot-zone', rule_id: 'scot-zone', kind: 'setup', area: 'land', title: 'Is your farm in the Moray, Aberdeenshire, Banff and Buchan nitrate vulnerable zone?', why: 'It sets when bagged nitrogen can go on again.' + (SZ.how === 'unsure' ? ' Until you know, we use the north dates: the longer closed period, so the safe side.' : ''), due: null, cta: 'setup' });
    if (M && M.perHa !== null && M.over && nv.inNvz === true) add({ local_id: 'manure-over:' + y, rule_id: 'manure-over', kind: 'law', area: 'livestock', title: 'Manure nitrogen is over the 170 kg limit',
      why: Math.round(M.perHa) + ' kg N per ha over the holding this year. Export manure, take on more land, or change stock numbers before 31 December.', due: y + '-12-31', cta: 'livestock' });
    if (M && M.holdingHa === null && (M.rows || []).length) add({ local_id: 'holding-area', rule_id: 'holding-area', kind: 'setup', area: 'land', title: 'How many hectares does the farm have?', why: 'The manure limit is worked out over the farm plus any land you rent.', due: null, cta: 'setup' });
    var S = inp.store;
    if (S && S.ask === 'build' && k === 'E' && nv.inNvz === false) add({ local_id: 'store-built', rule_id: 'store-built', kind: 'setup', area: 'livestock', title: 'When was the slurry store built?', why: 'Outside an NVZ the 4-month rule applies only to stores built or changed since 1 March 1991.', due: null, cta: 'stores' });
    if (S && S.status === 'short') add({ local_id: 'store-short:' + S.ruleFrom.slice(0, 4), rule_id: 'store-short', kind: 'law', area: 'livestock', title: 'Slurry store is short of the storage rule',
      why: 'About ' + N0w(Math.round(S.needM3)) + ' m³ needed for ' + S.rule.days + ' days against ' + N0w(Math.round(S.capacityM3)) + ' m³ of store' + (S.fullBy ? ', full around ' + D(S.fullBy) : '') + '. Check the size and the stock housed, or plan more storage.', due: null, fullBy: S.fullBy || null, cta: 'stores' });
    else if (S && S.status === 'tight' && S.fullBy) add({ local_id: 'store-tight:' + S.fullBy.slice(0, 7), rule_id: 'store-tight', kind: 'law', area: 'livestock', fullBy: S.fullBy, title: 'Slurry store is tight: full around ' + D(S.fullBy),
      why: (S.spreadFrom ? 'You can’t spread slurry until ' + D(S.spreadFrom) + '. ' : '') + 'Tell us how full it is today and the forecast corrects itself.', due: S.fullBy, cta: 'stores' });
    var sh = inp.sheep;
    if (sh && !sh.filed && sh.dates && sh.dates.daysToCount <= 45) {
      add({ local_id: 'sheep-return:' + sh.dates.year, rule_id: 'sheep-return', kind: 'law', area: 'livestock', title: k === 'N' ? 'Sheep inventory' : 'Sheep and goat inventory',
        why: 'Count ' + (sh.dates.countFrom === sh.dates.countTo ? 'on ' + D(sh.dates.countFrom) : 'between ' + D(sh.dates.countFrom) + ' and ' + D(sh.dates.countTo)) + ', return by ' + D(sh.dates.dueBy) + ' through ' + sh.dates.route + '. We don’t send it for you.',
        due: sh.dates.state === 'upcoming' || sh.dates.state === 'count' ? sh.dates.countFrom : sh.dates.dueBy, cta: 'return', shared: 'attn-inventory', state: sh.dates.state });
    }
    /* -439-sus6: NI goats have their own inventory, due 5 January (DAERA goat quick guide, May 2026) */
    var gt = inp.goats;
    if (gt && !gt.filed && gt.dates && gt.dates.daysToCount <= 45) add({ local_id: 'goat-return:' + gt.dates.year, rule_id: 'goat-return', kind: 'law', area: 'livestock', title: 'Goat inventory',
      why: 'Count between ' + D(gt.dates.countFrom) + ' and ' + D(gt.dates.countTo) + ', return to DAERA by ' + D(gt.dates.dueBy) + ' (a separate goat return). We don’t send it for you.',
      due: gt.dates.state === 'upcoming' || gt.dates.state === 'count' ? gt.dates.countFrom : gt.dates.dueBy, cta: 'return', state: gt.dates.state });
    if (S && S.capacityM3 && (S.asks || []).indexOf('fill') >= 0) add({ local_id: 'store-fill', rule_id: 'store-fill', kind: 'setup', area: 'livestock', title: 'How full is the slurry store today?',
      why: 'Until you say, the store shows "Unknown" and no full-by date. Or tick "Assume emptied by 1 October" for a labelled forecast.', due: null, cta: 'stores' });
    if (S && S.capacityM3 && (S.asks || []).indexOf('area') >= 0) add({ local_id: 'store-area', rule_id: 'store-area', kind: 'setup', area: 'livestock', title: 'How big is the open surface of the store?',
      why: 'Length × width (or the diameter of a round tank). Until then the rain falling on it is not counted.', due: null, cta: 'stores' });
    /* -446 (web test P0-2) */
    if (S && S.capacityM3 && (S.asks || []).indexOf('washings') >= 0) add({ local_id: 'store-washings', rule_id: 'store-washings', kind: 'setup', area: 'livestock', title: 'Does anything else drain into the slurry store?',
      why: 'Parlour or dairy washings, or rain off a dirty yard. The storage rule counts them (SI 2015/668 reg 25(3)); until you answer, the store need is the stock and the rain on the store only.', due: null, cta: 'stores' });
    var st = inp.setup || {};
    if (st.rented === 'unsure' || st.rented == null) add({ local_id: 'setup-rented', rule_id: 'setup-rented', kind: 'setup', area: 'land', title: 'Do you rent any extra land?', why: 'Land you rent and have at your disposal counts as part of your farm for the manure limit.', due: null, cta: 'setup2' });
    if (st.sizes && st.sizes.suckler) add({ local_id: 'setup-size-suckler', rule_id: 'setup-size', kind: 'setup', area: 'livestock', title: 'How big are your suckler cows?', why: 'Under or over 500 kg changes the legal manure figure. Until you answer we use the higher one.', due: null, cta: 'sizes' });
    if (st.sizes && st.sizes.ewe) add({ local_id: 'setup-size-ewe', rule_id: 'setup-size', kind: 'setup', area: 'livestock', title: 'How big are your ewes?', why: 'Under or over 60 kg changes the legal manure figure. Until you answer we use the higher one.', due: null, cta: 'sizes' });
    if (st.sizes && st.sizes.dairy) add({ local_id: 'setup-size-dairy', rule_id: 'setup-size', kind: 'setup', area: 'livestock', title: 'What do your dairy cows give a year?', why: 'The milk yield band changes the legal manure figure. Until you answer we use the higher one.', due: null, cta: 'sizes' });
    if (st.housing) add({ local_id: 'setup-housing', rule_id: 'setup-housing', kind: 'setup', area: 'livestock', title: 'When are your cattle housed?', why: 'Until you answer we use an estimate from the UK inventory and survey data for your nation, centred on 15 January (tagged Estimate).', due: null, cta: 'housing' });
    if (st.lambing) add({ local_id: 'setup-lambing', rule_id: 'setup-lambing', kind: 'setup', area: 'livestock', title: 'When does lambing usually start?', why: 'Ewes are housed about 42 days before lambing (UK inventory), and lambs are dated from it. Until you answer there is no ewe housing estimate and lambs count from 1 April.', due: null, cta: 'housing' });
    if (st.system) add({ local_id: 'setup-system', rule_id: 'setup-system', kind: 'setup', area: 'livestock', title: 'How is the housed cattle manure kept?', why: 'Slurry gives about ten times the methane of a dung heap. Until you answer we count it as farmyard manure in a heap and say so.', due: null, cta: 'housing' });
    if (st.beefKind) add({ local_id: 'setup-beefkind', rule_id: 'setup-beefkind', kind: 'setup', area: 'livestock', title: 'Suckler cows or finishing cattle?', why: (st.beefKind.join(', ')) + ': suckler cows and finishing cattle have different legal figures. Until you say, we count suckler cows (the higher figure).', due: null, cta: 'setup2' });
    /* -441 (UX-17): in an NVZ (or anywhere in Wales and Northern Ireland) keeping slurry with no store is a matter of the storage
       rule itself, so the job is a legal one with the law table's citation; outside an NVZ, or while the NVZ answer is "not sure",
       it stays a setup job */
    if (st.store) { var stLaw = nv.inNvz === true && !nv.assumed, stR = stLaw ? storageRule({ nation: k, nvz: true, kind: st.store === 'pig' ? 'pig' : 'cattle', winterFrom: y }, law) : null;
      if (stR && !stR.applies) stLaw = false;
      add({ local_id: 'setup-store', rule_id: 'setup-store', kind: stLaw ? 'law' : 'setup', area: 'livestock', title: 'Add your slurry store', why: 'You keep slurry, and ' + (k === 'W' || k === 'N' ? 'the storage rule applies to every farm in ' + (k === 'W' ? 'Wales' : 'Northern Ireland') : nv.inNvz === true ? 'in an NVZ the law sets how much storage you need' : 'if the farm is in an NVZ the law sets how much storage you need') + '. Add the store’s size and whether it is covered, in Livestock, Manure, and we check it against the rule.' + (stLaw && stR && stR.cite && stR.cite.source ? ' The rule: ' + (stR.label ? stR.label + ', ' : '') + stR.cite.source + '.' : ''), due: null, cite: stLaw && stR ? stR.cite : null, cta: 'stores' }); }
    if (st.away === 'add') add({ local_id: 'setup-away-add', rule_id: 'setup-away', kind: 'setup', area: 'livestock', title: 'Add the stock away, or other people’s stock on your land', why: 'You said there is some. Add each group once (how many, from when, and who has the land), and the manure limit counts it on the right holding.', due: null, cta: 'away' });
    if (st.away === 'unsure') add({ local_id: 'setup-away', rule_id: 'setup-away', kind: 'setup', area: 'livestock', title: 'Any stock away, or other people’s stock on your land?', why: 'Away-wintering, common grazing, tack sheep or grazing licences change which holding counts them.', due: null, cta: 'away' });
    (inp.asks || []).forEach(function (a) { if (a.what === 'areaCheck') add({ local_id: 'area-check', rule_id: 'area-check', kind: 'setup', area: 'livestock', title: 'Your fields add up to more than the farm',
      why: 'The fields in Crops and Livestock come to ' + a.fieldsHa + ' ha; the farm the limits are worked over is ' + a.holdingHa + ' ha (Settings, plus rented land). Correct whichever is wrong: the manure limit uses the farm size.', due: null, cta: 'setup' }); });   /* -447 (P1-6) */
    (inp.asks || []).forEach(function (a) { if (a.what === 'rentedIn') add({ local_id: 'rented-in', rule_id: 'rented-in', kind: 'setup', area: 'livestock', title: 'Is the rented land inside your farm size?',
      why: 'Settings asks for the whole farm, rented land included. If the rented land is on top of it, say so: until then the limits use the smaller area (the cautious side).', due: null, cta: 'setup2' }); });   /* -447 (P1-5) */
    (inp.asks || []).forEach(function (a) { if (a.what === 'lambsPerEwe') add({ local_id: 'lambs-per-ewe', rule_id: 'lambs-per-ewe', kind: 'setup', area: 'livestock', title: 'How many lambs do you rear per ewe?',
      why: 'Lambs at foot are counted on their own in the carbon footprint' + (k === 'N' ? ' and in the Northern Ireland manure figure' : '') + '. Until you say, they are not counted.', due: null, cta: 'housing' }); });   /* -447 */
    (inp.asks || []).forEach(function (a, i) { if (a.what === 'occupier') add({ local_id: 'occupier:' + (a.batch || a.span || i), rule_id: 'occupier', kind: 'setup', area: 'livestock', title: 'Who occupies the land the stock are on?', why: 'Stock count on the holding of whoever has the land at their disposal. Until you answer they count on this farm (our cautious rule).', due: null, cta: 'batches' }); });
    var regSp = {};
    (inp.register || []).forEach(function (r) { if (!r || !r.species) return; regSp[r.species] = 1;
      add({ local_id: 'register:' + r.species, rule_id: 'register-diff', kind: 'check', area: 'livestock', title: r.title, why: r.why, due: null, cta: 'register', legal: !!r.legal }); });
    (inp.exceptions || []).filter(function (x) { return !(x && x.species && regSp[x.species]); }).slice(0, 1).forEach(function (x) { add({ local_id: 'exception:' + (x.herd || '') + ':' + (x.cls || ''), rule_id: 'exception', kind: 'setup', area: 'livestock', title: 'One thing doesn’t add up', why: x.why || ('Your records show ' + x.n + ' more ' + (x.cls || 'animals') + ' arriving than are in the count.'), due: null, cta: 'livestock' }); });
    return out.sort(function (a, b) { return (a.kind === 'law' ? 0 : 1) - (b.kind === 'law' ? 0 : 1) || ((a.dueIn == null ? 9999 : a.dueIn) - (b.dueIn == null ? 9999 : b.dueIn)); });
  }

  /* inputs hash: a stable FNV-1a of the inputs, so a result is persisted only when what it was worked out from changed */
  function inputsHash(o) {
    var s; try { s = JSON.stringify(o, function (k, v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce(function (a, x) { a[x] = v[x]; return a; }, {}) : v; }); } catch (e) { s = String(o); }
    var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }


  /* ══ Phase 2: nitrogen and soil (PREBUILD-CHECK-V53 §9 row 2; R9, R10, R11, R13, R16) ═════════════════════════════
     The Crops module owns the records (crop_inputs, crop_lands, soil_tests, the fertiliser store); these functions only
     work out. Legal values from `law` (nmax, closed, soil, limits.field_organic_n, limits.urea_rt); RB209, the product
     grades and the crop-available shares from `factors`. The engine never reads the free-text rate. */

  /* production crop names (ST_CROP.cropTypes, or typed) -> the law table's crop key. planted (ISO) splits a bare "wheat". */
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function mdWords(md) { var m = /^(\d{2})-(\d{2})$/.exec(String(md || '').slice(-5)); return m ? (+m[2]) + ' ' + MON3[+m[1] - 1] : String(md || ''); }
  function cropKey(name, planted) {
    var s = String(name || '').toLowerCase(), m = isoOk(planted) ? +planted.slice(5, 7) : null;
    if (!s) return null;
    var autumn = /winter|autumn/.test(s) ? true : /spring/.test(s) ? false : (m !== null ? (m >= 8 || m <= 1) : null);
    if (/wheat/.test(s)) return autumn === false ? 'spring_wheat' : 'winter_wheat';
    if (/barley/.test(s)) return autumn === false ? 'spring_barley' : 'winter_barley';
    if (/oat/.test(s)) return autumn === false ? 'spring_oats' : 'winter_oats';
    if (/rape|osr|canola/.test(s)) return 'winter_osr';
    if (/sugar ?beet/.test(s)) return 'sugar_beet';
    if (/potato/.test(s)) return 'potatoes';
    if (/maize/.test(s)) return 'forage_maize';
    if (/field bean|beans? \(field\)|^beans?$/.test(s)) return 'field_beans';
    if (/pea/.test(s)) return 'peas';
    if (/grass|silage|\bley|pasture|\bhay/.test(s)) return 'grass';   /* -441c: \bley - "parsley" was read as grass */
    if (/asparagus|carrot|radish|swede/.test(s)) return 'veg_low';
    if (/celery|courgette|dwarf bean|lettuce|onion|parsnip|runner bean|sweetcorn|turnip/.test(s)) return 'veg_mid';
    if (/beetroot|sprout|cabbage|calabrese|cauliflower|leek/.test(s)) return 'veg_high';
    return 'other';
  }

  /* R9: the crop N max. opts: { expectedYield (t/ha), milling, shallow, cuts3, straw, yieldEvidence (NI), planN (Scotland), nvz }
     out: { rule:'table'|'plan'|'none'|'not-nvz', crop, label, base, limit, std, adds:[{why,kg}], tags:[], status, cite, law_set } */
  function nmax(nation, crop, opts, law) {
    opts = opts || {}; var k = nationKey(nation), N = nat(law, k);
    if (!N || !N.nmax) return { rule: 'none', refused: 'nation and law needed' };
    var R = N.nmax, V = R.value, key = crop && V.crops && V.crops[crop] ? crop : null, out = { crop: crop || null, tags: [], adds: [], status: R.status, cite: cite(R), law_set: lawSet(law) };
    if (V.scope === 'nvz' && opts.nvz !== true) { out.rule = 'not-nvz'; out.limit = null; out.why = opts.nvz === false ? 'not in an NVZ: no crop N max' : 'NVZ not answered yet'; return out; }
    if (V.rule === 'plan') { var p = num(opts.planN); out.rule = 'plan'; out.limit = p !== null && p >= 0 ? p : null; out.base = out.limit; out.why = out.limit === null ? 'type the planned N for this field (the gov.scot Nmax calculator or your adviser)' : 'your plan'; return out; }
    if (!key) { out.rule = 'none'; out.limit = null; out.why = crop === 'other' || !crop ? 'no crop N max in the law for this crop' : 'no crop N max in the law for this crop'; return out; }
    var c = V.crops[key], A = V.adj || {}, lim = c.n, y = num(opts.expectedYield);
    out.rule = 'table'; out.label = c.label; out.base = c.n; out.std = c.std;
    if (c.status === 'pending') out.tags.push(c.note || 'to confirm');
    var adj = c.adj || [];
    if (c.std && y !== null && y > c.std && (adj.indexOf('yield') >= 0 || adj.indexOf('yield_evidence') >= 0)) {
      var over = y - c.std, full = Math.floor(over + 1e-9);
      if (adj.indexOf('yield_evidence') >= 0 && opts.yieldEvidence !== true) out.tags.push('the yield rise needs farm yields above ' + c.std + ' t/ha in one of the last three years: answer it to add it');
      else {
        if (full > 0) { out.adds.push({ why: full + ' t above the standard ' + c.std + ' t/ha', kg: full * A.per_tonne }); lim += full * A.per_tonne; }
        if (over - full > 1e-9) out.tags.push('our rule: whole tonnes only, as the law says “for every tonne” (' + r2(over - full) + ' t not counted)');   /* product choice, law row product_choices.nmax_whole_tonnes */
      }
    }
    if (adj.indexOf('milling') >= 0 && opts.milling === true) { out.adds.push({ why: 'milling wheat', kg: A.milling }); lim += A.milling; }
    if (adj.indexOf('shallow') >= 0 && opts.shallow === true) { out.adds.push({ why: 'shallow soil (not over sandstone)', kg: A.shallow }); lim += A.shallow; }
    if (adj.indexOf('cuts3') >= 0 && opts.cuts3 === true) { out.adds.push({ why: 'grass cut three times or more', kg: A.cuts3 }); lim += A.cuts3; }
    if (A.straw && opts.straw === true) { out.adds.push({ why: 'straw or paper sludge on this or the last crop', kg: A.straw }); lim += A.straw; }
    if (adj.indexOf('osr') >= 0) out.tags.push('no more than 30 kg N/ha of manufactured N in the autumn');
    out.limit = lim;
    return out;
  }

  /* -441c: the crop as the closed-period exceptions name it - the SI 2015/668 reg 22(5) table (also reg 21(1)), WSI 2021/77 Schedule 4
     (also reg 20), SSI 2008/298 reg 19(4) and reg 20(2). Reads the field's crop name (cropKey folds brassicas into veg_* and asparagus
     into veg_low, which these lists do not). null = no crop known: nothing is ruled out on crop grounds. */
  function closedCropKind(name, key) {
    var s = String(name || '').toLowerCase(), kk = String(key || '');
    if (/parsley/.test(s)) return 'parsley';
    if (kk === 'grass' || (!/barley|wheat|oat|rye|rape|maize/.test(s) && /grass|silage|\bley|pasture|\bhay/.test(s))) return 'grass';
    if (!s && !kk) return null;
    if (/rape|osr|canola/.test(s) || (!s && kk === 'winter_osr')) return /spring/.test(s) ? 'other' : 'winter_osr';
    if (/asparagus/.test(s)) return 'asparagus';
    if (/salad onion|spring onion/.test(s)) return 'salad_onion';
    if (/onion/.test(s)) return 'bulb_onion';
    if (/parsley/.test(s)) return 'parsley';
    if (/brassica|cabbage|sprout|cauliflower|calabrese|broccoli|kale|swede|turnip|kohl/.test(s)) return 'brassica';
    if (/catch crop|cover crop/.test(s)) return 'catch_cover';
    if (/wheat|barley|oat|rye|triticale|cereal/.test(s) || /wheat|barley|oats/.test(kk)) return 'cereal';
    return 'other';
  }

  /* -442 (owner decision 1, 24 Nov 2026): "recorded late". England and Wales ask for the record of a spreading within one week of
     it (SI 2015/668 reg 31(1)-(2), WSI 2021/77 reg 40(1)-(2)); Scotland (SSI 2008/298 reg 25) and Northern Ireland (NISR 2019/81
     reg 27(2)) set no per-spreading limit. The limit is the law table's closed.record_rule.value.within_days, never typed here.
     The record is ALWAYS saved (record_rule never_refuse): this only says whether to show the calm warning.
     inp: { nation, spreadOn:'YYYY-MM-DD', recordedOn:'YYYY-MM-DD' }
     out: { applies (the nation has a limit), late, days (recordedOn - spreadOn), withinDays, words, why, cite, quote, note, law_set } */
  function recordLate(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation), N = nat(law, k);
    var R = N && N.closed && N.closed.value && N.closed.value.record_rule && N.closed.value.record_rule.value ? N.closed.value.record_rule.value.within_days : null;
    var out = { applies: false, late: false, days: null, withinDays: null, words: null, why: null, cite: cite(R), quote: R ? R.quote || null : null, note: R ? R.note || null : null, law_set: lawSet(law) };
    if (!R) { out.refused = k ? 'no record-time row for this nation' : 'nation needed'; return out; }
    var lim = num(R.value);
    if (isoOk(inp.spreadOn) && isoOk(inp.recordedOn)) out.days = daysBetween(inp.spreadOn, inp.recordedOn);
    if (lim === null) { out.why = R.note || 'No time limit for making the record here.'; return out; }
    out.applies = true; out.withinDays = lim;
    if (out.days === null) { out.refused = 'spread date and recorded date needed'; return out; }
    out.late = out.days > lim;
    if (out.late) { out.words = lim === 7 ? 'Recorded more than a week after spreading. The law asks for a record within one week.' : 'Recorded more than ' + lim + ' days after spreading. The law asks for a record within ' + lim + ' days.'; out.why = (R.source || '') + (R.quote ? ': \u201c' + R.quote + '\u201d' : ''); }
    return out;
  }
  /* -442 (owner decision 3, 24 Nov 2026): Scotland's two bagged-N zones (SSI 2008/298; the law table's closed.bagN north/south and
     north_zones). The farmer's answer wins: 'north' or 'unsure' -> north (the longer closed period, the safe side), 'south' -> south.
     With no answer, the NVZ map name decides (any north_zones name in it). ask: the question is still open (no map name settles it
     and the answer is missing or "not sure"), so the app keeps asking gently.
     inp: { nation, answer:'north'|'south'|'unsure'|null, mapName, nvz:true|false|null }
     out: { applies (Scotland), north, how:'answer'|'unsure'|'map'|'none', ask } */
  function scotZone(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation);
    if (k !== 'S') return { applies: false, north: false, how: 'none', ask: false };
    var C = nat(law, 'S') ? nat(law, 'S').closed.value : null, zs = (C && Array.isArray(C.north_zones)) ? C.north_zones : [];
    var map = String(inp.mapName || ''), a = inp.answer === 'north' || inp.answer === 'south' || inp.answer === 'unsure' ? inp.answer : null;
    var mapNorth = !!map && zs.some(function (z) { return map.toLowerCase().indexOf(String(z).toLowerCase().replace(/shire$/, '')) >= 0; });   /* 'Aberdeenshire' matches an 'Aberdeen' map name too, as the old regex did */
    var settled = !!map, ask = !settled && inp.nvz !== false && a !== 'north' && a !== 'south';
    if (a === 'north') return { applies: true, north: true, how: 'answer', ask: false };
    if (a === 'south') return { applies: true, north: false, how: 'answer', ask: false };
    if (a === 'unsure') return { applies: true, north: true, how: 'unsure', ask: ask };
    return { applies: true, north: mapNorth, how: map ? 'map' : 'none', ask: ask };
  }

  /* R13: one closed-period check for every place spreading is recorded (Crops input form, Livestock -> Manure spread).
     inp: { nation, nvz:true|false|null, land:'grass'|'arable', soil:'sandy'|'other', product:'manufactured'|'high_ran'|'fym',
            date:'YYYY-MM-DD', crop (crop key), cropName (the field's crop as typed, -441c), organicKind, sownOn, north (Scotland zone) }
     out: { hit, action:'warn'|null (never 'refuse', -439-sus6), from, to, why, exception, reasons:[{id,label,source}], cite, law_set } - hit false when the date is open. */
  function closedPeriodHit(inp, law) {
    inp = inp || {}; var k = nationKey(inp.nation), N = nat(law, k);
    if (!N || !isoOk(inp.date)) return { hit: false, action: null, refused: 'nation and date needed' };
    var C = N.closed.value, land = inp.land === 'arable' ? 'arable' : 'grass', soil = inp.soil === 'sandy' ? 'sandy' : 'other', prod = inp.product;
    var base = { hit: false, action: null, cite: cite(N.closed), law_set: lawSet(law), product: prod, land: land, soil: soil };
    if (prod !== 'manufactured' && prod !== 'high_ran' && prod !== 'fym') { base.refused = 'product type needed'; return base; }
    if (C.scope === 'nvz' && inp.nvz !== true) {
      if (inp.nvz === null || inp.nvz === undefined) { base.unknown = true; base.why = 'NVZ not answered: if the farm is in an NVZ, check the closed periods'; }
      return base;
    }
    var pair = null;
    if (k === 'N') pair = prod === 'manufactured' ? C.chemicalNP : prod === 'fym' ? C.fym : C.organicExceptFym;
    else if (prod === 'manufactured') pair = C.bagN && C.bagN.north ? (inp.north ? C.bagN.north : C.bagN.south)[land] : C.bagN[land];
    else if (prod === 'high_ran') pair = C.slurry[land][soil];
    else pair = C.fym || null;
    if (!pair) { base.why = prod === 'fym' ? 'no closed period for solid manure here' : null; return base; }
    var y = +inp.date.slice(0, 4), md = inp.date.slice(5), f = pair[0], t = pair[1], from, to;
    if (t < f) { if (md >= f) { from = y + '-' + f; to = (y + 1) + '-' + t; } else if (md <= t) { from = (y - 1) + '-' + f; to = y + '-' + t; } }
    else if (md >= f && md <= t) { from = y + '-' + f; to = y + '-' + t; }
    if (!from) return base;
    /* -439-sus6 (owner decision "closed" a; source audit L1-L3): a date in a closed period is never refused. The law requires
       every application to be recorded, and some closed-period spreading is lawful. The entry is saved with a factual warning
       and a reason the farmer chooses (out.reasons). "no_exception_in_law" only changes the wording. */
    var ab = C.no_exception_in_law || C.absolute || {}, noEx = prod === 'manufactured' ? !!(ab.bagN && ab.bagN[land]) : !!ab[prod === 'high_ran' ? 'slurry' : prod], X = C.exceptions || {};
    var out = Object.assign(base, { hit: true, from: from, to: to, opensOn: addDays(to, 1), action: 'warn', noExceptionInLaw: noEx });
    var words = { manufactured: k === 'N' ? 'chemical fertiliser' : 'manufactured nitrogen', high_ran: 'slurry, poultry manure and other high readily available N manure', fym: 'farmyard manure' }[prod];
    out.why = 'This date is inside the closed period for ' + words + ' on ' + (land === 'grass' ? 'grassland' : 'tillage land') + (prod === 'high_ran' ? (soil === 'sandy' ? ' (sandy or shallow soil)' : ' (other soils)') : '') + ', ' + mdWords(from) + ' to ' + mdWords(to) + '.';
    /* -441c: the exceptions depend on the crop and the date as well as the product. Example: slurry on grass on 16 Nov in England -
       reg 21(5)(a) bars the organic-holding route after 31 October, and reg 22(8) bars the grass crop exception, so none applies. */
    var kind = land === 'grass' ? 'grass' : closedCropKind(inp.cropName, inp.crop), row = kind ? (X.bagN || []).filter(function (x) { return x.crop === kind; })[0] || null : null;
    var past = !!(row && row.until && inp.date > from.slice(0, 4) + '-' + row.until);
    var EA = X.slurry_sandy_arable_early ? [].concat(X.slurry_sandy_arable_early) : [];
    if (prod === 'high_ran' && land === 'arable' && soil === 'sandy' && EA.length) {
      var cand = EA.filter(function (e) { return md >= e.from && md <= e.to && (!e.kinds || kind === null || e.kinds.indexOf(kind) >= 0); });
      if (cand.length) {
        var sown = isoOk(inp.sownOn) && inp.sownOn.slice(0, 4) === String(y) ? inp.sownOn.slice(5) : null;
        var okE = sown ? cand.filter(function (e) { return (!e.kinds || kind !== null) && (e.sown_by ? sown <= e.sown_by : sown < e.sown_before); })[0] : null;
        if (okE) { out.hit = false; out.action = null; out.exception = X.slurry_note; return out; }
        out.exception = X.slurry_note + (sown ? '' : ' Add the sowing date to the field to check it.');
      }
    }
    if (prod === 'manufactured') {
      if (k === 'N') out.exception = X.bagN_arable;
      else {
        var ex = row;
        if (ex && ex.table === 'sch3_t1' && X.wosr_sch3_t1) {
          var T1 = X.wosr_sch3_t1.value, g = num(inp.residueGroup), amt = g !== null && T1[String(g)] != null ? T1[String(g)] : null;
          out.exception = 'Winter oilseed rape may have the amount in Schedule 3 Table 1 where your fertiliser and manure plan shows the need: ' + (amt !== null ? amt + ' kg N/ha after a residue group ' + g + ' crop' : '30, 20 or 10 kg N/ha after a residue group 1, 2 or 3 crop, none after groups 4 to 6') + ' (SSI 2008/298 reg 19(4)).';
          out.exceptionMax = amt;
        } else if (ex && past) out.exception = 'The exception for this crop ends on ' + mdWords(ex.until) + ', so it does not cover this date.';
        else out.exception = ex ? ('Allowed up to ' + ex.max + ' kg N/ha for this crop' + (ex.plan ? ' where your fertiliser and manure plan shows the need' : '') + (ex.until ? ', none after ' + mdWords(ex.until) : '') + (ex.each ? ', no more than ' + ex.each + ' kg at once' : '') + (ex.every4w ? ', no more than ' + ex.every4w + ' kg every 4 weeks' : '') + '.') : X.bagN_note;
        if (ex && ex.max && !past) out.exceptionMax = ex.max;
      }
    }
    /* the reasons the farmer chooses from: the lawful routes for this nation, product, land, crop and date, then "None: possible breach" */
    var ok2 = String(inp.organicKind || '').toLowerCase();
    out.reasons = (C.lawful_routes || []).filter(function (r) {
      var v = r.value || {}; if (v.products && v.products.indexOf(prod) < 0) return false; if (v.land && v.land.indexOf(land) < 0) return false;
      if (v.from && (inp.date < v.from || inp.date > v.to)) return false;
      if (v.crops === 'table' && kind !== null && !row) return false;       /* only the crops the law lists */
      if (v.crops === 'not_table' && kind !== null && row) return false;    /* FACTS advice: only crops NOT in the table */
      if (v.until_table && past) return false;                              /* e.g. grass, winter oilseed rape: none after 31 October */
      if (v.not && ok2 && v.not.some(function (n) { return ok2.indexOf(n) >= 0 || (n === 'poultry' && /layer|broiler|duck|turkey|litter/.test(ok2)); })) return false;
      return true;
    }).map(function (r) { return { id: r.value.id, label: r.label, source: r.source, source_url: r.source_url }; });
    out.noExceptionInLaw = out.reasons.length === 0;
    out.cropKind = kind;
    out.reasons.push({ id: 'none', label: 'None: possible breach', source: C.record_rule ? C.record_rule.source : null });
    if (inp.reason) { out.reason = inp.reason; out.reasonOk = inp.reason !== 'none' && out.reasons.some(function (r) { return r.id === inp.reason; }); }
    return out;
  }

  /* kg N (and P2O5, K2O) in one crop input or spreading. Never reads the free-text rate.
     inp: { applied (false = bought, in the store), n_pct, p2o5_pct, k2o_pct, qty, qty_unit:'kg/ha'|'t/ha'|'L/ha'|'m3/ha'|'kg'|'t'|'L'|'m3',
            area_ha, organic_kind, kg_per_l }
     Organic kinds: cattle_slurry, pig_slurry, cattle_fym, pig_fym, sheep_fym, horse_fym, duck_fym, poultry_litter, layer_manure, digestate.
     out: { kgN, kgNHa, kgP2O5Ha, kgK2OHa, availKgNHa, category, organic, estimate:[...], refused } */
  /* -439-sus6: the crop-available share comes from the nation's law row (crop_available_n: E/W reg 14(3)/reg 9, S Sch 3 Table 5,
     NI Sch 2 Table 3). Digestate has no default: the supplier's analysis is asked (source audit L13). */
  var ORGANIC = { cattle_slurry: ['rb209.cattle_slurry.dm6.total_n', 'high_ran', 'cattle_slurry', 'm3'], pig_slurry: ['rb209.pig_slurry.dm4.total_n', 'high_ran', 'pig_slurry', 'm3'],
                  cattle_fym: ['rb209.fym.cattle.total_n', 'fym', 'fym', 't'], pig_fym: ['rb209.fym.pig.total_n', 'fym', 'fym', 't'], sheep_fym: ['rb209.fym.sheep.total_n', 'fym', 'fym', 't'],
                  horse_fym: ['rb209.fym.horse.total_n', 'fym', 'fym', 't'], duck_fym: ['rb209.fym.duck.total_n', 'fym', 'fym', 't'],
                  poultry_litter: ['rb209.poultry.dm60.total_n', 'high_ran', 'poultry', 't'], layer_manure: ['rb209.poultry.dm20.total_n', 'high_ran', 'poultry', 't'],
                  digestate: [null, 'high_ran', null, 'm3'] };
  var QTY_UNITS = { 'kg/ha': [1, 1], 't/ha': [1000, 1], 'L/ha': ['L', 1], 'm3/ha': ['m3', 1], kg: [1, 0], t: [1000, 0], L: ['L', 0], m3: ['m3', 0] };
  function inputN(inp, factors, law) {
    inp = inp || {}; var out = { kgN: null, kgNHa: null, kgP2O5Ha: null, kgK2OHa: null, availKgNHa: null, category: null, organic: false, estimate: [] };
    if (inp.applied === false) { out.refused = 'bought, not spread yet'; return out; }
    var U = QTY_UNITS[inp.qty_unit], q = num(inp.qty), ha = num(inp.area_ha);
    if (!U || q === null || q < 0) { out.refused = 'amount and unit needed'; return out; }
    if (!(ha > 0)) { out.refused = 'area needed'; return out; }
    var org = inp.organic_kind && ORGANIC[inp.organic_kind] ? ORGANIC[inp.organic_kind] : null, pct = num(inp.n_pct), perHa = U[1] ? q : q / ha, unitBase = U[0];
    if (org) {
      out.organic = true; out.category = org[1];
      if (typeof unitBase === 'number') unitBase = unitBase === 1000 ? 't' : 'kg';
      var tonnes = unitBase === 't' ? perHa : unitBase === 'kg' ? perHa / 1000 : unitBase === 'm3' ? perHa : unitBase === 'L' ? perHa / 1000 : null;   /* slurry 1 m3 ~ 1 t */
      var nPer = null;
      if (pct !== null && pct >= 0) nPer = pct * 10;                                  // % N of fresh weight -> kg N per t (or m3)
      else if (org[0]) { nPer = facV(factors, org[0]); if (nPer !== null) out.estimate.push('standard N content for ' + inp.organic_kind.replace(/_/g, ' ') + ' (RB209); an analysis beats it'); }
      if (nPer === null) { out.refused = 'N content needed (from an analysis)'; return out; }
      if ((unitBase === 'm3' && org[3] === 't') || (unitBase === 't' && org[3] === 'm3')) out.estimate.push('1 m³ counted as 1 tonne');
      out.kgNHa = tonnes * nPer; out.kgN = out.kgNHa * ha;
      var AVr = nat(law, inp.nation), AV = AVr && AVr.crop_available_n ? AVr.crop_available_n : null, typed = num(inp.avail_pct);
      var av = typed !== null && typed >= 0 && typed <= 100 ? typed / 100 : (org[2] && AV ? num(AV.value[org[2]]) : null);
      if (av !== null) { out.availKgNHa = out.kgNHa * av; out.availPct = Math.round(av * 100); out.availFrom = typed !== null ? 'analysis' : 'law'; if (typed === null) out.availCite = cite(AV); }
      else { out.availKgNHa = null; out.ask = 'avail'; out.estimate.push(org[2] ? 'crop-available share: nation not known' : 'crop-available N not worked out: type it from the supplier\u2019s analysis (% of total N)'); }
    } else {
      if (pct === null || pct < 0 || pct > 100) { out.refused = 'N% needed'; return out; }
      out.category = 'manufactured';
      var kg = typeof unitBase === 'number' ? perHa * unitBase : null;
      if (unitBase === 'L') { var d = num(inp.kg_per_l); if (!(d > 0)) { out.refused = 'a liquid needs its weight a litre, or type kg'; return out; } kg = perHa * d; out.estimate.push('weight from litres at ' + d + ' kg a litre'); }
      if (unitBase === 'm3') { out.refused = 'type kg or litres for a manufactured fertiliser'; return out; }
      out.kgNHa = kg * pct / 100; out.kgN = out.kgNHa * ha; out.availKgNHa = out.kgNHa;
      var p = num(inp.p2o5_pct), kk = num(inp.k2o_pct);
      out.kgP2O5Ha = p !== null && p >= 0 ? kg * p / 100 : null; out.kgK2OHa = kk !== null && kk >= 0 ? kg * kk / 100 : null;
    }
    ['kgN', 'kgNHa', 'kgP2O5Ha', 'kgK2OHa', 'availKgNHa'].forEach(function (x) { if (out[x] !== null && out[x] !== undefined) out[x] = r2(out[x]); });
    return out;
  }

  /* The 250 kg/ha organic manure N limit on any one hectare in any 12 months (grazing deposition not included).
     apps: [{ field, date, kgNHa, organic:true }] (crop inputs and Livestock -> Manure spreading)
     out: { limit, fields:{ id:{ worstKgHa, worstTo, nowKgHa, over } }, over:[ids], cite } */
  function fieldOrganicN(apps, today, law, nation, nvz) {
    var L0 = law && law.limits && law.limits.field_organic_n, lim = L0 ? L0.value : null, by = {}, nk = nationKey(nation);
    /* -439-sus6: no field limit in NI (none in NISR 2019/81; the 250 there is the holding derogation) */
    if (nk && L0 && L0.applies && L0.applies[nk] === null) return { limit: null, applies: false, fields: {}, over: [], cite: cite(L0), law_set: lawSet(law), why: 'no field limit in Northern Ireland law' };
    /* -446 (web test P0-1): the law row says where the limit applies - England and Scotland in NVZs only (SI 2015/668 reg 8,
       SSI 2008/298 reg 15(1)), Wales everywhere. A farm answered "not in an NVZ" has no field limit; an unanswered NVZ keeps
       the check (the cautious side) and says it rests on that answer. */
    var scope = nk && L0 && L0.applies ? L0.applies[nk] : null, nvzOnly = scope === 'nvz';
    if (nvzOnly && nvz === false) return { limit: null, applies: false, fields: {}, over: [], cite: cite(L0), law_set: lawSet(law), why: 'the 250 kg field limit applies in NVZs only, and the farm is not in one' };
    (apps || []).forEach(function (a) { if (!a || !a.organic || a.field == null || !isoOk(a.date) || !(num(a.kgNHa) > 0)) return; (by[String(a.field)] = by[String(a.field)] || []).push(a); });
    var out = { limit: lim, fields: {}, over: [], cite: cite(L0), law_set: lawSet(law), nvzUnknown: nvzOnly && nvz !== true };
    Object.keys(by).forEach(function (f) {
      var L = by[f].sort(function (a, b) { return a.date < b.date ? -1 : 1; }), worst = 0, worstTo = null;
      L.forEach(function (a) { var s = 0, from = yearFrom(a.date); L.forEach(function (b) { if (b.date >= from && b.date <= a.date) s += num(b.kgNHa); }); if (s > worst) { worst = s; worstTo = a.date; } });
      var now = 0; if (isoOk(today)) { var f0 = yearFrom(today); L.forEach(function (b) { if (b.date >= f0 && b.date <= today) now += num(b.kgNHa); }); }
      out.fields[f] = { worstKgHa: r2(worst), worstTo: worstTo, nowKgHa: r2(now), over: worst > lim };
      if (worst > lim) out.over.push(f);
    });
    return out;
  }

  /* R10: the N plan for one field from RB209 and the field's own SNS Index (no -30 on top: the Index already holds soil N).
     inp: { crop (key), sns (0-6), expectedYield, soil:'medium'|'deep_clay'|..., nation, nvz, nmaxOpts }
     out: { rec, base, yieldAdj, tags, refused, nmax (the legal limit beside it), cite } */
  function nPlan(inp, law, factors) {
    inp = inp || {}; var out = { rec: null, tags: [] };
    var sns = num(inp.sns); if (sns === null || sns < 0 || sns > 6 || Math.floor(sns) !== sns) { out.refused = 'SNS Index needed (0 to 6)'; }
    if (inp.crop !== 'winter_wheat') { out.refused = out.refused || 'no RB209 table for this crop in the app yet: use your adviser’s plan'; }
    var T = fac(factors, 'rb209.wheat_winter.sns'), Y = fac(factors, 'rb209.wheat_winter.yield_adj');
    var soil = inp.soil || 'medium', row = T && T.value ? T.value[soil] : null;
    if (!inp.soil) out.tags.push('soil type not answered, so medium soils');
    if (!out.refused && !row) out.refused = 'soil type not in the app’s RB209 table yet (medium and deep clay soils only)';
    if (!out.refused) {
      var base = row[sns], y = num(inp.expectedYield), adj = 0, Yv = Y ? Y.value : { std: 8, per_half_t: 10, max_t: 13 };
      if (y !== null && y > 0) { var yy = Math.min(y, Yv.max_t); adj = Math.round((yy - Yv.std) / 0.5) * Yv.per_half_t; if (y > Yv.max_t) out.tags.push('yield rise capped at ' + Yv.max_t + ' t/ha'); }
      else out.tags.push('no expected yield, so the 8 t/ha figure');
      if (sns === 6) out.tags.push('Index 6 is 0 to 40: up to 40');
      out.base = base; out.yieldAdj = adj; out.rec = Math.max(0, base + adj); out.sns = sns;
      out.cite = T ? { source: T.source, source_url: T.source_url, status: T.status, checked_on: T.checked_on } : null;
    }
    if (inp.nation && law) out.nmax = nmax(inp.nation, inp.crop, Object.assign({ nvz: inp.nvz, expectedYield: inp.expectedYield }, inp.nmaxOpts || {}), law);
    if (out.rec !== null && out.nmax && out.nmax.limit != null && out.rec > out.nmax.limit) out.tags.push('the recommendation is above the legal N max: plan to the N max');
    return out;
  }

  /* R11: the Red Tractor urea standard (England, members only), on the APPLICATION date - never the invoice date.
     inp: { nation, member:true|false|null, appliedOn, n_form:'urea_untreated'|'urea_protected'|'urea_liquid'|null, product }
     out: { applies, flagged, ask, why, label } */
  function ureaCheck(inp, law) {
    inp = inp || {}; var R = law && law.limits && law.limits.urea_rt, k = nationKey(inp.nation);
    var out = { applies: false, flagged: false, label: 'Red Tractor standard, not law', cite: cite(R) };
    if (!R || !k || R.value.nations.indexOf(k) < 0 || inp.member !== true || !isoOk(inp.appliedOn)) return out;
    var nf = inp.n_form || null, looks = /\burea\b/i.test(String(inp.product || '')) && !/protect|inhibit|nbpt|nppt|stabil|agrotain|limus|uan|liquid/i.test(String(inp.product || ''));
    if (!nf && !looks) return out;
    out.applies = true;
    if (nf === 'urea_protected') return out;
    var md = inp.appliedOn.slice(5), inWin = md >= R.value.from && md <= R.value.to;
    if (nf === 'urea_liquid') { out.note = 'Liquid urea outside 15 January to 31 March needs a FACTS adviser’s written advice.'; out.flagged = !inWin; out.soft = true; return out; }
    if (!nf) out.ask = 'Was the urea protected (with a urease inhibitor)?';
    out.flagged = !inWin;
    if (out.flagged) out.why = 'Untreated urea applied on ' + inp.appliedOn + ': Red Tractor allows it only from 15 January to 31 March. Use protected urea outside that window.';
    return out;
  }

  /* R16: soil tests by nation. fields:[{ id, name, cultivated }], tests:[{ land, sampled_on }] -> per field the latest test and when the next is due. */
  function soilDue(nation, fields, tests, today, law) {
    var N = nat(law, nation); if (!N || !N.soil || !isoOk(today)) return null;
    var R = N.soil, V = R.value, out = { law: !!V.law, every: V.every_years, label: R.label, status: R.status, cite: cite(R), fields: [], due: 0, missing: 0 };
    (fields || []).forEach(function (f) {
      if (!f || f.cultivated === false) return;
      var last = (tests || []).filter(function (t) { return t && String(t.land) === String(f.id) && isoOk(t.sampled_on) && t.sampled_on <= today; }).map(function (t) { return t.sampled_on; }).sort().slice(-1)[0] || null;
      var dueOn = last ? (+last.slice(0, 4) + V.every_years) + last.slice(4) : null;
      var st = !last ? 'missing' : dueOn <= today ? 'due' : daysBetween(today, dueOn) <= 90 ? 'soon' : 'ok';
      if (st === 'missing') out.missing++; if (st === 'due') out.due++;
      out.fields.push({ id: f.id, name: f.name || '', last: last, dueOn: dueOn, state: st });
    });
    return out;
  }

  /* The NVZ records for the year: one row per application, the same rows on screen and in the CSV.
     inp: { nation, nvz, today, from, to, lands:[{id,name,crop,area,planted,targetYield,opts,landType}], inputs:[crop inputs],
            spreads:[{ field, fieldName, date, organic_kind, qty, qty_unit, area_ha, kg_n, n_pct }], soil, north, member, factors }
     out: { rows, crops:[{crop,label,area,limit,appliedKg,appliedKgHa,within,status,tags}], organic: fieldOrganicN, totals } */
  var NVZ_COLS = ['Date', 'Field', 'Crop', 'Area (ha)', 'Product', 'Type', 'N %', 'Amount', 'Unit', 'kg N/ha', 'Crop-available kg N/ha', 'kg N total', 'Closed period', 'Note'];
  function nvzRecords(inp, law, factors) {
    inp = inp || {}; var k = nationKey(inp.nation), rows = [], apps = [], breaches = [];
    if (!k || !law) return { refused: 'nation and law needed', rows: rows, breaches: breaches };
    var from = isoOk(inp.from) ? inp.from : null, to = isoOk(inp.to) ? inp.to : inp.today;
    var landBy = {}; (inp.lands || []).forEach(function (l) { if (l) landBy[String(l.id)] = l; });
    var push = function (src, l, r, x) {
      var key = l ? cropKey(l.crop, l.planted) : null;
      var cp = closedPeriodHit({ nation: k, nvz: inp.nvz, land: (l && (l.landType === 'grass' || key === 'grass')) ? 'grass' : 'arable', soil: inp.soil, product: r.category, date: x.date, crop: key, cropName: l ? l.crop : null, organicKind: x.organic_kind || null, sownOn: l ? l.planted : null, north: inp.north, reason: x.closed_reason }, law);
      var rsn = cp.hit && cp.reasons ? (cp.reasons.filter(function (q) { return q.id === x.closed_reason; })[0] || null) : null;
      rows.push({ src: src, id: x.id, date: x.date, field: l ? l.id : x.field, fieldName: l ? (l.name || '') : (x.fieldName || ''), crop: l ? (l.crop || '') : (x.crop || ''), cropKey: key,
                  area: num(x.area_ha) || (l ? num(l.area) : null), product: x.product || '', type: r.organic ? 'Organic manure' : 'Manufactured', nPct: num(x.n_pct), qty: num(x.qty), unit: x.qty_unit || '',
                  kgNHa: r.kgNHa, availKgNHa: r.availKgNHa, kgN: r.kgN, closed: (cp.hit && !(r.refused && num(x.n_pct) === null)) ? 'In the closed period: ' + (rsn ? rsn.label : x.closed_reason ? 'the reason chosen does not cover this product' : 'reason not given') : '', closedReason: cp.hit ? (x.closed_reason || null) : null, refused: r.refused || null,
                  note: (r.refused ? 'Not worked out: ' + r.refused : (r.estimate || []).join('; ')) });
      if (!r.refused && r.organic) apps.push({ field: l ? l.id : x.field, date: x.date, kgNHa: r.kgNHa, organic: true });
      /* -446 (web test P0-4): an application in a closed period with no lawful route recorded ("None", no reason, or a reason that
         does not cover this product) is a possible breach. It stays a record exactly as made, and it is said wherever the
         nitrogen record is summed up: the jobs, the summary and the pack - not only in the row. */
      if (cp.hit && !(r.refused && num(x.n_pct) === null) && (!x.closed_reason || x.closed_reason === 'none' || !rsn))
        breaches.push({ id: x.id, src: src, date: x.date, field: l ? l.id : x.field, fieldName: l ? (l.name || '') : (x.fieldName || ''), product: x.product || '',
                        from: cp.from, to: cp.to, why: cp.why || '', reason: x.closed_reason || null,
                        reasonWords: !x.closed_reason ? 'no reason recorded' : x.closed_reason === 'none' ? 'reason recorded: none' : 'the reason chosen does not cover this product' });
    };
    (inp.inputs || []).forEach(function (x) {
      if (!x || x.kind !== 'fertiliser' || x.removed || !isoOk(x.date) || (from && x.date < from) || (to && x.date > to) || x.applied === false) return;
      var l = landBy[String(x.land)] || null, d = x.qty == null && x.n_pct == null ? null : x;
      var r = d ? inputN({ nation: k, applied: x.applied, n_pct: x.n_pct, p2o5_pct: x.p2o5_pct, k2o_pct: x.k2o_pct, qty: x.qty, qty_unit: x.qty_unit, area_ha: x.area_ha != null ? x.area_ha : (l ? l.area : null), organic_kind: x.organic_kind, kg_per_l: x.kg_per_l, avail_pct: x.avail_pct }, factors, law) : { refused: 'no N% or amount on this record (an older entry)', category: x.organic_kind ? (ORGANIC[x.organic_kind] || [])[1] : 'manufactured' };
      push('crop', l, r, { id: x.id, date: x.date, area_ha: x.area_ha != null ? x.area_ha : (l ? l.area : null), product: x.product, n_pct: x.n_pct, qty: x.qty, qty_unit: x.qty_unit, closed_reason: x.closed_reason });
    });
    (inp.spreads || []).forEach(function (s) {
      if (!s || !isoOk(s.date) || (from && s.date < from) || (to && s.date > to)) return;
      var l = s.field != null ? (landBy[String(s.field)] || null) : null, ha = num(s.area_ha) || (l ? num(l.area) : null);
      var typed = num(s.kg_n), r;
      if (typed !== null && ha > 0) { var org = ORGANIC[s.organic_kind] || [null, 'high_ran']; r = { organic: true, category: org[1], kgN: r2(typed), kgNHa: r2(typed / ha), availKgNHa: null, estimate: ['your kg N'] }; var AV0 = nat(law, k).crop_available_n, ta = num(s.avail_pct), av = ta !== null ? ta / 100 : (org[2] && AV0 ? num(AV0.value[org[2]]) : null); r.availKgNHa = av !== null ? r2(typed / ha * av) : null; if (av === null) r.estimate.push('crop-available N not worked out: type it from the supplier\u2019s analysis'); }
      else r = inputN({ nation: k, qty: s.qty, qty_unit: s.qty_unit === 'm3' ? 'm3' : 't', area_ha: ha, organic_kind: s.organic_kind, n_pct: s.n_pct, avail_pct: s.avail_pct }, factors, law);
      push('spread', l, r, { id: s.id, date: s.date, area_ha: ha, product: s.label || 'Manure spread', field: s.field, fieldName: s.fieldName, qty: s.qty, qty_unit: s.qty_unit === 'm3' ? 'm3' : 't', closed_reason: s.closed_reason });
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    /* crop N max per crop: total N over the area of the crop against the sum of each field's limit */
    var crops = {};
    (inp.lands || []).forEach(function (l) {
      if (!l || !l.crop || !(num(l.area) > 0)) return; var key = cropKey(l.crop, l.planted);
      var nm = nmax(k, key, Object.assign({ nvz: inp.nvz, expectedYield: l.targetYield }, l.opts || {}), law), g = crops[key] = crops[key] || { crop: key, label: nm.label || l.crop, area: 0, limitKg: 0, appliedKg: 0, rule: nm.rule, tags: [], fields: [], missingLimit: false };
      g.area += num(l.area); g.fields.push(l.id);
      if (nm.limit == null) g.missingLimit = true; else g.limitKg += nm.limit * num(l.area);
      (nm.tags || []).forEach(function (t) { if (g.tags.indexOf(t) < 0) g.tags.push(t); }); if (nm.why && g.tags.indexOf(nm.why) < 0 && nm.limit == null) g.tags.push(nm.why);
    });
    rows.forEach(function (r) { if (r.refused || r.cropKey == null || !crops[r.cropKey] || crops[r.cropKey].fields.indexOf(r.field) < 0) return;
      var l0 = landBy[String(r.field)]; if (l0 && isoOk(l0.planted) && r.date < addDays(l0.planted, -60)) return;   /* an application for the last crop, not this one */ var a = num(r.availKgNHa), ha = num(r.area); if (a !== null && ha > 0) crops[r.cropKey].appliedKg += a * ha; });
    var cropList = Object.keys(crops).map(function (c) {
      var g = crops[c], lim = g.missingLimit || !g.area ? null : g.limitKg / g.area, ap = g.area ? g.appliedKg / g.area : 0;
      return { crop: c, label: g.label, area: r2(g.area), rule: g.rule, limitKgHa: lim === null ? null : r2(lim), appliedKgHa: r2(ap), within: lim === null ? null : ap <= lim + 1e-9,
               status: lim === null ? (g.rule === 'not-nvz' || g.rule === 'none' ? 'no-limit' : 'missing') : ap <= lim + 1e-9 ? 'within' : 'over', tags: g.tags };
    });
    var organic = fieldOrganicN(apps, inp.today, law, k, inp.nvz === true ? true : inp.nvz === false ? false : null);
    var missing = rows.filter(function (r) { return r.refused; }).length, closedN = rows.filter(function (r) { return r.closed; }).length;
    breaches.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { rows: rows, crops: cropList, organic: organic, missing: missing, closed: closedN, breaches: breaches, cols: NVZ_COLS, law_set: lawSet(law),
             over: cropList.filter(function (c) { return c.status === 'over'; }).length };
  }
  /* the CSV rows: exactly the screen's rows, in the screen's order */
  function nvzCsvRows(rec) {
    return (rec && rec.rows || []).map(function (r) {
      var f = function (v, dp) { return v === null || v === undefined ? '' : String(Math.round(v * Math.pow(10, dp || 0)) / Math.pow(10, dp || 0)); };
      return [r.date, r.fieldName, r.crop, f(r.area, 2), r.product, r.type, f(r.nPct, 1), f(r.qty, 2), r.unit, f(r.kgNHa, 0), f(r.availKgNHa, 0), f(r.kgN, 0), r.closed, r.note];
    });
  }

  /* Phase 2 jobs (law, scheme and setup), into sus_tasks and the one attention list beside legalJobs. */
  function nitrogenJobs(inp, law) {
    inp = inp || {}; var t = inp.today, k = nationKey(inp.nation), y = num(inp.year), out = [];
    if (!isoOk(t) || !k || !law) return out;
    var add = function (j) { jobState(j, (inp.states || {})[j.local_id], t); out.push(j); };
    var R = inp.records;
    if (R && R.crops) R.crops.filter(function (c) { return c.status === 'over'; }).forEach(function (c) {
      add({ local_id: 'nmax-over:' + y + ':' + c.crop, rule_id: 'nmax-over', kind: 'law', area: 'crops', title: c.label + ': over the crop N max', why: Math.round(c.appliedKgHa) + ' kg N/ha over ' + c.area + ' ha against ' + Math.round(c.limitKgHa) + ' kg allowed. Check the records, or hold back the next application.', due: null, cta: 'crops' }); });
    if (R && R.organic) R.organic.over.forEach(function (f) { var x = R.organic.fields[f], lab = (R.rows.filter(function (r) { return String(r.field) === String(f); })[0] || {}).fieldName || 'A field';
      add({ local_id: 'organic-over:' + f + ':' + (x.worstTo || y), rule_id: 'organic-over', kind: 'law', area: 'crops', title: lab + ': over 250 kg N/ha of organic manure', why: Math.round(x.worstKgHa) + ' kg N/ha of organic manure in the 12 months to ' + x.worstTo + '. No more organic manure on that field for now.' + (R.organic.nvzUnknown ? ' The limit applies in an NVZ: answer the NVZ question in Rainfall if the farm is not in one.' : ''), due: null, cta: 'crops' }); });
    var Dn = typeof inp.fmt === 'function' ? inp.fmt : function (x) { return x; };
    if (R && R.breaches) R.breaches.forEach(function (b) {
      add({ local_id: 'closed-spread:' + b.id, rule_id: 'closed-spread', kind: 'law', area: 'crops', title: (b.fieldName || 'A field') + ': spread in the closed period on ' + Dn(b.date),
            why: (b.product ? b.product + '. ' : '') + b.why + ' ' + b.reasonWords.charAt(0).toUpperCase() + b.reasonWords.slice(1) + '. If a lawful route covered it, add it to the record in Crops; if not, talk to your adviser. The record stays as it was made.', due: null, cta: 'crops' }); });
    var S = inp.soil;
    if (S && (S.due || S.missing)) add({ local_id: 'soil-due:' + y, rule_id: 'soil-due', kind: S.law ? 'law' : 'scheme', area: 'crops', title: 'Soil: ' + (S.due + S.missing) + ' field' + (S.due + S.missing === 1 ? ' needs' : 's need') + ' a soil test',   /* -440 (R10, UX-48) */
      why: (S.law ? S.label + '.' : S.label + '. A scheme action, not law.') + ' One soil item with your soil management plan in Crops, Compliance.', due: null, cta: 'soil', shared: 'compliance-soil' });
    (inp.urea || []).forEach(function (u) { if (u.flagged && !u.soft) add({ local_id: 'urea:' + u.id, rule_id: 'urea-rt', kind: 'scheme', area: 'crops', title: 'Untreated urea outside 15 Jan to 31 Mar', why: (u.why || '') + ' Red Tractor standard, not law.', due: null, cta: 'crops' }); });
    if (R && R.missing) add({ local_id: 'n-missing', rule_id: 'n-missing', kind: 'setup', area: 'crops', title: R.missing + ' fertiliser record' + (R.missing === 1 ? '' : 's') + ' without N% or an amount', why: 'The NVZ record needs the N in every application. Open each one in Crops and add the analysis and the amount.', due: null, cta: 'crops' });
    return out;
  }


  /* ══ Phase 4 (PREBUILD-CHECK-V53 §9 row 4): farm health and targets ═══════════════════════════════════════════════════
     footprint (carbon), energy, water, nature and targets. Still pure: no clock, no DOM. Factors come from `factors`
     (data/sus-factors-uk-2026.1.json); the N2O method is chosen in that table (factors.methods.n2o, B4 undecided) and
     can be overridden per call for comparison. Every figure carries its factor and that factor's status, and anything
     resting on an estimate is tagged, never shown as verified. Scope: the farm's own stock (Away stock stays in, other
     people's stock on our land is left out), its fertiliser, fuel, bought electricity, lime and, where a checked factor
     exists, bought feed. */
  var G_N2O = 44 / 28;                                   /* N2O-N to N2O, exact */
  var C_CO2 = 44 / 12;                                   /* C to CO2, exact */
  function fstat(f) { return f ? (f.status === 'confirmed' ? 'verified' : f.status === 'estimate' ? 'estimate' : (f.status || 'pending')) : 'missing'; }
  function fuse(used, factors, id) { var f = fac(factors, id); if (f && !used[id]) used[id] = { id: id, label: f.label, value: f.value, unit: f.unit, status: fstat(f), source: f.source, source_url: f.source_url }; return f ? num(f.value) : null; }
  function n2oMethod(factors, want) {
    var M = factors && factors.methods && factors.methods.n2o; if (!M || !M.options) return null;
    var id = want && M.options[want] ? want : M['default'];
    var o = M.options[id]; return o ? Object.assign({ id: id }, o) : null;
  }

  /* footprint group for one animal-day: enteric factor and liveweight follow the animal, not the legal class
     (cattle under 6 months are calves; breeding cows and bulls at the band's adult age; everything else youngstock). */
  function fpGroup(species, role, age, b) {
    var adult = b && b.mid_under ? b.mid_under : 24;
    if (species === 'cattle') {
      if (role === 'bull_breeding' && age >= adult) return 'bull';
      if (role === 'dairy' && age >= adult) return 'dairy';
      if (role === 'suckler' && age >= adult) return 'cow';
      if (age < 6) return 'calf';
      return role === 'dairy' || role === 'dairy_young' ? 'dyoung' : 'young';
    }
    if (species === 'sheep') return age < 12 && (role === 'lamb' || role === 'store') ? 'lamb' : role === 'ram' ? 'ram' : 'ewe';
    return null;
  }
  /* head by footprint group for each month (day-weighted, like monthlyClasses); a record with sign -1 is skipped:
     the footprint is our own stock wherever it is, so spans are never passed in here. */
  function stockGroups(nation, animals, from, months, law) {
    var out = [], nm = months > 0 ? Math.min(60, Math.floor(months)) : 12, b = bands(nation, law);
    if (!isoOk(from) || !nationKey(nation)) return out;
    var y = +from.slice(0, 4), m = +from.slice(5, 7) - 1;
    for (var i = 0; i < nm; i++) {
      var s = Date.UTC(y, m + i, 1), e = Date.UTC(y, m + i + 1, 1), days = Math.round((e - s) / DAY), g = {};
      (animals || []).forEach(function (a) {
        if (!a || a.sign === -1) return; var fixed = num(a.age);
        if (!isoOk(a.dob) && (fixed === null || fixed < 0)) return;
        var n = head(a.n == null ? 1 : a.n); if (!n) return;
        var dob = isoOk(a.dob) ? toT(a.dob) : null, on = isoOk(a.on) ? toT(a.on) : (dob !== null ? dob : -Infinity), off = isoOk(a.off) ? toT(a.off) : Infinity;
        for (var t = Math.max(s, on); t < Math.min(e, off); t += DAY) {
          var age = dob !== null ? ageAt(iso(dob), iso(t)) : fixed, k = fpGroup(a.species, a.role, age, b); if (!k) continue;
          g[k] = (g[k] || 0) + n / days;
        }
      });
      Object.keys(g).forEach(function (k) { g[k] = Math.round(g[k] * 1e6) / 1e6; });
      out.push({ month: iso(s).slice(0, 7), days: days, groups: g });
    }
    return out;
  }
  var FP_GROUP_HOUSING = { cow: 'sucklers', bull: 'sucklers', dairy: 'dairy', young: 'followers', dyoung: 'followers', calf: 'followers' };
  function grazeShare(h, y) {   /* share of the year a group is out, from its (resolved) housing; no answer and no estimate = out all year */
    var dy = yearDays(y), hd = 0; for (var m = 0; m < 12; m++) hd += housedDays(h, y, m); return 1 - hd / dy;
  }
  /* -439-sus6: the UK inventory fertiliser EF1 (NID 2026 eq.1-3): EF = (Cum(rate) - Cum(0)) / rate, Cum = (e^(fit) - 1.63) x bias */
  function ukEf1(form, rate, rainM, factors) {
    var urea = /^urea/.test(form || ''), f = fac(factors, urea ? 'ukinv.ef1.eq_urea' : 'ukinv.ef1.eq_other'), r = num(rate);
    if (!f || !(r > 0)) return null; var c = f.value, R = num(rainM);
    if (!urea && R === null) return null; if (!urea) R = Math.max(0, Math.min(num(c.rain_max_m) || 1.3, R));
    var cum = function (x) { return (Math.exp(c.a + c.b * x + (urea ? 0 : c.c * R + c.d * x * R)) - c.shift) * c.bias; };
    var ef = (cum(r) - cum(0)) / r; return ef > 0 ? { ef: ef, id: f.id } : null;
  }

  /* inp: { nation, year, today, method (optional override), rainMm:[12] (the farm's Rainfall normal, for the UK inventory EF1),
            stock:{ herds, animals, moves, batches, counts, opts:{ lambingMonth, ... }, housing:{ group:{ mode, in, out, system:'slurry'|'fym'|'both', slurryPct, crust:'crust'|'none'|'cover', weightKg } }, records },
            (stock.records: ready-made stockRecords records, used instead of the herds when given: the golden fixture and replays)
            fertiliser:[{ kgN, kgNHa, form:'an'|'can'|'urea'|'urea_protected'|'uan'|'as'|'nitrate'|null, label }] (manufactured N spread this year),
            assume:{ anMfg: the farmer ticked "use ammonium nitrate's figure" for products with no checked one },
            fuel:[{ litres, fuel:'gas_oil'|'diesel'|'petrol'|'kerosene'|'lpg', assumed, from }], electricity:{ kwh, bills, billsNoKwh },
            solar:{ generatedKwh, exportedKwh }, lime:[{ tonnes, kind:'limestone'|'dolomite' }], feed:[{ tonnes, kind, label }] }
     out: { total (t CO2e), src:{ name: t }, rows:[{ src, what, qty, unit, factor, t, status }], estimates:[...], missing:[...], notCounted:[...],
            method, used:{ factor id: {value, status, source} }, energy, livestock }
     -439-sus6 (owner standing rule: nothing from the mock-up): UK inventory enteric factors per category (NID 2026 Annex
     A 5.1.8); the N2O method defaults to the UK inventory (fertiliser EF1 from N rate and the farm's rainfall; manure 0.75%
     slurry, 0.33% FYM, 1.01% poultry), IPCC 2019 disaggregated wet climate the alternative; storage N losses, EF3 and methane
     by species and system (IPCC 2019 Tables 10.14, 10.21, 10.22); dairy VS 8.4 with the dairy weight; urea manufacture 1.909
     (no double count); UAN volatilisation 0.05. Every unanswered farm fact is asked, or used as a labelled estimate. */
  var FUEL_F = { gas_oil: 'fuel.gas_oil.kgco2e_per_l', diesel: 'fuel.diesel_avg_biofuel.kgco2e_per_l', petrol: 'fuel.petrol_avg_biofuel.kgco2e_per_l', kerosene: 'fuel.kerosene.kgco2e_per_l', lpg: 'fuel.lpg.kgco2e_per_l' };
  var FUEL_LABEL = { gas_oil: 'Red diesel (gas oil)', diesel: 'Road diesel', petrol: 'Petrol', kerosene: 'Heating oil (kerosene)', lpg: 'LPG' };
  var FERT_MFG = { an: 'fert.mfg.an.kgco2e_per_kg_n', can: 'fert.mfg.can.kgco2e_per_kg_n', urea: 'fert.mfg.urea.kgco2e_per_kg_n', urea_protected: 'fert.mfg.urea.kgco2e_per_kg_n', uan: 'fert.mfg.uan.kgco2e_per_kg_n' };
  var FERT_GAS = { an: 'ipcc.fracgasf.an_based', can: 'ipcc.fracgasf.an_based', urea: 'ipcc.fracgasf.urea', urea_protected: 'ipcc.fracgasf.urea', uan: 'ipcc.fracgasf.an_based', as: 'ipcc.fracgasf.ammonium_based', nitrate: 'ipcc.fracgasf.nitrate_based' };
  var ENT_F = { cow: 'ukinv.enteric.beef_cow', bull: 'ukinv.enteric.bull_breeding', dairy: 'ukghgi.ief.enteric.dairy', young: 'ukinv.enteric.beef_young', dyoung: 'ukinv.enteric.dairy_young', calf: 'ukinv.enteric.calf', ewe: 'ukinv.enteric.ewe', ram: 'ukinv.enteric.ram' };
  var GROUP_LABEL = { cow: 'Suckler cows', bull: 'Breeding bulls', dairy: 'Dairy cows', young: 'Beef youngstock 6 months and over', dyoung: 'Dairy youngstock 6 months and over', calf: 'Calves under 6 months', ewe: 'Ewes', ram: 'Rams', lamb: 'Lambs' };
  var CATTLE_G = ['cow', 'bull', 'dairy', 'young', 'dyoung', 'calf'];
  function footprint(inp, law, factors) {
    inp = inp || {}; var k = nationKey(inp.nation), y = num(inp.year);
    if (!k || !y || !law || !factors) return { refused: 'nation, year, law and factors needed' };
    var used = {}, rows = [], src = {}, est = [], miss = [], notC = [], asks = [], M = n2oMethod(factors, inp.method);
    if (!M) return { refused: 'no N2O method in the factor table' };
    var F = function (id) { return fuse(used, factors, id); }, isEst = function (id) { var f = fac(factors, id); return !f || f.status !== 'confirmed'; };
    var tag = function (s) { if (s && est.indexOf(s) < 0) est.push(s); }, ask = function (s) { if (asks.indexOf(s) < 0) asks.push(s); };
    var add = function (s, what, qty, unit, factorTxt, t, ids, extra) {
      if (!(t > 0) && t !== 0) return; src[s] = (src[s] || 0) + t;
      var e = (ids || []).some(isEst);
      rows.push(Object.assign({ src: s, what: what, qty: qty, unit: unit, factor: factorTxt, t: t, status: e ? 'estimate' : 'verified', factors: ids || [] }, extra || {}));
    };
    var UK = M.id === 'ukinv_t2';
    var GWPN = F('gwp.ar5.n2o'), GWPM = F('gwp.ar5.ch4'), G = GWPN * G_N2O / 1000, CH = GWPM / 1000;
    var EF4 = F('ipcc.ef4.wet'), EF5 = F('ipcc.ef5'), FL = F('ipcc.fracleach_h'), FGM = F('ipcc.fracgasm');
    var EF1 = F(M.ef1_synthetic), PRPc = F(M.ef_prp_cattle), PRPs = F(M.ef_prp_sheep);
    var EFsp = function (kind) { var id = UK ? (kind === 'slurry' ? M.ef_slurry : kind === 'poultry' ? M.ef_poultry : M.ef_fym) : M.ef1_organic; return [F(id), id]; };   /* manure spread on land */
    if (M.status && M.status !== 'confirmed') tag('N₂O method: ' + M.label + ' (' + (M.status === 'pending' ? 'not decided yet' : M.status) + ')');
    var rainM = inp.rainMm && inp.rainMm.length === 12 ? inp.rainMm.reduce(function (a, b) { return a + (num(b) || 0); }, 0) / 1000 : (num(inp.rainAnnualMm) > 0 ? num(inp.rainAnnualMm) / 1000 : null);

    /* fertiliser: manufacture + field N2O (direct + indirect), by form; urea adds its own CO2 */
    var fN = 0, fForms = {}, AS = inp.assume || {};
    (inp.fertiliser || []).forEach(function (x) {
      var kg = num(x && x.kgN); if (kg === null || kg <= 0) return;
      var form = FERT_MFG[x.form] || FERT_GAS[x.form] ? x.form : null; if (!form) tag('fertiliser type not recorded on some records, so ammonium nitrate is assumed (our rule)');
      var fm = FERT_MFG[form || 'an'] || null, fg = FERT_GAS[form || 'an'];
      var ef1 = EF1, ef1Id = M.ef1_synthetic, rate = num(x.kgNHa);
      if (UK) { var u = ukEf1(form, rate, rainM, factors); if (u) { ef1 = u.ef; ef1Id = u.id; F(u.id); } else tag(!(rate > 0) ? 'fertiliser N2O: no rate per hectare on some records, so the UK inventory’s implied 0.65%' : 'fertiliser N2O: no rainfall normal yet, so the UK inventory’s implied 0.65%'); }
      var fgas = F(fg), perKg = (ef1 + fgas * EF4 + FL * EF5) * G * 1000;         /* kg CO2e per kg N */
      var key = (form || 'an') + '|' + (fm || 'none') + '|' + ef1Id;
      var g0 = fForms[key] = fForms[key] || { form: form || 'an', kg: 0, n2o: 0, mfgId: fm, gasId: fg, ef1Id: ef1Id, assumed: !form, label: x.label };
      g0.kg += kg; g0.n2o += kg * perKg; fN += kg;
      if (/^urea/.test(form || '')) { var uc = F('ipcc.urea.ef_c'); g0.ureaCO2 = (g0.ureaCO2 || 0) + kg / 0.46 * uc * C_CO2 / 1000; }
    });
    var FLAB = { an: 'ammonium nitrate', can: 'CAN', urea: 'urea', urea_protected: 'protected urea', uan: 'UAN', as: 'ammonium sulphate or other ammonium-based', nitrate: 'nitrate-based' };
    var byForm = {}; Object.keys(fForms).forEach(function (key) { var g0 = fForms[key], b0 = byForm[g0.form] = byForm[g0.form] || { form: g0.form, kg: 0, mfgId: g0.mfgId, assumed: false }; b0.kg += g0.kg; b0.assumed = b0.assumed || g0.assumed; });
    Object.keys(byForm).forEach(function (fk) {      /* manufacture, once per product type */
      var g0 = byForm[fk], lab = FLAB[g0.form] || g0.form, mfgId = g0.mfgId;
      if (!mfgId) {   /* source audit S14: no checked manufacture figure; AN's only with the farmer's tick */
        if (AS.anMfg === true) { mfgId = FERT_MFG.an; tag('no checked manufacture figure for ' + lab + ', so ammonium nitrate’s (your tick)'); }
        else { notC.push('Making ' + lab + ' fertiliser, ' + N2(g0.kg) + ' kg N: no checked figure yet (tick to use ammonium nitrate’s)'); ask('fert-mfg'); }
      }
      if (mfgId) { var mfg = F(mfgId); add('Fertiliser', 'Making ' + lab + ' fertiliser' + (g0.assumed ? ' (type assumed)' : ''), g0.kg, 'kg N', mfg + ' kg CO₂e per kg N (EU average production)', g0.kg * mfg / 1000, [mfgId]); }
    });
    Object.keys(fForms).forEach(function (key) {
      var g0 = fForms[key], lab = FLAB[g0.form] || g0.form;
      add('Fertiliser', 'Nitrous oxide from the field (' + lab + ')', g0.kg, 'kg N', N2(g0.n2o / g0.kg, 2) + ' kg CO₂e per kg N (' + M.short + ')', g0.n2o / 1000, [g0.ef1Id, g0.gasId, 'ipcc.ef4.wet', 'ipcc.fracleach_h', 'ipcc.ef5', 'gwp.ar5.n2o'], { method: M.id });
      if (g0.ureaCO2) add('Fertiliser', 'CO₂ from urea', g0.kg, 'kg N', '0.2 t C per t urea', g0.ureaCO2, ['ipcc.urea.ef_c']);
    });
    if (!fN) miss.push('fertiliser: no N recorded on fertiliser spread this year');

    /* livestock: our own stock, wherever it is (no spans), legal N by class for the N2O, groups for the methane */
    var st = inp.stock || {}, from = y + '-01-01', tday = isoOk(inp.today) ? (inp.today > y + '-12-31' ? y + '-12-31' : inp.today) : y + '-12-31', so = st.opts || {};
    var recs = Array.isArray(st.records) ? st.records.filter(function (r) { return r && (r.species === 'cattle' || r.species === 'sheep') && head(r.n) > 0; })
                                         : stockRecords({ herds: st.herds, animals: st.animals, moves: st.moves, spans: [], from: from, today: tday, opts: so }).records;
    var LV = { groups: {}, lambMonths: 0, cattleN: 0, sheepN: 0, byHousing: {} };
    var cat = recs.filter(function (r) { return r.species === 'cattle'; }), shp = recs.filter(function (r) { return r.species === 'sheep'; });
    var cls = function (list) { var t = 0, av = averageClasses(monthlyClasses(k, list, from, 12, law)), hk = {};
      Object.keys(av).forEach(function (key) { var R = rate(k, key, law); if (R) { var kg = av[key] * R.value; t += kg; hk[key] = kg; } }); return { kg: t, byKey: hk }; };
    var cN = cls(cat), sN = cls(shp); LV.cattleN = cN.kg; LV.sheepN = sN.kg;
    var mg = stockGroups(k, recs, from, 12, law);
    mg.forEach(function (m) { Object.keys(m.groups).forEach(function (g) { if (g === 'lamb') LV.lambMonths += m.groups[g]; else LV.groups[g] = (LV.groups[g] || 0) + m.groups[g] / 12; }); });
    var dairyFarm = !!(LV.groups.dairy || LV.groups.dyoung);
    var HR = housingResolve(st.housing, k, factors, { followers: dairyFarm ? 'dairy' : 'beef', lambingMonth: so.lambingMonth, ewesIn: so.ewesIn }), HS = HR.housing;
    var gz = {}; CATTLE_G.forEach(function (g) { gz[g] = grazeShare(HS[FP_GROUP_HOUSING[g]], y); });
    var hEst = HR.estimated.filter(function (g) { return CATTLE_G.some(function (x) { return FP_GROUP_HOUSING[x] === g && (LV.groups[x] || 0) > 0; }); });
    if (hEst.length) { var w1 = HR.words(hEst); if (w1) tag(w1); }   /* -440 (UX-52): only the groups the farm has */
    if (HS.ewes && so.ewesIn !== 'yes' && (LV.groups.ewe || 0) > 0) HR.estimates.filter(function (t) { return /ewes come in/.test(t); }).forEach(function (t) { tag(t); });
    /* enteric methane: the UK inventory's own per-head factors (NID 2026 Annex Table A 5.1.8) */
    Object.keys(LV.groups).forEach(function (g) {
      var hd = LV.groups[g]; if (!(hd > 0) || !ENT_F[g]) return; var ef = F(ENT_F[g]);
      add('Livestock digestion', GROUP_LABEL[g] + ', ' + N2(hd, 1) + ' on average', hd, 'head', ef + ' kg CH₄ a head a year (UK inventory)', hd * ef * CH, [ENT_F[g], 'gwp.ar5.ch4'], { group: g });
    });
    if ((LV.groups.calf || 0) > 0) tag('calves: the UK inventory’s calf row (dairy calves under 1 year) is used for every calf; it has no beef-calf row');
    if (LV.lambMonths > 0) { var lf = F('ukinv.enteric.lamb');
      add('Livestock digestion', 'Lambs, ' + N2(LV.lambMonths) + ' lamb-months', LV.lambMonths, 'lamb-months', lf + ' kg CH₄ a lamb place a year (UK inventory)', LV.lambMonths / 12 * lf * CH, ['ukinv.enteric.lamb', 'gwp.ar5.ch4'], { group: 'lamb' }); }

    /* cattle manure: by housing group (sucklers, dairy, followers), the legal N of its classes, out at grass for the share of
       the year not housed, the rest through the store the farmer named (slurry or FYM), then spread */
    var storeOf = function (g, h, dairy) {        /* N losses, EF3 and methane for one housing group's store */
      var sys = h && (h.system === 'slurry' || h.system === 'fym' || h.system === 'both') ? h.system : null, crust = h && /^(crust|none|cover)$/.test(h.crust || '') ? h.crust : null;
      var pct = sys === 'both' ? num(h.slurryPct) : null; if (sys === 'both' && !(pct >= 0 && pct <= 100)) { sys = 'fym'; tag('slurry share of the manure not answered, so it is counted as FYM'); ask('system:' + g); }
      if (!sys) { tag('how the housed manure is kept (' + g + ') not answered, so it is counted as farmyard manure in a heap (slurry would be about 10 times the methane)'); ask('system:' + g); sys = 'fym'; }
      var sh = sys === 'slurry' ? 1 : sys === 'both' ? pct / 100 : 0;
      /* -440 (R9, checked): with these factors a crusted store gives the HIGHEST figure of the three answers (the methane factor is the
         same; a crust adds direct nitrous oxide and keeps more N for spreading), so unanswered is counted as crusted: the cautious case */
      if (sh > 0 && !crust) tag('slurry crust not answered, so counted as crusted, the answer that gives the highest figure (more nitrous oxide; the methane is the same)');
      var cr = crust || 'crust';
      var sl = { fg: cr === 'cover' ? 'ipcc.fracgas_ms.slurry_cover' : cr === 'none' ? 'ipcc.fracgas_ms.slurry_no_crust' : 'ipcc.fracgas_ms.slurry_crust', fl: 'ipcc.fracleach_ms.liquid', ef3: cr === 'none' ? 'ipcc.ef3.slurry_no_crust' : 'ipcc.ef3.slurry_crust', mcf: dairy ? 'ipcc.ch4.dairy_slurry_cool' : 'ipcc.ch4.other_slurry_cool', sp: 'slurry' };
      var so2 = { fg: dairy ? 'ipcc.fracgas_ms.dairy_solid' : 'ipcc.fracgas_ms.other_cattle_solid', fl: 'ipcc.fracleach_ms.solid_any', ef3: 'ipcc.ef3.solid_storage', mcf: dairy ? 'ipcc.ch4.dairy_solid_cool' : 'ipcc.ch4.solid_storage_cool', sp: 'fym' };
      return [[sl, sh], [so2, 1 - sh]].filter(function (x) { return x[1] > 0; });
    };
    var nOut = 0, nIn = 0, vsTot = 0, ch4Tot = 0, n2oStore = 0, n2oSpread = 0, kSpTot = 0, idsS = {}, idsSp = {}, idsM = {};
    ['sucklers', 'dairy', 'followers'].forEach(function (hg) {
      var Ng = 0; Object.keys(cN.byKey).forEach(function (key) { if (excretaGroup(key) === hg) Ng += cN.byKey[key]; });
      var gs = CATTLE_G.filter(function (g) { return FP_GROUP_HOUSING[g] === hg && (LV.groups[g] || 0) > 0; });
      if (!(Ng > 0) && !gs.length) return;
      var h = HS[hg], out = grazeShare(h, y), kG = Ng * out, kH = Ng - kG; nOut += kG; nIn += kH;
      LV.byHousing[hg] = { kgN: Ng, out: out, estimate: !!(h && h.estimate) };
      if (kH > 0 || gs.length) {
        var parts = storeOf(hg, h, hg === 'dairy');
        parts.forEach(function (p) {
          var s0 = p[0], w = p[1], fg = F(s0.fg), fl = F(s0.fl), ef3 = F(s0.ef3), kHp = kH * w, kSp = kHp * (1 - fg - fl), esp = EFsp(s0.sp);
          n2oStore += (kHp * ef3 + kHp * fg * EF4 + kHp * fl * EF5) * G; [s0.fg, s0.fl, s0.ef3].forEach(function (i) { idsS[i] = 1; });
          n2oSpread += (kSp * esp[0] + kSp * (FGM * EF4 + FL * EF5)) * G; kSpTot += kSp; idsSp[esp[1]] = 1;
          gs.forEach(function (g) {      /* volatile solids: head x weight x VS rate x days housed */
            var dairyCow = g === 'dairy', wKg = num(h && h.weightKg), wId = dairyCow ? 'ipcc.liveweight.dairy' : 'ipcc.liveweight.other_cattle';
            /* -447 (audit P2): the weight typed for a suckler group is the cows' weight; bulls in that group keep the IPCC default, said */
            if (g === 'bull' && hg === 'sucklers' && wKg > 0) { wKg = F(wId); idsM[wId] = 1; tag('breeding bulls: the IPCC default weight for Western Europe (the weight you typed is for the cows)'); }
            /* -440 (UX-05, R7): the farmer's own answers first. A typed weight; else, for suckler cows, the size band they answered in setup
               (the legal 500 kg line, SI 2015/668 Sch 1): "500 kg or less" keeps the IPCC default (405 kg, inside the band); "over 500 kg"
               uses 500 kg, the least the answer allows, and says so. Only with neither, the IPCC default, and the words say which. */
            var band = g === 'cow' && hg === 'sucklers' && !(wKg > 0) ? so.size : null;
            if (!(wKg > 0) && band === 'gt500') { wKg = 500; tag('suckler cow weight: you said over 500 kg, so 500 kg, the least your answer allows; type the weight for a closer figure'); ask('weight:' + hg); }
            else if (!(wKg > 0) && band === 'le500') { wKg = F(wId); idsM[wId] = 1; tag('suckler cow weight: you said 500 kg or less, so the IPCC default weight for Western Europe (405 kg), which is inside your answer'); }
            else if (!(wKg > 0)) { wKg = F(wId); idsM[wId] = 1; tag((g === 'cow' && hg === 'sucklers' ? 'suckler cow weight not answered' : 'cattle weight not answered (' + ({ sucklers: 'suckler cows and bulls', dairy: 'dairy cows', followers: 'young and finishing cattle' }[hg] || hg) + ')') + ', so the IPCC default weight for Western Europe (' + (dairyCow ? 600 : 405) + ' kg)'); ask('weight:' + hg); }
            var vsId = dairyCow ? 'ipcc.vs.dairy' : 'ipcc.vs.other_cattle', vs = (LV.groups[g] || 0) * wKg / 1000 * F(vsId) * yearDays(y) * (1 - gz[g]) * w, mcf = F(s0.mcf);
            vsTot += vs; ch4Tot += vs * mcf / 1000; idsM[vsId] = 1; idsM[s0.mcf] = 1;
          });
        });
      }
    });
    if (LV.cattleN > 0) {
      var gC = LV.cattleN > 0 ? nOut / LV.cattleN : 0; LV.grazeCattle = gC;
      add('Manure', 'Cattle dung and urine at grass (' + Math.round(gC * 100) + '% of their N)', nOut, 'kg N', 'EF ' + PRPc + ' + indirect', (nOut * PRPc + nOut * (FGM * EF4 + FL * EF5)) * G, [M.ef_prp_cattle, 'ipcc.fracgasm', 'ipcc.ef4.wet', 'ipcc.fracleach_h', 'ipcc.ef5', 'gwp.ar5.n2o'], { method: M.id });
      if (nIn > 0) {
        add('Manure', 'Cattle manure in store while housed', nIn, 'kg N', 'IPCC 2019 storage losses and EF3 by system', n2oStore, Object.keys(idsS).concat(['ipcc.ef4.wet', 'ipcc.ef5', 'gwp.ar5.n2o']));
        add('Manure', 'Cattle manure spread on the land', kSpTot, 'kg N', (UK ? 'UK inventory spread EF' : 'EF1 other N') + ' + indirect', n2oSpread, Object.keys(idsSp).concat(['ipcc.fracgasm', 'ipcc.ef4.wet', 'ipcc.fracleach_h', 'ipcc.ef5', 'gwp.ar5.n2o']), { method: M.id });
        add('Manure', 'Methane from stored cattle manure', vsTot, 'kg volatile solids', 'IPCC 2019 Table 10.14 by system', ch4Tot * CH, Object.keys(idsM).concat(['gwp.ar5.ch4']));
      }
    }
    /* sheep: at grass, except ewes housed 42 days before lambing when the lambing month is given (UK inventory) */
    if (LV.sheepN > 0) {
      var eweN = 0; Object.keys(sN.byKey).forEach(function (key) { if (/^ewe/.test(key)) eweN += sN.byKey[key]; });
      var eh = HS.ewes, eShare = eh ? (yearDays(y) - grazeShare(eh, y) * yearDays(y)) / yearDays(y) : 0, kEH = eweN * eShare, kSG = LV.sheepN - kEH;
      if (!eh) tag(so.ewesIn === 'no' ? 'sheep counted at grass all year: the ewes lamb outside (your answer)' : 'sheep counted at grass all year: lambing month not answered, so no ewe housing estimate');   /* -447: the reason it is so */
      else tag('ewes housed 42 days before lambing (UK inventory), from your lambing month');
      add('Manure', 'Sheep dung and urine at grass', kSG, 'kg N', 'EF ' + PRPs + ' + indirect', (kSG * PRPs + kSG * (FGM * EF4 + FL * EF5)) * G, [M.ef_prp_sheep, 'ipcc.fracgasm', 'ipcc.ef4.wet', 'ipcc.fracleach_h', 'ipcc.ef5', 'gwp.ar5.n2o'], { method: M.id });
      if (kEH > 0) { var sfg = F('ipcc.fracgas_ms.other_solid'), sfl = F('ipcc.fracleach_ms.solid_any'), sef3 = F('ipcc.ef3.solid_storage'), sp1 = EFsp('fym'), kSS = kEH * (1 - sfg - sfl);
        tag('housed ewe manure: IPCC 2019 "other animals" solid storage row');
        add('Manure', 'Ewe manure while housed before lambing, stored then spread', kEH, 'kg N', 'IPCC 2019 solid storage + spread', ((kEH * sef3 + kEH * sfg * EF4 + kEH * sfl * EF5) + (kSS * sp1[0] + kSS * (FGM * EF4 + FL * EF5))) * G,
            ['ipcc.fracgas_ms.other_solid', 'ipcc.fracleach_ms.solid_any', 'ipcc.ef3.solid_storage', sp1[1], 'ipcc.fracgasm', 'ipcc.ef4.wet', 'ipcc.ef5', 'gwp.ar5.n2o'], { method: M.id }); }
    }
    /* pigs and poultry (batches) and other species (counts): the owner's footprint. A batch on someone else's land stays;
       a count marked not ours (livery) is left out. sys = { fg, fl, ef3, sp } factor ids for the store and the spread. */
    var n2oAll = function (kg, gr, sys) { var fg = F(sys.fg), fl = F(sys.fl), ef3 = F(sys.ef3), sp = EFsp(sys.sp), kGr = kg * gr, kHo = kg * (1 - gr), kSp = kHo * (1 - fg - fl);
      return ((kGr * PRPs + kGr * (FGM * EF4 + FL * EF5)) + (kHo * ef3 + kHo * fg * EF4 + kHo * fl * EF5) + (kSp * sp[0] + kSp * (FGM * EF4 + FL * EF5))) * G; };
    (st.batches || []).forEach(function (b) {
      if (!b) return; var r = batchN(k, Object.assign({}, b, { holding: 'own', occupier: 'us' }), y, law); if (!r || !(r.kgExact > 0)) return;
      var hd = r.averageHead != null ? r.averageHead : r.effectiveHead * (r.daysInYear || 0) / yearDays(y), pig = b.species === 'pig';
      var rs = num(b.rangeShare), gr = b.where === 'field' ? 1 : 0;
      if (b.where === 'range' && !pig) { if (rs !== null && rs >= 0 && rs <= 100) gr = rs > 1 ? rs / 100 : rs; else { tag('free-range hens: share of droppings on the range not answered, so all counted in the house'); ask('range:' + (b.local_id || b.id || '')); } }
      var ent = pig ? hd * F('ipcc.enteric.swine') * CH : 0;
      var mcId = pig ? (/sow|boar|gilt/.test(b.type || '') ? 'ipcc2006.manure_ch4.breeding_pig' : 'ipcc2006.manure_ch4.growing_pig') : ({ broilers: 'ipcc2006.manure_ch4.poultry.broilers', turkeys: 'ipcc2006.manure_ch4.poultry.turkeys', ducks: 'ipcc2006.manure_ch4.poultry.ducks' }[b.type] || 'ipcc2006.manure_ch4.poultry.layers_dry');
      var cr = /^(crust|none|cover)$/.test(b.crust || '') ? b.crust : null; if (pig && !cr) tag('pig slurry crust not answered, so counted as crusted, the answer that gives the highest figure (more nitrous oxide; the methane is the same)');
      var sys = pig ? { fg: cr === 'cover' ? 'ipcc.fracgas_ms.slurry_cover' : cr === 'none' ? 'ipcc.fracgas_ms.slurry_no_crust' : 'ipcc.fracgas_ms.slurry_crust', fl: 'ipcc.fracleach_ms.liquid', ef3: cr === 'none' ? 'ipcc.ef3.slurry_no_crust' : 'ipcc.ef3.slurry_crust', sp: 'slurry' }
                    : { fg: 'ipcc.fracgas_ms.poultry_litter', fl: 'ipcc.fracleach_ms.liquid', ef3: 'ipcc.ef3.poultry', sp: 'poultry' };
      var lab = (pig ? 'Pigs' : 'Poultry') + (b.name ? ' (' + str(b.name, 60) + ')' : '') + ', ' + N2(hd) + ' on average';
      if (ent) add('Livestock digestion', lab, hd, 'head', F('ipcc.enteric.swine') + ' kg CH₄ a head a year', ent, ['ipcc.enteric.swine', 'gwp.ar5.ch4']);
      add('Manure', lab + ': manure methane', hd, 'head', F(mcId) + ' kg CH₄ a head a year', hd * F(mcId) * (1 - gr) * CH, [mcId, 'gwp.ar5.ch4']);
      add('Manure', lab + ': manure nitrous oxide', r.kgExact, 'kg N', 'IPCC 2019 store by system, then spread', n2oAll(r.kgExact, gr, sys), [sys.fg, sys.ef3, 'gwp.ar5.n2o'], { method: M.id });
    });
    var CNT = { horse: ['ipcc.enteric.horse', 'ipcc2006.manure_ch4.horse', 'housing.share.horse'], donkey: ['ipcc.enteric.horse', 'ipcc2006.manure_ch4.horse', 'housing.share.horse'], pony: ['ipcc.enteric.horse', 'ipcc2006.manure_ch4.horse', 'housing.share.horse'],
                goat: ['ipcc.enteric.goat_high_prod', 'ipcc2006.manure_ch4.goat', 'housing.share.goat'], deer: ['ipcc.enteric.deer', 'ipcc2006.manure_ch4.deer', 'housing.share.deer'],
                alpaca: ['ipcc.enteric.llama_alpaca', 'est.manure_ch4.alpaca_llama', null], llama: ['ipcc.enteric.llama_alpaca', 'est.manure_ch4.alpaca_llama', null] };
    var OTHER_SYS = { fg: 'ipcc.fracgas_ms.other_solid', fl: 'ipcc.fracleach_ms.solid_any', ef3: 'ipcc.ef3.solid_storage', sp: 'fym' };
    (st.counts || []).forEach(function (c) {
      if (!c || c.ownership === 'notours') return; var r = countN(k, Object.assign({}, c, { occupier: 'us' }), law, factors), sp = String(c.species || '').toLowerCase(), ids = CNT[sp]; if (!ids) return;
      if (r && r.ask) { ask(r.ask); notC.push(r.why); return; } if (!r) return;
      var hd = r.head, hm = num(c.housedMonths), housed = null, hIds = [];
      if (hm !== null && hm >= 0 && hm <= 12) housed = hm / 12;
      else if (ids[2]) { housed = F(ids[2]); hIds.push(ids[2]); tag(sp + 's: months housed not answered, so the UK ammonia inventory’s share (' + Math.round(housed * 100) + '% of the year housed)'); ask('housed:' + sp); }
      else { housed = 0; tag(sp + 's: months housed not answered and no published share, so counted at grass all year'); ask('housed:' + sp); }
      var gr = 1 - housed, lab = sp.charAt(0).toUpperCase() + sp.slice(1) + 's, ' + N2(hd);
      add('Livestock digestion', lab, hd, 'head', F(ids[0]) + ' kg CH₄ a head a year', hd * F(ids[0]) * CH, [ids[0], 'gwp.ar5.ch4']);
      add('Manure', lab + ': manure', r.kg, 'kg N', 'IPCC 2019', hd * F(ids[1]) * (1 - gr) * CH + n2oAll(r.kg, gr, OTHER_SYS), [ids[1], OTHER_SYS.fg, OTHER_SYS.ef3, 'gwp.ar5.n2o'].concat(hIds));
    });
    /* fuel */
    var fuelL = {};
    (inp.fuel || []).forEach(function (x) { var l = num(x && x.litres); if (l === null || l <= 0) return; var fu = FUEL_F[x.fuel] ? x.fuel : 'gas_oil'; if (!FUEL_F[x.fuel] || x.assumed) tag('diesel with no type on the bill taken as red diesel (gas oil)'); fuelL[fu] = (fuelL[fu] || 0) + l; });
    Object.keys(fuelL).forEach(function (fu) { var f = F(FUEL_F[fu]); add(fu === 'gas_oil' || fu === 'diesel' ? 'Diesel' : 'Other fuel', FUEL_LABEL[fu], fuelL[fu], 'litres', f + ' kg CO₂e a litre', fuelL[fu] * f / 1000, [FUEL_F[fu]]); });
    if (!Object.keys(fuelL).length) miss.push('fuel: no litres on fuel bills or in the fuel log this year');

    /* electricity bought from the grid (the bills' kWh); solar used on the farm is not bought, so it adds nothing */
    var el = inp.electricity || {}, kwh = num(el.kwh), gF = F('elec.uk.generation_kgco2e_per_kwh');
    if (kwh !== null && kwh > 0) add('Electricity', 'Electricity bought, from your bills', kwh, 'kWh', gF + ' kg CO₂e a kWh', kwh * gF / 1000, ['elec.uk.generation_kgco2e_per_kwh']);
    if (num(el.billsNoKwh) > 0) miss.push('electricity: ' + el.billsNoKwh + ' bill' + (el.billsNoKwh === 1 ? '' : 's') + ' without the kWh');
    else if (!(kwh > 0)) miss.push('electricity: no bills with kWh this year');
    var so = inp.solar || {}, gen = Math.max(0, num(so.generatedKwh) || 0), exp = Math.max(0, Math.min(gen, num(so.exportedKwh) || 0)), usedS = gen - exp;
    var energy = { gridKwh: kwh > 0 ? kwh : 0, solarKwh: gen, exportKwh: exp, solarUsedKwh: usedS, solarShare: (usedS + (kwh > 0 ? kwh : 0)) > 0 ? usedS / (usedS + (kwh > 0 ? kwh : 0)) : null, fuel: fuelL };

    /* lime */
    var limeT = { limestone: 0, dolomite: 0 };
    (inp.lime || []).forEach(function (x) { var t = num(x && x.tonnes); if (t === null || t <= 0) return; limeT[x.kind === 'dolomite' ? 'dolomite' : 'limestone'] += t; });
    if (limeT.limestone) { var lc = F('ipcc.lime.limestone_ef_c'); add('Lime', 'Ground limestone', limeT.limestone, 't', N2(lc * C_CO2, 2) + ' t CO₂ a tonne', limeT.limestone * lc * C_CO2, ['ipcc.lime.limestone_ef_c']); }
    if (limeT.dolomite) { var dc = F('ipcc.lime.dolomite_ef_c'); add('Lime', 'Magnesian limestone (dolomite)', limeT.dolomite, 't', N2(dc * C_CO2, 2) + ' t CO₂ a tonne', limeT.dolomite * dc * C_CO2, ['ipcc.lime.dolomite_ef_c']); }

    /* bought feed: counted only where the factor table has a checked figure; otherwise listed as not counted */
    var feedT = 0; (inp.feed || []).forEach(function (x) {
      var t = num(x && x.tonnes); if (t === null || t <= 0) return; feedT += t;
      var id = x.kind === 'soya' ? 'feed.soya_meal' : 'feed.compound_feed', f = fac(factors, id), v = f ? num(f.value) : null;
      if (v === null) { notC.push((x.label || 'Bought feed') + ', ' + N2(t, 1) + ' t: no checked factor yet'); return; }
      add('Bought feed', x.label || 'Bought feed', t, 't', v + ' kg CO₂e a tonne', t * v / 1000, [id]);
    });

    var total = 0; Object.keys(src).forEach(function (s) { total += src[s]; });
    var srcStatus = {}; rows.forEach(function (r) { srcStatus[r.src] = srcStatus[r.src] === 'estimate' || r.status === 'estimate' || r.estimate ? 'estimate' : 'verified'; });
    return { year: y, nation: k, total: total, src: src, srcStatus: srcStatus, rows: rows, estimates: est, missing: miss, notCounted: notC,
             method: { id: M.id, label: M.label, short: M.short, status: M.status, source: M.source, note: M.note }, used: used, energy: energy, livestock: LV, asks: asks,
             fertiliserKgN: fN, feedTonnes: feedT, factor_set: (factors.id && factors.version) ? factors.id + '-' + factors.version : null, law_set: lawSet(law),
             scope: 'Our own stock wherever it is (stock away included, other people’s stock on our land left out), fertiliser spread, fuel, bought electricity, lime and bought feed where a checked factor exists. Not yet: seed, sprays, crop residues, grain drying, contractors’ fuel. Removals by hedges, woods and soil are shown apart and never subtracted.' };
  }
  function N2(x, dp) { var p = Math.pow(10, dp || 0); return String(Math.round(x * p) / p); }

  /* Water from the meter readings Crops already holds (cumulative m3, any order). The year's use apportions each gap
     between two readings by days; a reading lower than the one before (a new meter) is not counted and is flagged.
     inp: { readings:[{date, m3}], year, authorisedM3, nation }  law: nations.X.abstraction */
  function waterUse(inp, law) {
    inp = inp || {}; var y = num(inp.year), k = nationKey(inp.nation), A = k && law && law.nations && law.nations[k] ? law.nations[k].abstraction : null;
    var rs = (inp.readings || []).filter(function (r) { return r && isoOk(r.date) && num(r.m3) !== null && num(r.m3) >= 0; }).map(function (r) { return { date: r.date, m3: num(r.m3) }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var used = 0, peak = 0, resets = 0, gaps = 0, s = y + '-01-01', e = y + '-12-31';
    for (var i = 1; i < rs.length; i++) {
      var a = rs[i - 1], b = rs[i], d = b.m3 - a.m3, days = daysBetween(a.date, b.date); if (days <= 0) continue;
      if (d < 0) { resets++; continue; }
      peak = Math.max(peak, d / days);
      var lo = a.date > s ? a.date : s, hi = b.date < e ? b.date : e, part = hi > lo ? daysBetween(lo, hi) : 0; if (part > 0) { used += d * part / days; gaps++; }
    }
    var auth = num(inp.authorisedM3), inYear = rs.filter(function (r) { return r.date >= s && r.date <= e; }).length;
    var rule = A ? { licenceOver: A.licence_over ? A.licence_over.value : null, notifyOver: A.notify_over ? A.notify_over.value : null, label: A.licence_over ? A.licence_over.label : null, notifyLabel: A.notify_over ? A.notify_over.label : null, cite: cite(A.licence_over), status: A.licence_over ? A.licence_over.status : null } : null;
    return { year: y, m3: rs.length >= 2 ? used : null, readings: rs.length, readingsInYear: inYear, peakPerDay: rs.length >= 2 ? peak : null, resets: resets,
             authorisedM3: auth > 0 ? auth : null, share: auth > 0 && rs.length >= 2 ? used / auth : null, rule: rule,
             overLicenceLine: rule && rule.licenceOver != null && peak > rule.licenceOver };
  }

  /* Nature: hedges by length, woodland, ponds, margins and other habitat by area, each linked to a field. */
  var HAB_KINDS = { hedge: 'Hedges', woodland: 'Woodland', pond: 'Ponds and wet ground', margin: 'Field margins and buffer strips', other: 'Other habitat' };
  function habitatSummary(list, farmHa) {
    var by = {}, area = 0, hedgeM = 0, n = 0;
    (list || []).forEach(function (h) {
      if (!h || h.removed || !HAB_KINDS[h.kind]) return;
      if (h.kind === 'hedge') { var m = num(h.length_m); if (m === null || m <= 0) return; hedgeM += m; n++; (by.hedge = by.hedge || { m: 0, n: 0 }).m += m; by.hedge.n++; return; }
      var a = num(h.area_ha); if (a === null || a <= 0) return; area += a; n++; (by[h.kind] = by[h.kind] || { ha: 0, n: 0 }).ha += a; by[h.kind].n++;
    });
    var fh = num(farmHa);
    /* -447 (audit P2): habitat larger than the farm is a wrong figure somewhere (the area or the farm size): never over 100%, and said */
    var pc = fh > 0 ? area / fh * 100 : null, overFarm = pc !== null && pc > 100;
    return { features: n, areaHa: area, hedgeM: hedgeM, byKind: by, kinds: HAB_KINDS, pct: overFarm ? 100 : pc, overFarm: overFarm, why: overFarm ? 'the habitat recorded (' + r2(area) + ' ha) is more than the farm (' + r2(fh) + ' ha): check the areas or the farm size' : null };
  }

  /* -439-sus6 (owner decision "habitats" a): a dated history, so progress since the baseline is real. Each habitat keeps
     history:[{ on:'YYYY-MM-DD', length_m, area_ha, removed }] (one entry per change, the farmer's date). The state on a day is
     the latest entry on or before it; a habitat with no history counts from its added date (added_on), or always if none.
     out: { at: { day: summary } , change: { areaHa, hedgeM } between the first and last day, dated: true when every habitat has a dated start } */
  function habitatAt(h, day) {
    /* -445 (decision 4): "Not sure" if it was there before is read as already there: no gain is ever claimed for it */
    if (Array.isArray(h.history) && h.history.some(function (x) { return x && x.unsure === true; })) { var lu = h.history.filter(function (x) { return x && isoOk(x.on) && x.on <= day; }).sort(function (a, b) { return a.on < b.on ? -1 : 1; }).pop() || h.history[0]; return lu.removed ? null : { kind: h.kind, length_m: lu.length_m != null ? lu.length_m : h.length_m, area_ha: lu.area_ha != null ? lu.area_ha : h.area_ha }; }
    var hs = Array.isArray(h.history) ? h.history.filter(function (x) { return x && isoOk(x.on) && x.on <= day; }).sort(function (a, b) { return a.on < b.on ? -1 : 1; }) : [];
    if (hs.length) { var l = hs[hs.length - 1]; return l.removed ? null : { kind: h.kind, length_m: l.length_m != null ? l.length_m : h.length_m, area_ha: l.area_ha != null ? l.area_ha : h.area_ha }; }
    if (Array.isArray(h.history) && h.history.some(function (x) { return x && isoOk(x.on); })) return null;   /* every dated entry is after the day: not there yet */
    if (isoOk(h.added_on) && h.added_on > day) return null;
    return h.removed ? null : h;
  }
  function habitatHistory(list, farmHa, days) {
    var at = {}, dated = true;
    (list || []).forEach(function (h) { if (h && !(isoOk(h.added_on) || (Array.isArray(h.history) && h.history.some(function (x) { return x && isoOk(x.on); })))) dated = false; });
    (days || []).forEach(function (d) { if (!isoOk(d)) return; at[d] = habitatSummary((list || []).map(function (h) { return h ? habitatAt(h, d) : null; }).filter(Boolean), farmHa); });
    var ks = Object.keys(at).sort(), a = ks.length ? at[ks[0]] : null, b = ks.length ? at[ks[ks.length - 1]] : null;
    return { at: at, dated: dated, change: a && b ? { areaHa: r2(b.areaHa - a.areaHa), hedgeM: Math.round(b.hedgeM - a.hedgeM), features: b.features - a.features } : null };
  }

  /* Targets: progress in words against a straight line from the baseline year to the target year. Nothing is pre-set.
     inp: { label, unit, dp (decimals in the words, default 1, as the screen shows the figure), lowerIsBetter, base, baseYear, now, nowYear, target, byYear } */
  function targetProgress(inp) {
    inp = inp || {}; var b = num(inp.base), n = num(inp.now), t = num(inp.target), by = num(inp.baseYear), ty = num(inp.byYear), ny = num(inp.nowYear), lo = inp.lowerIsBetter !== false;
    var u = inp.unit || '', dp = num(inp.dp) !== null && inp.dp >= 0 && inp.dp <= 3 ? inp.dp : 1, f = function (v) { var p = Math.pow(10, dp); return (Math.round(v * p) / p).toLocaleString('en-GB') + u; };
    if (t === null) return { status: 'none', word: 'No target', words: 'No target set.' };
    if (b === null || n === null || !by || !ty || ty <= by) return { status: 'nodata', word: 'Missing', words: 'Target ' + f(t) + (ty ? ' by ' + ty : '') + '. ' + (b === null ? 'No figure for the baseline year ' + (by || '') + ' yet.' : 'No figure for ' + (ny || 'this year') + ' yet.') };
    /* -440 (UX-40): in the baseline year itself there is no progress to show yet */
    if (ny && ny <= by) return { status: 'set', word: 'Baseline set', words: 'Baseline ' + by + ': ' + f(b) + '. Target ' + f(t) + ' by ' + ty + '. Progress shows from next year.', expectedNow: b, changePct: null };
    var met = lo ? n <= t : n >= t;
    var frac = Math.max(0, Math.min(1, (ny - by) / (ty - by))), expect = b + (t - b) * frac;
    var on = lo ? n <= expect + 1e-9 : n >= expect - 1e-9;
    var ch = b ? (n - b) / Math.abs(b) * 100 : null, chw = ch === null ? '' : (Math.abs(ch) < 0.5 ? 'about the same as' : (Math.round(Math.abs(ch)) + '% ' + (ch < 0 ? 'lower than' : 'higher than')));
    var words = 'Now ' + f(n) + ', ' + (chw ? chw + ' the baseline ' + by + ' (' + f(b) + ')' : 'baseline ' + by + ' ' + f(b)) + '. Target ' + f(t) + ' by ' + ty + '. ';
    if (met) words += 'The target is met already.';
    else words += (on ? 'On track: ' : 'Behind: ') + 'a straight line to the target would be about ' + f(expect) + ' by ' + ny + '.';
    return { status: met ? 'met' : on ? 'on' : 'behind', word: met ? 'Met' : on ? 'On track' : 'Behind', words: words, expectedNow: expect, changePct: ch };
  }

  /* ══ Phase 5: Who's asking (PREBUILD-CHECK-V53 §9 row 5, §4.1 "Phase 5", §7, §8 B10) ════════════════════════════
     Pure functions: detection from the ledger with its evidence, the send guard, the preview hash and the calculator
     inputs in each tool's order. The library (who asks for what, each claim with a dated source or "example") is data:
     data/sus-askers-uk-2026.1.json. Nothing here sends anything. */

  /* SHA-256 of a string (UTF-8), hex. Synchronous so the preview, the confirm and the log all use the one function. */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function utf8(str) { var s = String(str == null ? '' : str), out = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    return out; }
  function sha256(str) {
    var b = utf8(str), l = b.length, H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64), i, j;
    b.push(0x80); while (b.length % 64 !== 56) b.push(0);
    var hi = Math.floor(l / 0x20000000), lo = (l * 8) >>> 0; b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var ror = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (i = 0; i < b.length; i += 64) {
      for (j = 0; j < 16; j++) w[j] = ((b[i + j * 4] << 24) | (b[i + j * 4 + 1] << 16) | (b[i + j * 4 + 2] << 8) | b[i + j * 4 + 3]) >>> 0;
      for (j = 16; j < 64; j++) { var s0 = ror(w[j - 15], 7) ^ ror(w[j - 15], 18) ^ (w[j - 15] >>> 3), s1 = ror(w[j - 2], 17) ^ ror(w[j - 2], 19) ^ (w[j - 2] >>> 10); w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0; }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) { var S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[j] + w[j]) >>> 0, S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0; }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + bb) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ('0000000' + x.toString(16)).slice(-8); }).join('');
  }
  /* one canonical text for a payload: keys sorted at every level, so the same records always give the same hash */
  function canonical(o) {
    if (o === null || typeof o !== 'object') return (typeof o === 'number' && !isFinite(o)) ? 'null' : JSON.stringify(o === undefined ? null : o);
    if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
    return '{' + Object.keys(o).filter(function (k) { return o[k] !== undefined && typeof o[k] !== 'function'; }).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(o[k]); }).join(',') + '}';
  }
  function previewHash(payload) { return sha256(canonical(payload)); }

  /* who is likely asking, from the ledger (bank lines, typed income and costs) and the loans - always with the evidence.
     inp: { lines:[{date ISO, desc, amt, type:'income'|'expense', cat}], loans:[{lender, what}], today ISO, nation, months }
     lib: the askers file. An asker with no match pattern (the regulators) is never detected here: it comes from the profile.
     Nothing is guessed: no line and no loan that names them, no suggestion. */
  var MON3F = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dWords(s) { return isoOk(s) ? (+s.slice(8, 10)) + ' ' + MON3F[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4) : ''; }
  function gbpWords(x) { var v = Math.round(Math.abs(Number(x) || 0)); return '£' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function isoReal(s) { if (!isoOk(s)) return false; var d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); return d.getUTCDate() === +s.slice(8, 10) && d.getUTCMonth() === +s.slice(5, 7) - 1; }
  function askDetect(inp, lib) {
    inp = inp || {}; var out = [], today = isoOk(inp.today) ? inp.today : null; if (!today || !lib || !Array.isArray(lib.askers)) return out;
    var months = num(inp.months) > 0 && num(inp.months) <= 120 ? Math.round(num(inp.months)) : 24, from = addDays(today, -Math.round(months * 30.44));
    var lines = (Array.isArray(inp.lines) ? inp.lines : []).filter(function (t) { return t && isoReal(t.date) && t.date <= today && t.date >= from && num(t.amt) !== null && num(t.amt) !== 0 && (t.type === 'income' || t.type === 'expense') && typeof t.desc === 'string' && t.desc.trim(); });
    var loans = (Array.isArray(inp.loans) ? inp.loans : []).filter(function (x) { return x && typeof x.lender === 'string' && x.lender.trim(); });
    lib.askers.forEach(function (a) {
      var m = a && a.match; if (!m || !Array.isArray(m.words) || !m.words.length) return;
      if (Array.isArray(a.nations) && a.nations.length && a.nations.indexOf(inp.nation) < 0) return;
      var re; try { re = new RegExp(m.words.join('|'), 'i'); } catch (er) { return; }
      var hit = lines.filter(function (t) { return (!m.type || m.type === 'any' || t.type === m.type) && (re.test(t.desc) || (Array.isArray(m.cats) && m.cats.indexOf(t.cat) >= 0 && m.catAlone === true)); })
        .sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
      var ln = m.loans ? loans.filter(function (x) { return re.test(x.lender); }) : [];
      if (!hit.length && !ln.length) return;
      var tot = 0; hit.forEach(function (t) { tot += Math.abs(num(t.amt)); });
      var L = hit[0] || null, verb = a.kind === 'buyer' ? 'You sold to ' + a.name : (L && L.type === 'income') ? a.name + ' paid you' : 'You paid ' + a.name;
      var txt = L ? verb + ' on ' + dWords(L.date) + ', ' + gbpWords(L.amt) + (hit.length > 1 ? ' (' + hit.length + ' payments since ' + dWords(hit[hit.length - 1].date) + ', ' + gbpWords(tot) + ' in all)' : '') : '';
      if (ln.length) txt += (txt ? '. ' : '') + 'Your loan' + (ln.length > 1 ? 's' : '') + ' from ' + ln[0].lender.trim() + ' in Loans' + (ln[0].what ? ' (' + String(ln[0].what).slice(0, 60) + (ln.length > 1 ? ' and ' + (ln.length - 1) + ' more' : '') + ')' : '');
      out.push({ id: a.id, name: a.name, kind: a.kind, count: hit.length, total: Math.round(tot * 100) / 100, first: hit.length ? hit[hit.length - 1].date : null,
                 last: L ? { date: L.date, amt: Math.abs(num(L.amt)), desc: L.desc.slice(0, 80) } : null, loans: ln.length, evidence: txt });
    });
    var ord = { law: 0, scheme: 1, buyer: 2, assurance: 3, bank: 4 };
    return out.sort(function (x, y) { return ((ord[x.kind] || 9) - (ord[y.kind] || 9)) || ((y.last ? y.last.date : '') < (x.last ? x.last.date : '') ? -1 : 1); });
  }

  /* may anything go to this asker now? Every send is checked here at the moment it would leave, after the farmer's
     confirm: a withdrawal (or a removal) made after the preview still stops it. */
  function canSend(asker, consents) {
    if (!asker || !asker.id) return { ok: false, why: 'unknown', words: 'Choose who it goes to.' };
    if (asker.state === 'no' || asker.removed) return { ok: false, why: 'removed', words: 'They are not on your list.' };
    if (asker.state !== 'yes' && asker.src !== 'profile') return { ok: false, why: 'unconfirmed', words: 'Confirm them first: nothing goes to someone you have not added.' };
    if (asker.withdrawnAt) return { ok: false, why: 'withdrawn', since: asker.withdrawnAt, words: 'You stopped sharing with ' + (asker.name || 'them') + ' on ' + (dWords(String(asker.withdrawnAt).slice(0, 10)) || 'an earlier date') + '. Nothing more goes to them unless you allow it again.' };
    var w = (Array.isArray(consents) ? consents : []).filter(function (c) { return c && c.recipientId === asker.id && c.withdrawnAt && (!asker.allowedAgainAt || String(c.withdrawnAt) > String(asker.allowedAgainAt)); })[0];
    if (w) return { ok: false, why: 'withdrawn', since: w.withdrawnAt, words: 'You stopped sharing with ' + (asker.name || 'them') + ' on ' + (dWords(String(w.withdrawnAt).slice(0, 10)) || 'an earlier date') + '.' };
    return { ok: true };
  }

  /* calculator inputs in the tool's own order. rec: { key: { value, unit, from, status:'records'|'part'|'estimate'|'missing' } }.
     These are the farm's records as inputs, never our footprint figure: a footprint key is refused. */
  var NOT_INPUTS = /^(footprint|carbon|co2e|emissions)/i;
  function exportInputs(tool, rec, lib) {
    var X = lib && lib.exports && lib.exports[tool]; if (!X || !Array.isArray(X.order)) return null; rec = rec || {};
    var rows = X.order.filter(function (o) { return o && o.key && !NOT_INPUTS.test(o.key); }).map(function (o, i) {
      var r = rec[o.key] || null, st = r && ['records', 'part', 'estimate', 'missing'].indexOf(r.status) >= 0 ? r.status : 'missing';
      var v = r && r.value != null && r.value !== '' && !(typeof r.value === 'number' && !isFinite(r.value)) ? r.value : '';
      if (v === '') st = 'missing';
      return { n: i + 1, section: o.section || '', key: o.key, label: o.label, value: v, unit: v === '' ? '' : (r.unit || o.unit || ''), from: v === '' ? 'Not in your records yet' : (r.from || ''), status: st };
    });
    var c = { records: 0, part: 0, estimate: 0, missing: 0 }; rows.forEach(function (r) { c[r.status]++; });
    return { tool: tool, label: X.label, note: 'Your records as inputs for ' + X.label + ', in its input order. This is not our footprint figure: ' + X.label + ' works out its own.',
             orderStatus: X.status || 'example', orderSource: X.source || '', rows: rows, counts: c };
  }
  var EXPORT_COLS = ['Order', 'Section', 'Input', 'Value', 'Unit', 'From your records', 'Status'];
  function exportCsvRows(x) { var W2 = { records: 'From your records', part: 'Part in your records', estimate: 'Estimate', missing: 'Not in your records yet' };
    return x ? x.rows.map(function (r) { return [r.n, r.section, r.label, r.value, r.unit, r.from, W2[r.status]]; }) : []; }

  return {
    VERSION: VERSION, nationKey: nationKey, nvzStatus: nvzStatus,
    bands: bands, classKey: classKey, rate: rate, monthlyClasses: monthlyClasses, averageClasses: averageClasses,
    manureN: manureN, niBatchN: niBatchN, countsOnHolding: countsOnHolding,
    storageRule: storageRule, storeForecast: storeForecast, sheepReturn: sheepReturn,
    /* Phase 1 and 1b */
    herdKind: herdKind, herdPrimary: function (type) { return KIND_PRIMARY[herdKind(type)] || null; }, stockRecords: stockRecords, headOn: headOn, batchN: batchN, countN: countN, manureMoveN: manureMoveN,
    yearManure: yearManure, slurryInflow: slurryInflow, housedDays: housedDays, closedSpread: closedSpread, storePlan: storePlan,
    sheepReturnPrefill: sheepReturnPrefill, parseRegisterCsv: parseRegisterCsv, registerCompare: registerCompare, registerOpen: registerOpen, carryAnswers: carryAnswers, tagKey: tagKey, parseDate: parseDate, legalJobs: legalJobs, inputsHash: inputsHash,
    /* Phase 2 */
    cropKey: cropKey, closedCropKind: closedCropKind, nmax: nmax, closedPeriodHit: closedPeriodHit, inputN: inputN, fieldOrganicN: fieldOrganicN, nPlan: nPlan, ureaCheck: ureaCheck,
    soilDue: soilDue, nvzRecords: nvzRecords, nvzCsvRows: nvzCsvRows, nitrogenJobs: nitrogenJobs, NVZ_COLS: NVZ_COLS,
    /* Phase 4 */
    footprint: footprint, stockGroups: stockGroups, grazeShare: grazeShare, n2oMethod: n2oMethod, waterUse: waterUse, habitatSummary: habitatSummary, targetProgress: targetProgress, HAB_KINDS: HAB_KINDS,
    /* -439-sus6 */
    /* -442 */
    recordLate: recordLate, scotZone: scotZone,
    housingResolve: housingResolve, housingDefault: housingDefault, wetYearRain: wetYearRain, ukEf1: ukEf1, habitatHistory: habitatHistory,
    /* Phase 5 */
    sha256: sha256, canonical: canonical, previewHash: previewHash, askDetect: askDetect, canSend: canSend, exportInputs: exportInputs, exportCsvRows: exportCsvRows, EXPORT_COLS: EXPORT_COLS,
    jobState: jobState, JOB_ACTS: JOB_ACTS,
    _util: { addDays: addDays, daysBetween: daysBetween, isoOk: isoOk, ageAt: ageAt, yearFrom: yearFrom }
  };
}));
