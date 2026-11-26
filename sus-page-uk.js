/* sus-page-uk.js - Sustainability Phase 1, 1b and 2, UK desktop (PREBUILD-CHECK-V53 §9 rows 1, 1b and 2).
 * -438-sus5r (register option C, 15 Nov 2026): the register file moved to Livestock -> Register (sus-register-uk.js). The figures
 * always use Livestock; compute() runs the register check beside them (c.reg) and its card joins the jobs and the attention list.
 * Phase 5 (-437-sus5): Who's asking lives in sus-asks-uk.js; this file keeps its sharing log (ST_SUS.consents) and lends it
 * the tile words through _susApi.words, so a pack shows the figures the page shows.
 * Phase 4 (-436-sus4): farm health and targets live in sus-health-uk.js. This file feeds it (inputs().p4, compute().h),
 * persists its figures through the same sus_results path, and lays its tabs over the Phase 1 and 2 summary.
 * Phase 2 (-435-sus2): nitrogen and soil. Crops -> Compliance holds the records (susCropsHtml: N max, the 250 kg field limit,
 * the NVZ records and their CSV, the fertiliser store, the N plan, soil tests, Red Tractor urea); the Crops input form gets
 * the nutrient block and the closed-period check (susCiHtml / susCiRead); Livestock -> Manure spreading uses the same check.
 *
 * Behind SUS_FLAGS.pilot (off by default; pilot farms only). Northern Ireland stays behind SUS_FLAGS.ni (D5).
 * The 14 Nov 2026 ownership decision: the modules own the records and the actions, the one engine (sus-engine-uk.js)
 * works everything out, and the Sustainability page is a read-only summary that links to the module where the farmer acts.
 *   - Livestock -> Manure (this file, susLsRender) holds the records: sizes, housing, stores and readings, stock away and
 *     not ours, the sheep count, the register import, pig and poultry batches, other species, manure moves.
 *   - Settings, Rainfall and Livestock keep their own answers: setup writes back through their own saves.
 *   - Every figure comes from susCompute(): Sustainability, Livestock, the jobs list, the Dashboard attention list, the
 *     bell, the Crops 170 kg line and the print pack all read the same object, and sus_results stores it.
 * Copy is written at source in plain English (the UK build is English only). Status colours always carry a word.
 */
(function (W) {
  'use strict';
  var EN = function () { return W.SusEngineUK || null; };
  var LAW = function () { return W.SUS_LAW || null; };
  var FAC = function () { return W.SUS_FACTORS || null; };
  function on() { return !!(W.SUS_FLAGS && W.SUS_FLAGS.pilot); }
  function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function D(x) { try { return x ? (typeof W.dispDate === 'function' ? W.dispDate(x) : x) : ''; } catch (er) { return x || ''; } }
  function N(x, dp) { var v = Number(x); if (!isFinite(v)) return ''; return v.toLocaleString('en-GB', { maximumFractionDigits: dp == null ? 0 : dp, minimumFractionDigits: 0 }); }
  function pl(n, one, many) { n = Math.round(Number(n) || 0); return N(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function today() { var d = (typeof W.APP_TODAY !== 'undefined' && W.APP_TODAY) ? new Date(W.APP_TODAY) : new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { if (v === '' || v == null) return null; var x = Number(v); return isFinite(x) ? x : null; }
  /* -441: a number outside its range keeps the saved figure and puts it back in the box, with a word; it never blanks it quietly.
     An emptied box still clears the figure. */
  var _rangeAt = 0;
  function rangeNum(t, v, lo, hi, old, what) {
    if (String(v == null ? '' : v).trim() === '') return null;
    var x = num(v); if (x !== null && x >= lo && x <= hi) return x;
    var had = old != null && old !== ''; _rangeAt = Date.now();
    if (typeof W.toast === 'function') W.toast((what || 'That number') + ' should be between ' + lo.toLocaleString('en-GB') + ' and ' + hi.toLocaleString('en-GB') + '. ' + (had ? 'Kept ' + Number(old).toLocaleString('en-GB') + '.' : 'Left blank.'), 'info');
    try { t.value = had ? old : ''; } catch (e) {}
    return had ? old : null;
  }
  function nationKey() { try { var n = typeof W.ukNation === 'function' ? W.ukNation() : ''; return EN() ? EN().nationKey(n) : null; } catch (er) { return null; } }
  var NAT = { E: 'England', W: 'Wales', S: 'Scotland', N: 'Northern Ireland' };

  /* -440 (UX-03, R5, UX-07; fixed as a class): no Sustainability form re-renders under the farmer's typing. Every redraw of a page, a
     sheet or a pop-out goes through setHtml: a field the farmer changed but that is not saved yet (its value differs from what was
     drawn: value vs defaultValue, selected vs defaultSelected, checked vs defaultChecked) keeps its value across the redraw, matched by
     id, data-sf or data-rgl; the field being typed in keeps the focus and the caret. A select keeps a value only if the new list has it,
     and never falls back to the first option silently (every list that matters starts on "Choose…"). */
  function fkey(el) { var k = el.id || el.getAttribute('data-sf') || el.getAttribute('data-rgl') || (el.getAttribute('data-sa') ? el.getAttribute('data-sa') + '|' + (el.getAttribute('data-v') || '') : ''); return k ? el.tagName + '#' + k : null; }
  function dirty(el) {
    if (el.tagName === 'SELECT') return [].some.call(el.options, function (o) { return o.selected !== o.defaultSelected; }) && !(el.selectedIndex === 0 && ![].some.call(el.options, function (o) { return o.defaultSelected; }));
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
    if (el.type === 'file') return false;
    return el.value !== el.defaultValue;
  }
  /* -441 (R5, as a class): a redraw never replaces a box the farmer is in. A box's "change" fires as the farmer clicks or tabs to the
     NEXT box, while the old one still has the focus; redrawing then replaced the box just clicked, focus fell to the page and the
     next typing was lost (store size -> open area; setup farm size -> CPH). So while a typing box inside the part being redrawn has
     the focus, the redraw waits (latest wins) and runs once the focus has left the part's typing boxes and no button is held down
     (a held button is never swapped under the click). Selects, ticks and buttons redraw at once, so a choice that opens more boxes
     still opens them. */
  var _pend = [], _ptrDown = false, _flushT = null, _evt = null;
  function typingBox(a) { if (!a || !a.tagName) return false; if (a.tagName === 'TEXTAREA') return true; if (a.tagName !== 'INPUT') return false; return !/^(checkbox|radio|file|button|submit|reset|range|color|image)$/i.test(a.type || ''); }
  function ctlIn(el) { var a = document.activeElement; return !!(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && el.contains(a)) ? a : null; }
  /* may this redraw replace el now? Not while the farmer is in one of its boxes, unless the redraw comes from that very
     choice (a list picked, a tick ticked) or from a button clicked while the box kept the focus */
  function mayPaint(el) {
    /* a typing box's own "change" fires while the focus is on its way to the next box (the old box or the page has it then):
       wait until the focus has landed */
    if (_evt && _evt.type === 'change' && typingBox(_evt.t) && el.contains(_evt.t)) return false;
    var a = ctlIn(el); if (!a) return true;
    if (typingBox(a)) return !!(_evt && _evt.type === 'click' && _evt.t !== a);
    /* -441b (real-DB retest 16 Nov): a redraw that arrives later on its own (a register file read, a load from the server) is not
       held by a list, tick or file box that has the focus: only a typing box holds it. The file picker kept the focus after a file
       was chosen, so the register preview never appeared until the farmer clicked elsewhere. paint() keeps that control's value
       and focus. */
    if (!_evt) return true;
    return !!(_evt && (_evt.t === a || (_evt.type === 'click' && _evt.t && a.contains && (a === _evt.t || (a.labels && [].some.call(a.labels, function (l) { return l.contains(_evt.t); }))))));
  }
  function flushSoon() { if (_flushT) clearTimeout(_flushT); _flushT = setTimeout(flush, 0); }
  function flush() {
    _flushT = null; if (_ptrDown || !_pend.length) return;
    var list = _pend; _pend = [];
    /* -448 (prod test 26 Nov): a held redraw also runs when the focus has landed in a typing box that holds no typing yet and that
       the redraw can find again (paint() puts the focus and caret back). Tabbing from "Rented land, ha" to the next box kept the
       new "already inside your farm size?" question off screen until the farmer clicked somewhere. A box with typing still holds it. */
    list.forEach(function (p) { if (!p.el.isConnected) return; var a = ctlIn(p.el); if (a && typingBox(a) && (dirty(a) || !fkey(a))) { _pend.push(p); return; } paint(p.el, p.html); });
  }
  try {
    var mark = function (ev) { _evt = { type: ev.type, t: ev.target }; setTimeout(function () { _evt = null; }, 0); };
    var unmark = function () { _evt = null; };
    document.addEventListener('change', mark, true); document.addEventListener('click', mark, true);
    W.addEventListener('change', unmark, false); W.addEventListener('click', unmark, false);
    document.addEventListener('focusout', function () { if (_pend.length) flushSoon(); }, true);
    document.addEventListener('focusin', function () { if (_pend.length) flushSoon(); }, true);
    document.addEventListener('pointerdown', function () { _ptrDown = true; }, true);
    var up = function () { _ptrDown = false; if (_pend.length) flushSoon(); };
    document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
    W.addEventListener('blur', up);
  } catch (er) {}
  W.susRedrawPending = function () { return _pend.length; };
  function setHtml(el, html) {
    if (!el) return;
    _pend = _pend.filter(function (p) { return p.el !== el; });
    if (!mayPaint(el)) { _pend.push({ el: el, html: html }); flushSoon(); return; }
    paint(el, html);
  }
  function paint(el, html) {
    var keep = {}, act = document.activeElement, focus = null;
    try {
      [].forEach.call(el.querySelectorAll('input,select,textarea'), function (f) { var k = fkey(f); if (!k) return;
        var d = dirty(f); if (d) keep[k] = { v: f.value, c: f.checked };
        if (f === act) focus = { k: k, s: (function () { try { return [f.selectionStart, f.selectionEnd]; } catch (er) { return null; } })() }; });
    } catch (er) {}
    /* -448: a focused button (a Yes/No the farmer tabbed to) is found again by its key after the redraw, so Tab then Space still works */
    var bk = null; try { if (act && act.tagName === 'BUTTON' && el.contains(act)) bk = fkey(act); } catch (er) {}
    el.innerHTML = html;
    if (bk) { try { var nb = [].filter.call(el.querySelectorAll('button'), function (b) { return fkey(b) === bk; })[0]; if (nb) nb.focus({ preventScroll: true }); } catch (er) {} }
    try {
      [].forEach.call(el.querySelectorAll('input,select,textarea'), function (f) { var k = fkey(f); if (!k) return; var x = keep[k];
        if (x) { if (f.type === 'checkbox' || f.type === 'radio') f.checked = x.c; else if (f.tagName === 'SELECT') { if ([].some.call(f.options, function (o) { return o.value === x.v; })) f.value = x.v; } else f.value = x.v; }
        if (focus && focus.k === k) { try { f.focus({ preventScroll: true }); if (focus.s && focus.s[0] != null && f.setSelectionRange) f.setSelectionRange(focus.s[0], focus.s[1]); } catch (er) {} } });
    } catch (er) {}
  }
  W.susSetHtml = setHtml;

  /* ── state (declared in index-uk.html as ST_SUS so saveState, loadState and the fresh start know it) ── */
  var LISTS = ['stores', 'readings', 'spans', 'inventory', 'tasks', 'history', 'results', 'batches', 'counts', 'manureMoves', 'soilTests', 'fertStore', 'habitats', 'solar', 'consents', 'regImports'];   /* -438-sus5r: the register files (Livestock -> Register) */   /* Phase 2: soil tests and the fertiliser store; Phase 4: habitats, solar readings; Phase 5: the sharing log */
  function S() {
    var s = W.ST_SUS; if (!s) return null;
    if (!s.settings || typeof s.settings !== 'object') s.settings = {};
    LISTS.forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
    if (!s.gone || typeof s.gone !== 'object') s.gone = {};
    return s;
  }
  function set() { var s = S(); return s ? s.settings : {}; }
  var _saveT = null;
  function save(msg, kind) {
    _cache.key = null;
    try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {}
    if (_saveT) clearTimeout(_saveT);
    _saveT = setTimeout(function () { _saveT = null; try { if (W.AI && W.AI.sus && W.AI.farm && W.AI.farm.active() && W.ST_SUS) W.AI.sus.saveAll(W.ST_SUS).catch(function () {}); } catch (er) {} }, 400);
    redraw();
    if (msg && !(Date.now() - _rangeAt < 300) && typeof W.toast === 'function') W.toast(msg, kind || 'success');   /* -441: the range message stays on screen */
  }
  function saveLivestock() {
    try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {}
    try { if (W.AI && W.AI.farm && W.AI.farm.active() && W.ST_LS) W.AI.livestock.saveAll(W.ST_LS).catch(function (er) { console.error('Backend livestock save failed:', er); }); } catch (er) {}
  }
  function saveProfile() {
    try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {}
    try { if (W.AI && W.AI.profile && W.AI.farm && W.AI.farm.active() && !W.__AI_GUEST) W.AI.profile.save(W.ST).catch(function (er) { console.error('Profile not saved to the server', er); }); } catch (er) {}
  }
  function removeRow(key, id) {
    var s = S(); if (!s) return;
    var before = s[key].length; s[key] = s[key].filter(function (x) { return String(x.id) !== String(id); });
    if (s[key].length !== before) { (s.gone[key] = s.gone[key] || []).push(String(id)); }
  }
  /* The sign-in read (ai-auth-uk.js): server rows win by local_id; a row made here and not sent yet stays; a row removed
     here and not deleted there yet is never taken back. */
  var SUS6_KEYS = ['offN', 'crust', 'rangeShare', 'housedMonths', 'assumeProxy', 'closedReason', 'history', 'addedOn'];
  function hydrate(data) {
    var s = S(); if (!s || !data) return;
    if (data.settings && typeof data.settings === 'object') { var keep = s.settings || {}; s.settings = Object.assign({}, data.settings); if (keep._local) s.settings._local = keep._local;
      if (s.settings.asks === undefined) { if (keep.asks) s.settings.asks = keep.asks; else delete s.settings.asks; }   /* Phase 5: no asks column on the server yet: keep this device's answers */
      /* -439-sus6: the farm facts column (sus_settings.farm_facts, uk-sus6) may not be there yet: keep this device's answers */
      ['lambingMonth', 'assumeEmptied', 'weeksFrom', 'assumeAnMfg', 'wfpSoil', 'washAsk', 'washM3Wk', 'yardM2', 'lambsPerEwe', 'rentedIn', 'nvzSeen'].forEach(function (k) { if (s.settings[k] === undefined && keep[k] !== undefined) s.settings[k] = keep[k]; }); }
    Object.keys(data.tables || {}).forEach(function (k) {
      var srv = data.tables[k]; if (!Array.isArray(srv) || !Array.isArray(s[k])) return;
      var gone = {}; (s.gone[k] || []).forEach(function (id) { gone[String(id)] = 1; });
      var by = {}; srv.forEach(function (x) { if (x && x.id != null && !gone[String(x.id)]) by[String(x.id)] = x; });
      var mine = s[k].filter(function (x) { return x && x._new && !by[String(x.id)]; });
      /* -439-sus6: answers in columns the server may not have yet (uk-sus6, NOT RUN) stay from this device */
      s[k].forEach(function (x) { var y = x && by[String(x.id)]; if (!y) return; SUS6_KEYS.forEach(function (f) { if (y[f] === undefined && x[f] !== undefined) y[f] = x[f]; }); });
      s[k] = Object.keys(by).map(function (id) { return by[id]; }).concat(mine);
    });
    _cache.key = null;
    try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {}
    redraw();
  }

  /* ── inputs: everything the engine needs, read from the modules ── */
  /* -447 (web test P1-5): Settings calls the farm size "the whole farm, owned and rented", while this setup added the rented land on
     top - a farmer who followed Settings counted it twice, which spreads the manure over too many hectares. So it is asked: is the
     rented land inside the farm size? Not answered: inside (the smaller area, the cautious side for the 170 kg limit), and said. */
  function holdingHa() {
    var own = num(W.ST && W.ST.farmHa) || 0, st = set(), rent = (st.rentedAsk === 'yes' ? (num(st.rentedHa) || 0) : 0);
    var t = !rent ? own : st.rentedIn === 'no' ? own + rent : Math.max(own, rent); return t > 0 ? t : null;
  }
  /* -447 (web test P1-6): the fields in Crops and Livestock add up to more than the farm the limits are worked over - one of the two is
     wrong, and the per-hectare figures disagree (Nitrogen per field area, the 170 kg limit per farm). Said once, as a setup job. */
  function areaAsk(inp) {
    var ha = 0; ((inp.n && inp.n.lands) || []).forEach(function (l) { ha += num(l.area) || 0; });
    var hold = num(inp.holdingHa); return hold > 0 && ha > hold * 1.05 + 0.5 ? [{ what: 'areaCheck', fieldsHa: Math.round(ha * 10) / 10, holdingHa: Math.round(hold * 10) / 10 }] : [];
  }
  var _nvzSeenT = null; function nvzSeenSave() { if (_nvzSeenT) return; _nvzSeenT = setTimeout(function () { _nvzSeenT = null; try { var s0 = S(); if (s0 && W.AI && W.AI.sus && W.AI.farm && W.AI.farm.active()) W.AI.sus.saveAll(s0).catch(function () {}); if (typeof W.saveState === 'function') W.saveState(); } catch (er) {} }, 0); }
  function rentedInAsk() { var st = set(); return st.rentedAsk === 'yes' && num(st.rentedHa) > 0 && st.rentedIn !== 'yes' && st.rentedIn !== 'no'; }
  /* Livestock herds of other species are records too. Until the farmer adds batches (pigs, poultry) or a count (goats, deer,
     horses, camelids) in Livestock -> Manure, the herd's head count stands for the whole year, tagged as an estimate. */
  var KIND_COUNT = { goats: 'goat', deer: 'deer', horses: 'horse', camelids: 'alpaca' };
  function herdsOf(kinds) { return ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return h && !h.removed && !h.planned && (Number(h.qty) || 0) > 0 && kinds.indexOf(EN().herdKind(h.type)) >= 0; }); }
  function batchesIn() {
    var own = (S() ? S().batches : []).map(function (b) { return { local_id: b.id, name: b.name, species: b.species, type: b.type, stage: b.stage || null, placed: b.placed, cleared: b.cleared,
      n: b.n, deaths: b.deaths, where: b.where, repeats: !!b.repeats, empty_weeks: b.emptyWeeks, holding: b.holding || 'own', occupier: b.occupier || null,
      off_n: b.offN != null ? b.offN : null, crust: b.crust || storeCrust() || null, rangeShare: b.rangeShare != null ? b.rangeShare : null }; });
    var y = today().slice(0, 4), has = { pig: own.some(function (b) { return b.species === 'pig'; }), poultry: own.some(function (b) { return b.species === 'poultry'; }) };
    herdsOf(['pigs', 'poultry']).forEach(function (h) {
      var sp = EN().herdKind(h.type) === 'pigs' ? 'pig' : 'poultry'; if (has[sp]) return;
      var t = String(h.type || '').toLowerCase(), type = sp === 'pig' ? (/sow/.test(t) ? 'sows' : /boar/.test(t) ? 'boars' : 'finishers') : (/broiler/.test(t) ? 'broilers' : /layer|hen/.test(t) ? 'layers' : /turkey/.test(t) ? 'turkeys' : /duck/.test(t) ? 'ducks' : 'broilers');
      own.push({ local_id: 'herd-' + h.id, name: h.name, species: sp, type: type, stage: null, placed: y + '-01-01', cleared: y + '-12-31', n: h.qty, deaths: 0,
                 where: /free.range/.test(t) ? 'range' : 'house', repeats: false, holding: 'own', occupier: 'us', fromHerd: true });
    });
    return own;
  }
  function countsIn() {
    var own = (S() ? S().counts : []).map(function (c) { return { species: c.species, age_band: c.ageBand, milking: c.milking, n: c.n, ownership: c.ownership, occupier: c.occupier, housedMonths: c.housedMonths != null ? c.housedMonths : null, assumeProxy: c.assumeProxy === true }; });
    herdsOf(['goats', 'deer', 'horses', 'camelids']).forEach(function (h) {
      var sp = KIND_COUNT[EN().herdKind(h.type)]; if (own.some(function (c) { return c.species === sp || (sp === 'alpaca' && c.species === 'llama'); })) return;
      own.push({ species: sp, n: h.qty, ownership: /livery/i.test(h.type || '') ? 'notours' : 'ours', occupier: null, milking: /dairy/i.test(h.type || '') ? true : null, fromHerd: true });
    });
    return own;
  }
  /* goats on this holding today: goat herds in Livestock and goat counts under Other stock (ours; not livery on someone else's land) */
  function goatHead(inp) {
    var n = 0; (inp.herds || []).forEach(function (h) { if (EN().herdKind(h.type) === 'goats') n += Math.max(0, Number(h.qty) || 0); });
    (inp.counts || []).forEach(function (c) { if (c.species === 'goat' && !c.fromHerd && c.ownership !== 'notours') n += Math.max(0, Number(c.n) || 0); });
    return Math.floor(n);
  }
  /* -440 (UX-27): the slurry crust is asked once, on the store: all slurry stores covered = covered; every open one "no crust" = none;
     an open one that crusts = crust; unanswered = unanswered (counted as crusted, the higher figure). A group's own old answer stays. */
  function storeCrust() {
    var st = set(), L = (S() ? S().stores : []).filter(function (x) { return x && !x.removed && (x.kind === 'lagoon' || x.kind === 'tank'); }); if (!L.length) return null;
    if (L.every(function (x) { return x.covered === true; })) return 'cover';
    var open = L.filter(function (x) { return x.covered !== true; }), ans = open.map(function (x) { return (st.storeCrust || {})[x.id] || null; });
    if (ans.some(function (a) { return a === 'crust'; })) return 'crust'; if (ans.every(function (a) { return a === 'none'; })) return 'none'; return null;
  }
  function housing() {
    var h = JSON.parse(JSON.stringify(set().housing || {})), sc = storeCrust();
    ['sucklers', 'dairy', 'followers'].forEach(function (g) { if (h[g] && !h[g].crust && sc) h[g].crust = sc; });
    /* -440 (UX-28): "housed for winter" with a date not chosen yet uses the estimate for that date (tagged), never no housing at all */
    ['sucklers', 'dairy', 'followers'].forEach(function (g) { var x = h[g]; if (!x || x.mode !== 'winter' || (x['in'] && x.out)) return;
      var d0 = EN().housingDefault(g, nationKey(), FAC() || {}, null) || {}; if (!x['in']) x['in'] = d0['in']; if (!x.out) x.out = d0.out; x.estimate = true; });
    /* The Rainfall housing log (production livestock_housing): the latest "Housed" this season and "Turned out" this year
       are the real dates; they beat the usual ones. */
    try {
      var t = today(), y = +t.slice(0, 4), lastIn = null, lastOut = null;
      ((W.ST_RAIN && W.ST_RAIN.housing) || []).forEach(function (x) {
        if (!x || !x.date || x.date > t) return;
        if (x.ev === 'in' && x.date >= (y - (t.slice(5) < '08-01' ? 1 : 0)) + '-08-01' && (!lastIn || x.date > lastIn)) lastIn = x.date;
        if (x.ev === 'out' && x.date >= y + '-01-01' && (!lastOut || x.date > lastOut)) lastOut = x.date;
      });
      ['sucklers', 'dairy', 'followers'].forEach(function (g) {
        var x = h[g]; if (x && x.mode && x.mode !== 'winter') return;
        if (lastIn || lastOut) { var d0 = EN().housingDefault(g, nationKey(), FAC() || {}, null) || {}; h[g] = Object.assign({ mode: 'winter', 'in': d0['in'], out: d0.out }, x || {}); if (lastIn) h[g]['in'] = lastIn.slice(5); if (lastOut) h[g].out = lastOut.slice(5); h[g].log = true; if (!x || !x.mode) { h[g].estIn = !lastIn; h[g].estOut = !lastOut; } }
      });
    } catch (er) {}
    return h;
  }
  function inputs() {
    var LS = W.ST_LS || {}, st = set(), t = today();
    return { nation: nationKey(), year: +t.slice(0, 4), today: t,
      /* -440 (R6): a generic "Beef cattle" herd reads as the kind the farmer answered (finishing cattle use the beef rows) */
      herds: (LS.herd || []).filter(function (h) { return h && !h.removed && !h.planned; }).map(function (h) { var bk = genericBeef(h) && (st.beefKind || {})[h.id]; return { id: h.id, type: bk === 'store_cattle' ? 'Store/finishing cattle' : h.type, qty: h.qty, classes: bk === 'store_cattle' && h.classes ? h.classes.map(function (c) { return c.k === 'cows' ? { k: 'heifers', n: c.n } : c; }) : (h.classes || null) }; }),
      animals: (LS.animals || []).map(function (a) { return { herd: a.herd, sex: a.sex, cls: a.cls, dob: a.dob, status: a.status }; }),
      moves: (LS.moves || []).map(function (m) { return { herd: m.herd, reason: m.reason, qty: m.qty, cls: m.cls, toCls: m.toCls, date: m.date }; }),
      reg: (typeof W.susRegKey === 'function') ? W.susRegKey() : null,   /* -438-sus5r: the register never feeds the figures; a change of file or answer only redraws its card */
      spans: (S() ? S().spans : []).map(function (x) { return { kind: x.kind, species: x.species, role: x.role, n: x.n, from: x.from, to: x.to, occupier: x.occupier }; }),
      batches: batchesIn(), counts: countsIn(),
      manureMoves: (S() ? S().manureMoves : []).map(function (m) { return { kind: m.kind, qty: m.qty, unit: m.unit, manure: m.manure, kg_n: m.kgN, moved_on: m.on }; }),
      opts: { size: st.sucklerSize || null, eweSize: st.eweSize || null, yieldBand: st.dairyYield || null, lambingMonth: st.lambingMonth || null, ewesIn: st.ewesIn || null, lambsPerEwe: st.lambsPerEwe != null ? st.lambsPerEwe : null },
      assumeEmptied: st.assumeEmptied === true, weeksFrom: st.weeksFrom || null, wash: { ask: st.washAsk === 'yes' || st.washAsk === 'no' ? st.washAsk : null, m3Wk: st.washAsk === 'yes' ? num(st.washM3Wk) : null, yardM2: st.washAsk === 'yes' ? num(st.yardM2) : null },   /* -446 (P0-2) */ assume: { anMfg: st.assumeAnMfg === true }, wfpSoil: st.wfpSoil || null,
      holdingHa: holdingHa(), rentedInAsk: rentedInAsk(), housing: housing(), pigFeed: st.pigFeed || null,
      stores: (S() ? S().stores : []).map(function (x) { return { local_id: x.id, kind: x.kind, capacity_m3: x.capacityM3, covered: x.covered, built_or_changed: x.builtOrChanged, open_area_m2: x.openAreaM2, removed: x.removed }; }),
      readings: (S() ? S().readings : []).map(function (r) { return { store_local_id: r.store, read_on: r.on, fill_frac: r.frac }; }),
      rainNormal: (typeof W.rnNormalMonthly === 'function') ? W.rnNormalMonthly() : null,
      rainWet: rainWet(t),   /* -439-sus6 (L7): a 1-in-5 wet season from the farm's Rainfall normal (80th percentile of ~30 ERA5 seasons) */
      nvz: (function () { var nv = (typeof W.ukNvzStatus === 'function') ? W.ukNvzStatus() : { inNvz: null };
        /* -447 (web test P1-14): an NVZ answer belongs to the nation it was given under. The farm's nation changed since: asked again
           (nvzSeen remembers the nation and the answer; a new answer, here or in Rainfall, takes the current nation). */
        if ((nv.inNvz === true || nv.inNvz === false) && nv.editable !== false) { var nk0 = nationKey(), sn = st.nvzSeen;
          if (!sn || sn.v !== nv.inNvz) { st.nvzSeen = { n: nk0, v: nv.inNvz }; nvzSeenSave(); }
          else if (sn.n && nk0 && sn.n !== nk0) nv = Object.assign({}, nv, { inNvz: null, how: 'other-nation', was: sn.n }); }
        return nv.inNvz === null && st.nvzAsk === 'unsure' ? Object.assign({}, nv, { inNvz: true, assumed: true, how: 'unsure' }) : nv; })(),   /* -440 (UX-09) */
      soil: (W.ST_RAIN && W.ST_RAIN.soils === 'sandy') ? 'sandy' : 'other',
      inv: (S() ? S().inventory : []).slice(), taskStates: taskStates(),
      sheepKeeper: (typeof W.ukKeepsSheepOrGoats === 'function') ? W.ukKeepsSheepOrGoats() : false,
      law: LAW() ? LAW().id + '-' + LAW().version : null, fac: FAC() ? FAC().id + '-' + FAC().version : null,
      n: nInputs(),   /* Phase 2: fertiliser inputs, spreading, fields, soil tests, Red Tractor */
      p4: (typeof W.susHealthInputs === 'function') ? W.susHealthInputs() : null };   /* Phase 4: bills, fuel, lime, water, habitats, solar, targets */
  }
  function rainWet(t) {
    var nm = (typeof W.rnNormalMonthly === 'function') ? W.rnNormalMonthly() : null;
    var N0 = W.ST_RAIN && W.ST_RAIN.normal;
    try { return EN().wetYearRain(nm, N0 && N0.band, N0 && N0.years); } catch (er) { return { mm: nm, basis: nm ? 'average' : null, years: 0 }; }
  }
  function taskStates() { var o = {}; (S() ? S().tasks : []).forEach(function (x) { if (x && x.id) o[x.id] = { status: x.status, until: x.until }; }); return o; }
  /* -440 (UX-10, UX-26): does the farm keep stock at all, and does it keep slurry? A farm with none gets no livestock cards or questions
     (an "Add livestock" link instead); a farm with no slurry gets no slurry store card. */
  function lsOff() { try { return typeof W.entOn === 'function' && !W.entOn('livestock'); } catch (er) { return false; } }
  function stockInfo(inp) {
    var st = set(), any = inp.herds.some(function (h) { return (Number(h.qty) || 0) > 0 || (h.classes || []).some(function (c) { return c.n > 0; }); }) || inp.batches.length > 0 || inp.counts.length > 0 || inp.spans.length > 0;
    var stores = inp.stores.some(function (x) { return !x.removed; }), slurryStore = inp.stores.some(function (x) { return !x.removed && (x.kind === 'lagoon' || x.kind === 'tank'); });
    var slurry = slurryStore || ['sucklers', 'dairy', 'followers'].some(function (g) { var x = st.housing && st.housing[g]; return x && x.mode !== 'out' && (x.system === 'slurry' || x.system === 'both'); }) || inp.batches.some(function (b) { return b.species === 'pig' && (b.where || 'house') === 'house'; });
    return { any: any || stores, slurry: slurry, lsOff: lsOff() };
  }
  function setupNeeds(inp, man) {
    var st = set(), rows = (man && man.rows) || [], has = function (re) { return rows.some(function (r) { return re.test(r.key); }); }, n = inp.nation;
    var cattle = inp.herds.some(function (h) { var k = EN().herdKind(h.type); return k === 'suckler' || k === 'dairy' || k === 'dairy_young' || k === 'store_cattle'; });
    var gb = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return h && !h.removed && !h.planned && (Number(h.qty) || 0) > 0 && genericBeef(h) && !(st.beefKind || {})[h.id]; });
    return { rented: st.rentedAsk || null, beefKind: gb.length ? gb.map(function (h) { return h.name || h.type; }) : null,
      sizes: { suckler: n !== 'N' && !st.sucklerSize && has(/^suckler_/), ewe: n !== 'N' && !st.eweSize && has(/^ewe_/), dairy: n !== 'N' && !st.dairyYield && has(/^dairy_(lt|60|gt)/) },
      housing: cattle && !(st.housing && (st.housing.sucklers || st.housing.dairy || st.housing.followers)), away: st.awayAsk === 'unsure' ? 'unsure' : st.awayAsk === 'yes' && !inp.spans.length ? 'add' : null,   /* -440 (UX-30) */
      lambing: inp.herds.some(function (h) { var k = EN().herdKind(h.type); return k === 'ewes'; }) && !st.lambingMonth,
      system: cattle && !['sucklers', 'dairy', 'followers'].some(function (g) { return st.housing && st.housing[g] && st.housing[g].system; }),
      /* -440 (UX-17): slurry is kept (a cattle group on slurry, or housed pigs) and no slurry store is recorded: the storage rule can't be
         checked. -441: in an NVZ that is a legal job (the engine cites the storage rule), never "Nothing by law"; 'cattle' or 'pig'
         says which storage window applies */
      store: (function () { if (inp.nvz.inNvz === false || inp.stores.some(function (x) { return !x.removed && (x.kind === 'lagoon' || x.kind === 'tank'); })) return false;
        if (['sucklers', 'dairy', 'followers'].some(function (g) { var x = st.housing && st.housing[g]; return x && x.mode !== 'out' && (x.system === 'slurry' || x.system === 'both'); })) return 'cattle';
        return inp.batches.some(function (b) { return b.species === 'pig' && (b.where || 'house') === 'house'; }) ? 'pig' : false; })() };
  }

  /* ── the one computation ── */
  var _cache = { key: null, val: null };
  function compute() {
    if (!on()) return null;
    var E = EN(), L = LAW(), F = FAC();
    if (!E || !L) return { loading: true };
    var inp = inputs();
    if (!inp.nation) return { missing: 'nation' };
    if (inp.nation === 'N' && !(W.SUS_FLAGS && W.SUS_FLAGS.ni)) return { blocked: 'ni', nation: 'N' };
    var key = E.inputsHash(inp);
    if (_cache.key === key && _cache.val) return _cache.val;
    var man = E.yearManure(inp, L, F);
    if (!man.refused && inp.rentedInAsk) man.estimates = (man.estimates || []).concat(['the rented land counted as inside the farm size until you say (the smaller area, the cautious side)']);   /* -447 (P1-5) */
    if (man.refused) return { refused: man.refused };
    /* -439-sus6 (S18): only the open surface the farmer gave; no 1 m² per 2.1 m³ rule */
    var area = 0; inp.stores.forEach(function (s) { if (!s.removed && (s.kind === 'lagoon' || s.kind === 'tank') && s.covered !== true && num(s.open_area_m2) > 0) area += num(s.open_area_m2); });
    var RW = inp.rainWet || {}, followers = inp.herds.some(function (h) { var k = E.herdKind(h.type); return k === 'dairy' || k === 'dairy_young'; }) ? 'dairy' : 'beef';
    var flow = E.slurryInflow({ nation: inp.nation, monthly: man.monthly, year: inp.year, housing: inp.housing, openAreaM2: area, rainMm: RW.mm, rainBasis: RW.basis, pigFeed: inp.pigFeed, pigBatches: inp.batches, followers: followers, washM3Wk: inp.wash ? inp.wash.m3Wk : null, yardM2: inp.wash ? inp.wash.yardM2 : null }, L, F || {});
    var anyPig = inp.batches.some(function (b) { return b.species === 'pig' && (b.where || 'house') === 'house'; }), anyPoultry = inp.batches.some(function (b) { return b.species === 'poultry' && (b.where || 'house') !== 'field'; });   /* the pig rule is for pig slurry: housed pigs */
    var places = { sow: 0, finisher: 0, poultry: 0 }; inp.batches.forEach(function (b) { var n = Number(b.n) || 0; if (b.species === 'poultry') places.poultry += n; else if (/sow|gilt/.test(b.type || '')) places.sow += n; else places.finisher += n; });
    var store = E.storePlan({ nation: inp.nation, nvz: inp.nvz.inNvz, stores: inp.stores, readings: inp.readings, inflowPerDay: flow.perDay || [0,0,0,0,0,0,0,0,0,0,0,0], today: inp.today,
                              kind: anyPig ? 'pig' : 'cattle', places: places, hasPigOrPoultry: anyPig || anyPoultry, soil: inp.soil, assumeEmptied: inp.assumeEmptied, weeksFrom: inp.weeksFrom, washAsk: inp.wash ? inp.wash.ask : null, washGiven: !!(inp.wash && (inp.wash.m3Wk != null || inp.wash.yardM2 != null)) }, L);
    var savedInv = inp.inv.filter(function (x) { return +x.year === +inp.year; }).map(function (x) { return { year: x.year, ewes: x.ewes, rams: x.rams, other: x.other, goats: x.goats, counted_on: x.countedOn, filed_on: x.filedOn, filed_via: x.filedVia }; })[0] || null;
    /* -439-sus6: in NI goats have their own return (below); the sheep return is for a flock */
    var niSheep = inp.nation !== 'N' || inp.herds.some(function (h) { var k = E.herdKind(h.type); return k === 'ewes' || k === 'rams' || k === 'store_lambs'; });
    /* -440 (UX-02, fixed as a class): goats are on the GB sheep AND goat inventory wherever they are recorded - a goat herd in Livestock
       or a count under "Other stock" (ours, on our holding). A goat-only holding in England, Wales or Scotland gets the card and the job. */
    var gbGoats = inp.nation === 'N' ? 0 : goatHead(inp);
    var sheep = (inp.sheepKeeper || gbGoats > 0) && niSheep ? E.sheepReturnPrefill(inp.nation, inp.today, man.records, savedInv, L) : null;
    if (sheep && !savedInv) { var R0 = E.sheepReturn(inp.nation, inp.today, L); if (R0 && R0.year !== inp.year) { var sv2 = inp.inv.filter(function (x) { return +x.year === +R0.year; })[0]; if (sv2) { savedInv = { year: sv2.year, ewes: sv2.ewes, rams: sv2.rams, other: sv2.other, goats: sv2.goats, counted_on: sv2.countedOn, filed_on: sv2.filedOn, filed_via: sv2.filedVia }; sheep = E.sheepReturnPrefill(inp.nation, inp.today, man.records, savedInv, L); } } }
    if (sheep) { sheep.estimate.goats = gbGoats; if (sheep.counted) sheep.counted.goats = savedInv && savedInv.goats != null ? Math.max(0, Number(savedInv.goats) || 0) : gbGoats; sheep.goats = gbGoats > 0 || !!(sheep.counted && sheep.counted.goats); }
    var need = setupNeeds(inp, man);
    /* -438-sus5r (register option C): the register checks Livestock on the file's date; the figures above stay on Livestock.
       The legal inputs go with it so the card can say when the register's numbers would change a legal answer (U17). */
    var reg = null;
    try { reg = (typeof W.susRegCompute === 'function') ? W.susRegCompute(inp, { manure: { nation: inp.nation, year: inp.year, today: inp.today, herds: inp.herds, animals: inp.animals, moves: inp.moves, spans: inp.spans,
        batches: inp.batches, counts: inp.counts, manureMoves: inp.manureMoves, opts: inp.opts, holdingHa: inp.holdingHa },
      inflow: { nation: inp.nation, year: inp.year, housing: inp.housing, openAreaM2: area, rainMm: RW.mm, rainBasis: RW.basis, pigFeed: inp.pigFeed, pigBatches: inp.batches, followers: followers },
      store: inp.stores.length ? { nation: inp.nation, nvz: inp.nvz.inNvz, stores: inp.stores, readings: inp.readings, today: inp.today, kind: anyPig ? 'pig' : 'cattle', places: places, hasPigOrPoultry: anyPig || anyPoultry, soil: inp.soil, assumeEmptied: inp.assumeEmptied, weeksFrom: inp.weeksFrom } : null,
      base: { perHa: man.perHa, over: man.over, storeStatus: inp.stores.length ? store.status : null } }) : null; } catch (er) { console.warn('register check', er); reg = null; }
    /* -439-sus6 (L15): NI goats have their own inventory, due 5 January */
    var goats = null; if (inp.nation === 'N' && (inp.herds.some(function (h) { return E.herdKind(h.type) === 'goats'; }) || inp.counts.some(function (x) { return x.species === 'goat' && x.ownership !== 'notours'; }))) {
      var GR = E.sheepReturn('N', inp.today, L, 'goats'); goats = GR ? { dates: GR, filed: false } : null; }   /* marked done on the job itself (sus_tasks) */
    var jobs = E.legalJobs({ nation: inp.nation, today: inp.today, year: inp.year, manure: man, nvz: inp.nvz, store: inp.stores.length ? store : null, sheep: sheep, goats: goats, setup: need,
                             asks: (man.asks || []).concat(inp.rentedInAsk ? [{ what: 'rentedIn' }] : [], areaAsk(inp)), exceptions: man.exceptions, states: inp.taskStates, fmt: D, register: reg ? reg.jobs : [], scotZone: inp.n && inp.n.zone }, L);
    /* Phase 2: nitrogen and soil, and its jobs beside the livestock ones (one list) */
    var nn = nCompute(inp);
    jobs = jobs.concat(E.nitrogenJobs({ nation: inp.nation, today: inp.today, year: inp.year, records: nn.rec, soil: nn.has && !(inp.nation === 'S' && set().wfpSoil === 'no') ? nn.soil : null,   /* -439-sus6 (L20): Scotland asks whether soil analysis is one of the WFP items */ urea: nn.urea, states: inp.taskStates, fmt: D }, L))
               .sort(function (a, b) { return (a.kind === 'law' ? 0 : 1) - (b.kind === 'law' ? 0 : 1) || ((a.dueIn == null ? 9999 : a.dueIn) - (b.dueIn == null ? 9999 : b.dueIn)); });
    var val = { nation: inp.nation, year: inp.year, today: inp.today, manure: man, inflow: flow, store: store, sheep: sheep, goats: goats, jobs: jobs, need: need, nvz: inp.nvz, n: nn, reg: reg, stock: stockInfo(inp),
                holdingHa: inp.holdingHa, inputs: inp, hash: key, law_set: inp.law, factor_set: inp.fac };
    /* Phase 4: farm health (footprint, energy, water, nature, targets), from the same inputs, in the same object */
    try { val.h = (typeof W.susHealthCompute === 'function') ? W.susHealthCompute(val) : null; } catch (er) { console.warn('sustainability health', er); val.h = null; }
    _cache = { key: key, val: val };
    persistResults(val);
    return val;
  }
  /* derived values ARE persisted (§4.4): only when what they were worked out from changed */
  var _resT = null;
  function persistResults(c) {
    var s = S(); if (!s || !c || !c.manure) return;
    /* a farm with no stock, no store and no flock has no result to keep (and a fresh start must leave nothing behind) */
    if (!c.manure.rows.length && !(c.store && c.store.capacityM3) && !c.sheep && !(c.n && c.n.has) && !(c.h && c.h.any)) return;
    var p = String(c.year), at = new Date().toISOString(), M = c.manure, St = c.store || {}, sh = c.sheep;
    var want = [
      ['manure_n_ha', M.perHa, null, M.status], ['manure_n_kg', M.kg, null, M.status], ['holding_ha', c.holdingHa, null, null],
      ['store_full_by', null, St.fullBy || null, St.status || null], ['store_need_m3', St.needM3 != null ? St.needM3 : null, null, St.status || null],
      ['jobs_open', c.jobs.filter(function (j) { return j.open; }).length, null, null]
    ];
    if (c.n && c.n.has) { var R2 = c.n.rec, om = 0; Object.keys(R2.organic.fields).forEach(function (f) { om = Math.max(om, R2.organic.fields[f].worstKgHa); });
      var nk = 0; R2.rows.forEach(function (r) { if (r.kgN) nk += r.kgN; });
      want.push(['nmax_over', R2.over, R2.crops.map(function (k) { return k.crop + ':' + (k.limitKgHa == null ? '-' : Math.round(k.limitKgHa)) + '/' + Math.round(k.appliedKgHa); }).join(','), R2.over ? 'over' : R2.crops.some(function (k) { return k.status === 'within'; }) ? 'within' : 'missing'],
                ['field_organic_max', om, null, R2.organic.over.length ? 'over' : 'within'], ['n_applied_kg', nk, null, R2.missing ? 'missing' : null], ['n_records_missing', R2.missing, null, null],
                ['soil_tests_due', c.n.soil ? c.n.soil.due + c.n.soil.missing : null, null, c.n.soil ? (c.n.soil.law ? 'law' : 'scheme') : null]); }
    if (sh) want.push(['sheep_return', sh.counted ? sh.counted.ewes : sh.estimate.ewes, JSON.stringify(sh.counted || sh.estimate), sh.filed ? 'filed' : sh.counted ? 'counted' : 'estimate']);
    var changed = false;
    /* Phase 4 rows carry their own period and factor set (factor set / N2O method). A past year's stored figure made with
       another set is never overwritten here: it changes only when the farmer recalculates it on purpose. */
    if (c.h && c.h.persist) c.h.persist.forEach(function (x) {
      var id = x.p + ':' + x.m, h = c.hash + ':' + x.m + ':' + x.p, cur = s.results.filter(function (r) { return r.id === id; })[0];
      if (cur && cur.hash === h) return;
      if (x.keepSet && cur && cur.factorSet && cur.factorSet !== x.set) return;
      var row = { id: id, period: String(x.p), metric: x.m, value: (typeof x.v === 'number' && isFinite(x.v)) ? Math.round(x.v * 100) / 100 : null, text: x.t, status: x.st, lawSet: c.law_set, factorSet: x.set, hash: h, at: at };
      if (cur) Object.assign(cur, row); else s.results.push(Object.assign(row, { _new: true }));
      changed = true;
    });
    want.forEach(function (w) {
      var id = p + ':' + w[0], h = c.hash + ':' + w[0], cur = s.results.filter(function (r) { return r.id === id; })[0];
      if (cur && cur.hash === h) return;
      var row = { id: id, period: p, metric: w[0], value: (typeof w[1] === 'number' && isFinite(w[1])) ? Math.round(w[1] * 100) / 100 : null, text: w[2], status: w[3], lawSet: c.law_set, factorSet: c.factor_set, hash: h, at: at };
      if (cur) Object.assign(cur, row); else s.results.push(Object.assign(row, { _new: true }));
      changed = true;
    });
    if (changed) { if (_resT) clearTimeout(_resT); _resT = setTimeout(function () { _resT = null; try { if (typeof W.saveState === 'function') W.saveState(); } catch (er) {} try { if (W.AI && W.AI.sus && W.AI.farm && W.AI.farm.active()) W.AI.sus.saveAll(W.ST_SUS).catch(function () {}); } catch (er) {} }, 1500); }
  }

  /* ── words ── */
  function manureWords(c) {
    var M = c.manure, nv = c.nvz && c.nvz.inNvz;
    if (M.perHa === null) return { big: (M.rows.length ? N(M.kg) + ' kg N' : 'No stock yet'), st: M.rows.length ? ['a', 'Missing: farm size'] : ['n', 'Nothing to count'], line: M.rows.length ? 'Add the farm’s hectares in Settings and any land you rent, and this becomes kg N per hectare.' : 'Add cattle, sheep or other stock in Livestock and the figure appears here.' };
    /* -440 (UX-16): close to the limit (over 90%) has its own word and a next step */
    var lim = M.limit, assumed = c.nvz && c.nvz.assumed, close = !M.over && lim && M.perHa > 0.9 * lim;
    var word = nv === false ? ['n', 'No limit here'] : M.over ? ['r', 'Over the limit' + (assumed ? ' (if in an NVZ)' : '')] : nv === null ? ['a', 'Within 170, NVZ not answered'] : close ? ['a', 'Close to the limit'] : assumed ? ['a', 'Within 170, NVZ not known'] : ['g', 'Within the limit'];
    return { big: N(M.perHa) + (nv === false ? '' : ' of ' + lim) + ' kg N per ha', st: word,
      line: ((M.estimates || []).length ? 'About ' + N(Math.round(M.kg / 10) * 10) : N(M.kg)) + ' kg N from livestock manure over ' + N(M.holdingHa, 1) + ' ha this year'   /* -447 (audit P2): estimates are not shown to the kilo */ + (nv === false ? '. The farm is not in an NVZ, so the 170 kg limit does not apply.' : '.') + (close && nv !== false ? ' Within ' + N(lim - M.perHa) + ' kg of the limit: check stock numbers, land you rent and manure you export before adding stock.' : '') + (assumed ? ' NVZ not known yet, so the NVZ rules are used.' : '') + regWords(c) };
  }
  /* decision 2a: the figure stays on Livestock and says when the register shows something different */
  function regWords(c) { return (typeof W.susRegDiffers === 'function' && W.susRegDiffers(c)) ? ' Your register shows something different: see Livestock, Register.' : ''; }
  function storeWords(c) {
    var P = c.store; if (!P || P.status === 'none') return { big: 'No store added', st: ['n', 'Not started'], line: 'Add each slurry store once in Livestock, Manure: size and whether it’s covered.' };
    if (P.status === 'missing' || P.capacityM3 === 0) return { big: 'Size missing', st: ['a', 'Needs you'], line: 'Add the size of the slurry store in cubic metres.' };
    var st = P.status === 'short' ? ['r', 'Short of the rule'] : P.status === 'unknown' ? ['n', 'Unknown'] : P.status === 'tight' ? ['a', 'Tight'] : ['g', 'Room to spare'];
    var noWash = (P.asks || []).indexOf('washings') >= 0;   /* -446 (P0-2): never "Room to spare" on stock and rain alone */
    if (noWash && st[0] === 'g') st = ['a', set().washAsk === 'yes' ? 'Check: add the washings' : 'Check: washings not answered'];
    var big = P.fillM3 === null ? 'How full is it today?' : P.fullBy ? 'Full around ' + D(P.fullBy) : 'Not full within a year at this rate';
    var rule = P.rule && P.rule.days ? ('The rule: ' + P.rule.days + ' days of storage. About ' + N(P.needM3) + ' m³ needed against ' + N(P.capacityM3) + ' m³.') : (P.rule && P.rule.why ? 'Storage rule: ' + P.rule.why + '.' : '');
    /* -440 (UX-45): the spreading date says which soil it assumed and where that is set */
    var soilW = c.nation === 'N' ? '' : ' (' + (c.inputs && c.inputs.soil === 'sandy' ? 'sandy or shallow soil' : 'soil that is not sandy or shallow') + (set().soilAns ? ', your answer' : ', not answered yet') + ')';
    return { big: big, st: st, line: (noWash ? (set().washAsk === 'yes' ? 'Washings and yard water are not counted yet: add how much below. ' : 'Washings and yard water are not counted yet: say below whether any drain into the store. ') : '') + (P.fillM3 === null ? 'No full-by date until you say how full it is, or tick “Assume emptied by 1 October”. ' : '') + (P.spreadFrom ? 'You can’t spread slurry until ' + D(P.spreadFrom) + soilW + '. ' : '') + rule };
  }
  function sheepWords(c) {
    var sh = c.sheep; if (!sh) return null; var R = sh.dates, f = sh.counted || sh.estimate;
    var sheepAny = (f.ewes || 0) + (f.rams || 0) + (f.other || 0) > 0 || !sh.goats;
    var txt = (sheepAny ? pl(f.ewes, 'ewe') + ', ' + pl(f.rams, 'ram') + ', ' + N(f.other) + ' other sheep' : '') + (sh.goats ? (sheepAny ? ', ' : '') + pl(f.goats || 0, 'goat') : '');
    var st = sh.filed ? ['g', 'Filed ' + D(sh.filed_on)] : R.state === 'overdue' ? (R.stillAccepted ? ['a', 'Late: still taken until ' + D(R.acceptedUntil)] : ['r', 'Overdue']) : sh.counted ? ['g', 'Counted'] : ['n', 'Estimate'];   /* -447 (audit P2): Scotland takes late returns until 30 January */
    var cnt = R.countFrom === R.countTo ? 'Count on ' + D(R.countFrom) : 'Count between ' + D(R.countFrom) + ' and ' + D(R.countTo);
    return { big: txt, st: st, line: cnt + '. Return by ' + D(R.dueBy) + ' through ' + R.route + '. We don’t send it for you.' };
  }
  function stPill(st) { return '<span class="sus-st ' + st[0] + '">' + e(st[1]) + '</span>'; }
  function estTags(list) { return (list || []).length ? '<p class="sus-est"><span class="sus-tag">Estimate</span> ' + e(list.join('; ')) + '.</p>' : ''; }

  /* ── the Sustainability page (read-only summary) ── */
  function setupDone() { var st = set().setup || {}; return !!st.finishedAt; }
  function renderSustain() {
    var el = document.getElementById('sus-body'); if (!el) return;
    if (!on()) { el.innerHTML = '<div class="sus-card"><b>Sustainability is not switched on for this farm yet.</b><p class="sus-mini">It is in a pilot with a few farms.</p></div>'; return; }
    var c = compute();
    if (!c || c.loading) { el.innerHTML = '<div class="sus-card"><p class="sus-mini">Loading the legal tables…</p></div>'; return; }
    if (c.blocked === 'ni') { el.innerHTML = '<div class="sus-card"><b>Northern Ireland is not in the pilot yet.</b><p class="sus-mini">The Northern Ireland tables are being checked again against the new Nutrients Action Programme before they are shown to a farm.</p></div>'; return; }
    if (c.missing === 'nation') { el.innerHTML = '<div class="sus-card"><b>Which nation is the farm in?</b><p class="sus-mini">The rules differ in England, Wales, Scotland and Northern Ireland. Set the region in Settings.</p><button class="btn-sec" onclick="nav(\'settings\')">Open Settings</button></div>'; return; }
    if (c.refused) { el.innerHTML = '<div class="sus-card"><p class="sus-mini">Nothing to show yet.</p></div>'; return; }
    var mw = manureWords(c), sw = storeWords(c), shw = sheepWords(c), open = c.jobs.filter(function (j) { return j.open; }), law = open.filter(function (j) { return j.kind === 'law'; });
    var h = '', part = {};
    if (!setupDone()) h += '<div class="sus-card sus-setup"><div><b>Set up Sustainability: 3 short steps</b><p class="sus-mini">We show what the app already holds and ask only what is missing. Every answer is saved where it belongs: Settings, Rainfall or Livestock.</p></div><button class="btn-pri" data-sa="setup">Start</button></div>';
    part.setup = h; h = '';
    h += '<div class="sus-tiles">';
    if (c.stock && !c.stock.any) h += tile('Livestock', { big: 'None kept', st: ['n', 'Nothing to count'], line: 'If you keep stock, add it and its manure figures appear here. Manure you bring in is in Crops, Compliance.' }, 'Add livestock', 'addstock');   /* -440 (UX-10) */
    else {
      h += tile('Manure nitrogen, ' + c.year, mw, 'Open in Livestock', 'ls');
      if (c.stock && c.stock.slurry) h += tile('Slurry store', sw, 'Open in Livestock', 'ls-stores');   /* -440 (UX-26): only where slurry is kept */
    }
    if (shw) h += tile('Sheep and goat inventory', shw, 'Open in Livestock', 'ls-return');
    h += tile('Nitrogen and soil', nWords(c), 'Open in Crops', 'crops');   /* Phase 2: the records live in Crops */
    h += tile('Jobs', { big: open.length ? pl(open.length, 'job') + ' open' : 'Nothing open', st: lawPill(c.jobs), line: 'Legal jobs also show on the Dashboard and in the bell.' }, 'See the jobs', 'jobs');
    h += '</div>';
    part.tiles = h;
    part.jobs = '<div class="sus-card" id="sus-jobs"><h3>Jobs</h3>' + jobsHtml(c.jobs) + '</div>';
    part.where = '<div class="sus-card"><h3>Where these figures come from</h3>' + whereHtml(c) + '</div>';
    /* Phase 4: Overview (Today strip, six numbers, one chart), Carbon, Energy, Water, Nature, Targets, over the same parts */
    setHtml(el, (c.h && typeof W.susHealthWrap === 'function') ? W.susHealthWrap(c, part) : part.setup + part.tiles + part.jobs + part.where);
  }
  /* -441 (UX-04): a legal job put off with "Later" is still true, so it is never "Nothing by law": "Due later: …" until it is back */
  function lawLater(jobs) { return (jobs || []).filter(function (j) { return j.kind === 'law' && !j.open && j.status === 'later'; }); }
  function lawPill(jobs) {
    var law = (jobs || []).filter(function (j) { return j.open && j.kind === 'law'; }), lt = lawLater(jobs);
    if (law.length) return ['a', pl(law.length, 'job') + ' by law' + (lt.length ? ', ' + N(lt.length) + ' due later' : '')];
    if (lt.length) return ['a', 'Due later: ' + pl(lt.length, 'job') + ' by law'];
    return ['g', 'Nothing by law'];
  }
  W.susLawPill = lawPill;
  function tile(k, w, cta, go) { return '<div class="sus-tile"><span class="sus-k">' + e(k) + '</span><b class="sus-big">' + e(w.big) + '</b>' + stPill(w.st) + '<p class="sus-mini">' + e(w.line) + '</p><button class="sus-lnk" data-sa="go" data-v="' + go + '">' + e(cta) + '</button></div>'; }
  /* -440 (UX-43): Northern Ireland uses a herd or flock number, not a CPH */
  function holdingWord(n) { return n === 'N' ? 'Herd number' : 'CPH'; }
  function whereHtml(c) {
    var M = c.manure, src = M.sources || {}, bits = [], stk = c.stock || { any: true }, rl = typeof W.susRegLine === 'function' ? W.susRegLine(c) : null;
    if (!stk.any) bits.push('Livestock: none kept');   /* -440 (UX-10) */
    else {
      bits.push('Cattle: ' + (src.cattle === 'livestock' ? 'Livestock herds, animals and movements' : 'none'));
      bits.push('Sheep: ' + (src.sheep === 'livestock' ? 'Livestock herds and movements' : 'none'));
      bits.push('Your register: ' + (rl ? rl + '. It checks Livestock; it never changes the figures' : 'none imported. Import it in Livestock, Register to check the herd'));
    }
    bits.push('Farm size: ' + (W.ST && W.ST.farmHa ? N(W.ST.farmHa, 1) + ' ha from Settings' : 'missing') + (set().rentedAsk === 'yes' ? ', plus ' + N(set().rentedHa, 1) + ' ha rented' : ''));
    /* -440 (UX-47): say whose answer it is and where it is kept, whichever page it was given on */
    bits.push('NVZ: ' + (c.nvz.how === 'other-nation' ? 'answered before the farm\'s nation changed, so asked again for ' + (NAT[c.nation] || 'this nation') : c.nvz.how === 'whole-territory' ? 'every farm in ' + NAT[c.nation] : c.nvz.assumed ? 'not sure yet, so the NVZ rules are used' : c.nvz.inNvz === true ? 'yes, your answer (kept with your Rainfall settings)' : c.nvz.inNvz === false ? 'no, your answer (kept with your Rainfall settings)' : 'not answered yet'));
    var h = '<ul class="sus-ul">' + bits.map(function (b) { return '<li>' + e(b) + '</li>'; }).join('') + '</ul>';
    h += estTags(M.estimates.concat((c.inflow && c.inflow.estimates) || [], (c.store && c.store.estimates) || []));
    h += '<p class="sus-mini">Legal values: ' + e(c.law_set || '') + ' (checked ' + e(D(LAW().compiled)) + '). ' + e(M.cite ? M.cite.source : '') + '. Check with your adviser if unsure.</p>';
    if (stk.any) h += '<div class="sus-bt"><button class="sus-lnk" data-sa="go" data-v="register">Open the register in Livestock</button></div>';
    return h;
  }
  function jobsHtml(jobs) {
    if (!jobs.length) return '<p class="sus-mini">Nothing to do here at the moment.</p>';
    var open = jobs.filter(function (j) { return j.open; }), shut = jobs.filter(function (j) { return !j.open; });
    var row = function (j) {
      var due = j.dueIn == null ? '' : j.dueIn < 0 ? pl(-j.dueIn, 'day') + ' over' : j.dueIn === 0 ? 'due today' : 'in ' + pl(j.dueIn, 'day');
      var st = j.status === 'done' ? 'Done' : j.status === 'later' ? 'Later' : j.status === 'notforus' ? 'Not for us' : null;
      return '<div class="sus-job"><div class="sus-jm"><span class="sus-kind ' + (j.kind === 'law' ? 'law' : 'set') + '">' + (j.kind === 'law' ? 'By law' : j.kind === 'scheme' ? 'Scheme' : j.kind === 'check' ? 'Records check' : 'Setup') + '</span><b>' + e(j.title) + '</b><p class="sus-mini">' + e(j.why) + '</p>' +
        (due ? '<span class="sus-due">' + e(due) + (j.due ? ', ' + e(D(j.due)) : '') + '</span>' : '') + '</div><div class="sus-ja">' +
        (j.open ? '<button class="btn-sec sm" data-sa="jobgo" data-v="' + e(j.cta) + '">' + (j.kind === 'setup' || j.kind === 'check' ? 'Answer' : 'Open') + '</button>' +
          /* -440 (UX-04): a worked-out legal job can't be ticked away; "I've dealt with it" checks it again at once */
          (j.kind === 'law' && !j.computed && !(j.state === 'upcoming') ? '<button class="btn-sec sm" data-sa="job" data-v="' + e(j.local_id) + '|done">Filed</button>' : '') +
          (j.kind === 'law' && j.computed ? '<button class="btn-sec sm" data-sa="job" data-v="' + e(j.local_id) + '|recheck">I’ve dealt with it</button>' : '') +
          '<button class="btn-sec sm" data-sa="job" data-v="' + e(j.local_id) + '|later">Later</button>' + (j.kind === 'setup' && j.rule_id !== 'nvz-answer' && j.rule_id !== 'scot-zone' ? '<button class="btn-sec sm" data-sa="job" data-v="' + e(j.local_id) + '|notforus">Not for us</button>' : '') +
          (j.rechecked ? '<span class="sus-mini sus-rechk">Checked again: still true from your records. It clears itself when the numbers change.</span>' : '')
                : '<span class="sus-mini">' + e(st || '') + '</span><button class="sus-lnk" data-sa="job" data-v="' + e(j.local_id) + '|open">Reopen</button>') + '</div></div>';
    };
    return open.map(row).join('') + (shut.length ? '<details class="sus-det"><summary>' + pl(shut.length, 'job') + ' done, later or not for us</summary>' + shut.map(row).join('') + '</details>' : '');
  }
  function taskSet(id, status) {
    var s = S(); if (!s) return; var c = compute(), j = c && c.jobs ? c.jobs.filter(function (x) { return x.local_id === id; })[0] : null;
    var t = s.tasks.filter(function (x) { return x.id === id; })[0];
    if (!t) { t = { id: id, rule: j ? j.rule_id : id.split(':')[0], kind: j ? j.kind : 'setup', area: j ? j.area : '', due: j ? j.due : null, _new: true }; s.tasks.push(t); }
    t.status = status; t.until = status === 'later' ? EN()._util.addDays(today(), 14) : null; t.doneAt = status === 'done' ? new Date().toISOString() : null;
    s.history.push({ id: uid('h'), task: id, what: status, note: '', at: new Date().toISOString(), _new: true });
    /* the sheep return job is shared with the Dashboard item: Done there means "filed" */
    if (j && j.rule_id === 'sheep-return' && status === 'done') { var y = +id.split(':')[1]; var inv = invFor(y, true); if (!inv.filedOn) inv.filedOn = today(); }
    if (status === 'recheck') {   /* -440 (UX-04): check again now, from the records */
      _cache.key = null; save(); var c2 = compute(), j2 = c2 && c2.jobs ? c2.jobs.filter(function (x) { return x.local_id === id; })[0] : null;
      if (W.toast) W.toast(j2 && j2.open ? 'Checked again: still true from your records. Change the record it comes from and it clears itself' : 'Checked again: cleared', j2 && j2.open ? 'info' : 'success');
      return; }
    save(status === 'done' ? 'Marked filed' : status === 'later' ? 'Hidden for 14 days' : status === 'notforus' ? 'Marked not for us' : 'Reopened');
  }
  function invFor(y, make) { var s = S(), x = s.inventory.filter(function (r) { return +r.year === +y; })[0]; if (!x && make) { x = { id: 'inv-' + y, year: +y, _new: true }; s.inventory.push(x); } return x; }

  /* ── Livestock -> Manure (the records and the actions live here) ── */
  function susLsRender() {
    var el = document.getElementById('ls-view-manure'); if (!el) return;
    if (!on()) { el.innerHTML = ''; return; }
    var c = compute();
    if (!c || c.loading) { el.innerHTML = '<div class="sus-card"><p class="sus-mini">Loading the legal tables…</p></div>'; return; }
    if (c.blocked === 'ni') { el.innerHTML = '<div class="sus-card"><b>Northern Ireland is not in the pilot yet.</b></div>'; return; }
    if (c.missing || c.refused) { el.innerHTML = '<div class="sus-card"><b>Set the farm’s nation in Settings first.</b></div>'; return; }
    var mw = manureWords(c), h = '<div class="sus-ls">';
    h += '<div class="sus-card sus-head"><div><span class="sus-k">Manure nitrogen' + (c.nvz.inNvz === false ? '' : ' limit') + ', ' + c.year + '</span><b class="sus-big">' + e(mw.big) + '</b><p class="sus-mini">' + e(mw.line) + '</p></div>' + stPill(mw.st) + '</div>';
    h += regCardsHtml(c) + exceptionHtml(c) + returnHtml(c) + gridHtml(c) + sizeHtml(c) + houseHtml(c) + storesHtml(c) + awayHtml(c) + registerHtml(c) + batchesHtml(c) + countsHtml(c) + movesHtml(c) + howHtml(c);
    setHtml(el, h + '</div>');
  }
  function sec(id, title, body, sub) { return '<div class="sus-card" id="' + id + '"><h3>' + e(title) + '</h3>' + (sub ? '<p class="sus-mini">' + e(sub) + '</p>' : '') + body + '</div>'; }
  function seg(action, cur, opts, label) {
    return '<div class="sus-seg" role="group" aria-label="' + e(label || '') + '">' + opts.map(function (o) { var onx = cur === o[0]; return '<button type="button" data-sa="' + action + '" data-v="' + e(o[0]) + '" class="' + (onx ? 'on' : '') + '" aria-pressed="' + onx + '">' + e(o[1]) + '</button>'; }).join('') + '</div>';
  }
  /* -438-sus5r: one card per species; the register card takes in the "doesn't add up" card for the same animals */
  function regOpen(c, sp) { return ((c.reg && c.reg.cards) || []).some(function (x) { return x.species === sp && x.open.status === 'open'; }); }
  function regCardsHtml(c) { return ((c.reg && c.reg.cards) || []).filter(function (x) { return x.open.status === 'open'; }).map(function (x) { return typeof W.susRegCardHtml === 'function' ? W.susRegCardHtml(x.species, 'manure') : ''; }).join(''); }
  function exceptionHtml(c) {
    var x = (c.manure.exceptions || []).filter(function (q) { return !regOpen(c, q.species); })[0]; if (!x) return '';
    var herd = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (h) { return String(h.id) === String(x.herd); })[0];
    return '<div class="sus-card sus-x"><span class="sus-k">One thing doesn’t add up</span><b>' + e((herd ? herd.name + ': ' : '') + pl(x.n, 'more arrival') + ' than the ' + (x.cls || 'animals') + ' in the count') + '</b><p class="sus-mini">Movements in or births this year are more than the head count Livestock holds. The figure counts what the head count says until this is sorted. Check the count or the movements in Livestock, Herd.</p><button class="btn-sec sm" onclick="lsTab(\'herd\')">Open the herd</button></div>';
  }
  function returnHtml(c) {
    var sh = c.sheep; if (!sh) return ''; var w = sheepWords(c), R = sh.dates, f = sh.counted || sh.estimate, ed = _ui.retEdit;
    var h = '<div class="sus-card" id="sus-return"><span class="sus-k">Sheep and goat inventory, ' + e(NAT[c.nation]) + '</span>';
    if (ed) h += '<b>Your count</b><div class="sus-row3"><label class="sus-f"><span>Ewes</span><input type="number" min="0" id="sus-re" value="' + e(f.ewes) + '"></label><label class="sus-f"><span>Rams</span><input type="number" min="0" id="sus-rr" value="' + e(f.rams) + '"></label><label class="sus-f"><span>Other sheep (lambs, tegs)</span><input type="number" min="0" id="sus-ro" value="' + e(f.other) + '"></label>' + (sh.goats ? '<label class="sus-f"><span>Goats</span><input type="number" min="0" id="sus-rg" value="' + e(f.goats || 0) + '"></label>' : '') + '</div><div class="sus-bt"><button class="btn-pri sm" data-sa="ret" data-v="save">Save count</button><button class="sus-lnk" data-sa="ret" data-v="cancel">Cancel</button></div>';
    else {
      h += '<b class="sus-big">' + e(sh.counted ? w.big : 'Our estimate: ' + w.big) + '</b>' + stPill(w.st) + '<p class="sus-mini">' + e(w.line) + '</p>';
      /* Before the count day there is nothing to count or file yet: the estimate shows, and can be copied. */
      var counting = R.state !== 'upcoming';
      /* -440 (UX-22): before the count day, say when the count can be typed, where the control will be */
      if (!sh.counted) h += '<p class="sus-mini">From Livestock: today’s flock, this year’s movements and lambs counted at the count day. ' + (counting ? 'Count the flock and change it if it’s different.' : 'You can type your count here from ' + e(D(R.countFrom)) + '.') + '</p>';
      h += '<div class="sus-bt">' + (sh.counted || !counting ? '' : '<button class="btn-pri sm" data-sa="ret" data-v="ok">Counted, it’s right</button>') + (counting ? '<button class="btn-sec sm" data-sa="ret" data-v="chg">' + (sh.counted ? 'Change' : 'Type my count') + '</button>' : '') + '<button class="btn-sec sm" data-sa="ret" data-v="copy">Copy the figures</button>' +
        (sh.filed ? '<button class="sus-lnk" data-sa="ret" data-v="unfile">Not filed after all</button>' : (sh.counted ? '<button class="btn-sec sm" data-sa="ret" data-v="file">I’ve filed it</button>' : '')) + '</div>';
      if (!counting) h += '<p class="sus-mini">Count the flock ' + (R.countFrom === R.countTo ? 'on ' + e(D(R.countFrom)) : 'between ' + e(D(R.countFrom)) + ' and ' + e(D(R.countTo))) + ', then check the figures here.</p>';
      if (R.stillAccepted) h += '<p class="sus-mini">ScotEID still takes it until ' + e(D(R.acceptedUntil)) + '.</p>';
    }
    return h + '</div>';
  }
  function gridHtml(c) {
    var M = c.manure; if (!M.rows.length) return sec('sus-grid', 'Stock by class and month', '<p class="sus-mini">No cattle, sheep or other stock on the farm yet. Add them in Livestock and they show here by month.</p>');
    var keys = Object.keys(M.average).filter(function (k) { return M.average[k] > 0.004; });
    var L = LAW().nations[c.nation].manure_n.per_head, mon = M.monthly;
    var hd = '<tr><th>Legal class</th>' + mon.map(function (m) { return '<th class="n">' + e(D(m.month).split(' ')[0]) + '</th>'; }).join('') + '<th class="n">Average</th><th class="n">kg N a head</th><th class="n">kg N</th></tr>';
    var body = keys.map(function (k) { var r = L[k] || {}, row = M.rows.filter(function (x) { return x.key === k; })[0];
      return '<tr><td>' + e(r.label || k) + '</td>' + mon.map(function (m) { return '<td class="n">' + (m.classes[k] ? N(m.classes[k], m.classes[k] < 10 ? 1 : 0) : '') + '</td>'; }).join('') + '<td class="n">' + N(M.average[k], 1) + '</td><td class="n">' + N(r.value, 1) + '</td><td class="n">' + (row ? N(row.kg) : '') + '</td></tr>'; }).join('');
    var extra = M.rows.filter(function (r) { return r.batch !== undefined || r.count || r.per; });
    body += extra.map(function (r) { return '<tr><td>' + e(r.label) + (r.estimate ? ' <span class="sus-tag">Estimate</span>' : '') + '</td><td colspan="12" class="sus-mini">' + (r.per === 'place' ? 'Average places over the year' : r.per ? 'Batch' : 'Count') + '</td><td class="n">' + N(r.head, 1) + '</td><td class="n">' + N(r.rate, 2) + '</td><td class="n">' + N(r.kg) + '</td></tr>'; }).join('');
    if (M.adjustKg) body += '<tr><td colspan="15">Manure moved ' + (M.adjustKg < 0 ? 'off' : 'on to') + ' the holding</td><td class="n">' + N(M.adjustKg) + '</td></tr>';
    body += '<tr class="tot"><td colspan="15">Total</td><td class="n">' + N(M.kg) + '</td></tr>';
    return sec('sus-grid', 'Stock by class and month', '<div class="sus-scroll"><table class="sus-t">' + hd + body + '</table></div>' + estTags(M.estimates), 'Head by legal class each month, from Livestock. The manure limit, the store forecast and the sheep return use these numbers. Change a number in Livestock, Herd.');
  }
  function sizeHtml(c) {
    var st = set(), rows = c.manure.rows, n = c.nation, has = function (re) { return rows.some(function (r) { return re.test(r.key); }); }, h = '';
    if (n === 'N') return '';
    if (has(/^suckler_/)) h += '<div class="sus-q"><span class="sus-ql">A typical suckler cow weighs</span>' + seg('size', st.sucklerSize ? 'suckler:' + st.sucklerSize : '', [['suckler:le500', '500 kg or less'], ['suckler:gt500', 'Over 500 kg']], 'Suckler cow size') + (st.sucklerSize ? '' : '<p class="sus-mini">Until you answer we use the higher figure, the safer choice.</p>') + '</div>';
    if (has(/^ewe_/)) h += '<div class="sus-q"><span class="sus-ql">A typical ewe weighs</span>' + seg('size', st.eweSize ? 'ewe:' + st.eweSize : '', [['ewe:lt60', 'Under 60 kg'], ['ewe:ge60', '60 kg or more']], 'Ewe size') + (st.eweSize ? '' : '<p class="sus-mini">Until you answer we use the higher figure, the safer choice.</p>') + '</div>';
    if (has(/^dairy_(lt|60|gt)/)) h += '<div class="sus-q"><span class="sus-ql">Milk a cow gives in a year</span>' + seg('size', st.dairyYield ? 'dairy:' + st.dairyYield : '', [['dairy:lt6000', 'Under 6,000 L'], ['dairy:6000_9000', '6,000 to 9,000 L'], ['dairy:gt9000', 'Over 9,000 L']], 'Dairy yield') + (st.dairyYield ? '' : '<p class="sus-mini">Until you answer we use the higher figure, the safer choice.</p>') + '</div>';
    return h ? sec('sus-sizes', 'Size and yield, asked once', h, 'The register knows age, not size, and the legal manure figures depend on it.') : '';
  }
  var GROUPS = [['sucklers', 'Suckler cows, their calves and breeding bulls', /^suckler_|^bull_breeding/], ['dairy', 'Dairy cows', /^dairy_(lt|60|gt)|^dairy_cow$/], ['followers', 'Followers (young and finishing cattle)', /^(calf|beef_|dairy_young|dairy_heifer|bull_nonbreeding|cattle_|calf_)/]];
  /* -439-sus6 (owner decision "housing" a): unanswered groups show the inventory-based estimate for the nation, tagged
     "Estimate" with its source, asked once. The farmer also says how the housed manure is kept (slurry or FYM), and a typical weight;
     and, for a flock, the month lambing starts and whether the ewes come in to lamb.
     -440: dates are a day and a month (UX-28), never filled in for the farmer (the estimate is the hint); the slurry crust is asked once,
     on the store (UX-27); the housing log is one tap away (UX-11); the weight box says what the size answer already gives (R7). */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dmSel(g, which, md) {
    var d = md ? +md.slice(3, 5) : '', m = md ? +md.slice(0, 2) : '', P = (_ui.hpart || {})[g + ':' + which] || {};
    if (!md) { d = P.d || ''; m = P.m || ''; }
    var ds = '<select data-sf="hdm:' + g + ':' + which + ':d" aria-label="Day"><option value="">Day</option>'; for (var i = 1; i <= 31; i++) ds += '<option value="' + i + '"' + (+d === i ? ' selected' : '') + '>' + i + '</option>'; ds += '</select>';
    var ms = '<select data-sf="hdm:' + g + ':' + which + ':m" aria-label="Month"><option value="">Month</option>' + MONTHS.map(function (x, i) { return '<option value="' + (i + 1) + '"' + (+m === i + 1 ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
    return '<span class="sus-dm">' + ds + ms + '</span>';
  }
  function houseHtml(c) {
    var hs = (c.inflow && c.inflow.housing) || {}, rows = c.manure.rows, h = '', st = set();
    GROUPS.forEach(function (g) {
      if (!rows.some(function (r) { return g[2].test(r.key); })) return;
      var x = (st.housing || {})[g[0]] || {}, live = c.inputs.housing[g[0]] || {}, est = hs[g[0]] || {};
      h += '<div class="sus-hr"><b>' + e(g[1]) + '</b>' + seg('hmode', x.mode ? g[0] + ':' + x.mode : '', [[g[0] + ':winter', 'Housed for winter'], [g[0] + ':all', 'Housed all year'], [g[0] + ':out', 'Out-wintered']], g[1] + ' housing');
      if (!x.mode && live.log) h += '<p class="sus-mini">Not answered yet. Your housing log sets this season’s dates: in ' + e(mdLong(live['in'])) + (live.estIn ? ' <span class="sus-tag">Estimate</span>' : '') + ', out ' + e(mdLong(live.out)) + (live.estOut ? ' <span class="sus-tag">Estimate</span>' : '') + '.' + (live.estIn || live.estOut ? ' A date marked Estimate is the UK inventory estimate until you log it.' : '') + '</p>';
      else if (!x.mode) h += '<p class="sus-mini"><span class="sus-tag">Estimate</span> Not answered yet. Until you do we use ' + (est.days ? e(est.days + ' days, ' + mdLong(est['in']) + ' to ' + mdLong(est.out)) : 'no housing') + ', a typical figure for your nation (the source is under Jobs and sources). Tell us your dates.</p>';   /* -440 (UX-23) */
      else if (x.mode === 'winter') {
        var d0 = EN().housingDefault(g[0], nationKey(), FAC() || {}, null) || {};
        h += '<div class="sus-row3"><label class="sus-f"><span>Usually in</span>' + dmSel(g[0], 'in', x['in']) + '</label><label class="sus-f"><span>Usually out (the last day in)</span>' + dmSel(g[0], 'out', x.out) + '</label></div>' +
          (!x['in'] || !x.out ? '<p class="sus-mini">' + (d0['in'] ? 'If you are not sure, most farms in ' + e(NAT[nationKey()] || 'your nation') + ' are in about ' + e(mdLong(d0['in'])) + ' to ' + e(mdLong(d0.out)) + ' (an estimate; we use it until you choose).' : '') + '</p>' : '') +
          (live.log ? '<p class="sus-mini">This season your housing log says in ' + e(mdLong(live['in'])) + ', out ' + e(mdLong(live.out)) + '; the forecast uses those.</p>' : '');
      }
      else h += '<p class="sus-mini">' + (x.mode === 'all' ? 'Housed all year: all their slurry goes to the store.' : 'Their manure falls on the field, not in the store.') + '</p>';
      if (x.mode !== 'out') {
        h += '<div class="sus-q"><span class="sus-ql">How is their housed manure kept?</span>' + seg('hsys', x.system ? g[0] + ':' + x.system : '', [[g[0] + ':slurry', 'Slurry store'], [g[0] + ':fym', 'Straw yard or heap (FYM)'], [g[0] + ':both', 'Both']], 'Manure system') +
          (x.system ? '' : '<p class="sus-mini">Not answered yet. Until you do we count it as farmyard manure in a heap, and say so. Slurry gives about ten times the methane.</p>') + '</div>';
        if (x.system === 'both') h += '<label class="sus-f"><span>Share as slurry, %</span><input type="number" min="0" max="100" data-sf="hpct:' + g[0] + '" value="' + e(x.slurryPct != null ? x.slurryPct : '') + '"></label>';
        if ((x.system === 'slurry' || x.system === 'both') && !c.inputs.stores.some(function (z) { return !z.removed && (z.kind === 'lagoon' || z.kind === 'tank'); })) h += '<p class="sus-mini">Add your slurry store under Slurry stores (size, and whether it is covered or crusts over). It is on your jobs list until then.</p>';   /* UX-17, UX-27 */
      }
      var ph = g[0] === 'sucklers' && st.sucklerSize === 'gt500' ? 'Over 500 (you said)' : g[0] === 'sucklers' && st.sucklerSize === 'le500' ? '500 or less (you said)' : 'kg';
      h += '<div class="sus-row3"><label class="sus-f"><span>Typical weight, kg (optional, for the carbon figure)</span><input type="number" min="20" max="1500" data-sf="hw:' + g[0] + '" value="' + e(x.weightKg || '') + '" placeholder="' + e(ph) + '"></label></div>';
      h += '</div>';
    });
    if (c.inputs.herds.some(function (x) { return EN().herdKind(x.type) === 'ewes'; })) {
      h += '<div class="sus-hr"><b>Ewes</b><div class="sus-q"><span class="sus-ql">When does lambing usually start?</span><select data-sf="lambing" aria-label="Lambing month"><option value="">Not answered</option>' + MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (+st.lambingMonth === i + 1 ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select>' +
        '<p class="sus-mini">' + (st.lambingMonth ? 'Lambs are dated from 1 ' + MONTHS[st.lambingMonth - 1] + '.' : 'Not answered yet: lambs counted from 1 April.') + ' Lambs and rams are not housed.</p></div>' +
        (st.lambingMonth ? '<div class="sus-q"><span class="sus-ql">Do the ewes come in to lamb?</span>' + seg('ewesin', st.ewesIn || '', [['yes', 'Yes'], ['no', 'No, they lamb outside']], 'Ewes housed to lamb') + '<p class="sus-mini">' + (st.ewesIn === 'yes' ? 'Counted as housed for 42 days before lambing (UK inventory).' : st.ewesIn === 'no' ? 'Not counted as housed.' : 'Not answered yet: counted as housed for 42 days before lambing (UK inventory) until you say.') + '</p></div>' : '') +
        (c.inputs.herds.some(function (x) { return EN().herdKind(x.type) === 'ewes' && !((x.classes || []).some(function (k) { return k.k === 'lambs' && Number(k.n) > 0; })); }) ?   /* -447: only where no lambs are counted */
        '<div class="sus-q"><label class="sus-f"><span>Lambs reared per ewe</span><input type="number" min="0" max="4" step="0.05" data-sf="lpe" value="' + e(st.lambsPerEwe != null ? st.lambsPerEwe : '') + '" placeholder="e.g. 1.5"></label><p class="sus-mini">' + (st.lambsPerEwe != null ? 'Lambs at foot counted from lambing to 6 months old.' : 'Not answered yet: lambs at foot are not counted in the carbon footprint' + (nationKey() === 'N' ? ' or the manure figure' : '') + '.') + '</p></div>' : '') + '</div>';
    }
    return h ? sec('sus-housing', 'When stock are housed', h + '<div class="sus-bt"><button class="btn-sec sm" data-sa="hlog">Log housing or turnout</button></div>', 'Usual dates for your farm. We don’t ask every year: log the real day when they come in or go out, and the forecast uses it.') : '';
  }
  function mdLong(md, shift) { if (!/^\d{2}-\d{2}$/.test(md || '')) return ''; var t = Date.UTC(2027, +md.slice(0, 2) - 1, +md.slice(3, 5)) + (shift || 0) * 86400000, d = new Date(t); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  var STORE_KINDS = [['lagoon', 'Slurry lagoon'], ['tank', 'Slurry tank'], ['midden', 'Midden (solid manure)'], ['heap', 'Field heap or litter heap']];
  function rainMm(c) { var r = c.inputs && c.inputs.rainWet; return r && r.mm ? r.mm : null; }
  function storesHtml(c) {
    var s = S(), P = c.store, list = s.stores.filter(function (x) { return !x.removed; }), h = '';
    if (!list.length) h += '<p class="sus-mini">No stores yet. Add each one once: type, size and whether it’s covered.</p>';
    list.forEach(function (x) {
      var slurry = x.kind === 'lagoon' || x.kind === 'tank';
      h += '<div class="sus-store"><div class="sus-row3">' +
        '<label class="sus-f"><span>Type</span><select data-sf="store:' + e(x.id) + ':kind">' + STORE_KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (x.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="sus-f"><span>Name</span><input type="text" maxlength="80" data-sf="store:' + e(x.id) + ':name" value="' + e(x.name || '') + '"></label>' +
        '<label class="sus-f"><span>Size, ' + (slurry ? 'm³' : 'tonnes') + '</span><input type="number" min="0" data-sf="store:' + e(x.id) + ':' + (slurry ? 'capacityM3' : 'capacityT') + '" value="' + e(slurry ? (x.capacityM3 || '') : (x.capacityT || '')) + '"></label></div>' +
        '<div class="sus-row3"><div class="sus-f"><span>Covered?</span>' + seg('stcov', x.covered === true ? x.id + ':yes' : x.covered === false ? x.id + ':no' : '', [[x.id + ':yes', 'Yes'], [x.id + ':no', 'No']], 'Store covered') + (x.covered == null && slurry ? '<small class="sus-mini">Not answered yet. Until you do we count it as open to the rain, the safer choice.</small>' : '') + '</div>' +
        (slurry && x.covered === false ? '<div class="sus-f"><span>Does the slurry crust over?</span>' + seg('stcrust', (set().storeCrust || {})[x.id] ? x.id + ':' + set().storeCrust[x.id] : '', [[x.id + ':crust', 'It crusts over'], [x.id + ':none', 'No crust']], 'Slurry crust') + ((set().storeCrust || {})[x.id] ? '' : '<small class="sus-mini">Not answered: counted as crusted, the answer that gives the highest figure.</small>') + '</div>' : '') +   /* -440 (UX-27, R9): asked once, here */
        (slurry && x.covered !== true ? '<label class="sus-f"><span>Open surface, m² (length × width)</span><input type="number" min="0" data-sf="store:' + e(x.id) + ':openAreaM2" value="' + e(x.openAreaM2 || '') + '" placeholder="Needs your answer"></label>' : '') +
        (slurry && c.nation === 'E' ? '<label class="sus-f"><span>Built or last changed</span><input type="date" data-sf="store:' + e(x.id) + ':builtOrChanged" value="' + e(x.builtOrChanged || '') + '"></label>' : '') + '</div>' +
        (slurry ? '<div class="sus-q"><span class="sus-ql">How full is it today?</span>' + seg('fill', (function () { var r0 = ((S() || {}).readings || []).filter(function (r) { return r && r.store === x.id && r.on === today(); }).slice(-1)[0]; return r0 ? x.id + ':' + String(r0.frac) : ''; })(), [[x.id + ':0', 'Empty'], [x.id + ':0.25', 'A quarter'], [x.id + ':0.5', 'Half'], [x.id + ':0.75', 'Three quarters'], [x.id + ':1', 'Full']], 'How full') + '</div>' : '<p class="sus-mini">Solid manure: 10 m from water and 50 m from a spring, well or borehole' + (c.nation === 'N' ? ' (Northern Ireland: 20 m, 50 m and 250 m for FYM; within 120 days; not the same spot two years running)' : '') + '.</p>') +
        '<button class="sus-lnk" data-sa="stdel" data-v="' + e(x.id) + '">Remove</button></div>';
    });
    h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="stadd">Add a store</button></div>';
    /* -446 (web test P0-2): washings and yard water, the farmer's own figures (SI 2015/668 reg 25(3)) */
    if (list.some(function (x) { return x.kind === 'lagoon' || x.kind === 'tank'; })) { var stw = set();
      h += '<div class="sus-q"><span class="sus-ql">Does anything else drain into the slurry store?</span>' + seg('wash', stw.washAsk || '', [['no', 'No, only the slurry'], ['yes', 'Yes: washings or yard water']], 'Anything else into the store') +
        '<p class="sus-mini">Parlour and dairy washings, or rain off a dirty yard that runs to the store. The storage rule counts them (SI 2015/668 reg 25(3)).</p>' +
        (stw.washAsk === 'yes' ? '<div class="sus-row3"><label class="sus-f"><span>Washings and dairy water, m³ a week</span><input type="number" min="0" step="any" data-sf="washm3" value="' + e(stw.washM3Wk != null ? stw.washM3Wk : '') + '" placeholder="0 if none"></label>' +
          '<label class="sus-f"><span>Dirty yard draining to the store, m²</span><input type="number" min="0" step="any" data-sf="yardm2" value="' + e(stw.yardM2 != null ? stw.yardM2 : '') + '" placeholder="0 if none"></label></div>' : '') + '</div>'; }
    if (P && P.capacityM3 > 0) {
      var w = storeWords(c);
      h += '<div class="sus-fc"><div class="sus-gh"><b>' + (P.stores > 1 ? 'Slurry stores together' : 'Slurry store') + ', ' + N(P.capacityM3) + ' m³</b>' + stPill(w.st) + '</div><p><b>' + e(w.big) + (/[?.]$/.test(w.big) ? '' : '.') + '</b> ' + e(w.line) + '</p>' +
        '<p class="sus-mini">' + (P.fillM3 === null ? 'How full: Unknown. ' : 'About ' + N(P.pct) + '% full today (' + (P.fillFrom === 'reading' ? 'you said on ' + e(D(P.readOn)) : 'assumed emptied by 1 October, your tick') + '). ') + 'Fills about ' + N(P.weekM3) + ' m³ a week at this time of year' + (P.openAreaM2 ? (rainMm(c) ? ', with rain on ' + N(P.openAreaM2) + ' m² open to the sky' : '. No rainfall figures yet, so the rain on the ' + N(P.openAreaM2) + ' m² open surface is not counted: set the farm’s location in Rainfall') : '') + '.</p>' +   /* -440 (UX-21): one statement about rain */
        (P.fillFrom === 'reading' ? '' : '<label class="sus-f sus-cb"><input type="checkbox" data-sf="emptied"' + (set().assumeEmptied ? ' checked' : '') + '><span>Assume the store was emptied by 1 October (a labelled assumption; a reading beats it)</span></label>') +   /* -440 (UX-21): gone once you say how full it is */
        ((c.nation === 'S' || c.nation === 'N') && P.rule && P.rule.days ? '<label class="sus-f"><span>The ' + Math.round(P.rule.days / 7) + ' weeks run from</span><input type="date" data-sf="weeksfrom" value="' + e(P.ruleFrom || '') + '"><small class="sus-mini">The law gives no start date. ' + (P.startAssumed ? 'Until you choose, from 1 October.' : 'Your start.') + '</small></label>' : '') +   /* UX-48 */
        (P.rule && P.rule.cite ? '<p class="sus-mini">' + e(P.rule.label || '') + '. ' + e(P.rule.cite.source) + '.</p>' : (P.rule && P.rule.why ? '<p class="sus-mini">' + e(P.rule.why) + '.</p>' : '')) + estTags(P.estimates) + '</div>';
    }
    return sec('sus-stores', 'Manure stores', h);
  }
  var ROLES = { cattle: [['suckler', 'Suckler cows'], ['dairy', 'Dairy cows'], ['beef', 'Young or finishing cattle'], ['bull_breeding', 'Bulls']], sheep: [['ewe', 'Ewes'], ['ram', 'Rams'], ['store', 'Store lambs or tegs']] };
  function awayHtml(c) {
    var s = S(), st = set(), h = '<div class="sus-q"><span class="sus-ql">Any stock away from the farm, or other people’s stock on your land?</span>' + seg('awayask', st.awayAsk || '', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], 'Stock away or not yours') + '</div>';
    if (st.awayAsk === 'unsure') h += '<p class="sus-mini">That’s fine. It’s on your jobs list to check later. Until then we count only what Livestock shows.</p>';
    if (st.awayAsk === 'yes' || s.spans.length) {
      s.spans.forEach(function (x) {
        var aw = x.kind === 'away', lab = (ROLES[x.species] || []).filter(function (r) { return r[0] === x.role; })[0];
        h += '<div class="sus-aw"><span class="sus-kind ' + (aw ? 'set' : 'law') + '">' + (aw ? 'Away' : 'On our land, not ours') + '</span><div><b>' + e(N(x.n) + ' ' + (lab ? lab[1].toLowerCase() : x.species) + (x.where ? ', ' + x.where : '')) + '</b><p class="sus-mini">' + e(D(x.from) + ' to ' + (x.to ? D(x.to) : 'now') + '. ') +
          (x.occupier ? (aw ? (x.occupier === 'us' ? 'You have that land at your disposal too, so it stays on your holding.' : 'Left out of your manure limit and store.') : (x.occupier === 'them' ? 'They keep the land at their disposal, so it is not counted on yours.' : 'Counted in your manure limit.')) : 'Who has the land at their disposal while the stock is there? ') + '</p>' +
          '<div class="sus-q">' + seg('awocc', x.occupier ? x.id + ':' + x.occupier : '', [[x.id + ':us', aw ? 'We do' : 'We do'], [x.id + ':them', aw ? 'They do' : 'They do']], 'Who occupies the land') + '</div></div><button class="sus-lnk" data-sa="awdel" data-v="' + e(x.id) + '">Remove</button></div>';
      });
      var f = _ui.awf;
      if (f) h += '<div class="sus-form">' + seg('awkind', f.kind || '', [['away', 'Away: ours on other land'], ['notours', 'On our land, not ours']], 'Kind') +
        '<div class="sus-row3"><label class="sus-f"><span>Species</span><select id="sus-aw-sp"><option value=""' + (f.species ? '' : ' selected') + '>Choose…</option><option value="cattle"' + (f.species === 'cattle' ? ' selected' : '') + '>Cattle</option><option value="sheep"' + (f.species === 'sheep' ? ' selected' : '') + '>Sheep</option></select></label>' +
        '<label class="sus-f"><span>Group</span><select id="sus-aw-role"' + (f.species ? '' : ' disabled') + '><option value="" selected>Choose…</option>' + (ROLES[f.species] || []).map(function (r) { return '<option value="' + r[0] + '">' + r[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="sus-f"><span>How many</span><input type="number" min="1" id="sus-aw-n"></label></div><div class="sus-row3"><label class="sus-f"><span>From</span><input type="date" id="sus-aw-from"></label><label class="sus-f"><span>To (blank if still there)</span><input type="date" id="sus-aw-to"></label><label class="sus-f"><span>Where, or whose</span><input type="text" maxlength="120" id="sus-aw-where"></label></div>' +
        '<div class="sus-bt"><button class="btn-pri sm" data-sa="awsave">Save</button><button class="sus-lnk" data-sa="awcancel">Cancel</button></div></div>';
      else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="awopen">Add stock away or not ours</button></div>';
    }
    return sec('sus-away', 'Stock away, and other people’s stock', h, 'Your stock away (away-wintering, common grazing, a contract rearer) and other people’s stock here (tack sheep, a grazing licence, bed-and-breakfast cattle).');
  }
  function registerHtml(c) {   /* -438-sus5r (decision 1a): the register file lives in Livestock -> Register; here only a link */
    var rl = typeof W.susRegLine === 'function' ? W.susRegLine(c) : null;
    return sec('sus-register', 'Your register', '<p class="sus-mini">' + e(rl ? rl + '.' : 'No register file yet.') + ' It checks the herd; it never changes these figures.</p><div class="sus-bt"><button class="btn-sec sm" data-sa="go" data-v="register">Open Livestock, Register</button></div>');
  }
  var STAGES_GB = { 'pig:finishers': ['pig_31_66', 'pig_66_plus'], 'pig:weaners': ['pig_7_13', 'pig_13_31', 'pig_31_66'], 'pig:boars': ['boar_66_150', 'boar_150_plus'], 'poultry:turkeys': ['turkey_m', 'turkey_f'] };
  var STAGES_NI = { 'pig:weaners': ['w18', 'w35', 'w105'], 'pig:finishers': ['g35', 'g105', 'f105'], 'poultry:broilers': ['broiler_hot', 'broiler_conv', 'broiler_fr'], 'poultry:turkeys': ['turkey_0_6w', 'turkey_6w_kill', 'turkey_0_kill'],
                    'poultry:ducks': ['duck_fattening'], 'poultry:layers': ['layer', 'layer_fr'], 'poultry:pullets': ['pullet'], 'poultry:breeders': ['breeder_0_18w', 'breeder_18_60w'] };
  var BATCH_TYPES = { pig: [['finishers', 'Finishing pigs'], ['weaners', 'Weaners'], ['sows', 'Sows'], ['gilts', 'Maiden gilts'], ['boars', 'Boars']],
                      poultry: [['layers', 'Laying hens'], ['pullets', 'Pullets'], ['broilers', 'Broilers'], ['breeders', 'Breeding birds'], ['turkeys', 'Turkeys'], ['ducks', 'Ducks']] };
  function batchesHtml(c) {
    var s = S(), h = '', E = EN();
    s.batches.forEach(function (b) {
      var r = E.batchN(c.nation, { species: b.species, type: b.type, stage: b.stage, placed: b.placed, cleared: b.cleared, n: b.n, deaths: b.deaths, off_n: b.offN, where: b.where, repeats: b.repeats, empty_weeks: b.emptyWeeks, holding: b.holding, occupier: b.occupier }, c.year, LAW());
      var t = (BATCH_TYPES[b.species] || []).filter(function (x) { return x[0] === b.type; })[0];
      h += '<div class="sus-aw"><span class="sus-kind set">' + (b.species === 'pig' ? 'Pigs' : 'Poultry') + '</span><div><b>' + e((b.name ? b.name + ': ' : '') + N(b.n) + ' ' + (t ? t[1].toLowerCase() : b.type)) + '</b><p class="sus-mini">' +
        e('Placed ' + D(b.placed) + (b.cleared ? ', cleared ' + D(b.cleared) : '') + (b.deaths ? ', ' + pl(b.deaths, 'death') + (c.nation === 'N' ? '' : ' (counted at half: our averaging rule)') : '') + (b.repeats ? ', repeats after ' + pl(b.emptyWeeks || 0, 'empty week') : '') + '. ') +
        (r ? e(N(r.kg) + ' kg N this year') + (r.estimate ? ' <span class="sus-tag">Estimate</span> ' + e(r.why) : '') : 'Not worked out: dates needed.') + '</p>' +
        (c.nation === 'N' ? '<label class="sus-f"><span>How many went off the farm from this batch?</span><input type="number" min="0" data-sf="boff:' + e(b.id) + '" value="' + e(b.offN != null ? b.offN : '') + '" placeholder="Needs your answer"></label>' + (b.offN == null ? '<p class="sus-mini">Until you answer we count every one placed (the higher figure).</p>' : '') : '') +
        (b.species === 'pig' && (b.where || 'house') === 'house' ? '<div class="sus-q"><span class="sus-ql">Does the slurry crust over, or is the store covered?</span>' + seg('bcrust', b.crust ? b.id + ':' + b.crust : '', [[b.id + ':crust', 'Crusts over'], [b.id + ':none', 'No crust'], [b.id + ':cover', 'Covered']], 'Pig slurry crust') + '</div>' : '') +
        (b.species === 'poultry' && b.where === 'range' ? '<label class="sus-f"><span>About what share of the day are they out on the range? %</span><input type="number" min="0" max="100" data-sf="brange:' + e(b.id) + '" value="' + e(b.rangeShare != null ? b.rangeShare : '') + '" placeholder="Needs your answer"></label>' : '') +
        (b.holding === 'other' ? '<div class="sus-q"><span class="sus-ql">On someone else’s land. Who has it at their disposal while the stock is there?</span>' + seg('bocc', b.occupier ? b.id + ':' + b.occupier : '', [[b.id + ':us', 'We do'], [b.id + ':them', 'They do']], 'Occupier') + '</div>' : '') +
        '</div><button class="sus-lnk" data-sa="bdel" data-v="' + e(b.id) + '">Remove</button></div>';
    });
    var f = _ui.bf;
    if (f) {
      /* -440 (UX-44): only the stages or weight bands that fit the type picked (no turkey rows for laying hens, no finishing bands for sows) */
      var ni = c.nation === 'N', stages = f.type ? ((ni ? STAGES_NI : STAGES_GB)[f.species + ':' + f.type] || []) : [];
      var lab = function (k) { var N0 = LAW().nations[ni ? 'N' : c.nation].manure_n, r = (N0.per_batch_pig || {})[k] || (N0.per_crop_poultry || {})[k] || (N0.per_week_poultry || {})[k] || N0.per_head[k]; return r ? r.label : k; };
      /* -440 (UX-03): the species, the type and where they are start unanswered ("Choose…"), are kept on every redraw (setHtml),
         and the land question is asked first, so nothing typed is lost and no type is chosen silently */
      h += '<div class="sus-form"><div class="sus-q"><span class="sus-ql">On your land or someone else’s?</span>' + seg('bhold', f.holding || '', [['own', 'Ours, or land we rent'], ['other', 'Someone else’s land']], 'Holding') + '</div>' + seg('bsp', f.species || '', [['pig', 'Pigs'], ['poultry', 'Poultry']], 'Species') +
        (f.species ? '<div class="sus-row3"><label class="sus-f"><span>Type</span><select id="sus-b-type"><option value=""' + (f.type ? '' : ' selected') + '>Choose…</option>' + BATCH_TYPES[f.species].map(function (x) { return '<option value="' + x[0] + '"' + (f.type === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        (stages.length ? '<label class="sus-f"><span>Stage or weight band (optional)</span><select id="sus-b-stage"><option value="">Not sure yet</option>' + stages.map(function (k) { return '<option value="' + e(k) + '">' + e(lab(k)) + '</option>'; }).join('') + '</select></label>' : '') +
        '<label class="sus-f"><span>Name (optional)</span><input type="text" maxlength="80" id="sus-b-name"></label></div>' : '<p class="sus-mini">Pigs or poultry?</p>') +
        '<div class="sus-row3"><label class="sus-f"><span>How many placed</span><input type="number" min="1" id="sus-b-n"></label><label class="sus-f"><span>Deaths so far</span><input type="number" min="0" id="sus-b-d"></label><label class="sus-f"><span>Where</span><select id="sus-b-where"><option value=""' + (f.where ? '' : ' selected') + '>Choose…</option><option value="house"' + (f.where === 'house' ? ' selected' : '') + '>In a house</option><option value="range"' + (f.where === 'range' ? ' selected' : '') + '>House with a range</option><option value="field"' + (f.where === 'field' ? ' selected' : '') + '>Outdoors in a field</option></select></label></div>' +
        (f.species === 'poultry' && f.where === 'range' ? '<label class="sus-f"><span>About what share of the day are they out on the range? % (optional)</span><input type="number" min="0" max="100" id="sus-b-range"></label>' : '') +   /* UX-50: asked in the form */
        '<div class="sus-row3"><label class="sus-f"><span>Placed</span><input type="date" id="sus-b-placed"></label><label class="sus-f"><span>Cleared (blank if still in)</span><input type="date" id="sus-b-cleared"></label><label class="sus-f"><span>Empty weeks before the next batch (if it repeats)</span><input type="number" min="0" id="sus-b-empty"></label></div>' +
        '<div class="sus-bt"><button class="btn-pri sm" data-sa="bsave">Save batch</button><button class="sus-lnk" data-sa="bcancel">Cancel</button></div></div>';
    } else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="bopen">Add a pig or poultry batch</button></div>';
    if (s.batches.some(function (b) { return b.species === 'pig' && b.where === 'house'; })) h += '<div class="sus-q"><span class="sus-ql">How are the finishing pigs fed?</span>' + seg('pigfeed', set().pigFeed || '', [['dry', 'Dry fed'], ['liquid', 'Liquid fed']], 'Pig feed') + (set().pigFeed ? '' : '<p class="sus-mini">Liquid feeding doubles the slurry. Until you answer we use the liquid-fed figure (the higher legal row) and say so.</p>') + '</div>';
    return sec('sus-batches', 'Pig and poultry batches', h, 'Each batch once: when it came in and went out, how many, and deaths. ' + (c.nation === 'N' ? 'Northern Ireland counts each batch by its stage or crop.' : 'The legal figure is per place a year, so a batch counts for the days it is on the farm.'));
  }
  var COUNT_SP = [['goat', 'Goats'], ['deer', 'Deer'], ['horse', 'Horses and ponies'], ['donkey', 'Donkeys'], ['alpaca', 'Alpacas'], ['llama', 'Llamas']];
  function countsHtml(c) {
    var s = S(), h = '', E = EN();
    s.counts.forEach(function (x) {
      var r = E.countN(c.nation, { species: x.species, age_band: x.ageBand, milking: x.milking, n: x.n, ownership: x.ownership, occupier: x.occupier, assumeProxy: x.assumeProxy === true }, LAW(), FAC());
      var lab = COUNT_SP.filter(function (k) { return k[0] === x.species; })[0];
      h += '<div class="sus-aw"><span class="sus-kind set">' + e(lab ? lab[1] : x.species) + '</span><div><b>' + e(N(x.n) + ' ' + (lab ? lab[1].toLowerCase() : x.species) + (x.ownership === 'notours' ? ', not ours (livery or grazing)' : '')) + '</b><p class="sus-mini">' +
        (r && r.kg != null ? e(N(r.kg) + ' kg N a year' + (r.rate ? ' at ' + N(r.rate, 1) + ' each' : '')) + (r.estimate ? ' <span class="sus-tag">Estimate</span> ' + e(r.why) : '') : r && r.ask ? '<span class="sus-tag">Needs your answer</span> ' + e(r.why) : 'Not counted.') + '</p>' +
        (x.species === 'alpaca' || x.species === 'llama' ? '<label class="sus-f sus-cb"><input type="checkbox" data-sa="cproxy" data-v="' + e(x.id) + '"' + (x.assumeProxy ? ' checked' : '') + '><span>No official figure exists: use the goat figure scaled by weight (a labelled assumption)</span></label>' : '') +
        (x.ownership !== 'notours' ? '<label class="sus-f"><span>Months a year they are housed</span><input type="number" min="0" max="12" data-sf="chm:' + e(x.id) + '" value="' + e(x.housedMonths != null ? x.housedMonths : '') + '" placeholder="Needs your answer"></label>' : '') +
        (c.nation === 'N' && x.species === 'horse' ? '<div class="sus-q"><span class="sus-ql">Age</span>' + seg('cage', x.ageBand ? x.id + ':' + x.ageBand : '', [[x.id + ':u1', 'Under 1'], [x.id + ':1_2', '1 to 2'], [x.id + ':2_3', '2 to 3'], [x.id + ':gt3', 'Over 3']], 'Horse age') + '</div>' : '') +
        (x.ownership === 'notours' ? '<div class="sus-q"><span class="sus-ql">Who has the land at their disposal?</span>' + seg('cocc', x.occupier ? x.id + ':' + x.occupier : '', [[x.id + ':us', 'We do'], [x.id + ':them', 'They do']], 'Occupier') + '</div>' : '') +
        '</div><button class="sus-lnk" data-sa="cdel" data-v="' + e(x.id) + '">Remove</button></div>';
    });
    if (_ui.cf) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>Species</span><select id="sus-c-sp">' + COUNT_SP.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select></label><label class="sus-f"><span>How many</span><input type="number" min="1" id="sus-c-n"></label><label class="sus-f"><span>Whose</span><select id="sus-c-own"><option value="ours">Ours</option><option value="notours">Not ours (livery, grazing)</option></select></label></div><div class="sus-bt"><button class="btn-pri sm" data-sa="csave">Save</button><button class="sus-lnk" data-sa="ccancel">Cancel</button></div></div>';
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="copen">Add goats, deer, horses or other stock</button></div>';
    return sec('sus-counts', 'Other stock, as a count', h);
  }
  var MANURES = [['cattle_fym', 'Cattle FYM'], ['sheep_fym', 'Sheep FYM'], ['pig_fym', 'Pig FYM'], ['horse_fym', 'Horse FYM'], ['duck_fym', 'Duck FYM'], ['poultry_20', 'Poultry manure, wet (20% dry matter)'], ['poultry_40', 'Poultry litter (40%)'], ['poultry_60', 'Poultry litter (60%)'], ['poultry_80', 'Layer manure, dried (80%)'], ['cattle_slurry_6', 'Cattle slurry (6%)'], ['pig_slurry_4', 'Pig slurry (4%)']];
  function movesHtml(c, crops) {
    var s = S(), h = '', E = EN();
    s.manureMoves.forEach(function (m) {
      var r = E.manureMoveN({ kind: m.kind, qty: m.qty, unit: m.unit, manure: m.manure, kg_n: m.kgN }, FAC()), lab = MANURES.filter(function (k) { return k[0] === m.manure; })[0];
      var kw = { 'export': 'Sent off the farm', 'import': 'Brought in', 'clear-out': 'Cleared out to a heap or store', spread: 'Spread here' }[m.kind] || m.kind;
      h += '<div class="sus-aw"><span class="sus-kind ' + (m.kind === 'export' || m.kind === 'import' ? 'law' : 'set') + '">' + e(kw) + '</span><div><b>' + e(N(m.qty, 1) + ' ' + (m.unit === 'm3' ? 'm³' : 't') + ' ' + (lab ? lab[1].toLowerCase() : 'manure') + ', ' + D(m.on)) + '</b><p class="sus-mini">' + e((r && r.kg != null ? N(r.kg) + ' kg N' + (r.typed ? ' (your figure)' : ' (from the standard figure)') : 'Not worked out') + (m.toName ? ', to ' + m.toName : '') + (m.toCph ? ' (CPH ' + m.toCph + ')' : '') + '.') + '</p></div><button class="sus-lnk" data-sa="mdel" data-v="' + e(m.id) + '">Remove</button></div>';
    });
    if (_ui.mf) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>What happened</span><select id="sus-m-kind"><option value="clear-out">Cleared out to a heap or store</option><option value="export">Sent off the farm</option><option value="import">Brought in</option><option value="spread">Spread here</option></select></label><label class="sus-f"><span>Date</span><input type="date" id="sus-m-on"></label><label class="sus-f"><span>Manure</span><select id="sus-m-man">' + MANURES.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div id="sus-m-late" class="sus-late" hidden aria-live="polite"></div><div class="sus-row3"><label class="sus-f"><span>Amount</span><input type="number" min="0" id="sus-m-qty"></label><label class="sus-f"><span>Unit</span><select id="sus-m-unit"><option value="t">tonnes</option><option value="m3">m³</option></select></label><label class="sus-f"><span>kg N, if you have an analysis (optional)</span><input type="number" min="0" id="sus-m-kgn"></label></div>' +
      '<div class="sus-row3">' + whySelect('sus-m-why') + '</div><div class="sus-row3"><label class="sus-f"><span>Field, if spread here</span><select id="sus-m-field"><option value="">Not answered</option>' + landsAll().map(function (l) { return '<option value="' + e(l.id) + '">' + e(l.name + (l.area ? ', ' + N(l.area, 1) + ' ha' : '')) + '</option>'; }).join('') + '</select></label><label class="sus-f"><span>Area spread, ha (blank = the whole field)</span><input type="number" min="0" step="0.01" id="sus-m-area"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>To or from (name)</span><input type="text" maxlength="120" id="sus-m-to"></label><label class="sus-f"><span>Their CPH (optional)</span><input type="text" maxlength="20" id="sus-m-cph"></label></div><div class="sus-bt"><button class="btn-pri sm" data-sa="msave">Save</button><button class="sus-lnk" data-sa="mcancel">Cancel</button></div></div>';
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="mopen">Add a clear-out or a load of manure</button></div>';
    return crops ? sec('sus-moves', 'Manure brought in', h, 'Manure or slurry brought onto the farm (or sent off). It counts towards the 250 kg field limit when spread, and towards the 170 kg limit.') : sec('sus-moves', 'Clear-outs and manure moved', h, 'Litter clear-outs, and manure sent off the farm or brought in. Exports come off your manure limit; imports go on it.');
  }
  function howHtml(c) {
    var M = c.manure, rows = M.rows.filter(function (r) { return r.cite; }).slice(0, 8);
    var h = '<p class="sus-mini">Each legal class: average head over the year times the legal figure for ' + e(NAT[c.nation]) + '. The holding is the farm plus land you rent or otherwise have at your disposal.</p>';
    h += '<ul class="sus-ul">' + rows.map(function (r) { return '<li>' + e((r.label || r.key) + ': ' + N(r.head, 1) + ' x ' + N(r.rate, 2) + ' = ' + N(r.kg) + ' kg N. ' + (r.cite ? r.cite.source : '')) + '</li>'; }).join('') + '</ul>';
    return sec('sus-how', 'How it’s worked out', h + '<p class="sus-mini">' + e(c.law_set || '') + '. Check with your adviser if unsure.</p>');
  }

  /* ── first-time setup and the farm profile: steps 1 to 3 (decision 3: answers are written back to their modules) ── */
  var _ui = { retEdit: false, awf: null, bf: null, cf: null, mf: null, step: 0, fs: null, st: null };
  var STEPS = ['What we already know', 'Land and livestock', 'A few questions'];
  function setupOpen(step) {
    _ui.step = step || 0; _ui.shownStep = null;
    var ov = document.getElementById('sus-setup-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'sus-setup-ov'; ov.className = 'rn-modal'; ov.innerHTML = '<div class="rn-sheet sus-sheet" role="dialog" aria-modal="true" aria-labelledby="sus-setup-t"><div id="sus-setup-box"></div></div>'; document.body.appendChild(ov); ov.addEventListener('click', onClick); ov.addEventListener('change', onChange); }
    ov.classList.add('on'); setupRender();
  }
  function setupClose() { var ov = document.getElementById('sus-setup-ov'); if (ov) ov.classList.remove('on'); redraw(); }
  function setupRender() {
    var box = document.getElementById('sus-setup-box'); if (!box) return;
    var st = _ui.step, prof = setupDone(), h = '<div class="sh"><div><h3 id="sus-setup-t">' + (prof ? 'Farm profile' : 'Sustainability setup') + '</h3><div class="sus-mini">Step ' + (st + 1) + ' of 3: ' + STEPS[st] + '</div></div><button class="sus-lnk" data-sa="setclose">' + (prof ? 'Close' : 'Close and finish later') + '</button></div><div class="sus-sbody">';
    h += st === 0 ? step1() : st === 1 ? step2() : step3();
    h += '</div><div class="sus-snav"><button class="btn-sec" data-sa="setback"' + (st === 0 ? ' style="visibility:hidden"' : '') + '>Back</button><button class="btn-pri" data-sa="setnext">' + (st === 2 ? (prof ? 'Save and close' : 'Finish setup') : st === 0 && !prof ? 'Looks right' : 'Next') + '</button></div>';
    setHtml(box, h);
    /* -447 (web test F5): a new step opens at its top, never at the last step's scroll position */
    if (_ui.shownStep !== st) { _ui.shownStep = st; try { box.scrollTop = 0; var pe = box.parentElement; while (pe && pe !== document.body) { if (pe.scrollTop) pe.scrollTop = 0; pe = pe.parentElement; } } catch (er) {} }
  }
  function line(k, v, sub, src, extra) { return '<div class="sus-line"><span class="sus-lk">' + e(k) + '</span><div class="sus-lv">' + v + (sub ? '<small class="sus-mini">' + e(sub) + '</small>' : '') + (extra || '') + '</div>' + (src ? '<span class="sus-src' + (/Needs you/.test(src) ? ' miss' : '') + '">' + e(src) + '</span>' : '') + '</div>'; }
  function step1() {
    var T = W.ST || {}, n = nationKey(), nv = (typeof W.ukNvzStatus === 'function') ? W.ukNvzStatus() : { inNvz: null }, LS = W.ST_LS || {};
    var herds = (LS.herd || []).filter(function (h) { return h && !h.removed && !h.planned; }), lands = ((W.ST_CROP && W.ST_CROP.lands) || []).length;
    var h = '<p class="sus-mini">This is what the app already holds. Change anything that is wrong; it is saved where it lives.</p>';
    h += line('Farm', '<input type="text" maxlength="80" data-sf="prof:farmName" value="' + e(T.farmName || '') + '" aria-label="Farm name">', '', T.farmName ? 'From Settings' : 'Needs you');
    h += line('Nation', e(n ? NAT[n] : 'Not set'), 'Sets which rules apply. Change it in Settings.', n ? 'From Settings' : 'Needs you');
    h += line('Farm size', '<input type="number" min="0" step="0.1" data-sf="prof:farmHa" value="' + e(T.farmHa || '') + '" aria-label="Farm size in hectares"> ha', 'The farm size in Settings. Rented land is the next step, where we ask whether it is already inside this figure.', T.farmHa ? 'From Settings' : 'Needs you');
    var needCph = herds.length > 0;
    h += n === 'N' ? line('Herd or flock number', '<input type="text" maxlength="20" data-sf="prof:cphNumber" value="' + e(T.cphNumber || '') + '" aria-label="Herd or flock number">', 'Your DAERA herd number (on your cattle passports) or flock number.', T.cphNumber ? 'From Settings' : (needCph ? 'Needs you' : ''))   /* -440 (UX-43) */
      : line('CPH number', '<input type="text" maxlength="20" data-sf="prof:cphNumber" value="' + e(T.cphNumber || '') + '" placeholder="e.g. 12/345/6789" aria-label="CPH number">', 'On your cattle passports and sheep movement forms.', T.cphNumber ? 'From Settings' : (needCph ? 'Needs you' : ''));
    if (nv.how === 'whole-territory') h += line('NVZ', 'Every farm in ' + e(NAT[n]) + ' follows the nitrate rules', '', 'The law');
    else h += line('In an NVZ?', seg('nvz', nv.inNvz === true ? 'yes' : nv.inNvz === false ? 'no' : set().nvzAsk === 'unsure' ? 'unsure' : '', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], 'In an NVZ') + (nv.inNvz === null && set().nvzAsk === 'unsure' ? '<small class="sus-mini">Until you know, we use the NVZ rules (the safer ones) and say so. It stays on your jobs list.</small>' : ''),   /* -440 (UX-09) */ nv.suggestion === true ? 'The government map puts the farm’s location in an NVZ. It is a suggestion; you confirm it.' : nv.suggestion === false ? 'The government map does not put the farm’s location in an NVZ. You confirm it.' : 'Set the farm’s location in Rainfall and we check the government map for you.', nv.inNvz === null ? 'Needs you' : 'From Rainfall');
    /* -445 (decision 3): a Scottish farm whose NVZ map name does not settle the zone is asked once; "Not sure" uses the north dates */
    var sz = susScotZone();
    if (n === 'S' && (sz.ask || sz.how === 'answer' || sz.how === 'unsure')) { var szA = (W.ST_RAIN || {}).scotZone || '';
      h += line('Bagged nitrogen zone', '<span class="sus-ql">Is your farm in the Moray, Aberdeenshire, Banff and Buchan nitrate vulnerable zone?</span>' + seg('szone', szA, [['north', 'Yes'], ['south', 'No'], ['unsure', 'Not sure']], 'Moray, Aberdeenshire, Banff and Buchan NVZ') +
        (szA === 'unsure' ? '<small class="sus-mini">Until you know, we use the north dates: the longer closed period, so the safe side. It stays on your jobs list.</small>' : ''), 'It sets when bagged nitrogen can go on again.', szA === 'north' || szA === 'south' ? 'From Rainfall' : 'Needs you'); }
    h += line('Fields and crops', lands ? pl(lands, 'field') + ' in Crops' : 'None in Crops yet', '', lands ? 'From Crops' : '');
    h += line('Livestock', herds.length ? e(herds.map(function (x) { return N(x.qty) + ' ' + String(x.name || x.type).toLowerCase(); }).join(', ')) : 'None in Livestock yet', '', herds.length ? 'From Livestock' : '');
    return h;
  }
  /* -440 (UX-01, UX-18, UX-22, UX-29, UX-19, R6): step 2 keeps a row for every group the farm can add, split the way the law splits
     them: dairy heifers (replacements) are their own class (SI 2015/668 Sch 1 dairy rows, 34.7 and 61.0 kg N), never "steers";
     beef heifers and steers are separate; bulls are asked; other sheep (hoggs, ewe lambs, store lambs) have a row. A row shows
     while Livestock has no herd of its kind, so a cattle farm can still add its flock. Rows that share a herd become one herd with
     classes (Livestock's own class model). [key, label, herd type, herd name, class, kind] */
  var NEW_ROWS = [['suckler', 'Suckler cows', 'Suckler cows', 'Suckler herd', 'cows', 'suckler'], ['sbull', 'Breeding bulls', 'Suckler cows', 'Suckler herd', 'bulls', 'suckler'],
                  ['dairy', 'Dairy cows', 'Dairy cattle', 'Dairy herd', 'cows', 'dairy'], ['dheif', 'Dairy heifers (replacements)', 'Dairy youngstock', 'Dairy heifers', 'heifers', 'dairy_young'],
                  ['bheif', 'Beef heifers (young and finishing)', 'Store/finishing cattle', 'Young and finishing cattle', 'heifers', 'store_cattle'], ['steer', 'Steers (young and finishing)', 'Store/finishing cattle', 'Young and finishing cattle', 'steers', 'store_cattle'],
                  ['ewes', 'Ewes', 'Lowland ewes', 'Sheep flock', 'ewes', 'ewes'], ['rams', 'Rams', 'Lowland ewes', 'Sheep flock', 'rams', 'ewes'], ['osheep', 'Other sheep (hoggs, ewe lambs, store lambs)', 'Lowland ewes', 'Sheep flock', 'lambs', 'ewes']];
  function kindsHeld() { var o = {}; ((W.ST_LS && W.ST_LS.herd) || []).forEach(function (h) { if (h && !h.removed && !h.planned) { var k = EN().herdKind(h.type); if (k) o[k] = 1; if (k === 'rams' || k === 'store_lambs') o.ewes = 1; } }); return o; }
  /* R6: a herd called just "Beef cattle" (or "Cattle") could be suckler cows or finishing cattle; we ask, and never assume */
  function genericBeef(h) { var t = String((h && h.type) || '').toLowerCase(); return EN().herdKind(h.type) === 'suckler' && !/suckler|cow|bull|heifer|steer|calf|calves/.test(t); }
  function step2() {
    var st = set(), LS = W.ST_LS || {}, herds = (LS.herd || []).filter(function (h) { return h && !h.removed && !h.planned; }), own = num(W.ST && W.ST.farmHa) || 0;
    var h = '<h4>Rented land</h4><div class="sus-q"><span class="sus-ql">Do you rent any extra land?</span>' + seg('rent', st.rentedAsk || '', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], 'Rented land') +
      (st.rentedAsk === 'yes' ? '<label class="sus-f"><span>Rented land, ha</span><input type="number" min="0" step="0.1" data-sf="set:rentedHa" value="' + e(st.rentedHa || '') + '"></label>' +
          (num(st.rentedHa) > 0 ? '<div class="sus-q"><span class="sus-ql">Is the ' + N(st.rentedHa, 1) + ' ha rented already inside your farm size of ' + N(own, 1) + ' ha?</span>' + seg('rentin', st.rentedIn || '', [['yes', 'Yes, it is inside'], ['no', 'No, it is on top']], 'Rented land inside the farm size') + '</div>' : '') +   /* -447 (P1-5) */
          '<p class="sus-mini">' + (st.rentedIn === 'no' ? 'Limits are worked out over your ' + N(own, 1) + ' ha plus ' + N(st.rentedHa || 0, 1) + ' ha rented: ' + N(own + (num(st.rentedHa) || 0), 1) + ' ha in total.' : st.rentedIn === 'yes' ? 'Limits are worked out over ' + N(holdingHa() || 0, 1) + ' ha, the rented land included.' : 'Until you say, limits are worked out over ' + N(holdingHa() || 0, 1) + ' ha (the rented land counted as inside, the cautious side).') + '</p>'
        : st.rentedAsk === 'no' ? '<p class="sus-mini">Limits are worked out over your ' + N(own, 1) + ' ha.</p>' : st.rentedAsk === 'unsure' ? '<p class="sus-mini">Until you know, limits are worked out over your ' + N(own, 1) + ' ha. It is on your jobs list.</p>' : '<p class="sus-mini">Land you rent and have at your disposal counts as part of your farm for the manure limit.</p>') + '</div>';
    h += '<h4>Livestock</h4>';
    var noStock = !herds.length && !(S() && (S().batches.length || S().counts.length));
    if (noStock && lsOff() && !_ui.showStock) return h + '<p class="sus-mini">This farm’s setup has no livestock, so there is nothing to count here.</p><div class="sus-bt"><button class="btn-sec sm" data-sa="showstock">We keep livestock</button></div>';   /* -440 (UX-10) */
    var cs = herds.filter(function (x) { var k = EN().herdKind(x.type); return k && /^(suckler|dairy|dairy_young|store_cattle|ewes|rams|store_lambs)$/.test(k); });
    if (cs.length) {
      h += '<p class="sus-mini">From Livestock. Change a number and it is saved in Livestock.</p>';
      cs.forEach(function (x) {
        if (x.classes && x.classes.length) h += '<div class="sus-line"><span class="sus-lk">' + e(x.name || x.type) + '</span><div class="sus-lv sus-row3">' + x.classes.map(function (k, i) { return '<label class="sus-f"><span>' + e(typeof W.lsClassMeta === 'function' ? W.lsClassMeta(x.type, k.k).label : k.k) + '</span><input type="number" min="0" data-sf="herdcls:' + e(x.id) + ':' + i + '" value="' + e(k.n || 0) + '"></label>'; }).join('') + '</div><span class="sus-src">From Livestock</span></div>';
        else h += line(x.name || x.type, '<input type="number" min="0" data-sf="herdqty:' + e(x.id) + '" value="' + e(x.qty || 0) + '">', '', 'From Livestock');
        if (genericBeef(x)) { var bk = (st.beefKind || {})[x.id] || ''; h += '<div class="sus-q"><span class="sus-ql">' + e(x.name || x.type) + ': suckler cows or finishing cattle?</span>' + seg('beefkind', bk ? x.id + ':' + bk : '', [[x.id + ':suckler', 'Suckler cows'], [x.id + ':store_cattle', 'Finishing cattle']], 'Kind of beef herd') + (bk ? '' : '<p class="sus-mini">Not answered: counted as suckler cows, the higher figure, until you say. It is on your jobs list.</p>') + '</div>'; }
      });
    }
    var held = kindsHeld(), rows = NEW_ROWS.filter(function (r) { return !held[r[5]]; });
    if (rows.length) {
      h += '<p class="sus-mini">' + (cs.length ? 'Anything not in Livestock yet: add the numbers you keep and we set them up in Livestock.' : 'None in Livestock yet. Add the numbers you keep and we set them up in Livestock; you can add details there later.') + '</p><div class="sus-row3">' +
        rows.map(function (r) { return '<label class="sus-f"><span>' + e(r[1]) + '</span><input type="number" min="0" id="sus-nh-' + r[0] + '" placeholder="0"></label>'; }).join('') + '</div><div class="sus-bt"><button class="btn-sec sm" data-sa="newherds">Add to Livestock</button></div>';
    }
    h += '<div class="sus-q"><span class="sus-ql">Pigs, poultry, goats, deer, horses or other stock?</span><div class="sus-bt"><button class="btn-sec sm" data-sa="setgo" data-v="batches">Add pigs or poultry</button><button class="btn-sec sm" data-sa="setgo" data-v="counts">Add goats, deer, horses or other stock</button></div><p class="sus-mini">Opens the form in Livestock, Manure. Setup stays where you left it.</p></div>';
    return h;
  }
  function step3() {
    var c = compute(), st = set(), h = '';
    if (c && c.manure && !c.blocked) {
      var tmp = sizeHtml(c); if (tmp) h += tmp;
      var hh = houseHtml(c); if (hh) h += hh;
    }
    /* -440 (UX-45): the slurry closed period depends on the soil; asked here once (saved with the Rainfall closed-period setting) */
    if (c && c.stock && c.stock.slurry && c.nation !== 'N') h += '<div class="sus-q"><span class="sus-ql">Is most of the land sandy or shallow soil?</span>' + seg('soilask', st.soilAns || '', [['sandy', 'Yes, sandy or shallow'], ['other', 'No']], 'Soil') + '<p class="sus-mini">' + (st.soilAns ? 'Saved with your Rainfall closed-period setting.' : 'It sets when you can spread slurry. Until you answer we use the dates for soils that are not sandy or shallow, and say so.') + '</p></div>';
    var noStk = c && c.stock && !c.stock.any;   /* -440 (UX-10): a farm with no stock is asked only about other people's stock on its land */
    h += '<div class="sus-q"><span class="sus-ql">' + (noStk ? 'Any other people’s stock on your land (tack sheep, a grazing licence)?' : 'Any stock away from the farm, or other people’s stock on your land?') + '</span>' + seg('awayask', st.awayAsk || '', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], 'Stock away or not yours') + (st.awayAsk === 'yes' ? '<p class="sus-mini">Add them in Livestock, Manure, once setup is done. It is on your jobs list until you do.</p>' : '') + '</div>';   /* UX-30 */
    h += '<p class="sus-mini">Anything you skip becomes a job, and until then we use the safer figure and say so.</p>';
    return h;
  }
  function setupNext() {
    var s = S(); s.settings.setup = s.settings.setup || {};
    s.settings.setup['step' + (_ui.step + 1)] = 'seen';
    if (_ui.step < 2) { _ui.step++; save(); setupRender(); return; }
    s.settings.setup.finishedAt = s.settings.setup.finishedAt || new Date().toISOString();
    if (!s.settings.awayAsk) { /* never pre-selected; unanswered stays unanswered (a job) */ }
    save(setupDone() ? 'Farm profile saved' : 'Setup finished'); setupClose();
  }
  function addHerds() {
    var LS = W.ST_LS; if (!LS) return; var by = {}, added = 0;
    NEW_ROWS.forEach(function (r) {
      var el = document.getElementById('sus-nh-' + r[0]), n = el ? Math.floor(num(el.value) || 0) : 0; if (!(n > 0)) return;
      var hk = r[2] + '|' + r[3];
      if (r[0] === 'sbull' && !(num((document.getElementById('sus-nh-suckler') || {}).value) > 0) && num((document.getElementById('sus-nh-dairy') || {}).value) > 0) hk = 'Dairy cattle|Dairy herd';   /* a dairy farm's bull goes with the dairy herd */
      var g = by[hk] = by[hk] || { type: hk.split('|')[0], name: hk.split('|')[1], classes: [] };
      g.classes.push({ k: r[4], n: n, v: 0 });
    });
    Object.keys(by).forEach(function (hk) {
      var g = by[hk], id = typeof W.lsNextHerdId === 'function' ? W.lsNextHerdId() : Date.now(), q = g.classes.reduce(function (a, c) { return a + c.n; }, 0);
      LS.herd.push({ id: id, type: g.type, name: g.name, camp: '', campId: '', track: false, qty: q, buy: 0, feed: 0, vet: 0, sell: 0, months: 12, notes: 'Added in Sustainability setup', classes: g.classes });
      added++;
    });
    if (!added) { if (typeof W.toast === 'function') W.toast('Type at least one number first', 'info'); return; }
    livestockOn();
    saveLivestock(); _cache.key = null; setupRender(); redraw();
    if (typeof W.toast === 'function') W.toast(pl(added, 'herd') + ' added to Livestock', 'success');
  }
  /* -440 (UX-46): stock added in setup is shown in Livestock: a farm whose onboarding left Livestock off gets it switched on, and says so */
  function livestockOn() {
    try { if (typeof W.entOn === 'function' && !W.entOn('livestock') && typeof W.setEnterprise === 'function') { W.setEnterprise('livestock', true); if (W.toast) W.toast('Livestock is now switched on, so you can see the herd', 'info'); } } catch (er) {}
  }

  /* ── events (one delegate per container) ── */
  /* -440 (UX-36, as a class): a remove or a stop asks once more, on the button itself ("Tap again to remove"), for 5 seconds */
  function armed(b, words) {
    if (b.getAttribute('data-armed') === '1') return true;
    var was = b.textContent; b.setAttribute('data-armed', '1'); b.textContent = words || 'Tap again to remove'; b.classList.add('sus-armed');
    setTimeout(function () { try { b.removeAttribute('data-armed'); b.textContent = was; b.classList.remove('sus-armed'); } catch (er) {} }, 5000);
    return false;
  }
  W.susArmed = armed;
  var ARM = { stdel: 1, awdel: 1, bdel: 1, cdel: 1, mdel: 1, fsdel: 1 };
  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-sa]') : null; if (!b) return;
    var a = b.getAttribute('data-sa'), v = b.getAttribute('data-v') || '', s = S(), st = s ? s.settings : {};
    if (!s) return;
    if (ARM[a] && !armed(b)) return;
    switch (a) {
      case 'setup': setupOpen(0); return;
      case 'profile': setupOpen(0); return;
      case 'setclose': setupClose(); return;
      case 'setback': if (_ui.step > 0) { _ui.step--; setupRender(); } return;
      case 'setnext': setupNext(); return;
      case 'newherds': addHerds(); return;
      case 'showstock': _ui.showStock = true; setupRender(); return;
      case 'setgo': livestockOn(); setupClose(); if (v === 'batches') _ui.bf = { species: '', holding: '', type: '', where: '' }; else _ui.cf = true; goTo(v === 'batches' ? 'batches' : 'counts'); return;   /* UX-19 */
      case 'beefkind': var bkx = v.split(':'); st.beefKind = Object.assign({}, st.beefKind || {}); st.beefKind[bkx[0]] = bkx[1]; _cache.key = null; save('Saved'); setupRender(); return;   /* R6 */
      case 'hlog': if (typeof W.rnHousingOpen === 'function') { W.rnHousingOpen(); var hm0 = document.getElementById('rn-housing-modal'); if (hm0) document.body.appendChild(hm0); } return;   /* UX-11 */
      case 'print': printPack(); return;
      case 'go': case 'jobgo': goTo(v); return;
      case 'job': var p = v.split('|'); taskSet(p[0], p[1]); return;
      case 'nvz': if (v === 'unsure') { st.nvzAsk = 'unsure'; _cache.key = null; save(); setupRender(); redraw(); return; } st.nvzAsk = null;   /* -440 (UX-09): "Not sure" is an answer; the NVZ rules apply until it is known */
        st.nvzSeen = { n: nationKey(), v: v === 'yes' }; save();   /* -447 (P1-14): answered for this nation */
        if (typeof W.rnSetNvz === 'function') W.rnSetNvz(v); else { W.ST_RAIN.nvz = v === 'yes'; W.ST_RAIN.prefsSet = true; } try { if (W.ST_CROP && W.ST_CROP.compliance) W.ST_CROP.compliance.nvzInZone = (v === 'yes'); } catch (er) {} _cache.key = null; setupRender(); redraw(); return;
      case 'szone': if (typeof W.rnSetScotZone === 'function') W.rnSetScotZone(v); else if (W.ST_RAIN) { W.ST_RAIN.scotZone = v; W.ST_RAIN.prefsSet = true; } _cache.key = null; setupRender(); redraw(); return;   /* -445 (decision 3): saved in farms.rain_prefs through the merge RPC */
      case 'rent': st.rentedAsk = v; if (v !== 'yes') st.rentedHa = st.rentedHa || null; save(); setupRender(); return;
      case 'size': var q = v.split(':'); if (q[0] === 'suckler') st.sucklerSize = q[1]; if (q[0] === 'ewe') st.eweSize = q[1]; if (q[0] === 'dairy') st.dairyYield = q[1]; save('Saved'); setupRender(); return;
      case 'hmode': var hm = v.split(':'); st.housing = st.housing || {}; st.housing[hm[0]] = Object.assign({}, st.housing[hm[0]] || {}, { mode: hm[1] }); save('Saved'); setupRender(); return;   /* -440 (UX-28): the dates are never filled in for the farmer */
      case 'soilask': st.soilAns = v === 'sandy' ? 'sandy' : 'other'; try { if (typeof W.rnSetSoils === 'function') W.rnSetSoils(st.soilAns); else if (W.ST_RAIN) W.ST_RAIN.soils = st.soilAns; } catch (er) {} _cache.key = null; save('Saved'); setupRender(); return;
      case 'ewesin': st.ewesIn = v === 'no' ? 'no' : 'yes'; save('Saved'); setupRender(); return;
      case 'hsys': var hy = v.split(':'); st.housing = st.housing || {}; st.housing[hy[0]] = Object.assign({}, st.housing[hy[0]] || {}, { system: hy[1] }); save('Saved'); return;
      case 'hcrust': var hc = v.split(':'); st.housing = st.housing || {}; st.housing[hc[0]] = Object.assign({}, st.housing[hc[0]] || {}, { crust: hc[1] }); save('Saved'); return;
      case 'bcrust': var bcr = v.split(':'), bcb = s.batches.filter(function (x) { return x.id === bcr[0]; })[0]; if (bcb) { bcb.crust = bcr[1]; save('Saved'); } return;
      case 'cproxy': var cpx = s.counts.filter(function (x) { return x.id === v; })[0]; if (cpx) { cpx.assumeProxy = !cpx.assumeProxy; save('Saved'); } return;
      case 'awayask': st.awayAsk = v; save(); setupRender(); return;
      case 'ret': retAction(v); return;
      case 'stadd': s.stores.push({ id: uid('st'), kind: 'lagoon', name: '', capacityM3: null, covered: null, _new: true }); save(); return;
      case 'stdel': removeRow('stores', v); s.readings = s.readings.filter(function (r) { if (String(r.store) === String(v)) { (s.gone.readings = s.gone.readings || []).push(String(r.id)); return false; } return true; }); save('Store removed'); return;
      case 'rentin': st.rentedIn = v === 'no' ? 'no' : 'yes'; _cache.key = null; save('Saved'); setupRender(); return;   /* -447 (P1-5) */
      case 'wash': st.washAsk = v === 'yes' ? 'yes' : 'no'; _cache.key = null; save('Saved'); redraw(); return;   /* -446 (P0-2) */
      case 'stcrust': var scr = v.split(':'); st.storeCrust = Object.assign({}, st.storeCrust || {}); st.storeCrust[scr[0]] = scr[1] === 'none' ? 'none' : 'crust'; _cache.key = null; save('Saved'); return;
      case 'stcov': var sc = v.split(':'), so = s.stores.filter(function (x) { return x.id === sc[0]; })[0]; if (so) { so.covered = sc[1] === 'yes'; save('Saved'); } return;
      case 'fill': var fl = v.split(':'); s.readings.push({ id: uid('rd'), store: fl[0], on: today(), frac: +fl[1], source: 'typed', _new: true }); save('Thanks. The forecast starts from today’s level'); return;
      case 'awopen': _ui.awf = { kind: '', species: '' }; redraw(); return;   /* -440 (UX-07): nothing pre-selected */
      case 'awkind': if (_ui.awf) { _ui.awf.kind = v; redraw(); } return;
      case 'awcancel': _ui.awf = null; redraw(); return;
      case 'awsave': spanSave(); return;
      case 'awdel': removeRow('spans', v); save('Removed'); return;
      case 'awocc': var ao = v.split(':'), sp = s.spans.filter(function (x) { return x.id === ao[0]; })[0]; if (sp) { sp.occupier = ao[1]; save('Saved'); } return;
      case 'bopen': _ui.bf = { species: '', holding: '', type: '', where: '' }; redraw(); return;   /* -440 (UX-03): nothing chosen for the farmer */
      case 'bsp': if (_ui.bf) { if (_ui.bf.species !== v) _ui.bf.type = ''; _ui.bf.species = v; redraw(); } return;
      case 'bhold': if (_ui.bf) { _ui.bf.holding = v; redraw(); } return;
      case 'bcancel': _ui.bf = null; redraw(); return;
      case 'bsave': batchSave(); return;
      case 'bdel': removeRow('batches', v); save('Batch removed'); return;
      case 'bocc': var bo = v.split(':'), bb = s.batches.filter(function (x) { return x.id === bo[0]; })[0]; if (bb) { bb.occupier = bo[1]; save('Saved'); } return;
      case 'pigfeed': st.pigFeed = v; save('Saved'); return;
      case 'copen': _ui.cf = true; redraw(); return;
      case 'ccancel': _ui.cf = null; redraw(); return;
      case 'csave': countSave(); return;
      case 'cdel': removeRow('counts', v); save('Removed'); return;
      case 'cage': var ca = v.split(':'), cc = s.counts.filter(function (x) { return x.id === ca[0]; })[0]; if (cc) { cc.ageBand = ca[1]; save('Saved'); } return;
      case 'cocc': var co = v.split(':'), cx = s.counts.filter(function (x) { return x.id === co[0]; })[0]; if (cx) { cx.occupier = co[1]; save('Saved'); } return;
      case 'mopen': _ui.mf = true; redraw(); return;
      case 'mcancel': _ui.mf = null; redraw(); return;
      case 'msave': moveSave(); return;
      case 'mdel': removeRow('manureMoves', v); save('Removed'); return;
      /* Phase 2: Crops -> Compliance, nitrogen and soil */
      case 'nvzcsv': nvzCsv(); return;
      case 'fsopen': _ui.fs = true; redraw(); return;
      case 'fscancel': _ui.fs = null; redraw(); return;
      case 'fssave': storeSave(); return;
      case 'fsdel': removeRow('fertStore', v); save('Removed from the store'); return;
      case 'stopen': _ui.st = true; redraw(); return;
      case 'stcancel': _ui.st = null; redraw(); return;
      case 'stsave': soilSave(); return;
      case 'stview': soilView(v); return;
      case 'wfpsoil': st.wfpSoil = v === 'yes' ? 'yes' : 'no'; save('Saved'); return;
      case 'rtm': st.schemes = Object.assign({}, st.schemes || {}, { redTractor: v === 'yes' });
        /* -440 (UX-14): the same answer in Who's asking: yes adds Red Tractor there, no takes it off (it was the one answer all along) */
        try { st.asks = st.asks || {}; st.asks.items = st.asks.items || {}; var rti = st.asks.items.redtractor; if (v === 'yes' && !(rti && rti.state === 'yes')) st.asks.items.redtractor = Object.assign({}, rti || {}, { state: 'yes', src: 'farmer', on: today() }); else if (v === 'no' && rti && rti.state === 'yes') st.asks.items.redtractor = Object.assign({}, rti, { state: 'no', removedOn: today() }); } catch (er) {}
        save('Saved'); return;
      case 'nfa': var na = v.split(':'), nfo = st.nFields = st.nFields || {}; nfo[na[0]] = Object.assign({}, nfo[na[0]] || {}); nfo[na[0]][na[1]] = na[2] === 'yes'; save('Saved'); return;
    }
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  function onChange(ev) {
    var t = ev.target; if (!t) return;
    if (t.id === 'sus-aw-sp' && _ui.awf) { _ui.awf.species = t.value; redraw(); return; }
    if (t.id === 'sus-b-type' && _ui.bf) { _ui.bf.type = t.value; redraw(); return; }    /* -440: the stage list follows the type */
    if (t.id === 'sus-b-where' && _ui.bf) { _ui.bf.where = t.value; redraw(); return; }  /* -440 (UX-50): the range share is asked in the form */
    var f = t.getAttribute && t.getAttribute('data-sf'); if (!f) return;
    var p = f.split(':'), s = S(), st = s.settings, v = t.value;
    if (p[0] === 'prof') {
      if (!W.ST) return;
      if (p[1] === 'farmHa') { var ha = num(v); if (ha === null || ha <= 0 || ha > 100000) { _rangeAt = Date.now(); if (typeof W.toast === 'function') W.toast('The farm size should be more than 0 and up to 100,000 hectares. ' + (num(W.ST.farmHa) > 0 ? 'Kept ' + Number(W.ST.farmHa).toLocaleString('en-GB') + ' ha.' : 'Left blank.'), 'info');   /* -447 (web test F1): said plainly, and kept on screen */ try { t.value = num(W.ST.farmHa) > 0 ? W.ST.farmHa : ''; } catch (er) {} return; }   /* -448: a farm size of 0 is not set: "Left blank.", box left empty */ W.ST.farmHa = ha; try { if (W.FARM) W.FARM.ha = ha; } catch (er) {} }
      else W.ST[p[1]] = String(v).trim().slice(0, p[1] === 'cphNumber' ? 20 : 80);
      try { if (typeof W.syncFarmFromST === 'function') W.syncFarmFromST(); } catch (er) {}
      /* -447 (web test F2): a GB CPH is 12/345/6789. Kept as typed (a farmer may hold an older form), but a wrong shape is said. */
      var cphBad = p[1] === 'cphNumber' && String(v).trim() !== '' && nationKey() !== 'N' && !/^\d{2}\/\d{3}\/\d{4}$/.test(String(v).trim());
      var keepMsg = !cphBad && Date.now() - _rangeAt < 2500;   /* a range message just shown stays on screen */
      saveProfile(); _cache.key = null; if (cphBad) _rangeAt = Date.now();
      if (typeof W.toast === 'function' && !keepMsg) W.toast(cphBad ? 'Saved. A CPH number usually looks like 12/345/6789: check it on a cattle passport or movement form.' : 'Saved to Settings', cphBad ? 'info' : 'success');
      redraw(); return;
    }
    if (p[0] === 'set') { st[p[1]] = rangeNum(t, v, 0, 99999, st[p[1]]); save(); setupRender(); return; }
    if (p[0] === 'herdqty' || p[0] === 'herdcls') {
      var h = ((W.ST_LS && W.ST_LS.herd) || []).filter(function (x) { return String(x.id) === p[1]; })[0]; if (!h) return;
      var n = Math.floor(num(v)); if (!(n >= 0) || n > 1000000) { if (typeof W.toast === 'function') W.toast('Type a whole number', 'info'); try { t.value = p[0] === 'herdqty' ? (h.qty || 0) : ((h.classes[+p[2]] || {}).n || 0); } catch (er) {} return; }
      if (p[0] === 'herdqty') { h.qty = n; if (h.classes && h.classes.length === 1) h.classes[0].n = n; }
      else { h.classes[+p[2]].n = n; h.qty = h.classes.reduce(function (a, k) { return a + (Number(k.n) || 0); }, 0); }
      saveLivestock(); _cache.key = null; if (typeof W.toast === 'function') W.toast('Saved in Livestock', 'success'); setupRender(); redraw(); return;
    }
    if (p[0] === 'sns' || p[0] === 'soilg') { snsSet(p.slice(1).join(':'), p[0] === 'sns' ? 'sns' : 'soil', v); return; }
    if (p[0] === 'nplanN') { var lid = p.slice(1).join(':'), pn = num(v), nf2 = st.nFields = st.nFields || {}; nf2[lid] = Object.assign({}, nf2[lid] || {}, { planN: rangeNum(t, v, 0, 700, (nf2[lid] || {}).planN, 'Planned nitrogen, kg N/ha') }); save('Saved'); return; }
    if (p[0] === 'hw' || p[0] === 'hpct') { st.housing = st.housing || {}; var gh = st.housing[p[1]] = Object.assign({}, st.housing[p[1]] || {}); var hv = num(v);
      if (p[0] === 'hw') { gh.weightKg = rangeNum(t, v, 20, 1500, gh.weightKg, 'Weight, kg'); if (p[1] === 'sucklers' && gh.weightKg > 0) st.sucklerSize = gh.weightKg > 500 ? 'gt500' : 'le500'; }   /* -447 (web test F4): the weight answers the size question too */
      else gh.slurryPct = rangeNum(t, v, 0, 100, gh.slurryPct, 'Share as slurry, %'); save('Saved'); return; }
    if (p[0] === 'lpe') { st.lambsPerEwe = rangeNum(t, v, 0, 4, st.lambsPerEwe, 'Lambs reared per ewe'); _cache.key = null; save('Saved'); return; }   /* -447 (P1-2, P1-3) */
    if (p[0] === 'lambing') { var lm = Math.floor(num(v)); st.lambingMonth = lm >= 1 && lm <= 12 ? lm : null; save('Saved'); return; }
    if (p[0] === 'emptied') { st.assumeEmptied = !!t.checked; save('Saved'); return; }
    if (p[0] === 'washm3' || p[0] === 'yardm2') { var wk = p[0] === 'washm3' ? 'washM3Wk' : 'yardM2'; st[wk] = rangeNum(t, v, 0, p[0] === 'washm3' ? 10000 : 1000000, st[wk]); _cache.key = null; save('Saved'); redraw(); return; }   /* -446 (P0-2) */
    if (p[0] === 'anmfg') { st.assumeAnMfg = !!t.checked; save('Saved'); return; }
    if (p[0] === 'weeksfrom') { st.weeksFrom = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.slice(5) : null; save('Saved'); return; }
    if (p[0] === 'boff' || p[0] === 'brange') { var bb2 = s.batches.filter(function (x) { return x.id === p[1]; })[0]; if (!bb2) return; var bv = num(v);
      if (p[0] === 'boff') { var bo = rangeNum(t, v, 0, Number(bb2.n) || 0, bb2.offN, 'Birds or animals away'); bb2.offN = bo == null ? null : Math.floor(bo); } else bb2.rangeShare = rangeNum(t, v, 0, 100, bb2.rangeShare, 'Share on the range, %'); save('Saved'); return; }
    if (p[0] === 'chm') { var cx2 = s.counts.filter(function (x) { return x.id === p[1]; })[0]; if (!cx2) return; var cm = num(v); cx2.housedMonths = rangeNum(t, v, 0, 12, cx2.housedMonths, 'Months housed'); save('Saved'); return; }
    if (p[0] === 'hdm') {   /* -440 (UX-28): a day and a month; saved when both are chosen */
      var key = p[1] + ':' + p[2], P = (_ui.hpart = _ui.hpart || {})[key] = Object.assign({}, (_ui.hpart || {})[key] || {});
      var cur = ((st.housing || {})[p[1]] || {})[p[2]]; if (cur && !P.d && !P.m) { P.d = +cur.slice(3, 5); P.m = +cur.slice(0, 2); }
      P[p[3]] = num(v) || null;
      if (P.d && P.m) { var dim = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][P.m - 1]; if (P.d > dim) { if (W.toast) W.toast('That month has ' + dim + ' days', 'info'); return; }
        st.housing = st.housing || {}; var gh2 = st.housing[p[1]] = st.housing[p[1]] || { mode: 'winter' }; gh2[p[2]] = ('0' + P.m).slice(-2) + '-' + ('0' + P.d).slice(-2); delete _ui.hpart[key]; save('Saved'); }
      return;
    }
    if (p[0] === 'house') { st.housing = st.housing || {}; var g = st.housing[p[1]] = st.housing[p[1]] || { mode: 'winter' }; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) g[p[2]] = v.slice(5); save('Saved'); return; }
    if (p[0] === 'store') {
      var so = s.stores.filter(function (x) { return x.id === p[1]; })[0]; if (!so) return;
      if (p[2] === 'kind' || p[2] === 'name') so[p[2]] = String(v).slice(0, 80);
      else if (p[2] === 'builtOrChanged') so.builtOrChanged = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      else so[p[2]] = rangeNum(t, v, 0, 9999999, so[p[2]], p[2] === 'openAreaM2' ? 'Open area, m²' : 'Size');
      save('Saved'); return;
    }
  }
  function goTo(v) {
    if (v === 'setup') { setupOpen(0); return; }
    if (v === 'setup2') { setupOpen(1); return; }
    if (v === 'addstock') { livestockOn(); _ui.showStock = true; setupOpen(1); return; }   /* -440 (UX-10) */   /* -440: the step 2 answers (rented land, the kind of beef herd) */
    if (v === 'sizes') { setupOpen(2); return; }
    if (v === 'rainfall') { W.nav('rainfall'); return; }
    if (v === 'register') { W.nav('livestock'); setTimeout(function () { try { W.lsTab('kreg'); } catch (er) {} }, 160); return; }
    if (v === 'crops' || v === 'soil') { W.nav('crop'); setTimeout(function () { try { W.cropSetTab('comply'); var el = document.getElementById(v === 'soil' ? 'sus-soil' : 'sus-crop-n'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); } catch (er) {} }, 160); return; }
    if (v === 'jobs') { if (W._susHealthUi && W._susHealthUi.tab !== 'jobs') { W._susHealthUi.tab = 'jobs'; renderSustain(); } var j = document.getElementById('sus-jobs'); if (j && j.scrollIntoView) j.scrollIntoView({ block: 'start' }); return; }
    var anchor = { 'ls-stores': 'sus-stores', 'ls-return': 'sus-return', stores: 'sus-stores', 'return': 'sus-return', housing: 'sus-housing', away: 'sus-away', batches: 'sus-batches', counts: 'sus-counts' }[v] || null;
    W.nav('livestock');
    setTimeout(function () { try { W.lsTab('manure'); if (anchor) { var el = document.getElementById(anchor); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); } } catch (er) {} }, 160);
  }
  function retAction(v) {
    var c = compute(); if (!c || !c.sheep) return; var sh = c.sheep, y = sh.dates.year;
    if (v === 'chg') { _ui.retEdit = true; redraw(); return; }
    if (v === 'cancel') { _ui.retEdit = false; redraw(); return; }
    var inv = invFor(y, true);
    if (v === 'ok') { inv.ewes = sh.estimate.ewes; inv.rams = sh.estimate.rams; inv.other = sh.estimate.other; inv.goats = sh.goats ? (sh.estimate.goats || 0) : null; inv.countedOn = today(); save('Count saved'); return; }
    if (v === 'save') {
      var g = function (id) { var x = Math.floor(num(val(id))); return x >= 0 && x < 1000000 ? x : 0; };
      inv.ewes = g('sus-re'); inv.rams = g('sus-rr'); inv.other = g('sus-ro'); if (sh.goats) inv.goats = g('sus-rg'); inv.countedOn = today(); _ui.retEdit = false; save('Count saved'); return;
    }
    if (v === 'file') { if (inv.ewes == null) return; inv.filedOn = today(); inv.filedVia = sh.dates.route; taskMark('sheep-return:' + y, 'done'); save('Marked as filed. We don’t send it for you'); return; }
    if (v === 'unfile') { inv.filedOn = null; taskMark('sheep-return:' + y, 'open'); save('Marked as not filed'); return; }
    if (v === 'copy') {
      var f = sh.counted || sh.estimate, txt = 'Ewes ' + f.ewes + '\nRams ' + f.rams + '\nOther sheep ' + f.other + (sh.goats ? '\nGoats ' + (f.goats || 0) : '');
      try { navigator.clipboard.writeText(txt).then(function () { W.toast && W.toast('Figures copied', 'success'); }, function () { W.toast && W.toast(txt.replace(/\n/g, ', '), 'info'); }); } catch (er) { W.toast && W.toast(txt.replace(/\n/g, ', '), 'info'); }
    }
  }
  function taskMark(id, status) { var s = S(), t = s.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) { t = { id: id, rule: id.split(':')[0], kind: 'law', area: 'livestock', _new: true }; s.tasks.push(t); } t.status = status; t.doneAt = status === 'done' ? new Date().toISOString() : null; s.history.push({ id: uid('h'), task: id, what: status, at: new Date().toISOString(), _new: true }); }
  function spanSave() {
    var f = _ui.awf; if (!f || !f.kind) { W.toast && W.toast('Choose away or not ours first', 'info'); return; }
    var n = Math.floor(num(val('sus-aw-n'))), from = val('sus-aw-from'), to = val('sus-aw-to');
    if (!(n > 0)) { W.toast && W.toast('How many?', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) { W.toast && W.toast('When did they go or come?', 'info'); return; }
    if (to && to < from) { W.toast && W.toast('The end is before the start', 'info'); return; }
    var spc = val('sus-aw-sp') || f.species, role = val('sus-aw-role');
    if (!spc) { W.toast && W.toast('Cattle or sheep?', 'info'); return; } if (!role) { W.toast && W.toast('Which group?', 'info'); return; }
    /* -440 (UX-07): stock sent away must be stock the farm has; say so rather than take off what isn't there */
    if (f.kind === 'away') { var have = roleHead(spc, role); if (have !== null && n > have) { W.toast && W.toast(have ? 'Livestock shows ' + N(have) + ' of that group. Check the group, or the number' : 'Livestock has none of that group. Choose the group they belong to', 'info'); return; } }
    S().spans.push({ id: uid('sp'), kind: f.kind, species: spc, role: role, n: n, from: from, to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null, where: String(val('sus-aw-where')).slice(0, 120), occupier: null, _new: true });
    _ui.awf = null; if (set().awayAsk !== 'yes') set().awayAsk = 'yes'; save('Saved');
  }
  /* head of one away-group role in Livestock today (stockRecords' roles), or null when it can't be told */
  function roleHead(sp, role) {
    try { var c = compute(); if (!c || !c.manure || !c.manure.records) return null; var t = today(), n = 0;
      c.manure.records.forEach(function (r) { if (r.species !== sp || r.src === 'away' || r.src === 'notours') return; if ((r.on && r.on > t) || (r.off && r.off <= t)) return;
        var rr = r.role === 'beef' || r.role === 'dairy_young' || r.role === 'bull_beef' ? 'beef' : r.role === 'lamb' || r.role === 'store' ? 'store' : r.role; if (rr === role) n += Number(r.n) || 0; });
      return Math.floor(n); } catch (er) { return null; }
  }
  function batchSave() {
    var f = _ui.bf; if (!f) return; var n = Math.floor(num(val('sus-b-n'))), d = Math.floor(num(val('sus-b-d')) || 0), pl0 = val('sus-b-placed'), cl = val('sus-b-cleared'), ew = num(val('sus-b-empty'));
    if (!(n > 0)) { W.toast && W.toast('How many were placed?', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pl0)) { W.toast && W.toast('When were they placed?', 'info'); return; }
    if (cl && cl < pl0) { W.toast && W.toast('Cleared is before placed', 'info'); return; }
    if (d < 0 || d > n) { W.toast && W.toast('Deaths can’t be more than the birds or pigs placed', 'info'); return; }
    if (!f.holding) { W.toast && W.toast('On your land or someone else’s?', 'info'); return; }
    if (!f.species) { W.toast && W.toast('Pigs or poultry?', 'info'); return; }
    var ty = val('sus-b-type'), wh = val('sus-b-where'); if (!ty) { W.toast && W.toast('Which type?', 'info'); return; } if (!wh) { W.toast && W.toast('Where are they kept?', 'info'); return; }
    var rs = num(val('sus-b-range'));
    S().batches.push({ id: uid('b'), species: f.species, type: ty, stage: val('sus-b-stage') || null, name: String(val('sus-b-name')).slice(0, 80), n: n, deaths: d, where: wh, rangeShare: wh === 'range' && rs !== null && rs >= 0 && rs <= 100 ? rs : null, placed: pl0, cleared: /^\d{4}-\d{2}-\d{2}$/.test(cl) ? cl : null,
      emptyWeeks: ew !== null && ew >= 0 ? Math.floor(ew) : null, repeats: ew !== null && ew >= 0 && !!cl, holding: f.holding, occupier: f.holding === 'own' ? 'us' : null, source: 'typed', _new: true });
    _ui.bf = null; save('Batch saved');
  }
  function countSave() {
    var n = Math.floor(num(val('sus-c-n'))); if (!(n > 0)) { W.toast && W.toast('How many?', 'info'); return; }
    S().counts.push({ id: uid('c'), species: val('sus-c-sp'), n: n, ownership: val('sus-c-own') || 'ours', ageBand: null, milking: null, occupier: null, _new: true });
    _ui.cf = null; save('Saved');
  }
  /* -439-sus6 (owner decision "closed" a): a closed-period date is never refused. The farmer picks why; "None: possible
     breach" is a reason. The list is the law table's lawful routes for this nation (closed.lawful_routes). */
  function whyOptions() {
    var L = LAW(), k = nationKey(), C = L && k && L.nations[k] ? L.nations[k].closed.value : null, o = (C && C.lawful_routes ? C.lawful_routes : []).map(function (r) { return [r.value.id, r.label]; });
    o.push(['none', 'None: possible breach']); return o;
  }
  function whySelect(id) { return '<label class="sus-f" id="' + id + '-row"><span>If this date is in a closed period, why?</span><select id="' + id + '"><option value="">Choose (only needed in a closed period)</option>' + whyOptions().map(function (o) { return '<option value="' + e(o[0]) + '">' + e(o[1]) + '</option>'; }).join('') + '</select></label>'; }
  /* -441b (real-DB retest 16 Nov): the reasons offered are the lawful routes for THIS product, land and date (the engine's
     closedPeriodHit().reasons), never the whole nation list. The form offered "FACTS adviser" and "crop exception" (manufactured N
     only) for slurry; the farmer could pick one and the record then read "reason not given". */
  function fillWhy(id, reasons) {
    var el = document.getElementById(id); if (!el || !reasons) return;
    var cur = el.value, first = el.options[0] ? el.options[0].outerHTML : '<option value="">Choose</option>';
    el.innerHTML = first + reasons.map(function (o) { return '<option value="' + e(o.id) + '">' + e(o.label) + '</option>'; }).join('');
    el.value = reasons.some(function (o) { return o.id === cur; }) ? cur : '';
  }
  /* -441c: one spreading over several fields - only a reason that covers EVERY field in the closed period is offered */
  function andReasons(a, b) { if (!a) return b; return a.filter(function (o) { return (b || []).some(function (x) { return x.id === o.id; }); }); }
  /* the fields whose own lawful reasons are lost when ticked together (e.g. wheat: FACTS advice; oilseed rape: the crop exception) */
  function splitNeeded(per, all) { var ids = (all || []).map(function (o) { return o.id; }).join(); return per.length > 1 && per.some(function (p) { return p.r.map(function (o) { return o.id; }).join() !== ids; }); }
  var SPLIT_WORDS = 'These fields need different reasons in the closed period, so no one reason covers them all. Log each field on its own.';
  function whyNotFor(why, reasons, what) {
    if (!why || !reasons || reasons.some(function (o) { return o.id === why; })) return null;
    return 'That reason does not cover ' + what + ' on this date. Choose one of: ' + reasons.map(function (o) { return o.label; }).join('; ') + '.';
  }
  function moveSave() {
    var on0 = val('sus-m-on'), q = num(val('sus-m-qty')), k = num(val('sus-m-kgn')), kind = val('sus-m-kind'), fld = val('sus-m-field'), ar = num(val('sus-m-area'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on0)) { W.toast && W.toast('When was it?', 'info'); return; }
    if (!(q > 0) && !(k >= 0)) { W.toast && W.toast('How much?', 'info'); return; }
    if (ar !== null && !(ar > 0)) { W.toast && W.toast('The area must be more than 0 ha', 'info'); return; }
    var L0 = kind === 'spread' && fld ? landOf(fld) : null;
    var m = { id: uid('mm'), kind: kind, on: on0, manure: val('sus-m-man'), qty: q, unit: val('sus-m-unit') || 't', kgN: k !== null && k >= 0 ? k : null, toName: String(val('sus-m-to')).slice(0, 120), toCph: String(val('sus-m-cph')).slice(0, 20),
              field: L0 ? L0.id : null, areaHa: L0 ? (ar !== null ? ar : (L0.area || null)) : null, _new: true };
    var late = kind === 'spread' ? lateCheck(on0) : null;   /* -445 (decision 1): always saved; the toast says it was late */
    var go = function (msg) { S().manureMoves.push(m); _ui.mf = null; save((msg || 'Saved') + (late ? '. ' + late.words : '')); };
    /* Phase 2 (R13): the one closed-period check, the same function as the Crops input form. -439-sus6: never refused. */
    var hit = spreadCheck(m), why = val('sus-m-why');
    if (hit) {
      if (!why) { W.toast && W.toast(hit.why + ' Choose why in “If this date is in a closed period, why?”; it is saved either way, as the law asks.', 'info'); var wr = document.getElementById('sus-m-why'); if (wr && wr.focus) wr.focus(); return; }
      var bad = whyNotFor(why, hit.reasons, 'this manure'); if (bad) { fillWhy('sus-m-why', hit.reasons); W.toast && W.toast(bad, 'info'); var wr2 = document.getElementById('sus-m-why'); if (wr2 && wr2.focus) wr2.focus(); return; }
      m.closedReason = why; var wl = hit.reasons.filter(function (o) { return o.id === why; }).map(function (o) { return [o.id, o.label]; })[0];
      go('Saved with a warning: inside the closed period (' + (wl ? wl[1] : why) + ')'); return;
    }
    go();
  }
  /* -441c: Livestock -> Manure offers only the reasons that fit this spreading, as soon as the date, manure or field is known
     (it listed every route for the nation until Save, then refused the wrong one) */
  function moveWhyRefresh() {
    var el = document.getElementById('sus-m-why'); if (!el) return;
    var fld = val('sus-m-field'), m = { kind: val('sus-m-kind'), on: val('sus-m-on'), manure: val('sus-m-man'), field: fld ? (landOf(fld) || {}).id : null };
    var hit = /^\d{4}-\d{2}-\d{2}$/.test(m.on) && m.kind === 'spread' ? spreadCheck(m) : null;
    if (hit && hit.reasons) fillWhy('sus-m-why', hit.reasons);
  }
  try { document.addEventListener('change', function (ev) { var t = ev.target; if (t && /^sus-m-(kind|on|man|field)$/.test(t.id || '')) { moveWhyRefresh(); lateShow('sus-m-late', val('sus-m-kind') === 'spread' ? val('sus-m-on') : ''); } }, true); } catch (e) {}
  /* ── the print pack, for the farmer's own file (no sending) ── */
  function printPack() {
    var c = compute(); if (!c || !c.manure) { W.toast && W.toast('Nothing to print yet', 'info'); return; }
    var T = W.ST || {}, M = c.manure, mw = manureWords(c), sw = storeWords(c), shw = sheepWords(c);
    var stk = c.stock || { any: true, slurry: true }, ttl = stk.any ? 'Livestock manure and storage' : 'Nitrogen and soil';   /* -440 (UX-10, UX-26) */
    var h = '<h1>' + ttl + ', ' + c.year + '</h1><div class="meta">' + e(T.farmName || 'Your farm') + (T.cphNumber ? ', ' + holdingWord(c.nation) + ' ' + e(T.cphNumber) : '') + ', ' + e(NAT[c.nation]) + '. Printed ' + e(D(c.today)) + '. For your own file: we don’t send it anywhere.</div>';
    if (stk.any) { h += '<h2>Manure nitrogen over the holding</h2><p><b>' + e(mw.big) + '</b>: ' + e(mw.st[1]) + '. ' + e(mw.line) + '</p>';
    h += '<table><tr><th>Legal class</th><th class="amt">Average head</th><th class="amt">kg N a head</th><th class="amt">kg N</th></tr>' + M.rows.map(function (r) { return '<tr><td>' + e(r.label || r.key) + (r.estimate ? ' (estimate)' : '') + '</td><td class="amt">' + N(r.head, 1) + '</td><td class="amt">' + N(r.rate, 2) + '</td><td class="amt">' + N(r.kg) + '</td></tr>'; }).join('') +
      (M.adjustKg ? '<tr><td>Manure moved on or off the holding</td><td></td><td></td><td class="amt">' + N(M.adjustKg) + '</td></tr>' : '') + '<tr class="total"><td>Total</td><td></td><td></td><td class="amt">' + N(M.kg) + '</td></tr></table>';
    h += '<p class="meta">Holding: ' + (M.holdingHa ? N(M.holdingHa, 1) + ' ha (the farm' + (set().rentedAsk === 'yes' ? ' plus ' + N(set().rentedHa, 1) + ' ha rented' : '') + ')' : 'not known') + '. ' + e(M.cite ? M.cite.source : '') + '.</p>';
    if (M.estimates.length) h += '<p class="meta">Estimates: ' + e(M.estimates.join('; ')) + '.</p>';
    var rl0 = typeof W.susRegLine === 'function' ? W.susRegLine(c) : null; if (rl0) h += '<p class="meta">Head counts from Livestock. ' + e(rl0) + '.</p>';
    if (stk.slurry) { h += '<h2>Slurry storage</h2><p><b>' + e(sw.big) + '</b>: ' + e(sw.st[1]) + '. ' + e(sw.line) + '</p>';
    if (c.store && c.store.estimates && c.store.estimates.length) h += '<p class="meta">Estimates: ' + e(c.store.estimates.join('; ')) + '.</p>'; } }
    if (shw) h += '<h2>Sheep and goat inventory</h2><p><b>' + e(shw.big) + '</b>: ' + e(shw.st[1]) + '. ' + e(shw.line) + '</p>';
    if (c.n && c.n.has) { var nw = nWords(c); h += '<h2>Nitrogen and soil (records in Crops)</h2><p><b>' + e(nw.big) + '</b>: ' + e(nw.st[1]) + '. ' + e(nw.line) + '</p>' +
      (c.n.rec.crops.length ? '<table><tr><th>Crop</th><th class="amt">Area, ha</th><th class="amt">Allowed, kg N/ha</th><th class="amt">Applied, kg N/ha</th></tr>' + c.n.rec.crops.map(function (k) { return '<tr><td>' + e(k.label) + '</td><td class="amt">' + N(k.area, 1) + '</td><td class="amt">' + (k.limitKgHa == null ? '' : N(k.limitKgHa)) + '</td><td class="amt">' + N(k.appliedKgHa) + '</td></tr>'; }).join('') + '</table>' : ''); }
    if (c.n && c.n.has && (c.n.rec.breaches || []).length) h += '<p><b>Spread in a closed period</b> (as recorded):</p><table><tr><th>Date</th><th>Field</th><th>Product</th><th>Closed period</th><th>Reason</th></tr>' + c.n.rec.breaches.map(function (b) { return '<tr><td>' + e(D(b.date)) + '</td><td>' + e(b.fieldName) + '</td><td>' + e(b.product) + '</td><td>' + e(D(b.from) + ' to ' + D(b.to)) + '</td><td>' + e(b.reasonWords) + '</td></tr>'; }).join('') + '</table>';   /* -446 (P0-4) */
    var open = c.jobs.filter(function (j) { return j.open && j.kind === 'law'; });
    h += '<h2>Legal jobs</h2>' + (open.length ? '<table><tr><th>Job</th><th>Due</th></tr>' + open.map(function (j) { return '<tr><td><b>' + e(j.title) + '</b><br>' + e(j.why) + '</td><td>' + e(j.due ? D(j.due) : '') + '</td></tr>'; }).join('') + '</table>' : (lawLater(c.jobs).length ? '' : '<p>None open.</p>'));
    var lt0 = lawLater(c.jobs);   /* -441 (UX-04): put off with "Later", still true */
    if (lt0.length) h += '<p><b>Due later:</b> put off for now, still true from your records.</p><table><tr><th>Job</th><th>Back on the list</th></tr>' + lt0.map(function (j) { return '<tr><td><b>' + e(j.title) + '</b><br>' + e(j.why) + '</td><td>' + e(j.until ? D(j.until) : '') + '</td></tr>'; }).join('') + '</table>';
    h += '<p class="meta">Legal values ' + e(c.law_set) + ', factors ' + e(c.factor_set || '') + '. Check with your adviser if unsure.</p>';
    var csv = (typeof W.toCSV === 'function') ? W.toCSV(['Legal class', 'Average head', 'kg N a head', 'kg N'], M.rows.map(function (r) { return [r.label || r.key, Math.round(r.head * 10) / 10, r.rate, Math.round(r.kg)]; }).concat([['Total', '', '', Math.round(M.kg)]])) : null;
    if (!stk.any) csv = null;
    if (typeof W.lsShowReport === 'function') W.lsShowReport(ttl + ' ' + c.year, '#1B4332', h, csv, 'manure-and-storage-' + c.year + '.csv');
    else if (typeof W.printWindow === 'function') W.printWindow(ttl, h);
  }

  /* ── the attention list and the bell (D1a): legal jobs only, never the sheep return twice ── */
  function attnItems() {
    if (!on()) return [];
    var c; try { c = compute(); } catch (er) { return []; }
    if (!c || !c.jobs) return [];
    var regItems = c.jobs.filter(function (j) { return j.open && j.rule_id === 'register-diff'; }).map(function (j) {
      return { tier: j.legal ? 'legal' : 'house', sev: j.legal ? 70 : 58, nm: j.title, lead: j.title, sub: j.why, st: 'check', when: 9999, cta: 'Open the register', action: function () { goTo('register'); } };
    });
    /* -440 (UX-35): the setup answers the law turns on (the NVZ answer, the farm's hectares, a missing slurry store) reach the Dashboard
       and the bell too, as a "to answer" item, not only the jobs list */
    var LAWSETUP = { 'nvz-answer': 1, 'holding-area': 1, 'setup-store': 1, 'scot-zone': 1 };   /* -445: the Scotland zone too */
    var setupItems = c.jobs.filter(function (j) { return j.open && LAWSETUP[j.rule_id]; }).map(function (j) {
      return { tier: j.kind === 'law' ? 'legal' : 'house', sev: j.kind === 'law' ? 70 : 60, nm: j.title, lead: j.title, sub: j.why, st: 'to answer',   /* -441 (UX-17): the store job is legal in an NVZ, listed once */ when: 9998, cta: 'Answer', action: function () { if (j.cta === 'setup' || j.cta === 'rainfall') setupOpen(0); else goTo(j.cta); } };
    });
    /* -441 (real-DB retest 16 Nov): a "shared" legal job is left out only when the module that shares it already raises it. The soil test
       is shared with Crops, Compliance, but nothing there puts a soil item on the Dashboard or in the bell, so it was dropped from both
       while this page said "Legal jobs also show on the Dashboard and in the bell". */
    var raisedElsewhere = function (j) {
      if (!j.shared) return false;
      try { return typeof W.computeNotifications === 'function' && W.computeNotifications().some(function (n) { return /soil/i.test(String(n.title || n.nm || '') + ' ' + String(n.sub || n.text || '')) && j.shared === 'compliance-soil'; }); } catch (er) { return false; }
    };
    return regItems.concat(setupItems, c.jobs.filter(function (j) { return j.open && j.kind === 'law' && !raisedElsewhere(j) && !LAWSETUP[j.rule_id]; }).map(function (j) {
      var w = j.dueIn == null ? 9999 : j.dueIn;
      /* -440 (UX-34): a store job carries its full-by date, so the Dashboard says when, not "no date" */
      var full = /^store-/.test(j.rule_id) && j.fullBy;
      return { tier: 'legal', sev: w < 0 ? 92 : (w <= 14 ? 78 : 62), nm: j.title, lead: j.title, sub: j.why,
               st: full ? 'full around ' + D(j.fullBy) : j.dueIn == null ? 'no date' : j.dueIn < 0 ? pl(-j.dueIn, 'day') + ' over' : j.dueIn === 0 ? 'due today' : 'in ' + pl(j.dueIn, 'day'),
               when: full ? Math.max(0, EN()._util.daysBetween(c.today, j.fullBy)) : w, cta: j.area === 'crops' ? 'Open crops' : 'Open livestock', action: function () { goTo(j.cta); } };
    }));
  }
  function inventoryFiled(year) {
    if (!on()) return false; var s = S(); if (!s) return false;
    var x = s.inventory.filter(function (r) { return +r.year === +year; })[0]; if (x && x.filedOn) return true;
    var t = s.tasks.filter(function (r) { return r.id === 'sheep-return:' + year; })[0]; return !!(t && t.status === 'done');
  }
  /* Crops -> Compliance (C4): the worked-out 170 kg figure replaces the typed tick */
  function manureResult() { var c = compute(); return c && c.manure && !c.blocked ? { perHa: c.manure.perHa, over: c.manure.over, kg: c.manure.kg, holdingHa: c.manure.holdingHa } : null; }

  /* ── redraw what is on screen, and the nav ── */
  function redraw() {
    _cache.key = null;
    try { var p = document.getElementById('pg-sustain'); if (p && p.classList.contains('on')) renderSustain(); } catch (er) { console.warn('sustainability render', er); }
    try { var v = document.getElementById('ls-view-manure'); if (v && v.style.display !== 'none') susLsRender(); } catch (er) { console.warn('livestock manure render', er); }
    try { var kv = document.getElementById('ls-view-kreg'); if (kv && kv.style.display !== 'none' && typeof W.susRegRender === 'function') W.susRegRender(); } catch (er) { console.warn('livestock register render', er); }
    try { if (typeof W.renderNotifications === 'function') W.renderNotifications(); } catch (er) {}
    try { if (typeof W.renderAttnCard === 'function' && document.querySelector('#pg-dashboard.on')) W.renderAttnCard(); } catch (er) {}
    try { var cv = document.getElementById('crop-view-comply'); if (on() && cv && cv.style.display !== 'none' && document.querySelector('#pg-crop.on') && typeof W.cropRenderCompliance === 'function') W.cropRenderCompliance(); } catch (er) { console.warn('crops compliance render', er); }
    try { var ov = document.getElementById('sus-setup-ov'); if (ov && ov.classList.contains('on')) setupRender(); } catch (er) {}
  }
  function navSync() {
    var showIt = on();
    try { var n = document.getElementById('nav-sustain'); if (n) n.style.display = showIt ? '' : 'none'; } catch (er) {}
    try { var t = document.getElementById('ls-tab-manure'); if (t) t.style.display = showIt ? '' : 'none'; } catch (er) {}
    try { var t2 = document.getElementById('ls-tab-kreg'); if (t2) t2.style.display = showIt ? '' : 'none'; } catch (er) {}
  }
  var _wired = false;
  function wire() {
    if (_wired) return; _wired = true;
    ['pg-sustain', 'ls-view-manure', 'crop-view-comply'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.addEventListener('click', onClick); el.addEventListener('change', onChange); } });
    navSync();
  }
  function render() { wire(); renderSustain(); }
  function lsRender() { wire(); susLsRender(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else setTimeout(wire, 0);


  /* ══ Phase 2 (-435-sus2): nitrogen and soil. Crops owns the records (fertiliser inputs, the fertiliser store, soil tests,
     the N plan answers); Livestock -> Manure records manure spreading; the engine works it all out once, in compute(). ══ */
  var ORG_KINDS = [['cattle_slurry', 'Cattle slurry'], ['pig_slurry', 'Pig slurry'], ['poultry_litter', 'Poultry litter'], ['layer_manure', 'Layer manure'], ['cattle_fym', 'Cattle FYM'],
                   ['sheep_fym', 'Sheep FYM'], ['pig_fym', 'Pig FYM'], ['horse_fym', 'Horse FYM'], ['duck_fym', 'Duck FYM'], ['digestate', 'Digestate (needs an analysis)']];
  var MOVE_ORG = { cattle_fym: 'cattle_fym', sheep_fym: 'sheep_fym', pig_fym: 'pig_fym', horse_fym: 'horse_fym', duck_fym: 'duck_fym', poultry_20: 'layer_manure', poultry_40: 'poultry_litter',
                   poultry_60: 'poultry_litter', poultry_80: 'poultry_litter', cattle_slurry_6: 'cattle_slurry', pig_slurry_4: 'pig_slurry' };
  var UNITS_HA = [['kg/ha', 'kg a hectare'], ['t/ha', 'tonnes a hectare'], ['L/ha', 'litres a hectare'], ['m3/ha', 'm³ a hectare'], ['kg', 'kg in all'], ['t', 'tonnes in all'], ['L', 'litres in all'], ['m3', 'm³ in all']];
  var SOILS = [['medium', 'Medium soils'], ['deep_clay', 'Deep clay soils'], ['light_sand', 'Light sand'], ['shallow', 'Shallow soils'], ['organic', 'Organic soils'], ['peat', 'Peat']];
  function products() { var F = FAC(); return F && F.factors ? F.factors.filter(function (f) { return /^fert\.product\./.test(f.id); }) : []; }
  function productBy(name) { var n = String(name || '').trim().toLowerCase(); if (!n) return null; return products().filter(function (f) { return f.label.toLowerCase() === n; })[0] || null; }
  function landsAll() {
    var out = [];
    ((W.ST_CROP && W.ST_CROP.lands) || []).forEach(function (l) { if (!l) return; var k = EN().cropKey(l.crop, l.planted);
      out.push({ id: l.id, name: l.name || '', crop: l.crop || '', area: Number(l.area) || 0, planted: l.planted || null, targetYield: Number(l.targetYield) || null, landType: k === 'grass' ? 'grass' : 'arable', kind: 'crop', planted0: !!(l.crop && l.stage !== 'fallow') }); });
    ((W.ST_LS && W.ST_LS.fields) || []).forEach(function (f) { if (!f) return; out.push({ id: f.id, name: f.name || '', crop: 'Grass / silage', area: Number(f.ha) || 0, planted: null, targetYield: null, landType: 'grass', kind: 'ls', planted0: true }); });
    return out;
  }
  function landOf(id) { return landsAll().filter(function (l) { return String(l.id) === String(id); })[0] || null; }
  function moveKgN(m) { var r = EN().manureMoveN({ kind: m.kind, qty: m.qty, unit: m.unit, manure: m.manure, kg_n: m.kgN }, FAC()); return r && r.kg != null ? r.kg : null; }
  /* -445 (decision 3): Scotland's zone, the one place the desktop works it out (Crops, Rainfall and Sustainability all call this) */
  function susScotZone() {
    var R = W.ST_RAIN || {}, E = EN(), L = LAW(), nv = (typeof W.ukNvzStatus === 'function') ? W.ukNvzStatus() : { inNvz: null };
    var inp = { nation: nationKey(), answer: R.scotZone || null, mapName: (R.nvzMap && R.nvzMap.name) || '', nvz: nv.inNvz };
    if (E && E.scotZone && L) return E.scotZone(inp, L);
    var a = inp.answer; return { applies: inp.nation === 'S', north: a === 'north' || a === 'unsure' ? true : a === 'south' ? false : /aberdeen|banff|buchan|moray/i.test(inp.mapName), how: 'fallback', ask: false };
  }
  W.susScotZone = susScotZone;
  /* -445 (decision 1): recorded more than the law's days after the spreading (England and Wales, 7). Always saved; a calm line. */
  function lateCheck(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
    var c = compute(), E = EN(), L = LAW(); if (!c || !c.nation || !L || !E || !E.recordLate) return null;
    var r = E.recordLate({ nation: c.nation, spreadOn: date, recordedOn: today() }, L); return r && r.late ? r : null;
  }
  function lateHtml(r) {
    if (!r) return '';
    var u = r.cite && r.cite.source_url ? r.cite.source_url : '';
    return '<span>' + e(r.words) + '</span> <details class="sus-why"><summary>Why?</summary><span>' + e(r.why || '') + (u ? ' <a href="' + e(u) + '" target="_blank" rel="noopener">legislation.gov.uk</a>' : '') + '. It is saved either way.</span></details>';
  }
  function lateShow(id, date) { var el = document.getElementById(id); if (!el) return; var r = lateCheck(date); el.hidden = !r; el.innerHTML = lateHtml(r); }
  W.susLateCheck = function (date) { var r = lateCheck(date); return r ? r.words : null; };
  function nInputs() {
    var st = set(), nf = st.nFields || {};
    var lands = landsAll().filter(function (l) { return l.planted0; }).map(function (l) { return Object.assign({}, l, { opts: nf[l.id] || {} }); });
    /* Phase 4: lime is logged as a fertiliser input with no N; it is for the carbon (and soil), not the NVZ record */
    var inputs = ((W.ST_CROP && W.ST_CROP.inputs) || []).filter(function (x) { return x && x.kind === 'fertiliser' && !(typeof W.susLimeKind === 'function' && W.susLimeKind(x.product)); }).map(function (x) { var pr = productBy(x.product);
      return { id: x.id, land: x.land, kind: x.kind, date: x.date, product: x.product, n_pct: x.nPct, p2o5_pct: x.p2o5Pct, k2o_pct: x.k2oPct, qty: x.qty, qty_unit: x.qtyUnit, area_ha: x.areaHa,
               organic_kind: x.organicKind || null, applied: x.applied, n_form: x.nForm || (pr ? pr.n_form : null), kg_per_l: pr && pr.kg_per_l ? pr.kg_per_l : null, closed_reason: x.closedReason || null, avail_pct: x.availPct != null ? x.availPct : null }; });
    var spreads = (S() ? S().manureMoves : []).filter(function (m) { return m && m.kind === 'spread'; }).map(function (m) { var L0 = m.field != null ? landOf(m.field) : null, lab = MANURES.filter(function (k) { return k[0] === m.manure; })[0];
      return { id: m.id, field: m.field != null ? m.field : null, fieldName: L0 ? L0.name : '', date: m.on, organic_kind: MOVE_ORG[m.manure] || null, qty: m.qty, qty_unit: m.unit, area_ha: m.areaHa || null, kg_n: moveKgN(m), label: lab ? lab[1] : 'Manure', closed_reason: m.closedReason || null }; });
    var tests = (S() ? S().soilTests : []).map(function (t) { return { id: t.id, land: t.land, sampled_on: t.on || null, sns: t.sns, soil: t.soil || null }; });
    /* -445 (decision 3): the farmer's answer (rain_prefs.scotZone) wins, then the NVZ map name; one engine function decides (susScotZone) */
    var zone = susScotZone();
    return { lands: lands, inputs: inputs, spreads: spreads, tests: tests, member: (st.schemes || {}).redTractor === true ? true : (st.schemes || {}).redTractor === false ? false : null,
             north: !!zone.north, zone: zone };
  }
  function nCompute(inp) {
    var E = EN(), L = LAW(), F = FAC() || {}, n = inp.n, t = inp.today, nv = inp.nvz ? inp.nvz.inNvz : null;
    var rec = E.nvzRecords({ nation: inp.nation, nvz: nv, today: t, from: E._util.yearFrom ? E._util.yearFrom(t) : E._util.addDays(t, -364), to: t, lands: n.lands, inputs: n.inputs, spreads: n.spreads, soil: inp.soil, north: n.north }, L, F);
    var cropFields = n.lands.filter(function (l) { return l.kind === 'crop'; });
    var soil = cropFields.length ? E.soilDue(inp.nation, cropFields, n.tests, t, L) : null;
    var urea = n.inputs.map(function (x) { return Object.assign({ id: x.id, date: x.date, product: x.product }, E.ureaCheck({ nation: inp.nation, member: n.member, appliedOn: x.date, n_form: x.n_form, product: x.product }, L)); }).filter(function (u) { return u.applies; });
    var y1 = +t.slice(0, 4) + 1, plans = cropFields.map(function (l) {
      var tt = n.tests.filter(function (x) { return String(x.land) === String(l.id); }), sn = tt.filter(function (x) { return x.sns != null; }).sort(function (a, b) { return String(a.id) < String(b.id) ? 1 : -1; })[0] || null;
      var so = tt.filter(function (x) { return x.soil; })[0] || null, key = E.cropKey(l.crop, l.planted);
      return { land: l, crop: key, sns: sn ? sn.sns : null, soil: so ? so.soil : null,
               plan: E.nPlan({ crop: key, sns: sn ? sn.sns : null, expectedYield: l.targetYield, soil: so ? so.soil : null, nation: inp.nation, nvz: nv, nmaxOpts: l.opts }, L, F) };
    });
    return { rec: rec, soil: soil, urea: urea, plans: plans, planYear: y1, member: n.member, has: !!(n.inputs.length || n.spreads.length || cropFields.length) };
  }
  function nWords(c) {
    var X = c.n; if (!X || !X.has) return { big: 'No fertiliser records yet', st: ['n', 'Not started'], line: 'Log fertiliser and manure in Crops, Inputs, with the N% and the amount.' };
    var R = X.rec, over = R.crops.filter(function (k) { return k.status === 'over'; }), lim = R.crops.filter(function (k) { return k.status === 'within' || k.status === 'over'; });
    var orgOver = R.organic.over.length, worst = 0; Object.keys(R.organic.fields).forEach(function (f) { worst = Math.max(worst, R.organic.fields[f].worstKgHa); });
    var st = over.length || orgOver ? ['r', 'Over a limit'] : R.missing ? ['a', 'Records missing N'] : lim.length ? ['g', 'Within the limits'] : ['n', 'No limit worked out'];
    var big = over.length ? over.map(function (k) { return k.label; }).join(', ') + ' over the N max' : orgOver ? 'Over 250 kg N/ha of organic manure on ' + pl(orgOver, 'field') : R.missing ? 'N max not worked out: ' + pl(R.missing, 'record') + ' without N' : lim.length ? 'Within the crop N max' : worst > 0 ? 'Organic manure within 250 kg N/ha' : (c.nvz && c.nvz.inNvz === false && c.nation !== 'W' && c.nation !== 'N' ? 'No crop N max here' : 'N max not worked out');   /* -440 (UX-33) */
    if (!over.length && !orgOver && !R.missing && !lim.length && worst > 0) st = ['g', 'Within the limits'];
    /* -446 (web test P0-4): a closed-period application with no lawful route recorded is said first, never under "Within the limits" */
    var br = (R.breaches || []).length;
    if (br) { st = ['r', 'Spread in a closed period']; big = pl(br, 'application') + ' in a closed period with no lawful route recorded' + (over.length || orgOver ? '; ' + big.charAt(0).toLowerCase() + big.slice(1) : ''); }
    var line = (R.rows.length ? pl(R.rows.length, 'application') + ' in the last 12 months. ' : '') + (R.organic.applies === false ? 'Organic manure: ' + (R.organic.why || 'no 250 kg field limit here') + '.' : worst > 0 ? 'Organic manure: the most on one field is ' + N(worst) + ' of 250 kg N/ha' + (orgOver ? ' (over on ' + pl(orgOver, 'field') + ')' : '') + '.' : 'No organic manure spread on a field.') +   /* -446: with no field limit the table is empty - never read that as no manure */   /* -440 (UX-33): never "up to 0 of 250" */
      (X.soil ? ' Soil tests: ' + (X.soil.due + X.soil.missing ? pl(X.soil.due + X.soil.missing, 'field') + (X.soil.due + X.soil.missing === 1 ? ' needs one' : ' need one') + (X.soil.law ? ' (law)' : ' (scheme)') : 'up to date') + '.' : '');   /* UX-48 */
    return { big: big, st: st, line: line };
  }
  /* ── Crops -> Compliance: the nitrogen and soil records (Crops owns them) ── */
  function cropsHtml() {
    if (!on()) return '';
    var c = compute(); if (!c || !c.n) return c && c.blocked === 'ni' ? '' : '';
    var X = c.n, R = X.rec, E = EN(), h = '<div id="sus-crop-n" class="sus-ls" style="margin:6px 0 18px">';
    var w = nWords(c);
    h += '<div class="sus-card sus-head"><div><span class="sus-k">Nitrogen and soil, 12 months to ' + e(D(c.today)) + '</span><b class="sus-big">' + e(w.big) + '</b><p class="sus-mini">' + e(w.line) + '</p></div>' + stPill(w.st) + '</div>';
    /* N max by crop */
    var nm = '<div class="sus-scroll"><table class="sus-t"><tr><th>Crop</th><th class="n">Area, ha</th><th class="n">Allowed, kg N/ha</th><th class="n">Applied, kg N/ha</th><th>Status</th></tr>' +
      R.crops.map(function (k) { var s = k.status === 'over' ? ['r', 'Over'] : k.status === 'within' ? ['g', 'Within'] : k.status === 'no-limit' ? ['n', 'No limit here'] : ['a', 'Missing'];
        return '<tr><td>' + e(k.label) + (k.tags.length ? '<br><span class="sus-mini">' + e(k.tags.join('; ')) + '</span>' : '') + '</td><td class="n">' + N(k.area, 1) + '</td><td class="n">' + (k.limitKgHa == null ? '' : N(k.limitKgHa)) + '</td><td class="n">' + N(k.appliedKgHa) + '</td><td>' + stPill(s) + '</td></tr>'; }).join('') + '</table></div>';
    h += sec('sus-nmax', 'Crop N max', R.crops.length ? nm : '<p class="sus-mini">Plant a field in Crops and the limit for its crop shows here.</p>',
      'Manufactured N plus the crop-available N from organic manure, over the area of each crop. ' + ((LAW().nations[c.nation].nmax || {}).source || ''));
    /* 250 per field */
    var fo = Object.keys(R.organic.fields).map(function (f) { var x = R.organic.fields[f], L0 = landOf(f); return '<tr><td>' + e(L0 ? L0.name : f) + '</td><td class="n">' + N(x.nowKgHa) + '</td><td class="n">' + N(x.worstKgHa) + '</td><td>' + stPill(x.over ? ['r', 'Over 250'] : ['g', 'Within 250']) + '</td></tr>'; }).join('');
    h += sec('sus-org', 'Organic manure on each field', fo ? '<div class="sus-scroll"><table class="sus-t"><tr><th>Field</th><th class="n">Last 12 months</th><th class="n">Most in any 12 months</th><th>Status</th></tr>' + fo + '</table></div>' : R.organic.applies === false ? '<p class="sus-mini">' + e((R.organic.why || 'No 250 kg field limit here').replace(/^./, function (c) { return c.toUpperCase(); })) + '. Each application is still in the NVZ record below.</p>' : '<p class="sus-mini">No organic manure spread on a field yet. Record slurry and FYM in Crops, Inputs (as an organic manure) or in Livestock, Manure (spread here, with the field).</p>',
      'No more than 250 kg of total N from organic manure on any hectare in any 12 months. Manure dropped by grazing animals is not counted.');
    /* NVZ records + CSV */
    var rows = R.rows.map(function (r) { return '<tr><td>' + e(D(r.date)) + '</td><td>' + e(r.fieldName) + '</td><td>' + e(r.product) + '</td><td>' + e(r.type) + '</td><td class="n">' + (r.kgNHa == null ? '' : N(r.kgNHa)) + '</td><td class="n">' + (r.availKgNHa == null ? '' : N(r.availKgNHa)) + '</td><td>' + (r.closed ? stPill(['r', r.closed]) : '') + (r.note ? '<br><span class="sus-mini">' + e(r.note) + '</span>' : '') + '</td></tr>'; }).join('');
    h += sec('sus-nvzrec', 'NVZ records', (rows ? '<div class="sus-scroll"><table class="sus-t" id="sus-nvz-table"><tr><th>Date</th><th>Field</th><th>Product</th><th>Type</th><th class="n">kg N/ha</th><th class="n">Crop-available</th><th>Check</th></tr>' + rows + '</table></div>' : '<p class="sus-mini">No fertiliser or manure applications in the last 12 months.</p>') +
      '<div class="sus-bt"><button class="btn-sec sm" data-sa="nvzcsv"' + (R.rows.length ? '' : ' disabled') + '>Download the NVZ records (CSV)</button></div>', 'Every nitrogen application per field: the record the NVZ rules ask you to keep for 5 years. The CSV has the same rows as this table.');
    h += storeHtml(c) + planHtml(c) + soilHtml(c) + ureaHtml(c);
    if (lsOff()) h += movesHtml(c, true);   /* -440 (UX-10): a farm without Livestock records manure brought in here */
    return h + '</div>';
  }
  function storeLeft(x) {
    var u = x.qtyUnit === 'L' ? 'L' : 'kg', bought = (num(x.qty) || 0) * (x.qtyUnit === 't' ? 1000 : 1), used = 0, name = String(x.product || '').toLowerCase();
    ((W.ST_CROP && W.ST_CROP.inputs) || []).forEach(function (i) {
      if (!i || i.kind !== 'fertiliser' || i.removed || String(i.product || '').toLowerCase() !== name || !(i.date >= x.on) || i.applied === false) return;
      var q = num(i.qty); if (q === null) return; var perHa = /\/ha$/.test(i.qtyUnit || ''), l = landOf(i.land), ha = num(i.areaHa) || (l ? l.area : 0);
      var tot = perHa ? q * ha : q, base = String(i.qtyUnit || '').replace('/ha', '');
      if (u === 'kg') used += base === 't' ? tot * 1000 : base === 'kg' ? tot : 0; else if (base === 'L') used += tot;
    });
    return { bought: bought, used: used, left: Math.max(0, bought - used), unit: u };
  }
  function storeHtml(c) {
    var s = S(), h = '', list = s.fertStore.filter(function (x) { return !x.removed; });
    list.forEach(function (x) { var L = storeLeft(x);
      h += '<div class="sus-aw"><span class="sus-kind set">Bought</span><div><b>' + e(x.product + ', ' + N(x.qty, 2) + ' ' + (x.qtyUnit === 'L' ? 'litres' : x.qtyUnit === 'kg' ? 'kg' : 'tonnes')) + '</b><p class="sus-mini">' +
        e('Bought ' + D(x.on) + (x.supplier ? ' from ' + x.supplier : '') + '. ' + (x.nPct != null ? N(x.nPct, 1) + '% N' + (x.p2o5Pct ? ', ' + N(x.p2o5Pct, 1) + '% P₂O₅' : '') + (x.k2oPct ? ', ' + N(x.k2oPct, 1) + '% K₂O' : '') + '. ' : '') +
        'About ' + N(L.left / (L.unit === 'kg' ? 1000 : 1), 2) + (L.unit === 'kg' ? ' t' : ' L') + ' left (spread: ' + N(L.used / (L.unit === 'kg' ? 1000 : 1), 2) + (L.unit === 'kg' ? ' t' : ' L') + ', matched by the product name).') + '</p></div><button class="sus-lnk" data-sa="fsdel" data-v="' + e(x.id) + '">Remove</button></div>';
    });
    if (_ui.fs) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>Product</span><select id="sus-fs-prod"><option value="">Choose, or type below</option>' + products().map(function (p) { return '<option value="' + e(p.id) + '">' + e(p.label) + '</option>'; }).join('') + '</select></label>' +
      '<label class="sus-f"><span>Or its name</span><input type="text" maxlength="120" id="sus-fs-name"></label><label class="sus-f"><span>Bought on</span><input type="date" id="sus-fs-on"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>N %</span><input type="number" min="0" max="100" step="0.1" id="sus-fs-n"></label><label class="sus-f"><span>P₂O₅ % (optional)</span><input type="number" min="0" max="100" step="0.1" id="sus-fs-p"></label><label class="sus-f"><span>K₂O % (optional)</span><input type="number" min="0" max="100" step="0.1" id="sus-fs-k"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>How much</span><input type="number" min="0" step="0.01" id="sus-fs-qty"></label><label class="sus-f"><span>Unit</span><select id="sus-fs-unit"><option value="t">tonnes</option><option value="kg">kg</option><option value="L">litres</option></select></label><label class="sus-f"><span>Supplier (optional)</span><input type="text" maxlength="120" id="sus-fs-sup"></label></div>' +
      '<div class="sus-bt"><button class="btn-pri sm" data-sa="fssave">Add to the store</button><button class="sus-lnk" data-sa="fscancel">Cancel</button></div></div>';
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="fsopen">Add fertiliser bought</button></div>';
    return sec('sus-store', 'Fertiliser store', h || '<p class="sus-mini">Nothing in the store.</p>', 'Bought is not spread. A delivery sits here until you log it on a field in Crops, Inputs; only then is it an NVZ record.');
  }
  function planHtml(c) {
    var X = c.n, nat = c.nation, rows = X.plans.map(function (p) {
      var L = p.land, o = (set().nFields || {})[L.id] || {}, P = p.plan, lim = P.nmax || {};
      var asks = [];
      if (/wheat/.test(p.crop || '') && nat !== 'N' && nat !== 'S') asks.push(['milling', 'Milling wheat?']);
      if ((p.crop === 'winter_wheat' || p.crop === 'winter_barley') && nat !== 'N' && nat !== 'S') asks.push(['shallow', 'Shallow soil (not over sandstone)?']);
      if (p.crop === 'grass' && nat !== 'N' && nat !== 'S') asks.push(['cuts3', 'Cut three times or more?']);
      if (nat === 'N' && lim.rule === 'table') asks.push(['yieldEvidence', 'Farm yield above the standard in one of the last 3 years?']);
      var askH = asks.map(function (a) { var v = o[a[0]] === true ? 'yes' : o[a[0]] === false ? 'no' : ''; return '<div class="sus-q"><span class="sus-ql">' + e(a[1]) + '</span>' + seg('nfa', v ? L.id + ':' + a[0] + ':' + v : '', [[L.id + ':' + a[0] + ':yes', 'Yes'], [L.id + ':' + a[0] + ':no', 'No']], a[1]) + '</div>'; }).join('');
      if (nat === 'S' && lim.rule === 'plan') askH += '<label class="sus-f"><span>Planned N for this field, kg N/ha (your Nmax)</span><input type="number" min="0" max="700" data-sf="nplanN:' + e(L.id) + '" value="' + e(o.planN != null ? o.planN : '') + '"></label>';
      var snsSel = '<select data-sf="sns:' + e(L.id) + '"><option value="">Not answered</option>' + [0, 1, 2, 3, 4, 5, 6].map(function (i) { return '<option value="' + i + '"' + (p.sns === i ? ' selected' : '') + '>Index ' + i + '</option>'; }).join('') + '</select>';
      var soilSel = '<select data-sf="soilg:' + e(L.id) + '"><option value="">Not answered</option>' + SOILS.map(function (s) { return '<option value="' + s[0] + '"' + (p.soil === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>';
      return '<div class="sus-hr"><div class="sus-gh"><b>' + e(L.name + ', ' + (L.crop || 'no crop') + ', ' + N(L.area, 1) + ' ha') + '</b>' +
        (P.rec != null ? stPill(['g', 'RB209 ' + N(P.rec) + ' kg N/ha']) : stPill(['n', 'No RB209 figure'])) + '</div>' +
        '<div class="sus-row3"><label class="sus-f"><span>SNS Index</span>' + snsSel + '</label><label class="sus-f"><span>Soil</span>' + soilSel + '</label><div class="sus-f"><span>Expected yield</span><b>' + (L.targetYield ? N(L.targetYield, 1) + ' t/ha (the field’s target)' : 'Not set: add a target yield to the field') + '</b></div></div>' +
        '<p class="sus-mini">' + e(P.rec != null ? 'RB209: ' + N(P.base) + ' at Index ' + P.sns + (P.yieldAdj ? (P.yieldAdj > 0 ? ' + ' : ' − ') + N(Math.abs(P.yieldAdj)) + ' for the yield' : '') + ' = ' + N(P.rec) + ' kg N/ha. ' : (P.refused ? P.refused + '. ' : '')) + e(
          (lim.limit != null ? 'Legal N max ' + N(lim.limit) + ' kg N/ha' + (lim.adds && lim.adds.length ? ' (' + lim.adds.map(function (a) { return '+' + a.kg + ' ' + a.why; }).join(', ') + ')' : '') + '. ' : (lim.why ? 'N max: ' + lim.why + '. ' : '')) +
          ((P.tags || []).concat(lim.tags || []).length ? 'Note: ' + (P.tags || []).concat(lim.tags || []).join('; ') + '.' : '')) + '</p>' + askH + '</div>';
    }).join('');
    return sec('sus-nplan', X.planYear + ' N plan, field by field', rows || '<p class="sus-mini">No fields with a crop yet.</p>',
      'RB209 recommendations already include the nitrogen in the soil through the SNS Index, so nothing is taken off on top. Choose each field’s own Index; we never assume Index 1.');
  }
  function soilHtml(c) {
    var X = c.n, S0 = X.soil, s = S(), h = '';
    if (!S0) return sec('sus-soil', 'Soil tests', '<p class="sus-mini">Add your fields in Crops first.</p>');
    if (c.nation === 'S') h += '<div class="sus-q"><span class="sus-ql">Is soil analysis one of your Whole Farm Plan items?</span>' + seg('wfpsoil', set().wfpSoil || '', [['yes', 'Yes'], ['no', 'No']], 'Whole Farm Plan soil analysis') + (set().wfpSoil ? '' : '<p class="sus-mini">Not answered yet: the soil job shows until you say.</p>') + '</div>';
    h += '<p class="sus-mini">' + e(S0.label + '. ' + (S0.law ? 'The law.' : 'A scheme action, not law.') + (S0.status === 'pending' ? ' To confirm: checked against the scheme rules before the pilot.' : '') + ' ' + (S0.cite ? S0.cite.source : '')) + '</p>';
    h += '<div class="sus-scroll"><table class="sus-t"><tr><th>Field</th><th>Last test</th><th>Next due</th><th>Status</th><th>Lab report</th></tr>' + S0.fields.map(function (f) {
      var t = s.soilTests.filter(function (x) { return String(x.land) === String(f.id) && x.on === f.last; })[0];
      var st = f.state === 'missing' ? ['a', 'No test'] : f.state === 'due' ? ['r', 'Due now'] : f.state === 'soon' ? ['a', 'Due soon'] : ['g', 'Up to date'];
      return '<tr><td>' + e(f.name) + '</td><td>' + e(f.last ? D(f.last) + (t ? ' (pH ' + (t.ph != null ? N(t.ph, 1) : '-') + ', P ' + (t.p != null ? t.p : '-') + ', K ' + (t.k != null ? t.k : '-') + ', Mg ' + (t.mg != null ? t.mg : '-') + ')' : '') : '') + '</td><td>' + e(f.dueOn ? D(f.dueOn) : '') + '</td><td>' + stPill(st) + '</td><td>' +
        (t && t.attachment ? '<button class="sus-lnk" data-sa="stview" data-v="' + e(t.id) + '">Open</button>' : '') + '</td></tr>'; }).join('') + '</table></div>';
    if (_ui.st) h += '<div class="sus-form"><div class="sus-row3"><label class="sus-f"><span>Field</span><select id="sus-st-land">' + landsAll().filter(function (l) { return l.kind === 'crop'; }).map(function (l) { return '<option value="' + e(l.id) + '">' + e(l.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="sus-f"><span>Sampled on</span><input type="date" id="sus-st-on"></label><label class="sus-f"><span>Lab (optional)</span><input type="text" maxlength="120" id="sus-st-lab"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>pH</span><input type="number" step="0.1" min="3" max="10" id="sus-st-ph"></label><label class="sus-f"><span>P Index</span><input type="number" step="1" min="0" max="9" id="sus-st-p"></label><label class="sus-f"><span>K Index</span><input type="number" step="1" min="0" max="9" id="sus-st-k"></label></div>' +
      '<div class="sus-row3"><label class="sus-f"><span>Mg Index</span><input type="number" step="1" min="0" max="9" id="sus-st-mg"></label><label class="sus-f"><span>Organic matter % (optional)</span><input type="number" step="0.1" min="0" max="100" id="sus-st-om"></label><label class="sus-f"><span>Lab report PDF (optional)</span><input type="file" accept="application/pdf,image/*" id="sus-st-file"></label></div>' +
      '<div class="sus-bt"><button class="btn-pri sm" data-sa="stsave">Save the test</button><button class="sus-lnk" data-sa="stcancel">Cancel</button></div></div>';
    else h += '<div class="sus-bt"><button class="btn-sec sm" data-sa="stopen">Add a soil test</button></div>';
    return sec('sus-soil', 'Soil tests', h);
  }
  function ureaHtml(c) {
    if (c.nation !== 'E') return '';
    var X = c.n, v = X.member === true ? 'yes' : X.member === false ? 'no' : '', h = '<div class="sus-q"><span class="sus-ql">Is the farm a Red Tractor member?</span>' + seg('rtm', v, [['yes', 'Yes'], ['no', 'No']], 'Red Tractor member') + '</div>';
    if (X.member === true) {
      var fl = X.urea.filter(function (u) { return u.flagged || u.ask; });
      h += fl.length ? fl.map(function (u) { return '<div class="sus-aw"><span class="sus-kind set">Red Tractor</span><div><b>' + e(u.product + ', ' + D(u.date)) + '</b><p class="sus-mini">' + e(u.flagged ? (u.why || u.note || '') : '') + (u.ask ? ' ' + e(u.ask) + ' Open the record in Crops, Inputs and choose the urea type.' : '') + '</p></div></div>'; }).join('')
        : '<p class="sus-mini">No untreated urea applied outside 15 January to 31 March.</p>';
    }
    return sec('sus-urea', 'Urea (Red Tractor standard, not law)', h, 'Untreated solid urea may be applied only from 15 January to 31 March; protected urea at other times. We check the date it was spread, never the invoice date.');
  }
  function nvzCsv() {
    var c = compute(); if (!c || !c.n) return;
    var E = EN(), rows = E.nvzCsvRows(c.n.rec);
    var csv = typeof W.toCSV === 'function' ? W.toCSV(E.NVZ_COLS, rows) : E.NVZ_COLS.join(',') + '\n' + rows.map(function (r) { return r.join(','); }).join('\n');
    if (typeof W.downloadFile === 'function') W.downloadFile('nvz-records-' + c.today + '.csv', csv, 'text/csv;charset=utf-8');
    W._susLastCsv = csv;
    W.toast && W.toast(pl(rows.length, 'record') + ' downloaded', 'success');
  }
  function storeSave() {
    var pid = val('sus-fs-prod'), pr = products().filter(function (p) { return p.id === pid; })[0] || null, name = String(val('sus-fs-name')).trim() || (pr ? pr.label : '');
    var on0 = val('sus-fs-on'), q = num(val('sus-fs-qty')), np = num(val('sus-fs-n'));
    if (!name) { W.toast && W.toast('Which fertiliser?', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on0)) { W.toast && W.toast('When was it bought?', 'info'); return; }
    if (!(q > 0)) { W.toast && W.toast('How much was bought?', 'info'); return; }
    if (np === null && pr) np = pr.value; if (np === null || np < 0 || np > 100) { W.toast && W.toast('Type the N % from the bag', 'info'); return; }
    var pp = num(val('sus-fs-p')), kk = num(val('sus-fs-k'));
    S().fertStore.push({ id: uid('fs'), product: name.slice(0, 120), key: pr ? pr.id.replace('fert.product.', '') : null, nPct: np, p2o5Pct: pp !== null ? pp : (pr ? pr.p2o5 : null), k2oPct: kk !== null ? kk : (pr ? pr.k2o : null),
      nForm: pr ? pr.n_form : null, qty: q, qtyUnit: val('sus-fs-unit') || 't', on: on0, supplier: String(val('sus-fs-sup')).slice(0, 120), _new: true });
    _ui.fs = null; save('Added to the fertiliser store');
  }
  function soilSave() {
    var land = val('sus-st-land'), on0 = val('sus-st-on');
    if (!land) { W.toast && W.toast('Which field?', 'info'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(on0) || on0 > today()) { W.toast && W.toast('When was it sampled? Not after today', 'info'); return; }
    var g = function (id, lo, hi) { var x = num(val(id)); return x !== null && x >= lo && x <= hi ? x : null; };
    var L0 = landOf(land), row = { id: uid('soil'), land: L0 ? L0.id : land, landKind: L0 ? L0.kind : 'crop', on: on0, ph: g('sus-st-ph', 3, 10), p: g('sus-st-p', 0, 9), k: g('sus-st-k', 0, 9), mg: g('sus-st-mg', 0, 9), om: g('sus-st-om', 0, 100), sns: null, soil: null, lab: String(val('sus-st-lab')).slice(0, 120), attachment: null, _new: true };
    var fi = document.getElementById('sus-st-file'), f = fi && fi.files && fi.files[0];
    S().soilTests.push(row); _ui.st = null;
    if (f) {
      if (f.size > 10 * 1024 * 1024) { save('Test saved. The file is over 10 MB, so it was not attached'); return; }
      try {
        var fid = W.AI && W.AI.farm && W.AI.farm.active();
        if (fid && W.AI.storage && !W.__AI_GUEST) {
          var path = W.AI.storage.path(fid, 'soil', row.id, f.name);
          W.AI.storage.upload(path, f, f.type).then(function (p) { row.attachment = p; save('Lab report attached'); }, function () { W.toast && W.toast('The test is saved; the file could not be attached. Try again later', 'info'); });
          save('Test saved. Attaching the report'); return;
        }
      } catch (er) {}
      save('Test saved. Sign in to attach the lab report'); return;
    }
    save('Soil test saved');
  }
  function soilView(id) {
    var t = S().soilTests.filter(function (x) { return x.id === id; })[0]; if (!t || !t.attachment) return;
    try { W.AI.storage.signedUrl(t.attachment, 600).then(function (u) { W.open(u, '_blank', 'noopener'); }, function () { W.toast && W.toast('The report could not be opened offline', 'info'); }); } catch (er) {}
  }
  function snsSet(land, kind, v) {
    var s = S(), y = +today().slice(0, 4) + 1, id = 'sns:' + land + ':' + y, row = s.soilTests.filter(function (x) { return x.id === id; })[0];
    if (!row) { var L0 = landOf(land); row = { id: id, land: L0 ? L0.id : land, landKind: L0 ? L0.kind : 'crop', on: null, sns: null, soil: null, _new: true }; s.soilTests.push(row); }
    if (kind === 'sns') { var x = v === '' ? null : Math.floor(num(v)); row.sns = x !== null && x >= 0 && x <= 6 ? x : null; }
    else row.soil = SOILS.some(function (q) { return q[0] === v; }) ? v : null;
    /* the SNS row is the plan's own assessment, never a lab test (no sampled date) */
    save('Saved');
  }
  /* ── the Crops input form: the nutrient block, and the checks before it saves ── */
  function ciHtml() {
    if (!on()) return '';
    var ps = products(), opt = function (a, cur) { return a.map(function (o) { return '<option value="' + e(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + e(o[1]) + '</option>'; }).join(''); };
    var css = 'width:100%;height:38px;border:1px solid var(--br);border-radius:9px;background:#fff;padding:0 11px;font-size:14px;font-family:inherit;box-sizing:border-box';
    var lb = function (t, o) { return '<label style="display:block;font-size:12px;font-weight:800;color:var(--gm);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">' + t + (o ? ' <span style="color:var(--t4);font-weight:600;text-transform:none;letter-spacing:0">optional</span>' : '') + '</label>'; };
    return '<div id="ci-nut" hidden style="border:1px solid var(--gp);background:var(--gb);border-radius:10px;padding:11px;margin-bottom:12px">' +
      '<div style="font-size:13px;font-weight:800;margin-bottom:8px">Nitrogen for the NVZ record</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:1">' + lb('Fertiliser or manure?') + '<select id="ci-n-type" style="' + css + '"><option value="">Choose</option><option value="man">Bagged or liquid fertiliser</option><option value="org">Organic manure (slurry, FYM, litter, digestate)</option></select></div>' +
        '<div style="flex:1">' + lb('Spread, or bought?') + '<select id="ci-n-app" style="' + css + '"><option value="">Choose</option><option value="spread">Spread on the field</option><option value="bought">Bought, not spread yet (to the store)</option></select></div></div>' +
      '<div id="ci-n-man"><div style="margin-bottom:10px">' + lb('Product from the list', true) + '<select id="ci-n-prod" style="' + css + '"><option value="">Not on the list</option>' + ps.map(function (p) { return '<option value="' + e(p.id) + '">' + e(p.label) + '</option>'; }).join('') + '</select></div>' +
        '<div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:1">' + lb('N %') + '<input id="ci-n-pct" type="number" min="0" max="100" step="0.1" style="' + css + '"></div><div style="flex:1">' + lb('P₂O₅ %', true) + '<input id="ci-n-p" type="number" min="0" max="100" step="0.1" style="' + css + '"></div><div style="flex:1">' + lb('K₂O %', true) + '<input id="ci-n-k" type="number" min="0" max="100" step="0.1" style="' + css + '"></div></div>' +
        '<div style="margin-bottom:10px">' + lb('If it is urea') + '<select id="ci-n-form" style="' + css + '"><option value="">Not urea, or not answered</option><option value="urea_untreated">Untreated urea</option><option value="urea_protected">Protected urea (urease inhibitor)</option><option value="urea_liquid">Liquid urea or UAN</option><option value="other">Not urea</option></select></div></div>' +
      '<div id="ci-n-org" hidden><div style="display:flex;gap:10px;margin-bottom:10px"><div style="flex:1">' + lb('Which manure') + '<select id="ci-n-ok" style="' + css + '"><option value="">Choose</option>' + opt(ORG_KINDS) + '</select></div><div style="flex:1">' + lb('N, % of fresh weight', true) + '<input id="ci-n-opct" type="number" min="0" max="100" step="0.01" placeholder="from an analysis" style="' + css + '"></div>' +
        '<div style="flex:1">' + lb('Crop-available N, % of total', true) + '<input id="ci-n-avail" type="number" min="0" max="100" step="1" placeholder="the supplier’s analysis" style="' + css + '"></div></div></div>' +
      '<div style="display:flex;gap:10px;margin-bottom:4px"><div style="flex:1">' + lb('Amount') + '<input id="ci-n-qty" type="number" min="0" step="0.01" style="' + css + '"></div><div style="flex:1">' + lb('Unit') + '<select id="ci-n-unit" style="' + css + '"><option value="">Choose</option>' + opt(UNITS_HA) + '</select></div><div style="flex:1">' + lb('Area, ha', true) + '<input id="ci-n-area" type="number" min="0" step="0.01" placeholder="the field’s area" style="' + css + '"></div></div>' +
      /* -440 (UX-31): the form says, as the date, field and product change, whether the day is in a closed period; the reason is asked only then */
      '<div id="ci-n-cp" style="font-size:13px;font-weight:700;color:var(--t2);margin:8px 0 4px" aria-live="polite"></div><div id="ci-n-late" class="sus-late" hidden aria-live="polite"></div>' +
      '<div id="ci-n-whybox" hidden style="margin:8px 0 4px">' + lb('This date is in a closed period: why?') + '<select id="ci-n-why" style="' + css + '"><option value="">Choose</option>' + whyOptions().map(function (o) { return '<option value="' + e(o[0]) + '">' + e(o[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div style="font-size:12px;color:var(--t3);line-height:1.5;margin-top:6px">These numbers make the NVZ record and the N max.</div></div>';
  }
  /* -440 (UX-31): a fertiliser or manure record is a short form: the spray-only boxes (MAPP number, active ingredient, spray certificate,
     what for, water volume, wind, harvest interval, the safe-to-harvest note) and the typed "Rate used" (the amount and unit below replace it)
     are hidden for Fertiliser, and shown again for a spray */
  var SPRAY_ONLY = ['ci-reg', 'ci-act', 'ci-cert', 'ci-for', 'ci-water', 'ci-wind', 'ci-phi', 'ci-rate'];
  function cpWords() {
    var el = document.getElementById('ci-n-cp'), wb = document.getElementById('ci-n-whybox'); if (!el) return;
    var v = function (id) { var x = document.getElementById(id); return x ? String(x.value || '').trim() : ''; }, date = v('ci-date'), type = v('ci-n-type'), app = v('ci-n-app');
    var ids = [].map.call(document.querySelectorAll('.ci-land-cb:checked'), function (c) { return c.value; });
    var ed = document.getElementById('ci-n-app'); lateShow('ci-n-late', app === 'bought' || (ed && ed.disabled) ? '' : date);   /* -445: a new spreading only; a correction keeps its first record */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !type || app === 'bought') { el.textContent = ''; if (wb) wb.hidden = true; return; }
    var c = compute(), E = EN(), L = LAW(); if (!c || !L || !c.nation) { el.textContent = ''; return; }
    var org = type === 'org', ok = v('ci-n-ok'), cat = org ? (/fym/.test(ok) ? 'fym' : 'high_ran') : 'manufactured', hit = null, unk = null, why0 = null, rs = null, per = [];
    (ids.length ? ids : [null]).forEach(function (id) { var L0 = id != null ? landOf(id) : null, key = L0 ? E.cropKey(L0.crop, L0.planted) : null;
      var r = E.closedPeriodHit({ nation: c.nation, nvz: c.nvz.inNvz, land: L0 && L0.landType === 'grass' ? 'grass' : 'arable', soil: c.inputs.soil, product: cat, date: date, crop: key, cropName: L0 ? L0.crop : null, organicKind: org ? ok : null, sownOn: L0 ? L0.planted : null, north: c.inputs.n.north }, L);
      if (r.hit) { rs = andReasons(rs, r.reasons); per.push({ r: r.reasons }); if (!hit) hit = (L0 ? L0.name + ': ' : '') + r.why; } else if (r.unknown) unk = r.why; else if (!why0 && r.why) why0 = r.why; });
    var what = org ? (cat === 'fym' ? 'FYM' : 'slurry or other manure') : 'manufactured fertiliser', d = D(date) + ': ';
    el.textContent = hit ? d + 'in a closed period for ' + what + '. ' + hit : unk ? d + unk : d + 'no closed period for ' + what + ' in ' + NAT[c.nation] + (why0 && /solid manure/.test(why0) ? ' (no closed period for solid manure here)' : '') + '.';
    if (hit && rs) fillWhy('ci-n-why', rs);
    if (hit && splitNeeded(per, rs)) el.textContent += ' ' + SPLIT_WORDS;
    if (wb) wb.hidden = !hit;
  }
  function ciWire() {
    var k = document.getElementById('ci-kind'), box = document.getElementById('ci-nut'); if (!k || !box) return;
    var rowOf = function (id) { var el = document.getElementById(id); if (!el) return null; var p = el.parentNode; return p; };
    var sync = function () { var fert = k.value === 'fertiliser'; box.hidden = !fert; var t = (document.getElementById('ci-n-type') || {}).value; var m = document.getElementById('ci-n-man'), o = document.getElementById('ci-n-org'); if (m) m.hidden = t === 'org'; if (o) o.hidden = t !== 'org';
      SPRAY_ONLY.forEach(function (id) { var r = rowOf(id); if (r) r.style.display = fert ? 'none' : ''; });
      [].forEach.call(document.querySelectorAll('#crop-comply-card div'), function (d0) { if (/works out the date the field is/.test(d0.textContent || '') && d0.children.length <= 1) d0.style.display = fert ? 'none' : ''; });
      cpWords(); };
    /* -447 (web test F13): manure is a type of its own on the form - picked, it is the fertiliser record with "organic manure" set
       (the row saved is unchanged). And the panel's rows wrap, so no select is cut off in the narrow window. */
    if (!k.querySelector('option[value="manure"]')) { var fo = k.querySelector('option[value="fertiliser"]'), mo = document.createElement('option'); mo.value = 'manure'; mo.textContent = 'Manure or slurry (organic)'; if (fo && fo.nextSibling) k.insertBefore(mo, fo.nextSibling); else k.appendChild(mo); }
    k.addEventListener('change', function () { if (k.value !== 'manure') return; k.value = 'fertiliser'; var t0 = document.getElementById('ci-n-type'); if (t0) t0.value = 'org'; try { k.dispatchEvent(new Event('change', { bubbles: true })); } catch (er) { sync(); } });
    if (!document.getElementById('sus-ci-wrap-css')) { var cs = document.createElement('style'); cs.id = 'sus-ci-wrap-css'; cs.textContent = '#ci-nut div[style*="display:flex"]{flex-wrap:wrap}#ci-nut div[style*="flex:1"]{min-width:160px}'; document.head.appendChild(cs); }
    k.addEventListener('change', sync); var ty = document.getElementById('ci-n-type'); if (ty) ty.addEventListener('change', sync);
    ['ci-date', 'ci-n-app', 'ci-n-ok'].forEach(function (id) { var x = document.getElementById(id); if (x) x.addEventListener('change', cpWords); });
    [].forEach.call(document.querySelectorAll('.ci-land-cb'), function (x) { x.addEventListener('change', cpWords); });
    /* the amount is typed once: for a fertiliser it also fills the record's rate */
    var rateFill = function () { if (k.value !== 'fertiliser') return; var q = (document.getElementById('ci-n-qty') || {}).value, u = (document.getElementById('ci-n-unit') || {}).value, r = document.getElementById('ci-rate'); if (r && q && u) r.value = q + ' ' + u; };
    ['ci-n-qty', 'ci-n-unit'].forEach(function (id) { var x = document.getElementById(id); if (x) { x.addEventListener('change', rateFill); x.addEventListener('input', rateFill); } });
    var pr = document.getElementById('ci-n-prod'); if (pr) pr.addEventListener('change', function () { var p = products().filter(function (x) { return x.id === pr.value; })[0]; if (!p) return;
      var s1 = function (id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }; s1('ci-n-pct', p.value); s1('ci-n-p', p.p2o5 || ''); s1('ci-n-k', p.k2o || ''); if (p.n_form) s1('ci-n-form', p.n_form);
      var pn = document.getElementById('ci-product'); if (pn && !pn.value) pn.value = p.label; if (p.form === 'liquid') s1('ci-n-unit', 'L/ha'); });
    sync();
  }
  function ciFill(x) {
    if (!on() || !x) return; var s1 = function (id, v) { var el = document.getElementById(id); if (el && v != null) el.value = v; };
    s1('ci-n-type', x.organicKind ? 'org' : (x.nPct != null ? 'man' : '')); s1('ci-n-app', x.kind === 'fertiliser' ? 'spread' : '');
    s1('ci-n-pct', x.organicKind ? null : x.nPct); s1('ci-n-opct', x.organicKind ? x.nPct : null); s1('ci-n-p', x.p2o5Pct); s1('ci-n-k', x.k2oPct); s1('ci-n-form', x.nForm); s1('ci-n-ok', x.organicKind);
    s1('ci-n-qty', x.qty); s1('ci-n-unit', x.qtyUnit); s1('ci-n-area', x.areaHa); s1('ci-n-why', x.closedReason); s1('ci-n-avail', x.availPct);
    var a = document.getElementById('ci-n-app'); if (a) a.disabled = true;
    ciWire();
  }
  /* read the block; check the closed period and the urea rule for every field ticked. One engine function decides. */
  function ciRead(landIds, date, product) {
    if (!on()) return {};
    var v = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var type = v('ci-n-type'), app = v('ci-n-app');
    if (!type) return { err: 'Fertiliser or manure? Choose one in the nitrogen box' };
    if (!app) return { err: 'Spread on the field, or bought for the store?' };
    var org = type === 'org', ok = v('ci-n-ok'), pct = num(org ? v('ci-n-opct') : v('ci-n-pct')), q = num(v('ci-n-qty')), unit = v('ci-n-unit'), area = num(v('ci-n-area'));
    if (org && !ok) return { err: 'Which manure was it?' };
    if (!org && (pct === null || pct < 0 || pct > 100)) return { err: 'Type the N % from the bag (0 if none)' };
    if (!(q > 0)) return { err: 'How much was spread?' };
    if (!unit) return { err: 'Choose the unit for the amount' };
    if (area !== null && !(area > 0)) return { err: 'The area must be more than 0 ha' };
    if (area !== null && landIds.length > 1) return { err: 'Leave the area blank when it went on more than one field: each uses its own area' };
    var avp = org ? num(v('ci-n-avail')) : null; if (avp !== null && !(avp >= 0 && avp <= 100)) return { err: 'Crop-available N is a % of the total, 0 to 100' };
    var nut = { nPct: pct, p2o5Pct: org ? null : num(v('ci-n-p')), k2oPct: org ? null : num(v('ci-n-k')), qty: q, qtyUnit: unit, areaHa: area, organicKind: org ? ok : null, nForm: org ? null : (v('ci-n-form') || null), availPct: avp, closedReason: null };
    if (app === 'bought') {
      if (org) return { err: 'Organic manure is not kept in the fertiliser store: record it in Livestock, Manure' };
      if (/\/ha$/.test(unit)) return { err: 'For a purchase, give the amount in all (kg, tonnes or litres)' };
      var pr = productBy(product);
      return { store: { id: uid('fs'), product: String(product || 'Fertiliser').slice(0, 120), key: pr ? pr.id.replace('fert.product.', '') : null, nPct: pct, p2o5Pct: nut.p2o5Pct, k2oPct: nut.k2oPct, nForm: nut.nForm, qty: q, qtyUnit: unit === 'm3' ? 't' : unit, on: date, supplier: '', _new: true } };
    }
    var c = compute(), E = EN(), L = LAW(); if (!c || !c.nation || !L) return { nut: nut };
    var cat = org ? (/fym/.test(ok) ? 'fym' : 'high_ran') : 'manufactured', worst = null, msgs = [], out0 = {};
    landIds.forEach(function (id) {
      var L0 = landOf(id), key = L0 ? E.cropKey(L0.crop, L0.planted) : null;
      var r = E.closedPeriodHit({ nation: c.nation, nvz: c.nvz.inNvz, land: L0 && L0.landType === 'grass' ? 'grass' : 'arable', soil: c.inputs.soil, product: cat, date: date, crop: key, cropName: L0 ? L0.crop : null, organicKind: org ? ok : null, sownOn: L0 ? L0.planted : null, north: c.inputs.n.north }, L);
      if (r.hit) { msgs.push((L0 ? L0.name + ': ' : '') + r.why + (r.exception ? ' ' + r.exception : '')); worst = 'warn'; out0.reasons = andReasons(out0.reasons, r.reasons); (out0.per = out0.per || []).push({ r: r.reasons });
        /* -441c: the crop exception has a ceiling (e.g. winter oilseed rape 30 kg N/ha, SI 2015/668 reg 22(5)); say so when this spreading is over it */
        if (r.exceptionMax != null && !org) { var xn = E.inputN({ applied: true, n_pct: pct, qty: q, qty_unit: unit, area_ha: area !== null ? area : (L0 && L0.area) || null }, FAC(), L);
          if (xn && xn.kgNHa != null && xn.kgNHa > r.exceptionMax + 1e-9) (out0.over = out0.over || []).push((L0 ? L0.name + ': ' : '') + 'this is ' + N(xn.kgNHa, 1) + ' kg N/ha; the crop exception allows up to ' + r.exceptionMax + ' kg N/ha.'); } }
      else if (r.unknown && !worst) { worst = 'ask'; msgs.push(r.why); }
    });
    var out = { nut: nut }, lt = lateCheck(date); if (lt) out.late = lt.words;   /* -445 (decision 1): said, never refused */
    /* -439-sus6: never refused; the farmer says why, and the record is saved with the warning and the reason */
    if (worst === 'warn') {
      var why = v('ci-n-why');
      if (splitNeeded(out0.per || [], out0.reasons) && why !== 'none') return { ask: SPLIT_WORDS };
      if (!why) return { ask: msgs[0] + ' Choose why in "If this date is in a closed period, why?"; it is saved either way, as the law asks.' };
      var bad = whyNotFor(why, out0.reasons, org ? 'this manure' : 'this fertiliser'); if (bad) { fillWhy('ci-n-why', out0.reasons); return { ask: bad }; }
      nut.closedReason = why; var wl = (out0.reasons || []).filter(function (o) { return o.id === why; }).map(function (o) { return [o.id, o.label]; })[0];
      out.warn = msgs.join('\n') + (why === 'crop_exception' && out0.over ? '\n\nOver the limit: ' + out0.over.join(' ') : '') + '\n\nYour reason: ' + (wl ? wl[1] : why) + '. It is saved with this warning.';
    }
    else if (worst === 'ask') out.note = msgs[0];
    if (!org) { var u = E.ureaCheck({ nation: c.nation, member: c.n.member, appliedOn: date, n_form: nut.nForm, product: product }, L); if (u.flagged && !u.soft) out.urea = u.why + ' (Red Tractor standard, not law.)'; else if (u.flagged && u.soft) out.urea = u.note; }
    return out;
  }
  function storeAdd(row) { var s = S(); if (!s) return; s.fertStore.push(row); save('Added to the fertiliser store. Log it on a field when it is spread'); }
  /* the same check for a manure spreading recorded in Livestock -> Manure (the Sustainability form) */
  function spreadCheck(m) {
    var c = compute(), E = EN(), L = LAW(); if (!c || !L || m.kind !== 'spread') return null;
    var L0 = m.field != null ? landOf(m.field) : null, ok = MOVE_ORG[m.manure], cat = /fym/.test(ok || '') ? 'fym' : 'high_ran';
    var r = E.closedPeriodHit({ nation: c.nation, nvz: c.nvz.inNvz, land: L0 && L0.landType === 'grass' ? 'grass' : 'arable', soil: c.inputs.soil, product: cat, date: m.on, crop: L0 ? E.cropKey(L0.crop, L0.planted) : null, cropName: L0 ? L0.crop : null, organicKind: ok || null, sownOn: L0 ? L0.planted : null, north: c.inputs.n.north }, L);
    return r.hit ? r : null;
  }
  function nResult() { var c = compute(); if (!c || !c.n) return null; var R = c.n.rec, worst = 0; Object.keys(R.organic.fields).forEach(function (f) { worst = Math.max(worst, R.organic.fields[f].worstKgHa); });
    return { crops: R.crops, over: R.over, organicMax: worst, organicOver: R.organic.over.length, rows: R.rows.length, missing: R.missing }; }

  /* styles (tokens from the page) */
  try {
    var css = '.sus-card{background:#fff;border:1px solid var(--br);border-radius:var(--rl);padding:17px;box-shadow:var(--sh);margin-bottom:14px}' +
      '.sus-card h3{font-size:14px;font-weight:800;margin:0 0 8px}.sus-card h4{font-size:13px;font-weight:800;margin:14px 0 6px}' +
      '.sus-setup{display:flex;justify-content:space-between;align-items:center;gap:16px;background:var(--gb);border-color:var(--gp)}' +
      '.sus-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:14px}' +
      '.sus-tile{background:#fff;border:1px solid var(--br);border-radius:var(--rl);padding:15px 17px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:6px;align-items:flex-start}' +
      '.sus-k{display:block;font-size:11px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}.sus-big{font-size:18px;font-weight:800;color:var(--t1);line-height:1.25}' +
      '.sus-mini{font-size:12px;color:var(--t3);line-height:1.5;margin:4px 0 0}.sus-st{display:inline-block;font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}' +
      '.sus-chip{border:1px solid var(--br2);background:var(--ap);color:#8A5A00;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;cursor:pointer}' +
      '.sus-late{margin:8px 0 4px;padding:8px 10px;border-radius:8px;background:var(--ap);color:#8A5A00;font-size:13px;line-height:1.5}.sus-late details{display:inline}.sus-late summary{display:inline;cursor:pointer;text-decoration:underline}.sus-late details[open] span{display:block;margin-top:4px}.sus-late a{color:inherit}' +
      '.sus-st.g{background:var(--gp);color:var(--gd)}.sus-st.a{background:var(--ap);color:#8A5A00}.sus-st.r{background:var(--rp);color:#A4281B}.sus-st.n{background:var(--br2);color:var(--t2)}' +
      '.sus-tag{display:inline-block;font-size:11px;font-weight:800;background:var(--br2);color:var(--t2);border-radius:6px;padding:1px 7px}.sus-est{font-size:12px;color:var(--t3);margin-top:8px}' +
      '.sus-lnk{color:var(--gm);font-weight:700;font-size:13px;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0}.btn-sec.sm,.btn-pri.sm{padding:6px 12px;font-size:12px}' +
      '.sus-job{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--br2)}.sus-job:first-child{border-top:0}.sus-jm b{display:block;font-size:14px;margin-top:4px}' +
      '.sus-ja{display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end}.sus-kind{display:inline-block;font-size:11px;font-weight:800;border-radius:6px;padding:2px 8px}' +
      '.sus-kind.law{background:var(--rp);color:#A4281B}.sus-kind.set{background:var(--bp);color:#1D4ED8}.sus-due{display:inline-block;font-size:12px;font-weight:700;color:var(--t2);margin-top:4px}' +
      '.sus-det summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--t2);padding:10px 0}.sus-ul{margin:6px 0 0 18px;font-size:13px;line-height:1.6;color:var(--t2)}' +
      '.sus-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.sus-x{border-color:var(--am);background:var(--ap)}' +
      '.sus-row3{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:8px 0}.sus-f{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--t2)}' +
      '.sus-seg{display:inline-flex;flex-wrap:wrap;gap:4px;background:var(--br2);border:1px solid var(--br);border-radius:10px;padding:3px}.sus-seg button{font-size:12px;font-weight:700;color:var(--t2);padding:6px 11px;border-radius:8px}' +
      '.sus-seg button.on{background:#fff;color:var(--gd);box-shadow:0 0 0 1.5px var(--gl) inset}.sus-q{margin:10px 0}.sus-ql{display:block;font-size:13px;font-weight:700;margin-bottom:6px}' +
      '.sus-hr,.sus-store,.sus-aw{padding:12px 0;border-top:1px solid var(--br2)}.sus-aw{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.sus-aw>div{flex:1}' +
      '.sus-bt{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.sus-form{background:var(--bg);border:1px solid var(--br);border-radius:12px;padding:12px;margin-top:10px}' +
      '.sus-fc{background:var(--bg);border-radius:12px;padding:12px;margin-top:12px}.sus-gh{display:flex;justify-content:space-between;gap:10px;align-items:center}' +
      '.sus-scroll{overflow-x:auto}.sus-t{border-collapse:collapse;width:100%;font-size:12px}.sus-t th,.sus-t td{padding:6px 7px;border-bottom:1px solid var(--br2);text-align:left;white-space:nowrap}' +
      '.sus-t th{font-size:11px;color:var(--t3);font-weight:800}.sus-t .n{text-align:right;font-variant-numeric:tabular-nums}.sus-t tr.tot td{font-weight:800}' +
      '.sus-sheet{max-width:640px}.sus-sbody{padding:14px 21px}.sus-snav{display:flex;justify-content:space-between;padding:12px 21px 18px;border-top:1px solid var(--br)}' +
      '.sus-line{display:grid;grid-template-columns:130px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--br2)}.sus-lk{font-size:12px;font-weight:800;color:var(--t2)}' +
      '.sus-lv small{display:block}.sus-lv input{max-width:220px}.sus-src{font-size:11px;font-weight:700;color:var(--gm)}.sus-src.miss{color:#8A5A00}' +
      '.sus-f.sus-cb{flex-direction:row;align-items:center;gap:8px;margin:8px 0}.sus-f.sus-cb input{width:auto;flex:none;margin:0;min-height:0}' +
      '@media (max-width:640px){.sus-line{grid-template-columns:1fr}.sus-job{flex-direction:column}.sus-ja{justify-content:flex-start}.sus-head,.sus-setup{flex-direction:column}}' +
      /* -440 (UX-20): the app keeps its sidebar at every width, so the page reflows inside whatever width the main column has: grids never ask
         for more than the column, rows stack below 900 px of window (about 660 px of column), long words and the tab strip wrap */
      '.sus-tiles{grid-template-columns:repeat(auto-fit,minmax(min(210px,100%),1fr))}.sus-row3{grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr))}' +
      '#pg-sustain,#ls-view-manure,#crop-view-comply .sus-ls{min-width:0;overflow-wrap:break-word}.sus-seg{max-width:100%}.sus-tabs{display:flex;flex-wrap:wrap}.sus-card,.sus-tile{min-width:0;max-width:100%}' +
      '#pg-sustain .page-title,#pg-sustain .page-sub{white-space:normal}' +
      /* -440 (UX-20): below 768 px (pilot farms) the sidebar folds away behind a Menu button, the way onboarding stacks below 760 px, so the
         page gets the whole width; the menu closes when a page is chosen */
      '.sus-menu{display:none}@media (max-width:767px){body.sus-narrow .sidebar{transform:translateX(-100%);transition:transform .2s;box-shadow:0 0 30px rgba(0,0,0,.18)}body.sus-narrow.sus-nav-open .sidebar{transform:none}' +
      'body.sus-narrow .main{margin-left:0}body.sus-narrow .topbar{padding:0 12px;gap:8px}' +
      /* -441 (UX-20 minor): at phone widths the save pill sat on the farm name (the right-hand group is absolutely placed); it now
         takes its own place in the row and wraps under the name when there is no room */
      'body.sus-narrow .topbar{flex-wrap:wrap;height:auto;min-height:56px;padding:6px 12px;row-gap:6px}body.sus-narrow .topbar>div:not(.topbar-right){min-width:0;flex:1 1 auto}' +
      'body.sus-narrow .topbar-right{position:static;transform:none;margin-left:auto;gap:8px;flex-wrap:wrap;justify-content:flex-end}body.sus-narrow #farm-name{display:inline-block;max-width:52vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}' +
      'body.sus-narrow .farm-sel{min-width:0}body.sus-narrow .content{padding:16px}body.sus-narrow .sus-menu{display:inline-flex;align-items:center;font-size:13px;font-weight:800;color:var(--gd);background:var(--gb);border:1px solid var(--gp);border-radius:8px;padding:6px 10px;margin-right:6px;cursor:pointer}}' +
      '@media (max-width:900px){.sus-line{grid-template-columns:1fr}.sus-job{flex-direction:column}.sus-ja{justify-content:flex-start}.sus-head,.sus-setup,.sus-gh{flex-direction:column;align-items:flex-start}.sus-aw{flex-wrap:wrap}.sus-tile{padding:12px}.sus-big{font-size:16px}}' +
      '.sus-armed{outline:2px solid var(--rd,#B23A2F);color:#A4281B!important}.sus-dm{display:flex;gap:6px}.sus-dm select{min-width:0}.sus-rechk{display:block;flex-basis:100%;text-align:right}';
    var stl = document.createElement('style'); stl.id = 'sus-css'; stl.textContent = css; (document.head || document.documentElement).appendChild(stl);
    narrowShell();
  } catch (er) {}

  /* -440 (UX-20): the Menu button for narrow windows (pilot only) */
  function narrowShell() {
    if (!on()) return;
    var go = function () {
      try { document.body.classList.add('sus-narrow'); var tb = document.querySelector('.topbar'); if (!tb || document.getElementById('sus-menu')) return;
        var b = document.createElement('button'); b.id = 'sus-menu'; b.className = 'sus-menu'; b.type = 'button'; b.textContent = 'Menu'; b.setAttribute('aria-label', 'Open the menu'); b.setAttribute('aria-expanded', 'false');
        b.addEventListener('click', function (ev) { ev.stopPropagation(); var o = document.body.classList.toggle('sus-nav-open'); b.setAttribute('aria-expanded', o ? 'true' : 'false'); });
        tb.insertBefore(b, tb.firstChild);
        var sb = document.querySelector('.sidebar'); if (sb) sb.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('.nav-item')) { document.body.classList.remove('sus-nav-open'); b.setAttribute('aria-expanded', 'false'); } });
        document.addEventListener('click', function (ev) { if (document.body.classList.contains('sus-nav-open') && sb && !sb.contains(ev.target) && ev.target !== b) { document.body.classList.remove('sus-nav-open'); b.setAttribute('aria-expanded', 'false'); } });
      } catch (er) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    /* -440 (UX-51): the orchard field form's fixed hint names the farm's own nation */
    var hint = function () { try { var sp = document.querySelector('#or-f-fref'); var lab = sp && sp.parentNode ? sp.parentNode.querySelector('.or-fh') : null; if (lab && typeof W.ukFieldRefHint === 'function') lab.textContent = 'optional · ' + W.ukFieldRefHint(); } catch (er) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hint); else setTimeout(hint, 0);
  }
  /* -439-sus6 (decision "soil" a): the one soil item in Crops, Compliance reads the same engine result as the soil job */
  function soilSummary() {
    var c = compute(); if (!c || !c.n || !c.n.soil) return null; var S0 = c.n.soil, n = S0.fields.length, tested = S0.fields.filter(function (f) { return f.last; }).length;
    var words = !n ? 'No fields yet' : (S0.due || S0.missing) ? (S0.due + S0.missing) + ' of ' + n + ' field' + (n === 1 ? '' : 's') + (S0.due + S0.missing === 1 ? ' needs' : ' need') + ' a test (Soil tests, below)' : 'Every field tested within ' + S0.every + ' years';   /* -440 (UX-48) */
    return { label: S0.label, law: S0.law, due: S0.due, missing: S0.missing, tested: tested, words: words };
  }
  /* -439-sus6 (decisions 11 and 12 a): the sharing log kept after "Clear my records": minimised, 6 years after the share ended */
  function shareKeepUntil(x) { var end = String(x.withdrawnAt || x.sentAt || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(end) ? (+end.slice(0, 4) + 6) + end.slice(4) : null; }
  function shareLogMinimal() {
    var s = S(), t = today(); return (s ? s.consents : []).filter(function (x) { var k = shareKeepUntil(x); return x && x.hash && (!k || k >= t); })
      .map(function (x) { return { id: x.id, recipient: x.recipient, recipientId: x.recipientId || null, records: (x.records || []).slice(), labels: (x.labels || []).slice(), format: x.format, hash: x.hash, sentAt: x.sentAt, withdrawnAt: x.withdrawnAt || null, deleteAskedAt: x.deleteAskedAt || null, kept: true }; });
  }
  function shareLogLastDate(list) { var m = null; (list || []).forEach(function (x) { var k = shareKeepUntil(x); if (k && (!m || k > m)) m = k; }); return m ? D(m) : null; }
  W.susSoilSummary = soilSummary; W.susShareLogMinimal = shareLogMinimal; W.susShareLogLastDate = shareLogLastDate; W.susShareKeepUntil = shareKeepUntil;
  W.susCompute = compute; W.renderSustain = render; W.susLsRender = lsRender; W.susHydrate = hydrate; W.susAttnItems = attnItems;
  W.susManureResult = manureResult; W.susInventoryFiled = inventoryFiled; W.susNavSync = navSync; W.susSetupOpen = setupOpen; W.susPrintPack = printPack;
  W.susRedraw = redraw; W._susUi = _ui;
  /* Phase 4 (sus-health-uk.js) works through these, so there is still one state, one save path and one computation */
  W._susApi = { S: S, set: set, save: save, removeRow: removeRow, uid: uid, today: today, landsAll: function () { return landsAll(); }, goTo: function (v) { goTo(v); },
                 /* Phase 5: the packs use the same words the tiles show (one figure everywhere) */
                 words: { manure: function (c) { return manureWords(c); }, store: function (c) { return storeWords(c); }, sheep: function (c) { return sheepWords(c); }, n: function (c) { return nWords(c); } } };
  /* Phase 2 */
  W.susCropsHtml = cropsHtml; W.susCiHtml = ciHtml; W.susCiWire = ciWire; W.susCiFill = ciFill; W.susCiRead = ciRead; W.susStoreAdd = storeAdd; W.susNitrogenResult = nResult; W.susNvzCsv = nvzCsv;
}(window));
