/* sus-register-uk.js - the keeper's register, option C (register-signoff.html v3, signed off 15 Nov 2026), UK desktop.
 * Build -438-sus5r. Behind SUS_FLAGS.pilot (off by default; pilot farms only). Northern Ireland stays behind SUS_FLAGS.ni.
 *
 * The farmer's register file belongs to Livestock (decision 1a): Livestock -> Register. It never overwrites the herd and never
 * feeds the figures (decision 2a): Livestock is the one source. It checks the herd. Where the two disagree, one card per species
 * says so (in Livestock, the jobs list and the Dashboard) and the farmer decides:
 *   - "Update Livestock to N" (decision 5a): a dated "Register correction" through the existing Livestock moves and herds saves,
 *     with an optional "what happened": sold, died or moved. It is an ordinary movement and can be deleted, which puts it back.
 *   - "Add N cows" (the owner's note): a pop-out right there, pre-filled from the register (tag, sex, breed, birth date, date on,
 *     the herd and class it would join). Every line can be changed; nothing is added until "Add to Livestock".
 *   - "Livestock is right", "Show the differences", "Not now". Answers are kept per file with who and when (answers).
 *   - "Set up Livestock from this file" only when that species has nothing in Livestock (decision 6a).
 * The file: one current file per species; a newer one supersedes it and the older is kept 12 months (decision 7a). Only the
 * columns decision 9 allows are kept. Nothing is ever reported to BCMS, LIS, ScotEID, APHIS/NIFAIS or EIDCymru.
 * The engine (sus-engine-uk.js) does the reading (parseRegisterCsv) and the checking (registerCompare, registerOpen); this file
 * only shows it and writes the farmer's choices back through Livestock's own saves. State: ST_SUS.regImports (the
 * livestock_register_imports table, tools/uk-sus5r-schema.sql, NOT RUN; probe CAN_SUS.livestock_register_imports).
 */
(function (W) {
  'use strict';
  var EN = function () { return W.SusEngineUK || null; };
  var LAW = function () { return W.SUS_LAW || null; };
  var FAC = function () { return W.SUS_FACTORS || null; };
  var API = function () { return W._susApi || null; };
  function on() { return !!(W.SUS_FLAGS && W.SUS_FLAGS.pilot); }
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function D(x) { try { return x ? (typeof W.dispDate === 'function' ? W.dispDate(x) : x) : ''; } catch (er) { return x || ''; } }
  function N(x) { var v = Number(x); return isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : ''; }
  function pl(n, one, many) { n = Math.round(Number(n) || 0); return N(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function today() { var a = API(); return a ? a.today() : new Date().toISOString().slice(0, 10); }
  function iso(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function S() { var a = API(); var s = a ? a.S() : null; if (s && !Array.isArray(s.regImports)) s.regImports = []; return s; }
  var SPN = { cattle: 'cattle', sheep: 'sheep' };
  var _ui = { pg: {}, show: {}, upd: null, pop: null, imp: null, setup: {}, uid: null };
  try { if (W.AI && W.AI.auth && W.AI.auth.currentUser && !W.__AI_GUEST) W.AI.auth.currentUser().then(function (u) { _ui.uid = u && u.id ? u.id : null; }).catch(function () {}); } catch (er) {}
  function who() { return _ui.uid || null; }

  /* ── the file, held compact (decision 9: only what the check needs) ── */
  function pack(r) { var o = {}; if (r.tag) o.t = r.tag; if (r.sex) o.s = r.sex; if (r.breed) o.b = r.breed; if (r.dob) o.d = r.dob; if (r.yob) o.y = r.yob; if (r.dam) o.m = r.dam; if (r.on) o.on = r.on; if (r.off) o.off = r.off; if (r.n) o.n = r.n; return o; }
  function unpack(r) { return { tag: r.t || null, sex: r.s || null, breed: r.b || null, dob: r.d || null, yob: r.y || null, dam: r.m || null, on: r.on || null, off: r.off || null, n: r.n || null }; }
  function kindOf(imp) { return (imp.rows || []).some(function (r) { return r && (r.on || r.off); }) ? 'moves' : 'snapshot'; }
  function current(sp) {
    var s = S(); if (!s) return null;
    return s.regImports.filter(function (x) { return x && x.species === sp && !x.superseded; }).sort(function (a, b) { return String(b.importedOn || '') + String(b.asOf) < String(a.importedOn || '') + String(a.asOf) ? -1 : 1; })[0] || null;
  }
  function kept(sp) { var s = S(); return s ? s.regImports.filter(function (x) { return x && x.species === sp && x.superseded; }) : []; }

  /* ── what the comparison reads, straight from Livestock ── */
  function lsIn() {
    var LS = W.ST_LS || {};
    return { herds: (LS.herd || []).filter(function (h) { return h && !h.removed && !h.planned; }).map(function (h) { return { id: h.id, type: h.type, qty: h.qty, classes: h.classes || null, name: h.name || null }; }),
             animals: (LS.animals || []).map(function (a) { return { id: a.id, herd: a.herd, tag: a.tag, sex: a.sex, cls: a.cls, dob: a.dob, status: a.status }; }),
             moves: (LS.moves || []).map(function (m) { return { id: m.id, herd: m.herd, reason: m.reason, qty: m.qty, cls: m.cls, toCls: m.toCls, date: m.date, leaving: !!m.leaving, corr: /^Register correction/.test(String(m.note || '')) }; }) };
  }
  function sales() {   /* mart payments with no animals taken out (Livestock, Herd, Records: "things don't line up") */
    try {
      if (typeof W._lsUnmatched !== 'function') return [];
      return (W._lsUnmatched().money || []).map(function (r) { return { ref: r.i, herd: typeof W._lsHerdIdFromEnt === 'function' ? W._lsHerdIdFromEnt(r.t.ent) : null,
        date: typeof W._lsTxnDateISO === 'function' ? W._lsTxnDateISO(r.t.date) : null, amt: r.t.amt, desc: r.t.desc || '' }; });
    } catch (er) { return []; }
  }
  function sheepCount(asOf) {
    var s = S(); if (!s || !iso(asOf)) return null; var y = +asOf.slice(0, 4) - (asOf.slice(5) >= '12-01' ? 0 : 1);
    var x = (s.inventory || []).filter(function (r) { return +r.year === y; })[0]; return x && (x.ewes != null || x.rams != null) ? { ewes: x.ewes, rams: x.rams, counted_on: x.countedOn || null } : null;
  }
  /* the part of the inputs hash: a change of file, date or answer recomputes */
  function key() {
    var s = S(); if (!s || !on()) return null;
    var LS = W.ST_LS || {};
    return JSON.stringify(s.regImports.map(function (x) { return [x.id, x.asOf, !!x.superseded, x.answers || null, (x.rows || []).length]; })) + '|' +
      (LS.animals || []).filter(function (a) { return a && a.tag; }).length + '|' + ((W.ST && W.ST.txns) || []).length;
  }

  /* ── the one comparison, run inside susCompute() so every screen reads the same object ── */
  function compute(inp, legal) {
    if (!on() || !EN() || !LAW() || !inp || !inp.nation) return null;
    var t = inp.today, cards = [], jobs = [], L = lsIn(), sl = sales(), spans = ((S() && S().spans) || []).map(function (x) { return { id: x.id, kind: x.kind, species: x.species, role: x.role, n: x.n, from: x.from, to: x.to, occupier: x.occupier, where: x.where }; });
    ['cattle', 'sheep'].forEach(function (sp) {
      var imp = current(sp); if (!imp || !iso(imp.asOf)) return;
      var cmp = EN().registerCompare({ nation: inp.nation, today: t, species: sp, asOf: imp.asOf, rows: (imp.rows || []).map(unpack), kind: kindOf(imp), herds: L.herds, animals: L.animals, moves: L.moves,
        spans: spans, sales: sl, count: sp === 'sheep' ? sheepCount(imp.asOf) : null, legal: legal }, LAW(), FAC());
      var op = EN().registerOpen(cmp, imp.answers || {}, t);
      var card = { species: sp, imp: imp, cmp: cmp, open: op, title: null, why: null };
      if (cmp.status === 'differs' && op.status === 'open') {
        var cls = cmp.diffs.filter(function (d) { return op.open.some(function (o) { return o.sig === d.sig; }); });
        var tg = op.open.filter(function (o) { return o.kind === 'tag'; }).length;
        card.title = cls.length === 1 ? cls[0].title : cls.length ? 'Your ' + sp + ' register differs from Livestock in ' + pl(cls.length, 'class', 'classes') : 'Your ' + sp + ' register and Livestock differ by ' + pl(tg, 'ear tag');
        card.why = 'File from ' + D(imp.asOf) + (cls[0] ? ': ' + N(cls[0].reg) + ' ' + (RW[cls[0].k] || cls[0].label) + '. Livestock: ' + N(cls[0].ls) + '.' : '.') + (cmp.legal && cmp.legal.lines.length ? ' ' + cmp.legal.lines[0] : '');
        jobs.push({ species: sp, title: card.title, why: card.why, legal: !!(cmp.legal && cmp.legal.changes.length) });
      }
      cards.push(card);
    });
    return { cards: cards, jobs: jobs };
  }
  var RW = { calves: 'calves', followers: 'followers', cows: 'cows and heifers over 2', bulls: 'males over 2', adults: 'ewes and rams', all: 'head' };
  function cards() { var c = typeof W.susCompute === 'function' ? W.susCompute() : null; return (c && c.reg && c.reg.cards) || []; }
  function cardFor(sp) { return cards().filter(function (x) { return x.species === sp; })[0] || null; }
  /* mart payments a register card has taken in: the "things don't line up" card leaves them out (one card, never two) */
  function claims() {
    if (!on()) return []; var out = [];
    try { cards().forEach(function (c) { if (c.open.status !== 'open') return; c.cmp.diffs.forEach(function (d) { (d.sales || []).forEach(function (s) { if (out.indexOf(s.ref) < 0) out.push(s.ref); }); }); }); } catch (er) {}
    return out;
  }
  function lineFor(c) {           /* Sustainability -> "Where these figures come from": a line and a link, never the figures */
    var cs = (c && c.reg && c.reg.cards) || []; if (!cs.length) return null;
    return cs.map(function (x) { return x.species === 'cattle' ? 'Cattle' : 'Sheep'; }).map(function (w, i) { var x = cs[i];
      return w + ' register file from ' + D(x.imp.asOf) + ': ' + (x.cmp.status === 'match' ? 'matches Livestock' : x.cmp.status === 'setup' ? 'not used yet (Livestock is empty)' : x.open.status === 'open' ? 'differs, waiting for your answer' : x.open.status === 'later' ? 'differs, hidden for now' : 'differences answered'); }).join('; ');
  }
  function differs(c) { return !!((c && c.reg && c.reg.cards) || []).some(function (x) { return x.open.status === 'open'; }); }

  /* ── answers: kept per file, with who and when ── */
  function answer(sp, sigs, a, extra) {
    var imp = current(sp); if (!imp) return; imp.answers = Object.assign({}, imp.answers || {});
    sigs.forEach(function (s) { imp.answers[s] = Object.assign({ a: a, by: who(), at: new Date().toISOString() }, extra || {}); });
    imp._new = true;
  }
  function saveLs() {
    try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {}
    try { if (W.AI && W.AI.farm && W.AI.farm.active() && W.ST_LS) W.AI.livestock.saveAll(W.ST_LS).catch(function (er) { console.error('Backend livestock save failed:', er); }); } catch (er) {}
    try { if (typeof W.dataChanged === 'function') W.dataChanged('livestock'); } catch (er) {}
  }
  function done(msg) { var a = API(); if (a) a.save(msg); render(); }

  /* ── the card (one per species) ── */
  function gapWords(g, cmp) {
    var w = cmp.windows, sp = cmp.species, an = sp === 'cattle' ? ['animal', 'animals'] : ['sheep', 'sheep'];
    var nn = function (n, a) { return N(n) + ' ' + (n === 1 ? a[0] : a[1]); };
    switch (g.what) {
      case 'young_reg': return nn(g.n, ['calf', 'calves']) + ' born in the ' + w.birth + ' days before the file ' + (g.n === 1 ? 'is' : 'are') + ' on the register but not in Livestock yet. Inside the registration window, so not a difference; add ' + (g.n === 1 ? 'it' : 'them') + ' in Livestock when you can.';
      case 'young': return nn(g.n, ['calf', 'calves']) + ' born in the ' + w.birth + ' days before the file ' + (g.n === 1 ? 'isn’t' : 'aren’t') + ' on the register yet, which is normal.';
      case 'death': return nn(g.n, ['death', 'deaths']) + ' in the ' + w.death + ' days before the file may not be on the register yet, which is normal.';
      case 'moved_off': return nn(g.n, an) + ' that left in the ' + w.move + ' days before the file may still be on it, which is normal' + (w.moveNote ? ' (' + w.moveNote + ')' : w.moveToConfirm ? ' (' + w.move + ' days used until DAERA confirms)' : '') + '.';
      case 'moved_on': return nn(g.n, an) + ' that arrived in the ' + w.move + ' days before the file may not be on it yet, which is normal' + (w.moveNote ? ' (' + w.moveNote + ')' : w.moveToConfirm ? ' (' + w.move + ' days used until DAERA confirms)' : '') + '.';
      case 'away': return nn(g.n, an) + ' away on another holding are matched to Stock away, not differences.';
      case 'heifers_over_2': return nn(g.n, ['heifer', 'heifers']) + ' ' + (g.n === 1 ? 'is' : 'are') + ' over 2 years on the register; Livestock keeps ' + (g.n === 1 ? 'it' : 'them') + ' as heifers. Not a difference.';
      case 'steers_over_2': return nn(g.n, ['steer', 'steers']) + ' ' + (g.n === 1 ? 'is' : 'are') + ' over 2 years on the register; Livestock keeps ' + (g.n === 1 ? 'it' : 'them') + ' as steers. Not a difference.';
    }
    return '';
  }
  function notes(card) {
    var cmp = card.cmp, h = '';
    if (cmp.old) h += '<p class="sus-mini"><span class="sus-st a">' + e(ageWords(cmp.ageDays)) + '</span> Changes since ' + e(D(cmp.asOf)) + ' will show as differences.</p>';
    var gs = cmp.gaps.map(function (g) { return gapWords(g, cmp); }).filter(Boolean);
    if (gs.length) h += '<ul class="sus-ul">' + gs.map(function (g) { return '<li>' + e(g) + '</li>'; }).join('') + '</ul>';
    if (cmp.species === 'sheep') h += '<p class="sus-mini">Lambs aren’t compared (' + N(cmp.lambs.reg) + ' on the register, ' + N(cmp.lambs.ls) + ' in Livestock).' + (cmp.count ? ' Your 1 December count: ' + pl(cmp.count.n, 'ewe or ram', 'ewes and rams') + '.' : '') + '</p>';
    return h;
  }
  function exceptionLine(sp) {      /* the "doesn't add up" card for the same animals folds in here */
    var c = typeof W.susCompute === 'function' ? W.susCompute() : null, x = c && c.manure ? (c.manure.exceptions || []).filter(function (q) { return q.species === sp; })[0] : null;
    if (!x) return ''; var hd = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return String(h.id) === String(x.herd); })[0];
    return '<p class="sus-mini"><b>Also in Livestock:</b> ' + e((hd ? (hd.name || hd.type) + ' has ' : '') + 'recorded ' + pl(x.n, 'more arrival') + (x.cls ? ' of ' + x.cls : '') + ' this year than it now counts. The manure figure uses the count; check the count or the arrivals while you are here.')   /* -440 (UX-37) */ + ' <button class="sus-lnk" onclick="lsTab(\'herd\')">Open the herd</button></p>';
  }
  function cardHtml(card, where) {
    var cmp = card.cmp, sp = card.species, imp = card.imp, op = card.open;
    if (cmp.status === 'setup') return setupHtml(card);
    if (cmp.status === 'refused') return '';
    if (cmp.status === 'empty') return '<div class="sus-card"><span class="sus-k">Checked against your register</span><p class="sus-mini">The ' + sp + ' file from ' + e(D(imp.asOf)) + ' has no animals on the holding on that date.</p></div>';
    if (cmp.status === 'match' || op.status === 'answered') {
      var ans = op.done[0];
      return '<div class="sus-card rg-ok"><span class="sus-k">Checked against your register</span><p class="sus-mini"><span class="sus-st g">' + (cmp.status === 'match' ? 'Matches' : 'Answered') + '</span> ' +
        e(SPN[sp].charAt(0).toUpperCase() + SPN[sp].slice(1) + ' file from ' + D(imp.asOf) + (cmp.status === 'match' ? ' matches Livestock.' : ': ' + (ans && ans.a === 'right' ? 'you said Livestock is right' : 'Livestock was updated') + (ans && ans.at ? ' on ' + D(String(ans.at).slice(0, 10)) : '') + '. The next file checks again.')) + '</p>' + notes(card) + '</div>';
    }
    if (op.status === 'later') return where === 'kreg' ? '<div class="sus-card"><span class="sus-k">Checked against your register</span><p class="sus-mini">' + e(card.cmp.species === 'cattle' ? 'Cattle' : 'Sheep') + ' differences hidden for now. <button class="sus-lnk" data-rg="reopen|' + sp + '">Show them again</button></p></div>' : '';
    var h = '<div class="sus-card sus-x rg-card" id="rg-card-' + (where === 'kreg' ? '' : 'm-') + sp + '"><span class="sus-k">Checked against your register</span><b class="sus-big">' + e(card.title) + '</b>';
    var cls = cmp.diffs.filter(function (d) { return op.open.some(function (o) { return o.sig === d.sig; }); });
    if (cls.length > 1) h += '<p class="sus-mini">File from ' + e(D(imp.asOf)) + ': ' + e(cls.map(function (d) { return N(d.reg) + ' ' + RW[d.k] + ' (Livestock ' + N(d.ls) + ')'; }).join(', ')) + '.</p>';
    if (cls.length === 1) { var d1 = cls[0]; h += '<p class="sus-mini">File from ' + e(D(imp.asOf)) + ': ' + e(N(d1.reg) + ' ' + (d1.k === 'all' ? (sp === 'cattle' ? 'cattle' : 'sheep') : RW[d1.k])) + '. Livestock: ' + e(N(d1.ls)) + '.</p>'; }
    if (cmp.tags.level && cmp.tags.lsOnly.length) h += '<p class="sus-mini">' + e(tagList(cmp.tags.lsOnly.slice(0, 3).map(function (x) { return x.tag; }), cmp.tags.lsOnly.length) + (cmp.tags.lsOnly.length === 1 ? ' is' : ' are') + ' in Livestock but not on the register.') + '</p>';
    if (cmp.tags.level && cmp.tags.regOnly.length) h += '<p class="sus-mini">' + e(tagList(cmp.tags.regOnly.slice(0, 3).map(function (x) { return x.tag; }), cmp.tags.regOnly.length) + (cmp.tags.regOnly.length === 1 ? ' is' : ' are') + ' on the register but not in Livestock.') + '</p>';
    cls.forEach(function (d) { (d.sales || []).slice(0, 1).forEach(function (s) { h += '<p class="sus-mini">A mart payment on ' + e(D(s.date)) + ' (' + e('£' + N(s.amt)) + ') has no animals taken out. If it was these, choose "Sold" below and the two are sorted together.</p>'; }); });
    var tagsOnly = !cls.length;
    if (tagsOnly) h += '<p class="sus-mini">File from ' + e(D(imp.asOf)) + '. The totals match, but some ear tags are in one list and not the other.</p>';
    h += '<p class="sus-mini">Until you answer, the manure figure uses Livestock' + (cls.length === 1 ? '’s ' + e(N(cls[0].ls)) : '') + ' and says the register differs.</p>';
    if (cmp.legal && cmp.legal.lines.length) h += cmp.legal.lines.map(function (l) { return '<p class="sus-mini"><span class="sus-st r">Legal answer would change</span> ' + e(l) + '</p>'; }).join('');
    if (cmp.awayHint) h += '<p class="sus-mini">' + e(pl(cmp.awayHint.n, 'animal') + ' left on ' + D(cmp.awayHint.date) + '. Away wintering?') + ' <button class="sus-lnk" data-rg="away">Add it in Stock away</button></p>';
    h += exceptionLine(sp) + notes(card);
    h += '<div class="sus-bt">';
    /* -440 (R10): one dark (main) button on the card; the other actions are plain */
    cls.forEach(function (d, i) {
      var bc = i === 0 ? 'btn-pri sm' : 'btn-sec sm';
      if (d.n > 0) h += '<button class="' + bc + '" data-rg="upd|' + sp + '|' + e(d.k) + '">Update Livestock to ' + e(N(d.reg)) + '</button>';
      else h += '<button class="' + bc + '" data-rg="add|' + sp + '|' + e(d.k) + '">Add ' + e(d.words) + '</button>';
    });
    if (tagsOnly && cmp.tags.regOnly.length) h += '<button class="' + (cls.length ? 'btn-sec sm' : 'btn-pri sm') + '" data-rg="add|' + sp + '|tags">Add ' + e(pl(cmp.tags.regOnly.length, 'animal')) + '</button>';
    h += '<button class="btn-sec sm" data-rg="right|' + sp + '">Livestock is right</button><button class="btn-sec sm" data-rg="show|' + sp + '">' + (_ui.show[sp] ? 'Hide the differences' : 'Show the differences') + '</button><button class="btn-sec sm" data-rg="later|' + sp + '">Not now</button>';
    if (where !== 'kreg') h += '<button class="sus-lnk" data-rg="open">Open Livestock, Register</button>';
    h += '</div>';
    if (_ui.upd && _ui.upd.sp === sp) h += updHtml(card);
    if (_ui.show[sp]) h += detailHtml(card);
    return h + '</div>';
  }
  function tagList(list, total) { var t = list.slice(); if (total > list.length) return 'Tags ' + t.join(', ') + ' and ' + N(total - list.length) + ' more'; if (t.length === 1) return 'Tag ' + t[0]; return 'Tags ' + t.slice(0, -1).join(', ') + ' and ' + t[t.length - 1]; }
  /* "Update Livestock to N": which herd (if two keep that class), and what happened (optional) */
  function updHtml(card) {
    var u = _ui.upd, d = card.cmp.diffs.filter(function (x) { return x.k === u.k; })[0]; if (!d) return '';
    var h = '<div class="sus-form"><b>Update Livestock to ' + e(N(d.reg)) + ' ' + e(d.k === 'all' ? '' : RW[d.k]) + '</b><p class="sus-mini">This takes ' + e(pl(d.n, 'animal')) + ' off in Livestock with a dated "Register correction" on ' + e(D(card.imp.asOf)) + '. You can delete the correction later and the count goes back.</p>';
    if (d.herds.length > 1) h += '<div class="sus-q"><span class="sus-ql">Which herd were they in?</span><div class="sus-seg">' + d.herds.map(function (c, i) { return '<button type="button" data-rg="uherd|' + i + '" class="' + (u.hi === i ? 'on' : '') + '" aria-pressed="' + (u.hi === i) + '">' + e((c.name || 'Herd ' + c.herd) + ', ' + c.cls + ' (' + N(c.n) + ')') + '</button>'; }).join('') + '</div></div>';
    var ops = [['sold', 'Sold'], ['died', 'Died'], ['moved', 'Moved off the holding'], ['skip', 'Skip']];
    h += '<div class="sus-q"><span class="sus-ql">What happened to the ' + e(N(d.n)) + '? (optional)</span><div class="sus-seg">' + ops.map(function (o) { return '<button type="button" data-rg="uwhy|' + o[0] + '" class="' + (u.why === o[0] ? 'on' : '') + '" aria-pressed="' + (u.why === o[0]) + '">' + e(o[1]) + '</button>'; }).join('') + '</div></div>';
    if ((d.sales || []).length && u.why === 'sold') h += '<label class="sus-mini"><input type="checkbox" id="rg-usale" checked> Link the mart payment of ' + e('£' + N(d.sales[0].amt)) + ' on ' + e(D(d.sales[0].date)) + ' to this sale</label>';
    h += '<div class="sus-bt"><button class="btn-pri sm" data-rg="udo|' + card.species + '"' + (d.herds.length > 1 && u.hi == null ? ' disabled' : '') + '>Update Livestock to ' + e(N(d.reg)) + '</button><button class="sus-lnk" data-rg="ucancel">Cancel</button></div></div>';
    return h;
  }
  function detailHtml(card) {
    var cmp = card.cmp, sp = card.species, h = '<div class="sus-fc"><b>The differences</b><div class="sus-scroll"><table class="sus-t"><tr><th>Class on ' + e(D(cmp.asOf)) + '</th><th class="n">Register</th><th class="n">Livestock</th><th class="n">Normal gaps</th><th class="n">Difference</th></tr>' +
      cmp.classes.map(function (x) { return '<tr><td>' + e(x.label) + '</td><td class="n">' + N(x.reg) + '</td><td class="n">' + N(x.ls) + '</td><td class="n">' + (x.left ? N(x.left) : '') + '</td><td class="n">' + (x.diff ? (x.diff > 0 ? N(x.diff) + ' more in Livestock' : N(-x.diff) + ' more on the register') : 'none') + '</td></tr>'; }).join('') + '</table></div>';
    if (cmp.away.length) h += '<p class="sus-mini">Matched to Stock away: ' + e(cmp.away.map(function (a) { return pl(a.n, 'animal') + ' from ' + D(a.from) + (a.where ? ' (' + a.where + ')' : ''); }).join('; ')) + '.</p>';
    if (cmp.tags.level) {
      h += pageList(sp, 'ls', cmp.tags.lsOnly, 'In Livestock but not on the register', function (x) { return '<tr><td>' + e(x.tag) + '</td><td>' + e(x.cls || '') + '</td><td><div class="sus-ja"><button class="btn-sec sm" data-rg="tgo|' + sp + '|' + e(x.id) + '|sold">Sold</button><button class="btn-sec sm" data-rg="tgo|' + sp + '|' + e(x.id) + '|died">Died</button><button class="btn-sec sm" data-rg="tgo|' + sp + '|' + e(x.id) + '|moved">Moved</button></div></td></tr>'; },
        cmp.tags.lsOnly.length > 1 ? '<div class="sus-bt"><span class="sus-mini">Apply to all ' + N(cmp.tags.lsOnly.length) + ':</span><button class="btn-sec sm" data-rg="tgoall|' + sp + '|sold">Sold</button><button class="btn-sec sm" data-rg="tgoall|' + sp + '|died">Died</button><button class="btn-sec sm" data-rg="tgoall|' + sp + '|moved">Moved</button></div>' : '');
      h += pageList(sp, 'reg', cmp.tags.regOnly, 'On the register but not in Livestock', function (x) { return '<tr><td>' + e(x.tag) + '</td><td>' + e((x.sex === 'F' ? 'Female' : x.sex === 'M' ? 'Male' : '') + (x.dob ? ', born ' + D(x.dob) : '')) + '</td><td><button class="btn-sec sm" data-rg="addone|' + sp + '|' + e(x.tag) + '">Add</button></td></tr>'; },
        cmp.tags.regOnly.length > 1 ? '<div class="sus-bt"><button class="btn-sec sm" data-rg="add|' + sp + '|tags">Add all ' + N(cmp.tags.regOnly.length) + '</button></div>' : '');
    } else if (sp === 'cattle') h += '<p class="sus-mini">Livestock keeps counts by class here, so the check is by class, not by ear tag.</p>';
    return h + '</div>';
  }
  function pageList(sp, which, list, title, row, foot) {
    if (!list.length) return ''; var per = 50, k = sp + which, p = _ui.pg[k] || 0, pages = Math.ceil(list.length / per); if (p >= pages) p = 0;
    return '<h4>' + e(title) + ' (' + N(list.length) + ')</h4><div class="sus-scroll"><table class="sus-t">' + list.slice(p * per, p * per + per).map(row).join('') + '</table></div>' +
      (pages > 1 ? '<div class="sus-bt"><span class="sus-mini">Page ' + (p + 1) + ' of ' + pages + '</span>' + (p > 0 ? '<button class="sus-lnk" data-rg="pg|' + k + '|' + (p - 1) + '">Previous</button>' : '') + (p < pages - 1 ? '<button class="sus-lnk" data-rg="pg|' + k + '|' + (p + 1) + '">Next</button>' : '') + '</div>' : '') + (foot || '');
  }
  /* decision 6a: "Set up Livestock from this file", only when the species has nothing in Livestock */
  var SET_TYPES = { cattle: [['Suckler cows', 'Suckler herd'], ['Dairy cattle', 'Dairy herd'], ['Store/finishing cattle', 'Store and finishing cattle']], sheep: [['Lowland ewes', 'Ewe flock'], ['Upland/hill ewes', 'Hill ewe flock']] };
  var SET_ORDER = { cattle: ['cows', 'heifers', 'steers', 'bulls', 'calves'], sheep: ['ewes', 'rams', 'lambs'] };
  var SET_WORD = { cows: 'cows', heifers: 'heifers', steers: 'steers and young bulls', bulls: 'bulls', calves: 'calves', ewes: 'ewes', rams: 'rams', lambs: 'lambs' };
  function setupHtml(card) {
    var su = card.cmp.setup, sp = card.species, st = _ui.setup[sp] || {}, types = SET_TYPES[sp];
    var h = '<div class="sus-card rg-setup" id="rg-setup-' + sp + '"><span class="sus-k">Your ' + sp + ' register, file from ' + e(D(card.imp.asOf)) + '</span><b class="sus-big">Set up Livestock from this file?</b>' +
      '<p class="sus-mini">Livestock has no ' + sp + ' yet. The file has ' + e(SET_ORDER[sp].filter(function (k) { return su.classes[k]; }).map(function (k) { return N(su.classes[k]) + ' ' + SET_WORD[k]; }).join(', ')) + '. Nothing is added until you tap the button.</p>';
    h += '<div class="sus-q"><span class="sus-ql">What kind of ' + (sp === 'cattle' ? 'herd' : 'flock') + ' is it?</span><div class="sus-seg">' + types.map(function (t, i) { var o = st.type === i; return '<button type="button" data-rg="stype|' + sp + '|' + i + '" class="' + (o ? 'on' : '') + '" aria-pressed="' + o + '">' + e(t[1]) + '</button>'; }).join('') + '</div></div>';
    if (su.tagged) h += '<label class="sus-mini"><input type="checkbox" data-rg-chk="stags|' + sp + '"' + (st.tags ? ' checked' : '') + '> Also add each animal with its tag (' + N(su.tagged) + ')</label>';
    h += '<div class="sus-bt"><button class="btn-pri sm" data-rg="setup|' + sp + '"' + (st.type == null ? ' disabled' : '') + '>Set up Livestock from this file</button></div></div>';
    return h;
  }

  /* ── the panel: Livestock -> Register ── */
  function render() {
    var el = document.getElementById('ls-view-kreg'); if (!el || el.style.display === 'none') { try { if (typeof W.susRedraw === 'function') W.susRedraw(); } catch (er) {} return; }
    if (!on()) { el.innerHTML = ''; return; }
    var c = typeof W.susCompute === 'function' ? W.susCompute() : null;
    if (!c || c.loading) { el.innerHTML = '<div class="sus-card"><p class="sus-mini">Loading the legal tables…</p></div>'; return; }
    if (c.blocked === 'ni') { el.innerHTML = '<div class="sus-card"><b>Northern Ireland is not in the pilot yet.</b></div>'; return; }
    if (c.missing || c.refused) { el.innerHTML = '<div class="sus-card"><b>Set the farm’s nation in Settings first.</b></div>'; return; }
    var h = '<div class="sus-ls">';
    h += '<div class="sus-card"><h3>Your register</h3><p class="sus-mini">Download your cattle register (the CTS “Cattle on Holding” spreadsheet or the ScotEID export) or your flock or herd software’s file as a CSV and add it here. It never changes your figures: Livestock stays the one source. Where the two differ, one card says so and you decide. Nothing is sent anywhere, and we never report to BCMS, LIS, ScotEID, APHIS or EIDCymru.</p></div>';
    var cs = (c.reg && c.reg.cards) || [];
    cs.forEach(function (x) { h += cardHtml(x, 'kreg'); });
    h += filesHtml() + importHtml(c) + correctionsHtml();
    if (typeof W.susSetHtml === 'function') W.susSetHtml(el, h + '</div>'); else el.innerHTML = h + '</div>';   /* -440: keep the typing */
    if (_ui.pop) popRender();
  }
  function filesHtml() {
    var h = '', any = false;
    ['cattle', 'sheep'].forEach(function (sp) {
      var cur = current(sp), old = kept(sp); if (!cur && !old.length) return; any = true;
      var cd = cardFor(sp), st = !cd ? ['n', 'Not checked'] : cd.cmp.status === 'match' ? ['g', 'Matches'] : cd.cmp.status === 'setup' ? ['a', 'Livestock empty'] : cd.open.status === 'open' ? ['a', diffWords(cd)] : cd.open.status === 'later' ? ['n', 'Not now'] : ['g', 'Answered'];
      if (cur) h += '<div class="sus-aw"><div><b>' + e(sp === 'cattle' ? 'Cattle' : 'Sheep') + ' file from ' + D(cur.asOf) + '</b><p class="sus-mini">' + e((cur.file || 'File') + ', imported ' + D(cur.importedOn) + ', ' + pl((cur.rows || []).length, 'row') + ' kept' + ((cur.refused || []).length ? ', ' + pl(cur.refused.length, 'row') + ' refused' : '')) + '</p></div><span class="sus-st ' + st[0] + '">' + e(st[1]) + '</span></div>';
      old.forEach(function (o) { h += '<div class="sus-aw"><div><span class="sus-mini">' + e((sp === 'cattle' ? 'Cattle' : 'Sheep') + ' file from ' + D(o.asOf) + ', kept for 12 months') + '</span></div><span class="sus-st n">Kept</span></div>'; });
    });
    return any ? '<div class="sus-card"><h3>Files</h3>' + h + '</div>' : '';
  }
  function importHtml(c) {
    var p = _ui.imp, cph = (W.ST && W.ST.cphNumber) || '';
    var h = '<div class="sus-card" id="rg-import"><h3>Import a register file</h3>';
    if (!p) {
      h += '<div class="sus-row3"><label class="sus-f"><span>Which animals?</span><select id="rg-sp"><option value="">Let the file tell us</option><option value="cattle">Cattle</option><option value="sheep">Sheep</option></select></label>' +
        '<label class="sus-f"><span>Your register file (CSV)</span><input type="file" accept=".csv,text/csv,text/plain" id="rg-file"></label></div>' +
        '<p class="sus-mini">' + (cph ? 'Files for a holding other than ' + e(cph) + ' are refused.' : 'Add your holding number (CPH) in Settings and a file for another holding is refused.') + ' A newer file replaces the older one for that species; the older one is kept for 12 months.</p>';
      return h + '</div>';
    }
    var r = p.res;
    h += '<p class="sus-mini"><b>' + e(p.file) + '</b>: ' + e(pl(r.rows.length, 'row') + ' read' + (r.refused.length ? ', ' + pl(r.refused.filter(function (x) { return x.line > 0; }).length, 'row') + ' refused' : '')) + '.</p>';
    var whole = r.refused.filter(function (x) { return x.line === 0 && !/only the first/.test(x.why); })[0] || (!r.rows.length ? r.refused[0] || { why: 'no animals read' } : null);
    if (whole) return h + '<p class="sus-mini"><span class="sus-st r">Refused</span> ' + e(cap(whole.why)) + '.</p><div class="sus-bt"><button class="btn-sec sm" data-rg="icancel">Choose another file</button></div></div>';
    if (r.ask === 'species') return h + '<div class="sus-q"><span class="sus-ql">Is this a cattle or a sheep register? GB ear tags look the same for both, so the file can’t tell us.</span><div class="sus-seg"><button type="button" data-rg="isp|cattle">Cattle</button><button type="button" data-rg="isp|sheep">Sheep</button></div></div><div class="sus-bt"><button class="sus-lnk" data-rg="icancel">Cancel</button></div></div>';
    if (r.clash && !p.clashOk) return h + '<p class="sus-mini"><span class="sus-st a">Check</span> This looks like a ' + e(r.species) + ' file, not ' + e(r.clash) + '.</p><div class="sus-bt"><button class="btn-pri sm" data-rg="iclash">Use it as ' + e(r.species) + '</button><button class="btn-sec sm" data-rg="icancel">Choose another file</button></div></div>';
    if (r.rightFileAsk && !p.rightOk) return h + '<p class="sus-mini"><span class="sus-st a">Right file?</span> ' + e(N(Math.round(r.refusedShare * 100))) + '% of the rows couldn’t be read. Nothing is compared until you say it’s the right file.</p>' + refusedList(r) + '<div class="sus-bt"><button class="btn-pri sm" data-rg="iright">Yes, it’s the right file</button><button class="btn-sec sm" data-rg="icancel">Choose another file</button></div></div>';
    var age = p.asOf ? Math.round((Date.parse(today()) - Date.parse(p.asOf)) / 864e5) : 0;
    h += '<div class="sus-row3"><label class="sus-f"><span>This ' + e(r.species) + ' file is from</span><input type="date" id="rg-asof" value="' + e(p.asOf || '') + '" max="' + e(today()) + '"></label></div>' +
      '<p class="sus-mini">' + (r.asOfFrom === 'heading' ? 'The date at the top of the file.' : r.asOfFuture ? 'The file says ' + e(D(r.asOfFuture)) + ', which is after today, so today until you change it. A file can’t be dated after today.' : 'Today: the file has no download date. Change it to the day you downloaded it' + (r.latestMove ? ' (its latest move is ' + e(D(r.latestMove)) + ')' : '') + '.') + ' Everything is compared on this date.</p>';   /* -440 (R4, UX-08) */
    if (age > 30) h += '<p class="sus-mini"><span class="sus-st a">' + e(ageWords(age)) + '</span> Still used. Changes since then will show as differences.</p>';
    if (r.dropped.length) h += '<p class="sus-mini">Not kept: ' + e(r.dropped.slice(0, 8).join(', ') + (r.dropped.length > 8 ? ' and ' + (r.dropped.length - 8) + ' more' : '')) + '. Only what the check needs is kept.</p>';
    if (r.species === 'sheep' && !r.columns.dob && !r.columns.yob) h += '<p class="sus-mini">No birth dates in this file: every sheep is counted as a ewe or ram.</p>';
    h += refusedList(r);
    if (current(r.species) && p.asOf && p.asOf < current(r.species).asOf) h += '<p class="sus-mini"><span class="sus-st a">Older file</span> This file is older than your current ' + e(r.species) + ' file from ' + e(D(current(r.species).asOf)) + '. Importing it makes it the file Livestock is checked against.</p>';
    if (current(r.species)) h += '<p class="sus-mini">This replaces the ' + e(r.species) + ' file from ' + e(D(current(r.species).asOf)) + ', which is kept for 12 months. Answers that still match carry over.</p>';
    return h + '<div class="sus-bt"><button class="btn-pri sm" data-rg="iok">Compare with Livestock</button><button class="sus-lnk" data-rg="icancel">Cancel</button></div></div>';
  }
  /* -440 (UX-37): "2 classes and 5 ear tags differ", not "7 differences" */
  function diffWords(cd) { var o = cd.open.open || [], t = o.filter(function (x) { return /^tag:/.test(x.sig || ''); }).length, k = o.length - t;
    return [k ? pl(k, 'class', 'classes') : '', t ? pl(t, 'ear tag') : ''].filter(Boolean).join(' and ') + ' differ'; }
  function ageWords(d) { return d >= 60 ? Math.floor(d / 30) + ' months old' : d + ' days old'; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function refusedList(r) { var b = r.refused.filter(function (x) { return x.line > 0; }); if (!b.length) return '';
    return '<details class="sus-det"><summary>' + e(pl(b.length, 'row')) + ' not read, with the reason</summary><ul class="sus-ul">' + b.slice(0, 50).map(function (x) { return '<li>' + e('Line ' + x.line + ': ' + x.why) + '</li>'; }).join('') + (b.length > 50 ? '<li>' + e('and ' + N(b.length - 50) + ' more') + '</li>' : '') + '</ul></details>'; }
  function corrections() { return ((W.ST_LS && W.ST_LS.moves) || []).filter(function (m) { return m && /^Register correction/.test(String(m.note || '')); }); }
  function correctionsHtml() {
    var list = corrections(); if (!list.length) return '';
    var meta = typeof W.lsMoveMeta === 'function' ? W.lsMoveMeta() : {};
    return '<div class="sus-card"><h3>Register corrections</h3><p class="sus-mini">Ordinary Livestock entries. Delete one and the count goes back.</p>' + list.map(function (m) {
      var hd = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return String(h.id) === String(m.herd); })[0];
      var lab0 = m.reason === 'moved_in' ? 'Added from the register' : ((meta[m.reason] || [])[2] || m.reason);   /* -440: a register add is not "moved in from another field" */
      return '<div class="sus-aw"><div><b>' + e(lab0 + ' ' + N(m.qty) + (m.cls ? ' ' + m.cls : '') + (hd ? ', ' + (hd.name || hd.type) : '')) + '</b><p class="sus-mini">' + e(D(m.date) + '. ' + m.note) + '</p></div><button class="btn-sec sm" data-rg="cdel|' + e(m.id) + '">Delete</button></div>';
    }).join('') + '</div>';
  }

  /* ── reading a file ── */
  function parse(text, sp) {
    return EN().parseRegisterCsv(text, today(), { species: sp || null, holding: (W.ST && W.ST.cphNumber) || null, nation: typeof W.ukNation === 'function' ? W.ukNation() : null });
  }
  function fileIn(input) {
    var f = input.files && input.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { W.toast && W.toast('That file is over 5 MB. Export the register as CSV and try again', 'info'); return; }
    var sp = (document.getElementById('rg-sp') || {}).value || '', rd = new FileReader();
    rd.onload = function () { var text = String(rd.result || ''), r = parse(text, sp); _ui.imp = { file: String(f.name).slice(0, 200), text: text, sp: sp, res: r, asOf: r.asOf }; render(); };
    rd.onerror = function () { W.toast && W.toast('That file could not be read', 'error'); };
    rd.readAsText(f);
  }
  function importSave() {
    var p = _ui.imp, s = S(); if (!p || !s || !EN()) return; var r = p.res, sp = r.species;
    var asOf = iso((document.getElementById('rg-asof') || {}).value) || p.asOf;
    if (!asOf) { W.toast && W.toast('Which day is the file from?', 'info'); return; }
    if (asOf > today()) { W.toast && W.toast('The file can’t be dated after today', 'info'); return; }   /* -440 (UX-08) */
    var prev = current(sp), id = (API() ? API().uid('rg') : 'rg' + Date.now().toString(36));
    var imp = { id: id, species: sp, file: p.file, asOf: asOf, importedOn: today(), importedBy: who(), rows: r.rows.map(pack), refused: r.refused.slice(0, 500), answers: {}, superseded: false, _new: true };
    if (prev) {
      /* decision 7a: the newer file replaces the older; answers whose difference is unchanged carry over (U8) */
      try { var c0 = W.susCompute(), L = lsIn();
        var nc = EN().registerCompare({ nation: c0.nation, today: today(), species: sp, asOf: asOf, rows: r.rows, kind: kindOf(imp), herds: L.herds, animals: L.animals, moves: L.moves, spans: (s.spans || []), sales: sales() }, LAW(), FAC());
        imp.answers = EN().carryAnswers(prev.answers || {}, nc); } catch (er) {}
      prev.superseded = true; prev._new = true;
    }
    s.regImports.push(imp);
    /* the previous files are kept 12 months, then removed by key */
    var cut = EN()._util && EN()._util.addDays ? EN()._util.addDays(today(), -365) : null;
    s.regImports.filter(function (x) { return x.superseded && cut && x.importedOn && x.importedOn < cut; }).forEach(function (x) { API().removeRow('regImports', x.id); });
    _ui.imp = null; done('Register file added. It checks Livestock; the figures still use Livestock');
  }

  /* ── the farmer's choices, through Livestock's own saves ── */
  function herdById(id) { return ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return String(h.id) === String(id); })[0] || null; }
  function corrNote(imp, add) { return 'Register correction: ' + (add ? 'added from' : 'not on') + ' the ' + imp.species + ' register file from ' + D(imp.asOf); }
  function update(sp) {
    var card = cardFor(sp), u = _ui.upd; if (!card || !u) return; var d = card.cmp.diffs.filter(function (x) { return x.k === u.k; })[0]; if (!d || !(d.n > 0)) return;
    var cand = d.herds.length === 1 ? d.herds[0] : d.herds[u.hi]; if (!cand) { W.toast && W.toast('Which herd were they in?', 'info'); return; }
    var h = herdById(cand.herd); if (!h || typeof W.lsRecordMove !== 'function') return;
    var reason = u.why === 'sold' ? 'sold' : u.why === 'died' ? 'died' : u.why === 'moved' ? 'moved_out' : 'missing', imp = card.imp;
    /* farms that keep ear tags: the named animals only in Livestock come off with the count */
    var ids = card.cmp.tags.level ? card.cmp.tags.lsOnly.filter(function (a) { return String(a.herd) === String(h.id) && (!a.cls || a.cls === cand.cls); }).slice(0, d.n).map(function (a) { return a.id; }) : [];
    var snap = typeof W._lsMoveSnapshot === 'function' ? W._lsMoveSnapshot(h, { animalIds: ids }) : null;
    if (ids.length) dropAnimals(ids);
    var opts = { herdId: h.id, reason: reason, qty: d.n, cls: cand.cls, date: imp.asOf, note: corrNote(imp, false) };
    if (reason === 'moved_out') { opts.leaving = true; opts.fromPlace = (W.ST && W.ST.farmName) || 'This holding'; opts.toPlace = 'Another holding'; }
    var sale = (d.sales || [])[0], useSale = reason === 'sold' && sale && (document.getElementById('rg-usale') || {}).checked;
    if (useSale && W.ST && W.ST.txns && W.ST.txns[sale.ref]) opts.linkTxn = W.ST.txns[sale.ref];
    W.lsRecordMove(opts); var mv = W.LS_LAST_MOVE;
    if (mv && snap) { mv.undo = snap; snap.moveId = mv.id; }
    answer(sp, [d.sig], 'updated', { move: mv ? mv.id : null });
    _ui.upd = null; saveLs(); done('Livestock updated to ' + N(d.reg) + '. A dated register correction was added');
  }
  function dropAnimals(ids) {
    ids.forEach(function (id) { try { if (W.AI && W.AI.farm && W.AI.farm.active()) W.AI.livestock.removeAnimal(id).catch(function () {}); } catch (er) {} });
    W.ST_LS.animals = (W.ST_LS.animals || []).filter(function (a) { return ids.indexOf(a.id) < 0; });
  }
  /* one tag only in Livestock: sold, died or moved (one tap each, or all at once) */
  function tagGo(sp, idsIn, why) {
    var card = cardFor(sp); if (!card) return; var imp = card.imp, list = card.cmp.tags.lsOnly.filter(function (a) { return idsIn.indexOf(String(a.id)) >= 0; }); if (!list.length) return;
    var by = {}; list.forEach(function (a) { var k = String(a.herd) + '|' + (a.cls || ''); (by[k] = by[k] || []).push(a); });
    var reason = why === 'sold' ? 'sold' : why === 'died' ? 'died' : 'moved_out';
    Object.keys(by).forEach(function (k) {
      var g = by[k], h = herdById(g[0].herd); if (!h) return; var ids = g.map(function (a) { return a.id; });
      var snap = typeof W._lsMoveSnapshot === 'function' ? W._lsMoveSnapshot(h, { animalIds: ids }) : null; dropAnimals(ids);
      var opts = { herdId: h.id, reason: reason, qty: ids.length, cls: g[0].cls || '', date: imp.asOf, note: corrNote(imp, false) + ' (' + g.map(function (a) { return a.tag; }).slice(0, 5).join(', ') + (g.length > 5 ? ' and ' + (g.length - 5) + ' more' : '') + ')' };
      if (reason === 'moved_out') { opts.leaving = true; opts.fromPlace = (W.ST && W.ST.farmName) || 'This holding'; opts.toPlace = 'Another holding'; }
      W.lsRecordMove(opts); var mv = W.LS_LAST_MOVE; if (mv && snap) { mv.undo = snap; snap.moveId = mv.id; }
    });
    answer(sp, list.map(function (a) { return a.sig; }), 'updated');
    saveLs(); done(pl(list.length, 'animal') + ' taken off in Livestock with a register correction');
  }
  /* U18: a correction is an ordinary entry; deleting it puts the count back */
  function corrDelete(id) {
    var LS = W.ST_LS, mv = (LS.moves || []).filter(function (m) { return String(m.id) === String(id); })[0]; if (!mv) return;
    var h = herdById(mv.herd);
    if (h && mv.undo && typeof W._lsMoveRestore === 'function') W._lsMoveRestore(h, mv.undo);
    else {
      if (h && typeof W._lsAdjustHead === 'function') W._lsAdjustHead(h, ({ born: 1, bought: 1, moved_in: 1 })[mv.reason] ? 'sold' : 'bought', mv.qty, mv.cls);
      LS.moves = LS.moves.filter(function (m) { return m !== mv; });
    }
    try { (W.ST.txns || []).forEach(function (t) { if (t && t.moveRef === mv.id) delete t.moveRef; }); } catch (er) {}
    /* -439-sus6 (register-build bug): deleting a correction offline came back on the next sign-in, because the server row was
       never deleted and the read put it back. Same pattern as ST_SUS.gone: a tombstone kept on this device until the server
       delete succeeds; every read is swept against it (susRegSweep, also called from the sign-in read). */
    var gs = S().gone = S().gone || {}; gs.lsMoves = gs.lsMoves || []; if (gs.lsMoves.indexOf(String(mv.id)) < 0) gs.lsMoves.push(String(mv.id));
    sweep();
    (S().regImports || []).forEach(function (imp) { var A = imp.answers || {}; Object.keys(A).forEach(function (k) { if (A[k] && A[k].move === mv.id) { delete A[k]; imp._new = true; } }); });
    saveLs(); done('Correction deleted. The count is back as it was');
  }
  /* the tombstone sweep: drop tombstoned moves from Livestock, and retry the server delete; a success clears the tombstone */
  var _sweeping = false;
  function sweep() {
    var s = S(); if (!s || !s.gone || !(s.gone.lsMoves || []).length) return;
    var ids = s.gone.lsMoves.slice(), LS = W.ST_LS;
    if (LS && Array.isArray(LS.moves)) { var before = LS.moves.length; LS.moves = LS.moves.filter(function (m) { return !m || ids.indexOf(String(m.id)) < 0; }); if (LS.moves.length !== before) { try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {} } }
    if (_sweeping) return;
    try {
      if (!(W.AI && W.AI.farm && W.AI.farm.active() && W.AI.livestock && W.AI.livestock.removeMove) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      _sweeping = true;
      Promise.all(ids.map(function (id) { return W.AI.livestock.removeMove(id).then(function () { return id; }, function (er) { console.warn('register correction not deleted on the server yet; kept to try again', er); return null; }); }))
        .then(function (ok) { _sweeping = false; var done0 = ok.filter(Boolean); if (!done0.length) return; s.gone.lsMoves = (s.gone.lsMoves || []).filter(function (id) { return done0.indexOf(id) < 0; }); try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {} });
    } catch (er) { _sweeping = false; }
  }
  W.susRegSweep = sweep;
  try { W.addEventListener('online', function () { try { sweep(); } catch (er) {} }); } catch (er) {}
  /* decision 6a: set up Livestock from the file */
  function setup(sp) {
    var card = cardFor(sp), st = _ui.setup[sp] || {}; if (!card || card.cmp.status !== 'setup' || st.type == null) return;
    var su = card.cmp.setup, t = SET_TYPES[sp][st.type], LS = W.ST_LS; if (!LS) return;
    var id = typeof W.lsNextHerdId === 'function' ? W.lsNextHerdId() : Date.now();
    /* -441: a herd set up from the file is worth today's market price per head (as one added by hand), not £0 */
    var per0 = 0; try { per0 = typeof W.lsHerdMarketVal === 'function' ? (W.lsHerdMarketVal({ type: SET_TYPES[sp][st.type][0], qty: 1 }) || 0) : 0; } catch (er) {}
    var classes = SET_ORDER[sp].filter(function (k) { return su.classes[k] > 0; }).map(function (k) { return { k: k, n: su.classes[k], v: Math.round(per0 * 100) / 100 }; });
    var qty = classes.reduce(function (a, c) { return a + c.n; }, 0);
    var h = { id: id, type: t[0], name: t[1], camp: '', campId: '', track: false, qty: qty, buy: 0, feed: 0, vet: 0, sell: 0, months: 12, notes: 'Set up from the ' + sp + ' register file from ' + D(card.imp.asOf), classes: classes };
    LS.herd.push(h);
    if (st.tags) {
      var day = card.imp.asOf, E = EN(), n = 0;
      (card.imp.rows || []).map(unpack).forEach(function (r) {
        if (!r.tag || (r.off && r.off <= day)) return;
        var k = sp === 'sheep' ? (r.dob || r.yob ? (E._util.ageAt(r.dob || (r.yob + '-04-01'), day) < 12 ? 'lambs' : (r.sex === 'M' ? 'rams' : 'ewes')) : (r.sex === 'M' ? 'rams' : 'ewes'))
                               : lsCls(E._util.ageAt(r.dob, day), r.sex);
        LS.animals.push({ id: 'an' + Date.now().toString(36) + (n++), herd: id, tag: r.tag, sex: r.sex || undefined, breed: r.breed || undefined, dob: r.dob || undefined, dam: r.dam || undefined, cls: k });
      });
      h.track = true;
    }
    _ui.setup[sp] = {}; saveLs(); done(t[1] + ' set up in Livestock: ' + pl(qty, 'animal'));
  }
  function lsCls(age, sex) { return age < 6 ? 'calves' : sex === 'M' ? (age >= 24 ? 'bulls' : 'steers') : (age >= 24 ? 'cows' : 'heifers'); }

  /* ── the pop-out (the owner's note): animals to add, pre-filled from the register, changed here, added on one tap ── */
  function popOpen(sp, what) {
    var card = cardFor(sp); if (!card) return; var cmp = card.cmp, lines = [];
    var herds = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return h && !h.removed && !h.planned && (EN().herdKind(h.type) && ({ cattle: 1 }[sp] ? /suckler|dairy|store_cattle|dairy_young/.test(EN().herdKind(h.type)) : /ewes|rams|store_lambs/.test(EN().herdKind(h.type)))); });
    var dh = herds[0] ? herds[0].id : null;
    if (what === 'tags' || (cmp.tags.level && what !== 'one' && cmp.tags.regOnly.length)) {
      var src = cmp.tags.regOnly; if (what && what !== 'tags') { var d0 = cmp.diffs.filter(function (x) { return x.k === what; })[0]; src = src.filter(function (x) { return !d0 || x.cls === d0.k; }); if (!src.length) src = cmp.tags.regOnly; }
      src.forEach(function (x) { lines.push({ tag: x.tag, sex: x.sex || '', breed: x.breed || '', dob: x.dob || '', on: x.on && x.on <= card.imp.asOf ? x.on : card.imp.asOf, herd: x.herd != null ? x.herd : dh, cls: x.lsCls, n: 1, sig: x.sig, keep: true }); });
    } else if (what === 'one') {
      return;
    } else {
      var d = cmp.diffs.filter(function (x) { return x.k === what; })[0]; if (!d) return; var c0 = d.herds[0] || {};
      /* -440 (R3): a herd kept as counts: list each animal from the register (tag, sex, breed, birth date, date on), the farmer ticks the
         ones to add (all of them ticked only when the list is exactly the difference); the count is added and the tags go in the note.
         A file without ear tags keeps the single count line. Nothing is added until the tap. */
      var rl = (cmp.regByClass && cmp.regByClass[d.k]) || [], kind0 = kindOf(card.imp), all = rl.length === -d.n;
      if (rl.length) rl.forEach(function (x) { var young = x.dob && EN()._util.daysBetween(x.dob, card.imp.asOf) < 183;
          lines.push({ tag: x.tag, sex: x.sex || '', breed: x.breed || '', dob: x.dob || '', on: x.on && x.on <= card.imp.asOf ? x.on : (kind0 === 'moves' || young ? (x.dob || card.imp.asOf) : card.imp.asOf), herd: c0.herd != null ? c0.herd : dh,
                       cls: c0.cls || x.lsCls || (sp === 'sheep' ? 'ewes' : 'cows'), sig: d.sig, countOnly: true, keep: all }); });
      else lines.push({ tag: '', sex: '', breed: '', dob: '', on: card.imp.asOf, herd: c0.herd != null ? c0.herd : dh, cls: c0.cls || (sp === 'sheep' ? 'ewes' : 'cows'), n: -d.n, sig: d.sig, count: true, keep: true });
      _ui.popNeed = -d.n;
    }
    _ui.pop = { sp: sp, lines: lines, how: '', page: 0, herds: herds.map(function (h) { return { id: h.id, name: h.name || h.type, type: h.type }; }) };
    popRender();
  }
  function popOne(sp, tag) {
    var card = cardFor(sp); if (!card) return; var x = card.cmp.tags.regOnly.filter(function (r) { return r.tag === tag; })[0]; if (!x) return;
    popOpen(sp, 'tags'); if (_ui.pop) { _ui.pop.lines.forEach(function (l) { l.keep = l.tag === tag; }); popRender(); }
  }
  function clsOpts(type, cur) {
    var defs = typeof W.lsClassDefs === 'function' ? (W.lsClassDefs(type) || []) : [];
    if (!defs.length) defs = [{ k: cur, label: cur }];
    return defs.map(function (d) { return '<option value="' + e(d.k) + '"' + (d.k === cur ? ' selected' : '') + '>' + e(d.label) + '</option>'; }).join('');
  }
  function popRender() {
    var p = _ui.pop, ov = document.getElementById('rg-pop');
    if (!p) { if (ov) ov.classList.remove('on'); return; }
    if (!ov) { ov = document.createElement('div'); ov.id = 'rg-pop'; ov.className = 'rn-modal'; ov.innerHTML = '<div class="rn-sheet sus-sheet rg-sheet" role="dialog" aria-modal="true" aria-labelledby="rg-pop-t"><div id="rg-pop-box"></div></div>'; document.body.appendChild(ov);
      ov.addEventListener('click', function (ev) { if (ev.target === ov) { _ui.pop = null; popRender(); return; } onClick(ev); }); ov.addEventListener('change', onPopChange); ov.addEventListener('input', onPopChange); }
    var card = cardFor(p.sp), per = 25, pages = Math.max(1, Math.ceil(p.lines.length / per)), pg = Math.min(p.page, pages - 1);
    var hOpt = function (cur) { return p.herds.map(function (h) { return '<option value="' + e(h.id) + '"' + (String(h.id) === String(cur) ? ' selected' : '') + '>' + e(h.name) + '</option>'; }).join(''); };
    var typeOf = function (id) { var h = p.herds.filter(function (x) { return String(x.id) === String(id); })[0]; return h ? h.type : ''; };
    var nk = p.lines.filter(function (l) { return l.keep; }).reduce(function (a, l) { return a + (l.count ? Math.max(0, Math.floor(Number(l.n) || 0)) : 1); }, 0);
    var h = '<div class="sus-sbody"><h3 id="rg-pop-t">Add to Livestock from the register</h3><p class="sus-mini">Pre-filled from your ' + e(p.sp) + ' register file from ' + e(card ? D(card.imp.asOf) : '') + '. Check or change any line. Nothing is added until you tap “Add to Livestock”.</p>' +
      (p.lines.some(function (l) { return l.countOnly; }) ? '<p class="sus-mini">This herd is kept as numbers, so the ' + N(p.lines.length) + ' animals on the register in this class are listed. Tick the ' + (_ui.popNeed ? N(_ui.popNeed) + ' ' : '') + 'that are not in Livestock yet: the number is added and their ear tags go in the note.</p>' : '');
    if (!p.herds.length) h += '<p class="sus-mini"><span class="sus-st a">No herd yet</span> Add a ' + (p.sp === 'cattle' ? 'cattle herd' : 'flock') + ' in Livestock first, or set it up from the file.</p>';
    h += '<div class="sus-scroll"><table class="sus-t rg-lines"><tr><th></th>' + (p.lines.some(function (l) { return l.count; }) ? '<th>How many</th>' : '<th>Ear tag</th><th>Sex</th><th>Breed</th><th>Born</th>') + '<th>Date on</th><th>Herd</th><th>Class</th></tr>';
    p.lines.slice(pg * per, pg * per + per).forEach(function (l, j) {
      var i = pg * per + j;
      h += '<tr><td><input type="checkbox" data-rgl="' + i + '|keep"' + (l.keep ? ' checked' : '') + ' aria-label="Add this line"></td>' +
        (l.count ? '<td><input type="number" min="1" step="1" style="width:80px" data-rgl="' + i + '|n" value="' + e(l.n) + '"></td>'
                 : '<td><input type="text" style="width:150px" data-rgl="' + i + '|tag" value="' + e(l.tag) + '"></td><td><select data-rgl="' + i + '|sex"><option value=""' + (!l.sex ? ' selected' : '') + '></option><option value="F"' + (l.sex === 'F' ? ' selected' : '') + '>Female</option><option value="M"' + (l.sex === 'M' ? ' selected' : '') + '>Male</option></select></td>' +
                   '<td><input type="text" style="width:70px" data-rgl="' + i + '|breed" value="' + e(l.breed) + '"></td><td><input type="date" data-rgl="' + i + '|dob" value="' + e(l.dob) + '"></td>') +
        '<td><input type="date" data-rgl="' + i + '|on" value="' + e(l.on) + '" max="' + e(card ? card.imp.asOf : '') + '"></td><td><select data-rgl="' + i + '|herd">' + hOpt(l.herd) + '</select></td><td><select data-rgl="' + i + '|cls">' + clsOpts(typeOf(l.herd), l.cls) + '</select></td></tr>';
    });
    h += '</table></div>';
    if (pages > 1) h += '<div class="sus-bt"><span class="sus-mini">Page ' + (pg + 1) + ' of ' + pages + '</span>' + (pg > 0 ? '<button class="sus-lnk" data-rg="ppg|' + (pg - 1) + '">Previous</button>' : '') + (pg < pages - 1 ? '<button class="sus-lnk" data-rg="ppg|' + (pg + 1) + '">Next</button>' : '') + '</div>';
    h += '<div class="sus-q"><span class="sus-ql">How did they come? (optional)</span><div class="sus-seg">' + [['born', 'Born here'], ['bought', 'Bought'], ['', 'Skip']].map(function (o) { var x = p.how === o[0]; return '<button type="button" data-rg="phow|' + o[0] + '" class="' + (x ? 'on' : '') + '" aria-pressed="' + x + '">' + e(o[1]) + '</button>'; }).join('') + '</div></div></div>';
    h += '<div class="sus-snav"><button class="btn-sec" data-rg="pclose">Cancel</button><button class="btn-pri" data-rg="psave"' + (nk && p.herds.length ? '' : ' disabled') + '>Add to Livestock' + (nk ? ' (' + N(nk) + ')' : '') + '</button></div>';
    var pb = document.getElementById('rg-pop-box'); if (typeof W.susSetHtml === 'function') W.susSetHtml(pb, h); else pb.innerHTML = h; ov.classList.add('on');   /* -440: keep the typing */
  }
  function onPopChange(ev) {
    var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-rgl'); if (!a || !_ui.pop) return; var q = a.split('|'), l = _ui.pop.lines[+q[0]]; if (!l) return;
    if (q[1] === 'keep') l.keep = !!t.checked; else l[q[1]] = t.value;
    if (q[1] === 'herd') { var hh = _ui.pop.herds.filter(function (x) { return String(x.id) === String(t.value); })[0], defs = hh && typeof W.lsClassDefs === 'function' ? (W.lsClassDefs(hh.type) || []) : []; if (defs.length && !defs.some(function (d) { return d.k === l.cls; })) l.cls = defs[0].k; l.herd = hh ? hh.id : l.herd; }
    if (ev.type === 'change' && (q[1] === 'keep' || q[1] === 'herd' || q[1] === 'n')) popRender();
  }
  function popSave() {
    var p = _ui.pop; if (!p) return; var card = cardFor(p.sp); if (!card || typeof W.lsRecordMove !== 'function') return; var imp = card.imp, LS = W.ST_LS;
    var keep = p.lines.filter(function (l) { return l.keep; }); if (!keep.length) { W.toast && W.toast('Tick at least one line', 'info'); return; }
    for (var i = 0; i < keep.length; i++) { var l = keep[i]; if (!herdById(l.herd)) { W.toast && W.toast('Choose a herd for every line', 'info'); return; }
      if (l.count && !(Math.floor(Number(l.n)) > 0)) { W.toast && W.toast('How many to add?', 'info'); return; }
      if (l.dob && !iso(l.dob)) { W.toast && W.toast('A birth date is not a date', 'info'); return; } }
    var tags = {}; (LS.animals || []).forEach(function (a) { if (a && a.tag) tags[EN().tagKey(a.tag)] = 1; });
    var dup = keep.filter(function (l) { return !l.count && l.tag && tags[EN().tagKey(l.tag)]; })[0];
    if (dup) { W.toast && W.toast('Tag ' + dup.tag + ' is already in Livestock', 'info'); return; }
    var groups = {}, sigs = [], n = 0;
    keep.forEach(function (l) { var on0 = iso(l.on) && l.on <= imp.asOf ? l.on : imp.asOf, k = String(l.herd) + '|' + l.cls + '|' + on0; (groups[k] = groups[k] || { herd: l.herd, cls: l.cls, date: on0, qty: 0, lines: [], tags: [] }); if (l.countOnly && l.tag) groups[k].tags.push(String(l.tag).trim().toUpperCase());
      groups[k].qty += l.count ? Math.floor(Number(l.n)) : 1; groups[k].lines.push(l); if (l.sig && sigs.indexOf(l.sig) < 0) sigs.push(l.sig); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k], h = herdById(g.herd);
      /* -440 (R1): "Skip" is recorded as a move in, which lsRecordMove now raises like a birth or a purchase (no money, so no purchase
         is posted). On a herd with no class breakdown it creates one (cows 48 + heifers 2), so the class is kept through a reload. */
      var snap = typeof W._lsMoveSnapshot === 'function' ? W._lsMoveSnapshot(h) : null;
      W.lsRecordMove({ herdId: h.id, reason: p.how === 'born' ? 'born' : p.how === 'bought' ? 'bought' : 'moved_in', qty: g.qty, cls: g.cls, date: g.date, note: corrNote(imp, true) + (g.tags.length ? ' · ID ' + g.tags.join(', ') : ''), money: 0, breakdown: true });   /* -441: only this "Add" splits a head-count herd */
      var mv = W.LS_LAST_MOVE; if (mv) { if (snap) { mv.undo = snap; snap.moveId = mv.id; } }
      g.lines.forEach(function (l) { if (l.count || l.countOnly || !l.tag) return;
        LS.animals.push({ id: 'an' + Date.now().toString(36) + (n++), herd: h.id, tag: String(l.tag).trim().toUpperCase(), sex: l.sex || undefined, breed: l.breed || undefined, dob: iso(l.dob) || undefined, cls: g.cls }); });
    });
    answer(p.sp, sigs, 'added');
    var tot = keep.reduce(function (a, l) { return a + (l.count ? Math.floor(Number(l.n)) : 1); }, 0);
    _ui.pop = null; popRender(); saveLs(); done(pl(tot, 'animal') + ' added to Livestock with a register correction');
  }

  /* ── events ── */
  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-rg]') : null; if (!b || b.disabled) return;
    var q = b.getAttribute('data-rg').split('|'), a = q[0], sp = q[1];
    switch (a) {
      case 'open': if (typeof W.nav === 'function') W.nav('livestock'); setTimeout(function () { try { W.lsTab('kreg'); } catch (er) {} }, 160); return;
      case 'away': if (API()) API().goTo('away'); return;
      case 'right': { var c = cardFor(sp); if (c) { answer(sp, c.open.open.map(function (o) { return o.sig; }), 'right'); done('Noted: Livestock is right for this file. The next file checks again'); } return; }
      case 'later': { var c2 = cardFor(sp); if (c2) { var u0 = EN()._util.addDays(today(), 14); answer(sp, c2.open.open.map(function (o) { return o.sig; }), 'later', { until: u0 }); done('Hidden for 14 days'); } return; }
      case 'reopen': { var imp = current(sp); if (imp) { var A0 = imp.answers || {}; Object.keys(A0).forEach(function (k) { if (A0[k] && A0[k].a === 'later') delete A0[k]; }); imp._new = true; done(); } return; }
      case 'show': _ui.show[sp] = !_ui.show[sp]; redrawCards(); return;
      case 'pg': _ui.pg[sp] = +q[2]; redrawCards(); return;
      case 'upd': _ui.upd = { sp: sp, k: q[2], why: '', hi: null }; redrawCards(); return;
      case 'uherd': if (_ui.upd) { _ui.upd.hi = +sp; redrawCards(); } return;
      case 'uwhy': if (_ui.upd) { _ui.upd.why = sp; redrawCards(); } return;
      case 'ucancel': _ui.upd = null; redrawCards(); return;
      case 'udo': update(sp); return;
      case 'add': popOpen(sp, q[2]); return;
      case 'addone': popOne(sp, q.slice(2).join('|')); return;
      case 'tgo': tagGo(sp, [q[2]], q[3]); return;
      case 'tgoall': { var c3 = cardFor(sp); if (c3) tagGo(sp, c3.cmp.tags.lsOnly.map(function (x) { return String(x.id); }), q[2]); return; }
      case 'ppg': if (_ui.pop) { _ui.pop.page = +sp; popRender(); } return;
      case 'phow': if (_ui.pop) { _ui.pop.how = sp || ''; popRender(); } return;
      case 'pclose': _ui.pop = null; popRender(); return;
      case 'psave': popSave(); return;
      case 'stype': _ui.setup[sp] = Object.assign({}, _ui.setup[sp] || {}, { type: +q[2] }); render(); return;
      case 'setup': setup(sp); return;
      case 'cdel': corrDelete(q.slice(1).join('|')); return;
      case 'icancel': _ui.imp = null; render(); return;
      case 'isp': if (_ui.imp) { _ui.imp.sp = sp; _ui.imp.res = parse(_ui.imp.text, sp); _ui.imp.asOf = _ui.imp.res.asOf; render(); } return;
      case 'iclash': if (_ui.imp) { _ui.imp.clashOk = true; render(); } return;
      case 'iright': if (_ui.imp) { _ui.imp.rightOk = true; render(); } return;
      case 'iok': importSave(); return;
    }
  }
  function onChange(ev) {
    var t = ev.target; if (!t) return;
    if (t.id === 'rg-file') { fileIn(t); return; }
    if (t.id === 'rg-asof' && _ui.imp) { var v = iso(t.value); if (v) { _ui.imp.asOf = v; render(); } return; }
    var c = t.getAttribute && t.getAttribute('data-rg-chk'); if (c) { var q = c.split('|'); _ui.setup[q[1]] = Object.assign({}, _ui.setup[q[1]] || {}, { tags: !!t.checked }); }
  }
  function redrawCards() { render(); try { var v = document.getElementById('ls-view-manure'); if (v && v.style.display !== 'none' && typeof W.susLsRender === 'function') W.susLsRender(); } catch (er) {} }
  var _wired = false;
  function wire() {
    if (_wired) return; var a = document.getElementById('ls-view-kreg'), m = document.getElementById('ls-view-manure'); if (!a) return; _wired = true;
    [a, m].forEach(function (el) { if (el) { el.addEventListener('click', onClick); el.addEventListener('change', onChange); } });
  }
  function navSync() { try { var t = document.getElementById('ls-tab-kreg'); if (t) t.style.display = on() ? '' : 'none'; } catch (er) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(); navSync(); }); else setTimeout(function () { wire(); navSync(); }, 0);

  try {
    var css = '.rg-card .sus-big{display:block;margin:4px 0 2px}.rg-ok{background:var(--gb);border-color:var(--gp)}.rg-setup{border-color:var(--gp)}' +
      '.rn-modal .rn-sheet.rg-sheet{max-width:960px;width:100%}.rg-lines td{white-space:nowrap}.rg-lines input[type=text],.rg-lines input[type=date],.rg-lines input[type=number],.rg-lines select{font-size:12px;padding:4px 6px}.rg-lines select{min-width:84px}' +
      '@media (max-width:640px){.rg-sheet{max-width:100%}}';
    var stl = document.createElement('style'); stl.id = 'rg-css'; stl.textContent = css; (document.head || document.documentElement).appendChild(stl);
  } catch (er) {}

  W.susRegCompute = compute; W.susRegKey = key; W.susRegRender = function () { wire(); navSync(); render(); }; W.susRegCardHtml = function (sp, where) { var c = cardFor(sp); return c ? cardHtml(c, where || 'manure') : ''; };
  W.susRegClaims = claims; W.susRegLine = lineFor; W.susRegDiffers = differs; W.susRegNavSync = navSync; W._susRegUi = _ui;
}(window));
