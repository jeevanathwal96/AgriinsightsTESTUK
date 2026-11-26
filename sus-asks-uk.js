/* sus-asks-uk.js - Sustainability Phase 5, UK desktop (PREBUILD-CHECK-V53 §9 row 5, §4.1 "Phase 5", §7, §8 B10): Who's asking.
 * Detection of likely askers from the ledger and the loans, always with the evidence; the library of what each asks for
 * (data/sus-askers-uk-2026.1.json, every claim with a dated source or "Example: to confirm"); packs built from the Phase 1, 2
 * and 4 figures; Send with a preview and an in-page confirm; the share_consents log; withdraw; "ask them to delete"; and the
 * calculator inputs in the Agrecalc, Cool Farm Tool, Farm Carbon Toolkit and Arla order (inputs, never our figure).
 *
 * Behind SUS_FLAGS.pilot like the rest of Sustainability; nothing here runs or shows with the flag off.
 * The rules this file keeps:
 *   - Nothing leaves without the farmer seeing exactly what goes (the preview) and saying yes (the confirm). Nothing is
 *     pre-ticked: not a suggestion, not a record, not a format.
 *   - The preview hash is SHA-256 of the canonical payload (engine previewHash). At the confirm the payload is built again
 *     from the records: if it differs from the preview, nothing goes and the farmer sees the preview again. The log row
 *     carries the preview's hash and the pack released is the previewed payload itself.
 *   - The send guard (engine canSend) runs at the moment of release: a withdrawal made after the preview still stops it.
 *   - Sending from the app is not switched on: there is no UK mail sender. After the confirm the pack opens in the report
 *     viewer (lsShowReport) to save as PDF or CSV, and the farmer sends it. The log says channel 'download'.
 *     tools/uk-sus5-send-share/index.ts is the server sender for later, NOT DEPLOYED.
 *   - One figure everywhere: every pack line comes from susCompute() through the same words and tiles the page shows.
 */
(function (W) {
  'use strict';
  var EN = function () { return W.SusEngineUK || null; };
  var LIB = function () { return W.SUS_ASKERS || null; };
  var A = function () { return W._susApi || null; };
  var NAT = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };
  var KIND = { law: 'By law', scheme: 'Scheme', buyer: 'Buyer', assurance: 'Standard', bank: 'Bank' };
  var GROUPS = [['law', 'The law', 'From your farm profile'], ['scheme', 'Payment schemes', 'Found in your payments'], ['buyer', 'Buyers and standards', 'Found in your sales and fees'], ['bank', 'Banks', 'Found in your loans and payments']];
  var FMT = { pdf: 'PDF to print or save', csv: 'CSV (the figures as a table)', both: 'PDF and CSV' };
  function on() { return !!(W.SUS_FLAGS && W.SUS_FLAGS.pilot); }
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function N(x, dp) { var v = Number(x); if (!isFinite(v)) return ''; return v.toLocaleString('en-GB', { maximumFractionDigits: dp == null ? 0 : dp, minimumFractionDigits: 0 }); }
  function D(x) { try { return x ? (typeof W.dispDate === 'function' ? W.dispDate(String(x).slice(0, 10)) : String(x).slice(0, 10)) : ''; } catch (er) { return x || ''; } }
  function pl(n, one, many) { n = Math.round(Number(n) || 0); return N(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pill(st) { return '<span class="sus-st ' + st[0] + '">' + e(st[1]) + '</span>'; }
  function txnIso(d) { try { if (typeof W.aiTxnISO === 'function') return W.aiTxnISO(d) || ''; } catch (er) {} var t = Date.parse(d); return isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10); }
  function code(h) { return h ? String(h).slice(0, 4) + ' ' + String(h).slice(4, 8) + ' ' + String(h).slice(8, 12) : ''; }
  var _ui = { ov: null, uid: null };

  /* ── state: the farmer's answers in settings.asks (sus_settings.asks, uk-sus5), the log in ST_SUS.consents (share_consents) ── */
  function S() { return A() ? A().S() : null; }
  /* items(true) makes the place to write; a read never adds anything to settings (a fresh farm stays empty) */
  function items(write) { var st = A().set(); if (!write) return (st.asks && st.asks.items && typeof st.asks.items === 'object') ? st.asks.items : {};
    if (!st.asks || typeof st.asks !== 'object') st.asks = {}; if (!st.asks.items || typeof st.asks.items !== 'object') st.asks.items = {}; return st.asks.items; }
  function consents() { var s = S(); return s && Array.isArray(s.consents) ? s.consents : []; }
  function lib(id) { var L = LIB(); return L ? L.askers.filter(function (a) { return a.id === id; })[0] || null : null; }

  /* ── detection: the ledger lines and the loans (Money and Loans own them) ── */
  var _det = { key: null, val: [] };
  function ledger() {
    return ((W.ST && W.ST.txns) || []).map(function (t) { if (!t) return null; var d = txnIso(t.date); if (!d) return null;
      return { date: d, desc: [t.desc, t.party, t.payee, t.supplier].filter(Boolean).join(' ').slice(0, 200), amt: Number(t.amt), type: t.type, cat: t.cat || '' }; }).filter(Boolean);
  }
  function loans() {
    var out = []; ((W.ST_LOANS && W.ST_LOANS.loans) || []).forEach(function (l) { if (l && l.lender) out.push({ lender: String(l.lender), what: l.name || l.type || '' }); });
    /* a financed machine with its own loan in Loans is the same loan: counted once */
    var linked = {}; ((W.ST_LOANS && W.ST_LOANS.loans) || []).forEach(function (l) { if (l && l.assetId != null) linked[String(l.assetId)] = 1; });
    ((W.ST_ASSETS && W.ST_ASSETS.assets) || []).forEach(function (a) { if (a && a.financed && a.lender && !linked[String(a.id)]) out.push({ lender: String(a.lender), what: a.name || '' }); });
    return out;
  }
  function detect(c) {
    var L = LIB(), E = EN(); if (!L || !E || !c) return [];
    var lines = ledger(), ln = loans(), key = c.today + '|' + c.nation + '|' + lines.length + '|' + ln.length + '|' + (lines.length ? lines[lines.length - 1].date + lines[lines.length - 1].amt : '');
    if (_det.key === key) return _det.val;
    _det = { key: key, val: E.askDetect({ lines: lines, loans: ln, today: c.today, nation: c.nation, months: 24 }, L) };
    return _det.val;
  }
  function nvzWords(c) { var v = c.nvz ? c.nvz.inNvz : null; return v === true ? 'in a Nitrate Vulnerable Zone (Rainfall)' : v === false ? 'not in a Nitrate Vulnerable Zone (Rainfall)' : 'NVZ not answered yet (Rainfall)'; }
  /* everyone asking: the regulator from the profile, then the ones the farmer said yes to, with the evidence */
  function askers(c) {
    var L = LIB(); if (!L) return { list: [], sugg: [] }; _c = c;
    var it = items(), det = detect(c), byDet = {}; det.forEach(function (d) { byDet[d.id] = d; });
    var list = [];
    L.askers.forEach(function (a) {
      if (a.kind === 'law') { if (a.profile && (a.nations || []).indexOf(c.nation) >= 0) list.push(row(a, Object.assign({ state: 'yes', src: 'profile' }, it[a.id] || {}), 'Your farm is in ' + NAT[c.nation] + ' (Settings) and ' + nvzWords(c) + '.')); return; }
      var x = it[a.id]; if (!x || x.state !== 'yes') return;
      var d = byDet[a.id]; list.push(row(a, x, d ? d.evidence + '.' : (x.src === 'farmer' ? 'Added by you on ' + D(x.on) + '.' : (x.evidence || 'Found in your records earlier') + '.')));
    });
    var sugg = det.filter(function (d) { var x = it[d.id]; return !x || (x.state !== 'yes' && x.state !== 'no'); });
    return { list: list, sugg: sugg };
  }
  /* -440 (UX-13): what each asker wants, filtered by the farm: no slurry, no storage record; no stock, no manure or inventory record; outside
     an NVZ (England, Scotland), no NVZ claim first and no NVZ storage; Red Tractor's urea check only for a member in England */
  var _c = null;
  function fitRecords(a) {
    var c = _c, st = c && c.stock, nvzOff = c && c.nvz && c.nvz.inNvz === false;
    return (a.records || []).filter(function (k) {
      if (!c) return true;
      if (k === 'store' && st && !st.slurry) return false;
      if ((k === 'manure' || k === 'sheep') && st && !st.any) return false;
      if (k === 'store' && nvzOff && a.kind === 'law') return false;
      return true; });
  }
  function fitClaims(a) {
    var c = _c, nvzOff = c && c.nvz && c.nvz.inNvz === false, cl = (a.claims || []).slice();
    if (nvzOff) cl.sort(function (x, y) { return (/Nitrate Vulnerable Zone|\bNVZ\b/.test(x.text) ? 1 : 0) - (/Nitrate Vulnerable Zone|\bNVZ\b/.test(y.text) ? 1 : 0); });
    return cl;
  }
  function row(a, x, ev) { return { id: a.id, name: a.name, kind: a.kind, what: a.what || '', tool: a.tool || null, records: fitRecords(a), claims: fitClaims(a), state: x.state, src: x.src, on: x.on || null,
    withdrawnAt: x.withdrawnAt || null, allowedAgainAt: x.allowedAgainAt || null, email: x.email || '', evidence: ev }; }
  function askerById(c, id) { return askers(c).list.filter(function (r) { return r.id === id; })[0] || null; }

  /* ── the records, from the one computation (the words and tiles the page shows) ── */
  function tilesOf(c) { try { return (c.h && typeof W.susHealthTiles === 'function') ? W.susHealthTiles(c, c.h, c.h.Y) : []; } catch (er) { return []; } }
  function tileK(c, k) { return tilesOf(c).filter(function (t) { return t.k === k; })[0] || null; }
  function words() { return (A() && A().words) || {}; }
  function sec(c, key, tool) {
    var L = LIB(), R = (L && L.records[key]) || { label: key, module: '' }, w = words(), H = c.h, Y = c.year, s = { key: key, label: R.label, module: R.module, ready: 'missing', big: '', status: '', line: '', table: null, notes: [] };
    var fill = function (o) { if (!o) return; s.big = o.big; s.status = o.st ? o.st[1] : ''; s.line = o.line || ''; };
    if (key === 'manure') { var M = c.manure; fill(w.manure && w.manure(c)); s.ready = M && M.rows.length ? (M.perHa != null ? 'ready' : 'part') : 'missing';
      if (M && M.rows.length) s.table = { head: ['Legal class', 'Average head', 'kg N a head', 'kg N'], rows: M.rows.map(function (r) { return [String(r.label || r.key) + rowEst(r), Math.round(r.head * 10) / 10, r.rate, Math.round(r.kg)]; }).concat([['Total', '', '', Math.round(M.kg)]]) };
      if (M && M.estimates && M.estimates.length) s.notes.push('Estimates: ' + M.estimates.join('; ') + '.'); }
    else if (key === 'store') { var P = c.store; fill(w.store && w.store(c)); s.ready = !P || P.status === 'none' ? 'missing' : (P.status === 'missing' || !P.capacityM3) ? 'part' : 'ready'; }
    else if (key === 'sheep') { var sw = w.sheep && w.sheep(c); if (sw) { fill(sw); s.ready = 'ready'; } else { s.big = 'No sheep or goats'; s.line = 'The farm keeps no sheep or goats.'; } }
    else if (key === 'nvz') { fill(w.n && w.n(c)); var X = c.n; s.ready = X && X.has ? (X.rec.missing ? 'part' : 'ready') : 'missing';
      if (X && X.has && X.rec.crops.length) s.table = { head: ['Crop', 'Area, ha', 'Allowed, kg N/ha', 'Applied, kg N/ha'], rows: X.rec.crops.map(function (k) { return [k.label, Math.round(k.area * 10) / 10, k.limitKgHa == null ? '' : Math.round(k.limitKgHa), Math.round(k.appliedKgHa)]; }) };
      /* -446 (web test P0-4): the pack for an inspector carries every closed-period application with no lawful route, as recorded */
      if (X && X.rec && X.rec.breaches && X.rec.breaches.length) { X.rec.breaches.forEach(function (b) { s.notes.push('Spread in a closed period: ' + D(b.date) + ', ' + (b.fieldName || 'a field') + (b.product ? ', ' + b.product : '') + ' (closed ' + D(b.from) + ' to ' + D(b.to) + '; ' + b.reasonWords + ').'); }); } }
    else if (key === 'soil') { var t = tileK(c, 's'), S0 = c.n && c.n.soil; fill(t); s.ready = S0 ? (S0.due + S0.missing ? 'part' : 'ready') : 'missing'; }
    else if (key === 'urea') { var X2 = c.n; if (c.nation !== 'E') { s.big = 'Not used here'; s.line = 'The Red Tractor urea standard is for England.'; }
      else if (!X2 || X2.member !== true) { s.big = X2 && X2.member === false ? 'Not a Red Tractor member' : 'Red Tractor membership not answered'; s.line = 'Answer it in Crops, Compliance.'; }
      else { var fl = X2.urea.filter(function (u) { return u.flagged; }); s.ready = 'ready'; s.big = fl.length ? pl(fl.length, 'application') + ' of untreated urea outside 15 January to 31 March' : 'No untreated urea outside 15 January to 31 March'; s.status = fl.length ? 'Check' : 'Within the standard'; s.line = 'Checked on the date it was spread, never the invoice date. A Red Tractor standard, not law.';
        if (fl.length) s.table = { head: ['Product', 'Spread on'], rows: fl.map(function (u) { return [u.product, u.date]; }) }; } }
    else if (key === 'footprint') { var tc = tileK(c, 'c'); fill(tc); var R0 = H && H.years[Y], fp = R0 && R0.fp;
      s.ready = fp && fp.total > 0 ? (Object.keys(fp.srcStatus).some(function (k) { return fp.srcStatus[k] === 'estimate'; }) ? 'part' : 'ready') : 'missing';
      if (fp && fp.total > 0) { s.table = { head: ['Source', 't CO₂e'], rows: Object.keys(fp.src).sort(function (a, b) { return fp.src[b] - fp.src[a]; }).map(function (k) { return [k + (fp.srcStatus[k] === 'estimate' ? ' (estimate)' : ''), Math.round(fp.src[k] * 10) / 10]; }).concat([['Total', Math.round(fp.total * 10) / 10]]) };
        s.notes.push('Worked out with the published UK factors for ' + Y + ' (DESNZ, the IPCC 2019 Refinement and the UK greenhouse gas inventory). Nitrous oxide: ' + (H.method ? H.method.label : 'none') + '.'); } }   /* -440 (UX-15): no internal ids */
    else if (key === 'energy') { var te = tileK(c, 'e'); fill(te); var R1 = H && H.years[Y]; s.ready = R1 && (R1.elec.length || R1.solar || R1.fuel.length || R1.fuelLog) ? (R1.elecNoKwh ? 'part' : 'ready') : 'missing';
      if (R1 && s.ready !== 'missing') { var lit = 0; R1.fuel.forEach(function (f) { lit += f.litres; }); if (!lit) lit = R1.fuelLog || 0;
        s.table = { head: ['Energy', 'Amount'], rows: [['Electricity bought, kWh', R1.fp.energy.gridKwh || 0], ['Solar generated, kWh', R1.solar ? R1.solar.generatedKwh : 0], ['Fuel, litres', Math.round(lit)]] }; } }
    else if (key === 'water') { var tw = tileK(c, 'w'); fill(tw); var wt = H && H.water[Y]; s.ready = wt && wt.m3 != null ? 'ready' : (wt && wt.readings ? 'part' : 'missing'); }
    else if (key === 'habitats') { var tn = tileK(c, 'na'); fill(tn); var hb = H && H.hab; s.ready = hb && hb.features ? 'ready' : 'missing';
      if (hb && hb.features) s.table = { head: ['Habitat', 'Amount'], rows: Object.keys(hb.byKind).map(function (k) { var b = hb.byKind[k]; return [(hb.kinds && hb.kinds[k]) || k, k === 'hedge' ? N(b.m) + ' m' : N(b.ha, 2) + ' ha']; }) }; }
    else if (key === 'targets') { var T = H ? H.targets : []; s.ready = T.length ? 'ready' : 'missing'; s.big = T.length ? pl(T.length, 'target') : 'No targets set'; s.line = H && H.baselineYear ? 'Baseline year ' + H.baselineYear + '.' : 'No baseline year chosen.';
      if (T.length) s.table = { head: ['Target', 'Progress'], rows: T.map(function (x) { return [x.n, x.p.words]; }) }; }
    else if (key === 'inputs') { var x = tool ? EN().exportInputs(tool, exportRec(c), LIB()) : null;
      if (x) { s.label = 'Inputs for ' + x.label + ' (your records, not our figure)'; s.big = x.counts.records + ' of ' + x.rows.length + ' inputs from your records'; s.line = x.note; s.ready = x.counts.missing === x.rows.length ? 'missing' : (x.counts.missing || x.counts.part || x.counts.estimate ? 'part' : 'ready');
        s.table = { head: EN().EXPORT_COLS, rows: EN().exportCsvRows(x) }; if (x.orderStatus === 'verified') s.notes.push('Input order: ' + x.orderSource + '.'); } }   /* -440 (UX-15): no internal notes in what leaves the farm */
    s.status = s.status || (s.ready === 'missing' ? 'Not in your records yet' : '');
    return s;
  }

  /* -440 (UX-15): a row whose legal class rests on an unanswered size or yield is an estimate, and says which */
  function rowEst(r) {
    var st = A().set(), why = /^dairy_(lt|60|gt)/.test(r.key) && !st.dairyYield ? 'milk yield not answered' : /^suckler_/.test(r.key) && !st.sucklerSize ? 'cow size not answered' : /^ewe_/.test(r.key) && !st.eweSize ? 'ewe size not answered' : null;
    return why ? ' (estimate: ' + why + ', the higher figure)' : r.estimate ? ' (estimate)' : '';
  }
  /* calculator inputs: read from the same computation, keyed as the askers file names them */
  function exportRec(c) {
    var r = {}, H = c.h, Y = c.year, R = H && H.years[Y], put = function (k, v, unit, from, st) { r[k] = { value: v, unit: unit || '', from: from, status: st || 'records' }; };
    put('farm.location', NAT[c.nation], '', 'Settings'); put('farm.year', String(Y), '', 'This year');
    if (c.holdingHa) put('land.total_ha', Math.round(c.holdingHa * 10) / 10, 'ha', 'Settings and the land you rent');
    var crops = {}; (A().landsAll() || []).forEach(function (l) { if (!l.planted0 || !(l.area > 0)) return; var k = l.crop || 'No crop'; crops[k] = (crops[k] || 0) + l.area; });
    var ck = Object.keys(crops); if (ck.length) put('land.crops', ck.map(function (k) { return k + ' ' + N(crops[k], 1) + ' ha'; }).join('; '), '', 'Crops and Livestock fields');
    var M = c.manure; if (M && M.rows.length) put('stock.classes', M.rows.map(function (x) { return String(x.label || x.key) + rowEst(x) + ' ' + N(x.head, 1); }).join('; '), 'head', 'Livestock (average over the year)', M.rows.some(function (x) { return rowEst(x); }) ? 'estimate' : 'records');   /* -440 (UX-15) */
    var st = A().set(), wt = []; if (st.eweSize) wt.push(st.eweSize === 'lt60' ? 'ewes under 60 kg' : 'ewes 60 kg or more'); if (st.sucklerSize) wt.push(st.sucklerSize === 'le500' ? 'suckler cows up to 500 kg' : 'suckler cows over 500 kg');
    if (wt.length) put('stock.weights', wt.join('; '), '', 'Your answers in setup (size bands, not weights)', 'part');
    var hs = c.inputs && c.inputs.housing, hk = hs ? Object.keys(hs).filter(function (g) { return hs[g] && hs[g].mode; }) : [];
    if (hk.length) put('stock.housing', hk.map(function (g) { var x = hs[g]; return g + ': ' + (x.mode === 'all' ? 'housed all year' : x.mode === 'out' ? 'out all year' : 'housed ' + (x['in'] || '') + ' to ' + (x.out || '')); }).join('; '), '', 'Livestock housing', hk.every(function (g) { return hs[g].answered || hs[g].log; }) ? 'records' : 'estimate');
    if (R) {
      var ft = 0; R.feed.forEach(function (f) { ft += f.tonnes; }); if (ft) put('feed.bought_t', Math.round(ft * 10) / 10, 't', 'Feed bills in Money');
      if (R.fN > 0) put('fert.n_kg', Math.round(R.fN), 'kg N', 'Fertiliser records in Crops', R.fert.some(function (x) { return x.kgN === null; }) ? 'part' : 'records');
      var pr = {}; R.fert.forEach(function (x) { if (x.product) pr[x.product] = 1; }); if (Object.keys(pr).length) put('fert.products', Object.keys(pr).join('; '), '', 'Crops, Inputs');
      var mo = {}, MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; R.fert.forEach(function (x) { mo[+String(x.date).slice(5, 7)] = 1; });
      var mk = Object.keys(mo).map(Number).sort(function (a, b) { return a - b; }); if (mk.length) put('fert.timing', mk.map(function (m) { return MO[m - 1]; }).join(', '), '', 'Dates in Crops, Inputs');
      var lt = 0; R.lime.forEach(function (x) { if (x.tonnes > 0) lt += x.tonnes; }); if (lt) put('lime.t', Math.round(lt * 10) / 10, 't', 'Crops, Inputs');
      var lit = 0; R.fuel.forEach(function (f) { lit += f.litres; }); if (lit) put('fuel.diesel_l', Math.round(lit), 'litres', 'Fuel bills in Money'); else if (R.fuelLog) put('fuel.diesel_l', Math.round(R.fuelLog), 'litres', 'Litres issued in the fuel log', 'estimate');
      if (R.fp.energy.gridKwh) put('elec.kwh', Math.round(R.fp.energy.gridKwh), 'kWh', 'Electricity bills in Money', R.elecNoKwh ? 'part' : 'records');
      if (R.solar && R.solar.generatedKwh) put('solar.kwh', Math.round(R.solar.generatedKwh), 'kWh', 'Solar readings');
    }
    var sp = (c.inputs && c.inputs.manureMoves || []).filter(function (m) { return m.kind === 'spread'; }).length; if (sp) put('manure.organic', pl(sp, 'spreading record'), '', 'Livestock, Manure');
    var stores = (c.inputs && c.inputs.stores || []).filter(function (x) { return !x.removed; }); if (stores.length) put('manure.management', stores.map(function (x) { return (x.kind || 'store') + (x.capacity_m3 ? ' ' + N(x.capacity_m3) + ' m³' : '') + (x.covered === true ? ', covered' : x.covered === false ? ', not covered' : ''); }).join('; '), '', 'Livestock, Manure stores');
    var tests = (S() ? S().soilTests : []).filter(function (t) { return t && !t.removed; }), ph = tests.filter(function (t) { return Number(t.ph) > 0; }), om = tests.filter(function (t) { return Number(t.om) > 0; });
    if (ph.length) put('soil.ph', 'Average ' + N(ph.reduce(function (s, t) { return s + Number(t.ph); }, 0) / ph.length, 1) + ' from ' + pl(ph.length, 'soil test'), '', 'Soil tests in Crops');
    if (om.length) put('soil.som', 'Average ' + N(om.reduce(function (s, t) { return s + Number(t.om); }, 0) / om.length, 1) + '% from ' + pl(om.length, 'soil test'), '', 'Soil tests in Crops');
    var w = H && H.water[Y]; if (w && w.m3 != null) put('water.m3', Math.round(w.m3), 'm³', 'Meter readings in Crops');
    var hb = H && H.hab; if (hb && hb.features) { if (hb.hedgeM) put('hab.hedge_m', Math.round(hb.hedgeM), 'm', 'Nature'); if (hb.byKind.woodland) put('hab.wood_ha', Math.round(hb.byKind.woodland.ha * 100) / 100, 'ha', 'Nature');
      var oth = 0; Object.keys(hb.byKind).forEach(function (k) { if (k !== 'hedge' && k !== 'woodland') oth += hb.byKind[k].ha; }); if (oth) put('hab.other_ha', Math.round(oth * 100) / 100, 'ha', 'Nature'); }
    return r;
  }

  /* ── the payload: exactly what goes, and what the hash covers ── */
  function payload(c, a, keys, format, email) {
    var T = W.ST || {}, L = LIB();
    return { v: 1, kind: 'sus-share', to: { id: a.id, name: a.name, email: email || '' }, farm: { name: T.farmName || '', cph: T.cphNumber || '', nation: NAT[c.nation] },
      year: c.year, made: c.today, law_set: c.law_set || '', factor_set: (c.h && c.h.setFull) || c.factor_set || '', askers_set: L ? L.id + '-' + L.version : '', format: format,
      tool: keys.indexOf('inputs') >= 0 ? a.tool : null,
      records: keys.map(function (k) { var s = sec(c, k, a.tool); return { key: s.key, label: s.label, module: s.module, ready: s.ready, big: s.big, status: s.status, line: s.line, table: s.table, notes: s.notes }; }) };
  }
  function renderPack(p, h) {
    var x = '<h1>Records for ' + e(p.to.name) + ', ' + e(p.year) + '</h1><div class="meta">' + e(p.farm.name || 'Your farm') + (p.farm.cph ? (p.farm.nation === 'Northern Ireland' ? ', herd number ' : ', CPH ') + e(p.farm.cph) : '') + ', ' + e(p.farm.nation) + '. Made ' + e(D(p.made)) + ' from the farm’s AgriInsights records and shared with the farmer’s consent. Preview code ' + e(code(h)) + '.</div>';
    x += '<h2>In this pack</h2><table><tr><th>Record</th><th>From</th></tr>' + p.records.map(function (r) { return '<tr><td>' + e(r.label) + '</td><td>' + e(r.module) + '</td></tr>'; }).join('') + '</table>';
    p.records.forEach(function (r) {
      x += '<h2>' + e(r.label) + '</h2><p><b>' + e(r.big || 'Not in the records yet') + '</b>' + (r.status ? ': ' + e(r.status) : '') + '. ' + e(r.line) + '</p>';
      if (r.table) x += '<table><tr>' + r.table.head.map(function (hh) { return '<th>' + e(hh) + '</th>'; }).join('') + '</tr>' + r.table.rows.map(function (rw) { return '<tr' + (rw[0] === 'Total' ? ' class="total"' : '') + '>' + rw.map(function (v) { return '<td' + (typeof v === 'number' ? ' class="amt"' : '') + '>' + e(typeof v === 'number' ? N(v, 1) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      r.notes.forEach(function (n) { x += '<p class="meta">' + e(n) + '</p>'; });
    });
    x += '<p class="meta">Each figure says where it comes from: your records, or an estimate (marked, with the reason). These are the farm’s own records; check with your adviser if unsure.</p>';   /* -440 (UX-15): no internal ids or notes */
    return x;
  }
  function packCsv(p) {
    var rows = []; p.records.forEach(function (r) { rows.push([r.label, r.big, r.status, r.line]); if (r.table) { rows.push([r.label].concat(r.table.head)); r.table.rows.forEach(function (rw) { rows.push([r.label].concat(rw)); }); } });
    return typeof W.toCSV === 'function' ? W.toCSV(['Record', 'Figure', 'Status', 'Detail'], rows) : null;
  }
  function fileName(p, ext) { return ('records-for-' + p.to.name + '-' + p.made).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.' + ext; }

  /* ── the Who's asking tab ── */
  function readyPill(r) { return r === 'ready' ? ['g', 'In your records'] : r === 'part' ? ['a', 'Part in your records'] : ['n', 'Not in your records yet']; }
  function claimHtml(cl) {
    var t = cl.status === 'verified' ? '<span class="sus-src">Source: ' + (cl.source_url ? '<a href="' + e(cl.source_url) + '" target="_blank" rel="noopener noreferrer">' + e(cl.source) + '</a>' : e(cl.source)) + (cl.source_date && String(cl.source).indexOf(String(cl.source_date)) < 0 ? ', ' + e(cl.source_date) : '') + '. Checked ' + e(D(cl.checked_on)) + '</span>'
      : cl.status === 'pending' ? '<span class="sus-tag">Being checked</span>' : '<span class="sus-tag">Example: to confirm</span>';
    return '<li>' + e(cl.text) + '. ' + t + '</li>';
  }
  function lastSend(id) { return consents().filter(function (x) { return x.recipientId === id; }).sort(function (a, b) { return String(b.sentAt) < String(a.sentAt) ? -1 : 1; })[0] || null; }
  function card(c, r) {
    var g = EN().canSend(r, consents()), secs = r.records.map(function (k) { return sec(c, k, r.tool); }), miss = secs.filter(function (s) { return s.ready === 'missing'; }).length;
    /* -447 (web test F17): a regulator's card says when legal jobs are open, so the farmer looks before sharing */
    var lawOpen = r.kind === 'law' ? (c.jobs || []).filter(function (j) { return j.open && j.kind === 'law'; }).length : 0;
    var st = r.withdrawnAt || g.why === 'withdrawn' ? ['n', 'Sharing stopped'] : miss ? ['a', pl(miss, 'record') + ' not in your records yet'] : lawOpen ? ['a', 'Ready: ' + pl(lawOpen, 'legal job') + ' open, look first'] : ['g', 'Ready to share'];
    var h = '<div class="sus-ask" data-ask="' + e(r.id) + '"><div class="sus-gh"><div><b>' + e(r.name) + '</b> <span class="sus-kind set">' + e(KIND[r.kind] || r.kind) + '</span><span class="sus-mini sus-blk">' + e(r.what) + '</span></div>' + pill(st) + '</div>';
    h += '<p class="sus-mini"><b>Why they are here:</b> ' + e(r.evidence) + '</p>';
    /* -439-sus6 (source audit A2): a claim with no dated source is not shown; only the name and the records they usually want */
    var shown = r.claims.filter(function (cl) { return cl.status === 'verified'; });
    if (shown.length) h += '<p class="sus-mini sus-lb">What they ask for</p><ul class="sus-ul sus-claims">' + shown.map(claimHtml).join('') + '</ul>';
    h += '<p class="sus-mini sus-lb">Records they usually want</p><div class="sus-recs">' + secs.map(function (s) { return '<span class="sus-rec">' + e(s.label) + ' ' + pill(readyPill(s.ready)) + '</span>'; }).join('') + '</div>';
    var ls = lastSend(r.id);
    if (ls) h += '<p class="sus-mini">Last shared ' + e(D(ls.sentAt)) + ': ' + e(pl((ls.records || []).length, 'record')) + ', ' + e(FMT[ls.format] || ls.format) + '. Preview code ' + e(code(ls.hash)) + '.' + (ls.deleteAskedAt ? ' You asked them to delete it on ' + e(D(ls.deleteAskedAt)) + '.' : '') + '</p>';
    h += '<div class="sus-bt">';
    if (g.ok) h += '<button class="btn-pri sm" data-sk="pack" data-v="' + e(r.id) + '">Make the pack</button>';
    else if (g.why === 'withdrawn') h += '<span class="sus-mini">' + e(g.words) + '</span><button class="btn-sec sm" data-sk="allow" data-v="' + e(r.id) + '">Allow sharing again</button>';
    if (r.tool) h += '<button class="btn-sec sm" data-sk="export" data-v="' + e(r.id) + '">Inputs for ' + e(LIB().exports[r.tool].label) + '</button>';
    if (g.ok && ls) h += '<button class="btn-sec sm" data-sk="withdraw" data-v="' + e(r.id) + '">Stop sharing</button>';
    if (ls && !ls.deleteAskedAt) h += '<button class="btn-sec sm" data-sk="delask" data-v="' + e(ls.id) + '">Ask them to delete it</button>';
    if (r.src !== 'profile') h += '<button class="sus-lnk" data-sk="remove" data-v="' + e(r.id) + '">Remove</button>';
    return h + '</div></div>';
  }
  function html(c) {
    if (!on()) return '';
    var L = LIB(), E = EN(); if (!L || !E || !E.askDetect) return '<div class="sus-card"><p class="sus-mini">Loading the list of who asks for what…</p></div>';
    var X = askers(c), it = items();
    /* -440 (UX-13): the header counts the records still missing, not only the askers to check */
    var missN = 0; X.list.forEach(function (r) { r.records.forEach(function (k) { if (sec(c, k, r.tool).ready === 'missing') missN++; }); });
    var h = '<div class="sus-card"><div class="sus-gh"><div><span class="sus-k">Who’s asking</span><b class="sus-big">' + (X.list.length ? pl(X.list.length, 'asker') : 'Nobody yet') + '</b></div>' + pill(X.sugg.length ? ['a', N(X.sugg.length) + ' to check'] : missN ? ['a', pl(missN, 'record') + ' not in your records yet'] : ['g', 'Nothing to check']) + '</div>' +
      '<p class="sus-mini">One set of records answers them all. Nothing is sent without your yes: you choose the records, see exactly what goes, then confirm. Every share is logged with its preview code, and you can stop sharing at any time.</p></div>';
    if (X.sugg.length) h += '<div class="sus-card" id="sus-ask-sugg"><h3>Is this right?</h3><p class="sus-mini">Found in your records. Nobody is added until you say so.</p>' + X.sugg.map(function (d) {
        return '<div class="sus-aw"><span class="sus-kind set">' + e(KIND[d.kind] || d.kind) + '</span><div><b>' + e(d.name) + '</b><p class="sus-mini">' + e(d.evidence) + '.</p><div class="sus-bt"><button class="btn-sec sm" data-sk="yes" data-v="' + e(d.id) + '">Yes, add them</button><button class="btn-sec sm" data-sk="no" data-v="' + e(d.id) + '">Not mine</button></div></div></div>'; }).join('') + '</div>';
    GROUPS.forEach(function (gr) { var rs = X.list.filter(function (r) { return gr[0] === 'buyer' ? (r.kind === 'buyer' || r.kind === 'assurance') : r.kind === gr[0]; }); if (!rs.length) return;
      /* -440 (UX-48): the sub-heading says "found in your …" only when every one in the group was found there */
      var sub = gr[0] === 'law' ? gr[2] : rs.every(function (r) { return r.src === 'ledger' || r.src === 'loans'; }) ? gr[2] : rs.every(function (r) { return r.src === 'farmer'; }) ? 'Added by you' : gr[2] + ', or added by you';
      h += '<h3 class="sus-h">' + e(gr[1]) + ' <span class="sus-mini">' + e(sub) + '</span></h3>' + rs.map(function (r) { return card(c, r); }).join(''); });
    var have = {}; X.list.forEach(function (r) { have[r.id] = 1; }); X.sugg.forEach(function (d) { have[d.id] = 1; });
    var add = L.askers.filter(function (a) { return a.kind !== 'law' && !have[a.id] && (!a.nations || a.nations.indexOf(c.nation) >= 0); });
    if (add.length) h += '<div class="sus-card"><h3>Add someone</h3><p class="sus-mini">Someone asking who is not found in your records. Their requirements come from the list below; claims without a dated source are not shown until one is found.</p><div class="sus-bt"><label class="sus-f"><span>Who</span><select id="sus-ask-add"><option value="">Choose…</option>' +
      add.map(function (a) { return '<option value="' + e(a.id) + '">' + e(a.name + ' (' + (KIND[a.kind] || a.kind).toLowerCase() + ')') + '</option>'; }).join('') + '</select></label><button class="btn-sec sm" data-sk="add">Add</button></div></div>';
    var KU = W.susShareKeepUntil || function () { return null; }, tday = A().today ? A().today() : new Date().toISOString().slice(0, 10);
    var log = consents().filter(function (x) { var k = KU(x); return !k || k >= tday; }).slice().sort(function (a, b) { return String(b.sentAt) < String(a.sentAt) ? -1 : 1; });
    h += '<div class="sus-card" id="sus-ask-log"><h3>What you have shared</h3>' + (log.length ? '<div class="sus-scroll"><table class="sus-t"><tr><th>When</th><th>To</th><th>Records</th><th>Format</th><th>Preview code</th><th>Now</th><th>Kept until</th></tr>' + log.map(function (x) {
        return '<tr><td>' + e(D(x.sentAt)) + '</td><td>' + e(x.recipient) + '</td><td>' + e((x.labels || x.records || []).join('; ')) + '</td><td>' + e(FMT[x.format] || x.format) + '</td><td><code>' + e(code(x.hash)) + '</code></td><td>' +
          e(x.withdrawnAt ? 'Sharing stopped ' + D(x.withdrawnAt) : 'Shared') + (x.deleteAskedAt ? e('; delete asked ' + D(x.deleteAskedAt)) : '') + '</td><td>' + e(x.withdrawnAt && KU(x) ? D(KU(x)) : '6 years after sharing stops') + '</td></tr>'; })   /* -440 (UX-39): no end date while the share is live */.join('') + '</table></div>' : '<p class="sus-mini">Nothing shared yet.</p>') +
      '<p class="sus-mini">This log is kept for 6 years after a share ends or is withdrawn, to show what was shared and when if a dispute arises (legitimate interests). “Clear my records” keeps it, in short form. You can complain to the ICO (ico.org.uk).</p>' +
      '<p class="sus-mini">Sending from the app is not switched on yet. After you confirm, the pack opens here to save as a PDF or CSV and you send it yourself. Once it has left, it can’t be called back: you can ask them to delete it.</p></div>';
    return h;
  }

  /* ── the pack sheet: choose, preview, confirm ── */
  function ovEl() {
    var ov = document.getElementById('sus-ask-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'sus-ask-ov'; ov.className = 'rn-modal'; ov.innerHTML = '<div class="rn-sheet sus-sheet sus-ask-sheet" role="dialog" aria-modal="true" aria-labelledby="sus-ask-t"><div id="sus-ask-box"></div></div>'; document.body.appendChild(ov);
      ov.addEventListener('click', onClick); ov.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); }); }
    return ov;
  }
  function open(id) {
    var c = W.susCompute(), r = c && askerById(c, id); if (!r) return;
    _ui.ov = { id: id, step: 'choose', keys: {}, format: null, email: r.email || '', payload: null, hash: null, msg: null };
    try { if (W.AI && W.AI.auth && W.AI.auth.currentUser && !W.__AI_GUEST) W.AI.auth.currentUser().then(function (u) { _ui.uid = u && u.id ? u.id : null; }).catch(function () {}); } catch (er) {}
    ovEl().classList.add('on'); draw(); setTimeout(function () { var f = document.querySelector('#sus-ask-box input,#sus-ask-box button'); if (f && f.focus) f.focus(); }, 0);
  }
  function close() { var ov = document.getElementById('sus-ask-ov'); if (ov) ov.classList.remove('on'); _ui.ov = null; try { W.susRedraw(); } catch (er) {} }
  function readChoice() {
    var o = _ui.ov; if (!o) return; o.keys = {};
    Array.prototype.forEach.call(document.querySelectorAll('#sus-ask-box [data-sk-rec]'), function (b) { if (b.checked) o.keys[b.getAttribute('data-sk-rec')] = 1; });
    var f = document.querySelector('#sus-ask-box input[name="sus-ask-fmt"]:checked'); o.format = f ? f.value : null;
    var m = document.getElementById('sus-ask-email'); if (m) o.email = String(m.value || '').trim().slice(0, 160);
  }
  function chosen(r) { var o = _ui.ov; return r.records.filter(function (k) { return o.keys[k]; }); }
  /* -447 (web test F16): a warning about the ticks or the format goes as soon as the farmer ticks a record or picks a format */
  try { document.addEventListener('change', function (ev) { var t = ev.target, o = _ui.ov; if (!o || !o.msg || !t || !t.closest || !t.closest('#sus-ask-box')) return;
    if ((t.hasAttribute('data-sk-rec') && /^Tick at least one/.test(o.msg)) || (t.name === 'sus-ask-fmt' && /^Choose the format/.test(o.msg))) { o.msg = null; var w = document.querySelector('#sus-ask-box .sus-warn'); if (w && w.parentNode) w.parentNode.removeChild(w); } }); } catch (er) {}
  function draw() {
    var box = document.getElementById('sus-ask-box'), o = _ui.ov; if (!box || !o) return;
    var c = W.susCompute(), r = c && askerById(c, o.id); if (!r) { close(); return; }
    var h = '<div class="sh"><div><h3 id="sus-ask-t">' + (o.step === 'confirm' ? 'Make the pack for ' + e(r.name) + '?' : 'Records for ' + e(r.name)) + '</h3><div class="sus-mini">' + (o.step === 'choose' ? 'Step 1 of 3: choose what to share' : o.step === 'preview' ? 'Step 2 of 3: exactly what goes' : 'Step 3 of 3: your yes') + '</div></div><button class="sus-lnk" data-sk="close">Close</button></div><div class="sus-sbody">';
    if (o.msg) h += '<p class="sus-mini sus-warn">' + e(o.msg) + '</p>';
    if (o.step === 'choose') {
      h += '<p class="sus-mini">Tick what to share with ' + e(r.name) + '. Nothing is ticked for you.</p><div class="sus-ask-ch">' + r.records.map(function (k) { var s = sec(c, k, r.tool);
        return '<label class="sus-ask-li"><input type="checkbox" data-sk-rec="' + e(k) + '"' + (o.keys[k] ? ' checked' : '') + '><span><b>' + e(s.label) + '</b><small class="sus-mini">' + e(s.big || 'Not in your records yet') + '</small></span>' + pill(readyPill(s.ready)) + '</label>'; }).join('') + '</div>';
      h += '<fieldset class="sus-ask-fs"><legend class="sus-mini sus-lb">Format</legend>' + ['pdf', 'csv', 'both'].map(function (f) { return '<label class="sus-ask-r"><input type="radio" name="sus-ask-fmt" value="' + f + '"' + (o.format === f ? ' checked' : '') + '> ' + e(FMT[f]) + '</label>'; }).join('') + '</fieldset>';
      h += '<label class="sus-f"><span>Their email, for your log (optional)</span><input type="email" id="sus-ask-email" maxlength="160" value="' + e(o.email) + '" autocomplete="off"></label>';
      h += '</div><div class="sus-snav"><button class="btn-sec" data-sk="close">Cancel</button><button class="btn-pri" data-sk="preview">See exactly what goes</button></div>';
    } else if (o.step === 'preview') {
      h += '<p class="sus-mini">This is exactly what goes to ' + e(r.name) + ', ' + e(FMT[o.format]) + '. Preview code <code>' + e(code(o.hash)) + '</code>: the log keeps this code, so you can show later what was shared.</p><div class="sus-ask-pv" tabindex="0" aria-label="Preview of the pack">' + renderPack(o.payload, o.hash) + '</div>';
      h += '</div><div class="sus-snav"><button class="btn-sec" data-sk="back">Back</button><button class="btn-pri" data-sk="confirm">Next</button></div>';
    } else {
      h += '<p>' + e(pl(o.payload.records.length, 'record')) + ' as ' + e(FMT[o.format]) + ' to <b>' + e(r.name + (o.email ? ' (' + o.email + ')' : '')) + '</b>:</p><ul class="sus-ul">' + o.payload.records.map(function (x) { return '<li>' + e(x.label) + '</li>'; }).join('') + '</ul>' +
        '<p class="sus-mini"><b>Once it has left the app it can’t be called back.</b> You can ask them to delete it afterwards, and you can stop sharing with them at any time: nothing more goes after that.</p>' +
        '<p class="sus-mini">Sending from the app is not switched on yet: after your yes the pack opens to save as a PDF or CSV, and you send it to them yourself. The log records it now, with preview code <code>' + e(code(o.hash)) + '</code>.</p>';
      h += '</div><div class="sus-snav"><button class="btn-sec" data-sk="back">Cancel</button><button class="btn-pri" data-sk="send">Yes, make the pack</button></div>';
    }
    if (typeof W.susSetHtml === 'function') W.susSetHtml(box, h); else box.innerHTML = h;   /* -440: keep the typing */
  }
  function toPreview() {
    readChoice(); var o = _ui.ov, c = W.susCompute(), r = c && askerById(c, o.id); if (!r) return;
    var k = chosen(r); o.msg = null;
    if (!k.length) { o.msg = 'Tick at least one record to share.'; draw(); return; }
    if (!o.format) { o.msg = 'Choose the format.'; draw(); return; }
    if (o.email && !/^[^\s@<>"'`()\\,;:]+@[^\s@<>"'`()\\,;:]+\.[^\s@<>"'`()\\,;:]+$/.test(o.email)) { o.msg = 'That email address doesn’t look right. Leave it blank if you don’t have it.'; draw(); return; }
    o.payload = payload(c, r, k, o.format, o.email); o.hash = EN().previewHash(o.payload); o.step = 'preview'; draw();
  }
  /* the release: guard, the same hash, the log, then the previewed pack itself */
  function send() {
    var o = _ui.ov; if (!o || !o.payload || !o.hash) return;
    var c = W.susCompute(), r = c && askerById(c, o.id); if (!r) { close(); return; }
    var g = EN().canSend(r, consents());
    if (!g.ok) { o.msg = g.words + ' Nothing was sent.'; o.step = 'choose'; draw(); return; }
    var again = EN().previewHash(payload(c, r, o.payload.records.map(function (x) { return x.key; }), o.format, o.email));
    if (again !== o.hash) { o.msg = 'Your records changed since the preview, so nothing was sent. Look at the preview again.'; o.step = 'choose'; draw(); return; }
    var p = o.payload, h = o.hash, row = { id: A().uid('sc'), recipient: r.name + (o.email ? ' <' + o.email + '>' : ''), recipientId: r.id, records: p.records.map(function (x) { return x.key; }), labels: p.records.map(function (x) { return x.label; }),
      format: o.format, hash: h, sentAt: new Date().toISOString(), sentBy: _ui.uid || null, channel: 'download', year: p.year, _new: true };
    S().consents.push(row);
    if (o.email) { var it = items(true); it[r.id] = Object.assign({}, it[r.id] || { state: r.src === 'profile' ? 'yes' : r.state, src: r.src }, { email: o.email }); }
    close();
    A().save('Logged as shared with ' + r.name + '. Save the PDF or CSV and send it to them yourself');
    if (typeof W.lsShowReport === 'function') W.lsShowReport('Records for ' + r.name, '#1B4332', renderPack(p, h), o.format === 'pdf' ? null : packCsv(p), fileName(p, 'csv'));
  }

  /* ── the other actions ── */
  function nowIso() { return new Date().toISOString(); }
  /* -440 (UX-14): one Red Tractor answer. Saying yes to Red Tractor here (found or added) answers "Is the farm a Red Tractor member?" in Crops */
  function rtSync(id, yes) { if (id !== 'redtractor' || !yes) return; var st = A().set(); st.schemes = Object.assign({}, st.schemes || {}, { redTractor: true }); }
  function answer(id, yes) { rtSync(id, yes); var c = W.susCompute(), d = detect(c).filter(function (x) { return x.id === id; })[0], it = items(true); it[id] = Object.assign({}, it[id] || {}, { state: yes ? 'yes' : 'no', src: 'ledger', on: A().today(), evidence: d ? d.evidence : '' }); A().save(yes ? 'Added. Their requirements are shown below' : 'Left out. They won’t be suggested again'); }
  function addOne() { var sel = document.getElementById('sus-ask-add'), id = sel ? sel.value : ''; if (!id || !lib(id)) { W.toast && W.toast('Choose who to add', 'info'); return; } rtSync(id, true); var it = items(true); it[id] = Object.assign({}, it[id] || {}, { state: 'yes', src: 'farmer', on: A().today() }); A().save('Added ' + lib(id).name); }
  function remove(id) { var it = items(true); it[id] = Object.assign({}, it[id] || {}, { state: 'no', removedOn: A().today() }); A().save('Removed. Nothing goes to them'); }
  function withdraw(id) {
    var it = items(true), t = nowIso(), a = lib(id); it[id] = Object.assign({}, it[id] || { state: 'yes' }, { withdrawnAt: t }); if (a && a.kind === 'law') it[id].src = 'profile';
    consents().forEach(function (x) { if (x.recipientId === id && !x.withdrawnAt) x.withdrawnAt = t; });
    A().save('Sharing with ' + (a ? a.name : 'them') + ' stopped. Nothing more goes to them');
  }
  function allow(id) { var it = items(true), a = lib(id); it[id] = Object.assign({}, it[id] || {}, { withdrawnAt: null, allowedAgainAt: nowIso() }); A().save('Sharing with ' + (a ? a.name : 'them') + ' allowed again. Each send still needs your yes'); }
  function askDelete(cid) {
    var x = consents().filter(function (r) { return r.id === cid; })[0]; if (!x) return; x.deleteAskedAt = nowIso();
    var T = W.ST || {}, h = '<h1>Please delete the records we shared</h1><div class="meta">' + e(T.farmName || 'Our farm') + '. ' + e(D(x.deleteAskedAt)) + '.</div><p>To ' + e(x.recipient) + ',</p><p>On ' + e(D(x.sentAt)) + ' we shared these farm records with you: ' + e((x.labels || x.records || []).join('; ')) + ' (preview code ' + e(code(x.hash)) + ').</p><p>Please delete them, and any copies, and confirm when it is done. Thank you.</p><p class="meta">Made from the farm’s AgriInsights sharing log. The request date is kept in the log.</p>';
    A().save('The request date is logged. Send them the letter that opens');
    if (typeof W.lsShowReport === 'function') W.lsShowReport('Ask to delete: ' + x.recipient, '#1B4332', h, null, null);
  }
  function exportFor(id) {
    var c = W.susCompute(), r = c && askerById(c, id); if (!r || !r.tool) return;
    var x = EN().exportInputs(r.tool, exportRec(c), LIB()); if (!x) return;
    var h = '<h1>Inputs for ' + e(x.label) + ', ' + e(c.year) + '</h1><div class="meta">' + e(x.note) + ' ' + (x.orderStatus === 'verified' ? 'Input order: ' + e(x.orderSource) + '.' : 'Our grouping of your inputs: layout to confirm with the tool.') + ' For you to type into ' + e(x.label) + ' or upload yourself: nothing is sent, and nothing is logged. To share it with ' + e(r.name) + ' from here, use Make the pack.</div>' +
      '<table><tr>' + EN().EXPORT_COLS.map(function (t) { return '<th>' + e(t) + '</th>'; }).join('') + '</tr>' + EN().exportCsvRows(x).map(function (rw) { return '<tr>' + rw.map(function (v) { return '<td>' + e(typeof v === 'number' ? N(v, 1) : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' +
      '<p class="meta">' + x.counts.records + ' from your records, ' + x.counts.part + ' partly, ' + x.counts.estimate + ' estimated, ' + x.counts.missing + ' not in your records yet: ' + e(x.label) + ' may ask you for those.</p>';
    var csv = typeof W.toCSV === 'function' ? W.toCSV(EN().EXPORT_COLS, EN().exportCsvRows(x)) : null;
    if (typeof W.lsShowReport === 'function') W.lsShowReport('Inputs for ' + x.label, '#1B4332', h, csv, (x.label + '-inputs-' + c.year).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv');
  }
  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-sk]') : null; if (!b || !on() || !A() || !EN()) return;
    var a = b.getAttribute('data-sk'), v = b.getAttribute('data-v') || '';
    switch (a) {
      case 'yes': answer(v, true); return; case 'no': answer(v, false); return; case 'add': addOne(); return; case 'remove': if (W.susArmed && !W.susArmed(b)) return; remove(v); return;   /* -440 (UX-36) */
      case 'pack': open(v); return; case 'export': exportFor(v); return; case 'withdraw': if (W.susArmed && !W.susArmed(b, 'Tap again to stop sharing')) return; withdraw(v); return; case 'allow': allow(v); return; case 'delask': askDelete(v); return;
      case 'close': close(); return; case 'preview': toPreview(); return;
      case 'back': if (_ui.ov) { if (_ui.ov.step === 'preview') _ui.ov.step = 'choose'; else _ui.ov.step = 'preview'; _ui.ov.msg = null; draw(); } return;
      case 'confirm': if (_ui.ov && _ui.ov.payload) { _ui.ov.step = 'confirm'; draw(); } return;
      case 'send': send(); return;
    }
  }
  var _wired = false;
  function wire() { if (_wired) return; var el = document.getElementById('pg-sustain'); if (!el) return; _wired = true; el.addEventListener('click', onClick); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 0);
  try {
    var css = '.sus-ask{border:1px solid var(--br2);border-radius:12px;padding:14px 16px;margin:0 0 12px;background:#fff}.sus-ask .sus-gh{align-items:flex-start}.sus-blk{display:block}.sus-lb{font-weight:800;margin:10px 0 4px}' +
      '.sus-claims li{margin:0 0 4px}.sus-recs{display:flex;flex-wrap:wrap;gap:6px 10px}.sus-rec{font-size:12.5px;display:inline-flex;gap:6px;align-items:center}.sus-ask .sus-bt{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.rn-sheet.sus-ask-sheet{max-width:720px}#sus-ask-ov .sus-ask-ch{display:flex;flex-direction:column;gap:6px;margin:8px 0 12px}#sus-ask-ov .sus-ask-li{display:flex;flex-direction:row;gap:10px;align-items:center;border:1px solid var(--br2);border-radius:10px;padding:8px 10px;cursor:pointer;width:auto}#sus-ask-ov .sus-ask-li span{flex:1;min-width:0}#sus-ask-ov .sus-ask-li small{display:block}' +
      '#sus-ask-ov .sus-ask-li input,#sus-ask-ov .sus-ask-r input{width:auto;flex:none;margin:0;min-height:0}#sus-ask-ov .sus-ask-li .sus-st{flex:none}#sus-ask-ov .sus-ask-fs{border:0;margin:0 0 10px;padding:0}#sus-ask-ov .sus-ask-r{display:flex;gap:8px;align-items:center;padding:3px 0;font-size:13.5px}.sus-ask-pv{border:1px solid var(--br2);border-radius:10px;padding:12px 14px;max-height:46vh;overflow:auto;font-size:13px}.sus-ask-pv h1{font-size:17px}.sus-ask-pv h2{font-size:14px;margin:12px 0 4px}.sus-ask-pv table{border-collapse:collapse;width:100%;margin:4px 0}.sus-ask-pv td,.sus-ask-pv th{border-bottom:1px solid var(--br2);padding:3px 6px;text-align:left}.sus-ask-pv .meta{color:var(--t3);font-size:12px}';
    var stl = document.createElement('style'); stl.id = 'sus-asks-css'; stl.textContent = css; (document.head || document.documentElement).appendChild(stl);
  } catch (er) {}

  W.susAsksHtml = function (c) { try { return html(c); } catch (er) { console.warn('sustainability asks', er); return '<div class="sus-card"><p class="sus-mini">Who’s asking could not be shown.</p></div>'; } };
  W._susAsks = { detect: detect, askers: askers, payload: payload, renderPack: renderPack, exportRec: exportRec, sec: sec, ui: _ui };
}(typeof window !== 'undefined' ? window : this));
