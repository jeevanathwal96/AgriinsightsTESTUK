/* ============================================================================
 * AgriInsights — Login Gate + Startup Load  (ai-auth.js)
 * Self-contained: injects its own sign-in overlay, and AFTER sign-in loads the
 * farm's transactions from Supabase into ST.txns and re-renders the app.
 * Does NOT modify bootAgriInsights() or loadState() — it layers on top.
 * Load order in <head>:  supabase-js  ->  ai-data.js  ->  ai-auth.js
 * ========================================================================== */
(function () {
  'use strict';

  /* -412 (UK -412 item 3): the orchard blocks arrive whole from the server. A server without orchard_blocks.pay
     (tools/uk-412-orchard-pay.sql not run) sends none of the block planner's fields (pick months, pay weeks, cost, tonnage,
     bearing, juice share, sales channel), so replacing the list would wipe them on this device: they are kept from this device
     instead, never over a value the server sent. With the column the server's copy is the truth (ai-data carried this device's
     fields onto it once, on the first load after the column exists). */
  function _obKeepLocal(incoming, local) {
    try {
      if (!Array.isArray(incoming) || !Array.isArray(local) || !local.length) return 0;
      if (!(window.AI && AI.orchPayKeys) || (AI.orchPayCan && AI.orchPayCan())) return 0;
      var K = AI.orchPayKeys, byId = {}, n = 0;
      local.forEach(function (b) { if (b && b.id != null) byId[String(b.id)] = b; });
      incoming.forEach(function (x) { var l = x && byId[String(x.id)]; if (!l) return;
        K.forEach(function (k) { if (l[k] == null || l[k] === '' || x[k] != null) return; x[k] = (typeof l[k] === 'object') ? JSON.parse(JSON.stringify(l[k])) : l[k]; n++; }); });
      return n;
    } catch (e) { return 0; }
  }
  window.__aiObKeepLocal = _obKeepLocal;   /* -412: tools/uk-412-harness.html */

  /* ══ -433 O1 / O2 (owner 14 Nov 2026): the welcome is a split screen - the promise, a real screen of the app and three
     trust lines on the left; "Create your farm" first and "Sign in" second on the right, with "Explore a sample farm".
     "Check your email" shows the address with "Wrong address? Change it", Open Gmail / Open Outlook, and "Send it again"
     after 30 seconds. The look is the signed-off prototype's (.ob4, index-uk.html); every id the sign-in, sign-up, reset
     and recovery paths use is kept, so nothing downstream changes. Wording: prototype/strings.js (signed off). ══ */
  var IC = {
    arrow: '<svg class="i" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    check: '<svg class="i" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    warn: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    eye: '<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    compass: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    trend: '<svg class="i" viewBox="0 0 24 24" style="width:20px;height:20px;stroke-width:2.4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    pin: '<svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    shield: '<svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    phone: '<svg class="i" viewBox="0 0 24 24" style="width:17px;height:17px"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
    mail: '<svg class="i" viewBox="0 0 24 24" style="color:#2D6A4F"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>',
    ext: '<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    clock: '<svg class="i" viewBox="0 0 24 24" style="width:13px;height:13px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  };
  function W8(k, v){ var s = (AUTH_T.en[k] != null) ? AUTH_T.en[k] : k; if (v) s = s.replace(/\{(\w+)\}/g, function(m, n){ return (n in v) ? String(v[n]) : m; }); return s; }

  // ---- styles + overlay injected on DOM ready ------------------------------
  function injectUI() {
    var css = document.createElement('style');
    css.textContent =
      '#ai-auth{position:fixed;inset:0;z-index:99999;display:flex;font-family:"Plus Jakarta Sans",system-ui,sans-serif;}' +
      '#ai-auth>.wl{flex:1;width:100%;min-width:0}' +
      '#ai-auth .opening{text-align:center;padding:18px 0 6px;font-size:14px;font-weight:700;color:#1B4332;}' +
      '#ai-auth .opening .spin,#ai-vo-chip .spin{display:inline-block;width:18px;height:18px;border-radius:50%;border:2.5px solid #cdd2c9;border-top-color:#1B4332;animation:aiSpin .8s linear infinite;vertical-align:middle;}' +
      '#ai-auth .opening .spin{width:26px;height:26px;}' +
      '@keyframes aiSpin{to{transform:rotate(360deg)}}' +
      '#ai-vo-chip{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99990;background:#fff;color:#1B4332;border:1px solid #cdd2c9;' +
        'border-radius:999px;padding:5px 12px 5px 9px;font:600 12.5px "Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.12);display:flex;align-items:center;gap:7px;transition:opacity .4s;}' +
      '#ai-vo-chip .spin{width:12px;height:12px;border-width:2px;}' +
      'html.ai-viewonly body{cursor:progress;}html.ai-viewonly input,html.ai-viewonly textarea,html.ai-viewonly select{caret-color:transparent;}';
    document.head.appendChild(css);

    var pass = function (id, auto, ph, hint) {
      return '<div class="f"><label class="fl" for="' + id + '">' + _esc(W8(id === 'ai-pass' ? 'lblPass' : id === 'ai-np-pass2' ? 'lblNew2' : id === 'ai-np-pass' ? 'lblNew' : 'lblPass')) + '</label><div class="inwrap">' +
        '<input class="inp" id="' + id + '" type="password" autocomplete="' + auto + '" placeholder="' + _esc(ph || '') + '" aria-describedby="' + id + '-err' + (hint ? ' ' + id + '-hint' : '') + '" maxlength="300">' +
        '<button type="button" class="side" data-pass="' + id + '" aria-pressed="false" aria-label="' + _esc(W8('showPass')) + '">' + IC.eye + '<span>' + _esc(W8('show')) + '</span></button></div>' +
        (hint ? '<div class="fh" id="' + id + '-hint">' + IC.check + '<span>' + _esc(hint) + '</span></div>' : '') + '<div class="err" id="' + id + '-err" hidden></div></div>';
    };
    var email = function (id, auto) {
      return '<div class="f"><label class="fl" for="' + id + '">' + _esc(W8('lblEmail')) + '</label><input class="inp" id="' + id + '" type="email" inputmode="email" autocomplete="' + auto + '" spellcheck="false" placeholder="' + _esc(W8('phEmail')) + '" aria-describedby="' + id + '-err" maxlength="400"><div class="err" id="' + id + '-err" hidden></div></div>';
    };
    var o = document.createElement('div');
    o.id = 'ai-auth'; o.className = 'ob4';
    o.innerHTML =
      '<div class="wl">' +
        '<section class="wl-left" id="ai-wl-left" aria-label="AgriInsights"></section>' +
        '<section class="wl-right"><div class="wl-top"></div>' +
          '<div class="wl-form" role="dialog" aria-modal="true" aria-labelledby="ai-h1">' +
            '<div class="seg" role="tablist" id="ai-tabs" aria-label="' + _esc(W8('tabUp')) + ' / ' + _esc(W8('tabIn')) + '">' +
              '<button type="button" role="tab" class="tab" id="ai-tab-up" tabindex="0"></button>' +
              '<button type="button" role="tab" class="tab" id="ai-tab-in" tabindex="0"></button>' +
            '</div>' +
            '<svg class="mailpic" id="ai-mailpic" style="display:none" viewBox="0 0 120 96" fill="none" aria-hidden="true"><rect x="10" y="22" width="100" height="66" rx="10" fill="#fff" stroke="#1B4332" stroke-width="2.5"/><path d="M12 28l48 34 48-34" stroke="#1B4332" stroke-width="2.5" stroke-linejoin="round"/><rect x="30" y="6" width="60" height="44" rx="6" fill="#D8F3DC" stroke="#2D6A4F" stroke-width="2"/><path d="M44 26l10 9 20-18" stroke="#1B4332" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 86l36-26M108 86L72 60" stroke="#1B4332" stroke-width="2.5"/></svg>' +
            '<h2 class="wl-h" id="ai-h1" tabindex="-1"></h2>' +
            '<p class="wl-p" id="ai-sub"></p>' +
            '<div class="msg" id="ai-msg" role="alert" aria-live="assertive"></div>' +
            /* ── sign-in pane (same fields + ids, so nothing downstream breaks) ── */
            '<form id="ai-pane-in" novalidate>' + email('ai-email', 'username') + pass('ai-pass', 'current-password', W8('phPass')) +
              '<div class="forgot"><button type="button" id="ai-forgot" class="lnk ai-link"></button></div>' +
              '<button type="submit" class="btn btn-pri full" id="ai-signin" style="margin-top:18px;height:54px"><span class="bl"></span>' + IC.arrow + '</button></form>' +
            /* ── forgot password ── */
            '<form id="ai-pane-reset" style="display:none" novalidate>' + email('ai-rs-email', 'email') +
              '<button type="submit" class="btn btn-pri full" id="ai-reset" style="margin-top:22px;height:54px"><span class="bl"></span>' + IC.arrow + '</button>' +
              '<p style="margin-top:22px"><button type="button" class="lnk" id="ai-reset-back"></button></p></form>' +
            /* ── the screen the reset link lands on: choose a new password ── */
            '<form id="ai-pane-newpass" style="display:none" novalidate>' + pass('ai-np-pass', 'new-password', '', W8('passHint')) + pass('ai-np-pass2', 'new-password', '') +
              '<button type="submit" class="btn btn-pri full" id="ai-savepass" style="margin-top:22px;height:54px"><span class="bl"></span>' + IC.arrow + '</button></form>' +
            /* ── create-account pane: two fields; the wizard collects the farm ── */
            '<form id="ai-pane-up" style="display:none" novalidate>' + email('ai-su-email', 'email') + pass('ai-su-pass', 'new-password', '', W8('passHint')) +
              '<button type="submit" class="btn btn-pri full" id="ai-signup" style="margin-top:22px;height:54px"><span class="bl"></span>' + IC.arrow + '</button></form>' +
            /* ── O2 check your email (confirmation and reset) ── */
            '<div id="ai-pane-inbox" style="display:none">' +
              
              '<div id="ai-inbox-title" class="ob4-sr"></div><div id="ai-inbox-body" class="ob4-sr"></div>' +
              '<div class="addr">' + IC.mail + '<div style="min-width:0"><div class="em" id="ai-inbox-email" style="overflow-wrap:anywhere"></div><div style="font-size:13px;color:var(--mut);margin-top:2px" id="ai-inbox-wrong"><span id="ai-inbox-wrong-t"></span> <button type="button" class="lnk" style="font-size:13px" id="ai-inbox-change"></button></div></div></div>' +
              '<div class="mailbtns"><button type="button" class="btn btn-sec" style="height:50px" data-mail="gmail">' + IC.ext + '<span id="ai-gmail"></span></button><button type="button" class="btn btn-sec" style="height:50px" data-mail="outlook">' + IC.ext + '<span id="ai-outlook"></span></button></div>' +
              '<div class="resend"><span id="ai-spam"></span><br><span id="ai-resend-box"><button type="button" class="lnk" id="ai-resend"><span class="bl"></span></button><span class="cd" id="ai-resend-cd" aria-hidden="true"></span></span></div>' +
            '</div>' +
            /* ── -400: shown to a farmer who is already signed in, while their farm loads ── */
            '<div id="ai-pane-opening" style="display:none"><div class="opening" aria-hidden="true"><div class="spin"></div></div></div>' +
            '<div id="ai-demo-box"><div class="or" id="ai-or"></div><button type="button" class="btn btn-gold full" id="ai-demo" style="height:52px">' + IC.compass + '<span id="ai-demo-t"></span></button><div class="gold-sub" id="ai-demo-q"></div></div>' +
          '</div>' +
          '<div class="wl-foot" id="ai-foot"><span class="fine" id="ai-fine" style="text-align:left;max-width:300px"></span><button type="button" class="lnk" style="font-size:13px" id="ai-inbox-back"></button></div>' +
        '</section>' +
      '</div>';
    document.body.appendChild(o);

    var on = function (id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('ai-pane-in', 'submit', function (e) { e.preventDefault(); doSignIn(); });
    on('ai-pane-up', 'submit', function (e) { e.preventDefault(); doSignUp(); });
    on('ai-pane-reset', 'submit', function (e) { e.preventDefault(); doReset(); });
    on('ai-pane-newpass', 'submit', function (e) { e.preventDefault(); doSavePassword(); });
    on('ai-tab-in', 'click', function(){ setMode('signin'); _focusH(); });
    on('ai-tab-up', 'click', function(){ setMode('signup'); _focusH(); });
    on('ai-inbox-back', 'click', function(){ setMode('signin'); _focusH(); });
    on('ai-resend', 'click', doResend);
    on('ai-forgot', 'click', function(){ var em = (document.getElementById('ai-email') || {}).value || ''; setMode('reset'); var r = document.getElementById('ai-rs-email'); if (r && em) r.value = em; _focusH(); });
    on('ai-reset-back', 'click', function(){ setMode('signin'); _focusH(); });
    on('ai-inbox-change', 'click', function(){ CHANGING = true; setMode('signup'); var e = document.getElementById('ai-su-email'); if (e) { e.value = AUTH_EMAIL; try { e.focus(); e.select(); } catch (x) {} } });
    o.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pass]');
      if (b) { var i = document.getElementById(b.getAttribute('data-pass')); var show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', W8(show ? 'hidePass' : 'showPass')); b.querySelector('span').textContent = W8(show ? 'hide' : 'show'); return; }
      var m = e.target.closest('[data-mail]');
      if (m) { try { var w = window.open(m.getAttribute('data-mail') === 'outlook' ? 'https://outlook.live.com/mail/' : 'https://mail.google.com/', '_blank', 'noopener'); if (w) { try { w.opener = null; } catch (x) {} } } catch (x) {} return; }
      var p = e.target.closest('[data-policy]');
      if (p) { try { if (typeof window.aiPolicyOpen === 'function') window.aiPolicyOpen(p.getAttribute('data-policy')); } catch (x) {} }
    });
    o.addEventListener('input', function (e) { var el = e.target; if (el && el.id) _fieldErr(el.id, null); if (el && el.id === 'ai-su-pass') { var h = document.getElementById('ai-su-pass-hint'); if (h) h.style.color = Array.from(el.value).length >= 8 ? '#2D6A4F' : ''; } });
    /* the two tabs: arrows move between them (both stay in the Tab order) */
    ['ai-tab-in', 'ai-tab-up'].forEach(function (id) { on(id, 'keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setMode(id === 'ai-tab-up' ? 'signin' : 'signup'); var t = document.getElementById(id === 'ai-tab-up' ? 'ai-tab-in' : 'ai-tab-up'); if (t) t.focus(); } }); });
    window.addEventListener('resize', _placeProof);
    /* a device that has signed in before opens on Sign in; a new visitor on Create your farm (O1) */
    var first = 'signup'; try { if (localStorage.getItem('ai_uk_had_account') === '1') first = 'signin'; } catch (e) {}
    setMode(first);
    /* The demo's "Create your farm ->" leaves a flag so the farmer lands where they were heading - the sign-up form. */
    try {
      if (localStorage.getItem('ai_uk_auth_mode') === 'signup') { setMode('signup'); WANT_SIGNUP = true; }   /* -432e F4 class: kept until the card is shown */
      localStorage.removeItem('ai_uk_auth_mode');
    } catch (e) {}
    /* D5: signed out from setup - say the half-filled answers were cleared from this computer */
    try { var fl = sessionStorage.getItem('ai_uk_ob433_flash'); if (fl) { sessionStorage.removeItem('ai_uk_ob433_flash'); setMode('signin'); msgK('signedOutCleared', 'ok'); } } catch (e) {}
    /* -400 (5a): signed in already (THIS project's token): the card says "Opening your farm..." from its first paint. */
    try { if (!window.__AI_GUEST && !RECOVERY && !window.__AI_BACKEND_BLOCKED && _sessionUid()) setMode('opening'); } catch (e) {}
    var demoBtn = document.getElementById('ai-demo');
    if (demoBtn) demoBtn.addEventListener('click', function () {
      try { localStorage.setItem('ai_uk_guest', '1'); } catch (e) {}
      location.href = location.pathname + '?demo=1';
    });
  }
  function _focusH(){ setTimeout(function(){ var h = document.getElementById('ai-h1'); if (h) try { h.focus(); } catch (e) {} }, 20); }
  function _placeProof(){
    var el = document.getElementById('ai-pimg'); if (!el) return;
    el.style.backgroundImage = 'url(img/ob433/proof-uk.jpg)'; el.style.backgroundSize = '100% auto'; el.style.backgroundPosition = '0 0';
  }
  function _leftHtml(mode){
    var trust = '<div class="trust"><div class="tr"><div class="ti">' + IC.pin + '</div><b>' + _esc(W8('t1b')) + '</b><span>' + _esc(W8('t1s')) + '</span></div>' +
      '<div class="tr"><div class="ti">' + IC.shield + '</div><b>' + _esc(W8('t2b')) + '</b><span>' + _esc(W8('t2s')) + '</span></div>' +
      '<div class="tr"><div class="ti">' + IC.phone + '</div><b>' + _esc(W8('t3b')) + '</b><span>' + _esc(W8('t3s')) + '</span></div></div>';
    var brand = '<div class="brandrow"><div class="bm"><img src="img/logomark.png?v=225" alt=""></div><div class="bn">Agri<span>Insights</span></div></div>';
    if (mode === 'inbox' && INBOX_KIND !== 'reset') {
      return brand + '<div style="margin:auto 0"><h1 class="promise" style="font-size:40px;margin-top:0">' + _esc(W8('ePromise1')) + ' <em>' + _esc(W8('ePromise2')) + '</em></h1>' +
        '<ol class="next3" style="list-style:none"><li class="n3 done"><div class="c">' + IC.check.replace('class="i"', 'class="i" style="width:16px;height:16px;stroke-width:3"') + '</div><div><b>' + _esc(W8('eN1')) + '</b><span>' + _esc(AUTH_EMAIL) + '</span></div></li>' +
        '<li class="n3 on" aria-current="step"><div class="c">2</div><div><b>' + _esc(W8('eN2')) + '</b><span>' + _esc(W8('eN2s')) + '</span></div></li>' +
        '<li class="n3"><div class="c">3</div><div><b>' + _esc(W8('eN3')) + '</b><span>' + _esc(W8('eN3s')) + '</span></div></li></ol></div>' + trust;
    }
    return brand + '<h1 class="promise">' + _esc(W8('promise1')) + ' <em>' + _esc(W8('promise2')) + '</em></h1>' +
      '<p class="promise-sub">' + _esc(W8('wSub')) + '</p>' +
      '<figure class="proof"><div class="proof-frame"><div class="proof-bar"><img src="img/logomark.png?v=225" alt="">Oakvale Farm<span class="pill">' + _esc(W8('samplePill')) + '</span></div>' +
      '<div class="proof-img" id="ai-pimg" role="img" aria-label="' + _esc(W8('proofCap')) + '"></div></div>' +
      '<div class="proof-chip"><div class="ic">' + IC.trend + '</div><div><div class="k">' + _esc(W8('chipK')) + '</div><div class="v">' + _esc(W8('chipV')) + '<span>' + _esc(W8('healthy')) + '</span></div></div></div></figure>' +
      '<figcaption class="proof-cap">' + _esc(W8('proofCap')) + '</figcaption>' + trust;
  }

  function msg(text, kind) {
    var m = document.getElementById('ai-msg');
    if (!m) return;
    if (!text) { m.innerHTML = ''; m.className = 'msg'; return; }
    m.className = 'msg ' + (kind === 'err' ? 'formerr' : 'okmsg');
    m.innerHTML = (kind === 'err' ? IC.warn : IC.info) + '<span>' + _esc(text) + '</span>';
  }
  function _fieldErr(id, text){
    var inp = document.getElementById(id), box = document.getElementById(id + '-err');
    if (inp) { if (text) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    if (box) { box.hidden = !text; box.innerHTML = text ? IC.warn + '<span>' + _esc(text) + '</span>' : ''; }
    if (text && inp) { try { inp.focus(); } catch (e) {} }
  }

  /* This overlay owns its copy rather than reading the app's strings: it renders before the app has booted. The -433
     lines are the signed-off prototype wording (prototype/strings.js, resolved for the UK by uk-433/gen/strings-uk.mjs). */
  var AUTH_T = { en: {"tabIn": "Sign in", "tabUp": "Create your farm", "createH": "Create your farm", "createP": "Set up your farm within minutes.", "changeP": "Type the right address. We’ll send the link there instead.", "signinH": "Welcome back", "signinP": "Sign in to your farm", "subReset": "Reset your password", "rsHint": "We’ll email you a link to choose a new password.", "subNewPass": "Choose a new password", "inboxTitle": "Check your email", "eP": "We sent a link to confirm it is you. Open it on this computer or your phone.", "resetTitle": "Check your email", "resetSentP": "If there’s a farm with {email}, we’ve sent it a link to choose a new password.", "lblEmail": "Email", "lblPass": "Password", "lblNew": "New password", "lblNew2": "Type it again", "phEmail": "you@farm.co.uk", "phPass": "Your password", "passHint": "At least 8 characters", "show": "Show", "hide": "Hide", "showPass": "Show password", "hidePass": "Hide password", "signin": "Sign in", "signup": "Create your farm", "resetBtn": "Email me a reset link", "resetBack": "Back to sign in", "savePass": "Save new password", "forgot": "Forgot password?", "or": "or", "demo": "Explore a sample farm", "demoQ": "No account needed. Nothing is saved.", "eWrong": "Wrong address?", "eChange": "Change it", "eGmail": "Open Gmail", "eOutlook": "Open Outlook", "eSpam": "Nothing there? Look in spam or junk.", "resend": "Send it again", "resendIn": "in {t}", "back": "Already confirmed? Sign in", "resent": "Sent again. Check your inbox.", "resetSent": "Sent again. Check your inbox.", "notYet": "Confirm your email first. We sent the link to {email}.", "fine": "You read and accept our {privacy} and {terms} during setup.", "privacy": "Privacy notice", "terms": "Terms of use", "needBoth": "Enter your email and password.", "emailEmpty": "Enter your email address.", "emailLong": "That email address is too long. Check it.", "badEmail": "That doesn’t look like an email address. Check for a missing .co.uk or .com.", "passEmpty": "Enter a password.", "shortPass": "Too short. Use at least 8 characters.", "longPass": "Use 128 characters or fewer.", "mismatch": "Those two passwords are not the same.", "creating": "Creating your account…", "signing": "Signing in…", "noMatch": "That email and password don’t match. Check them, or reset your password.", "savingPass": "Saving your new password…", "passSaved": "Password changed. Signing you in…", "recoverExpired": "That reset link has expired. Ask for a new one.", "offline": "You appear to be offline. Connect to the internet to continue.", "signedOutCleared": "You’re signed out. The answers you’d started were cleared from this computer.", "promise1": "Every pound on your farm,", "promise2": "clear in minutes.", "wSub": "See each month whether the farm is making money, where it goes, and what is due to HMRC. Without the paperwork.", "samplePill": "Sample farm", "proofCap": "The real app, showing the Oakvale sample farm", "chipK": "Is my farm profitable?", "chipV": "Yes · 35.2% margin", "healthy": "Healthy", "t1b": "Made for UK farms", "t1s": "England, Wales, Scotland and NI rules", "t2b": "Your data is yours", "t2s": "UK GDPR; run by a UK company", "t3b": "On your phone too", "t3s": "Works where the signal is weak", "ePromise1": "One quick check,", "ePromise2": "then your farm.", "eN1": "Account created", "eN2": "Confirm your email", "eN2s": "So only you can get into your farm’s records.", "eN3": "Tell us about your farm", "eN3s": "About two minutes. Then you are in.", "subOpening": "Opening your farm…", "openFail": "We could not open your farm just now. Check your connection, then sign in again."} };
  var MSG_KEY = null, MSG_KIND = '';
  function msgK(key, kind){ MSG_KIND = kind || ''; msg(T()[key], kind); MSG_KEY = key; }
  function T(){ return AUTH_T.en; }
  function _txt(id, s){ var el = document.getElementById(id); if (el) el.textContent = s; }
  function _btn(id, s){ var el = document.getElementById(id); if (!el) return; var b = el.querySelector('.bl'); if (b) b.textContent = s; else el.textContent = s; }
  function applyAuthCopy(){
    var t = T(), pane = AUTH_MODE;
    var left = document.getElementById('ai-wl-left'); if (left) { left.innerHTML = _leftHtml(pane); _placeProof(); }
    var H = { signup: CHANGING ? t.createH : t.createH, signin: t.signinH, reset: t.subReset, newpass: t.subNewPass, inbox: t.inboxTitle, opening: t.subOpening }[pane] || t.signinH;
    if (pane === 'inbox' && INBOX_KIND === 'reset') H = t.resetTitle;
    _txt('ai-h1', H);
    _txt('ai-sub', pane === 'signup' ? (CHANGING ? t.changeP : t.createP)
                 : pane === 'inbox' ? (INBOX_KIND === 'reset' ? W8('resetSentP', { email: AUTH_EMAIL }) : t.eP)
                 : pane === 'reset' ? t.rsHint
                 : pane === 'newpass' ? ''
                 : pane === 'opening' ? ''
                 : t.signinP);
    _txt('ai-tab-in', t.tabIn); _txt('ai-tab-up', t.tabUp);
    _btn('ai-signin', t.signin); _btn('ai-signup', t.signup); _btn('ai-reset', t.resetBtn); _btn('ai-savepass', t.savePass);
    _txt('ai-forgot', t.forgot); _txt('ai-reset-back', t.resetBack);
    _txt('ai-or', t.or); _txt('ai-demo-t', t.demo); _txt('ai-demo-q', t.demoQ);
    _txt('ai-inbox-title', INBOX_KIND === 'reset' ? t.resetTitle : t.inboxTitle);
    _txt('ai-inbox-body', INBOX_KIND === 'reset' ? W8('resetSentP', { email: AUTH_EMAIL }) : t.eP);
    _txt('ai-inbox-email', AUTH_EMAIL); _txt('ai-inbox-wrong-t', t.eWrong); _txt('ai-inbox-change', t.eChange);
    var wr = document.getElementById('ai-inbox-wrong'); if (wr) wr.style.display = INBOX_KIND === 'reset' ? 'none' : '';
    _txt('ai-gmail', t.eGmail); _txt('ai-outlook', t.eOutlook); _txt('ai-spam', t.eSpam);
    _btn('ai-resend', t.resend); _txt('ai-inbox-back', INBOX_KIND === 'reset' ? t.resetBack : t.back);
    var fine = document.getElementById('ai-fine');
    if (fine) fine.innerHTML = _esc(t.fine).replace('{privacy}', '<button type="button" class="lnk" data-policy="privacy">' + _esc(t.privacy) + '</button>').replace('{terms}', '<button type="button" class="lnk" data-policy="terms">' + _esc(t.terms) + '</button>');
    if (MSG_KEY && t[MSG_KEY]) msg(t[MSG_KEY], MSG_KIND);
  }
  function _esc(s){ return String(s || '').replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  var AUTH_MODE = 'signin', AUTH_EMAIL = '', INBOX_KIND = 'signup', WANT_SIGNUP = false, CHANGING = false;
  function setMode(m){
    if (m !== 'signup') CHANGING = false;
    AUTH_MODE = m;
    var show = function(id, on){ var el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
    show('ai-pane-in',      m === 'signin');
    show('ai-pane-up',      m === 'signup');
    show('ai-pane-inbox',   m === 'inbox');
    show('ai-pane-reset',   m === 'reset');
    show('ai-pane-newpass', m === 'newpass');
    show('ai-pane-opening', m === 'opening');
    show('ai-mailpic', m === 'inbox');
    var wf = document.querySelector('#ai-auth .wl-form'); if (wf) wf.classList.toggle('ob4-inbox', m === 'inbox');
    /* Tabs only while choosing between signing in and creating; never mid-confirmation, mid-reset or on the new password. */
    show('ai-tabs',       m === 'signin' || m === 'signup');
    show('ai-demo-box',   m === 'signin' || m === 'signup');
    show('ai-fine',       m === 'signup');
    show('ai-inbox-back', m === 'inbox');
    var ti = document.getElementById('ai-tab-in'), tu = document.getElementById('ai-tab-up');
    if (ti) { ti.className = 'tab' + (m === 'signin' ? ' on' : ''); ti.setAttribute('aria-selected', String(m === 'signin')); }
    if (tu) { tu.className = 'tab' + (m === 'signup' ? ' on' : ''); tu.setAttribute('aria-selected', String(m === 'signup')); }
    ['ai-email','ai-pass','ai-su-email','ai-su-pass','ai-rs-email','ai-np-pass','ai-np-pass2'].forEach(function (id) { _fieldErr(id, null); });
    MSG_KEY = null; msg('');
    applyAuthCopy();
    if (m === 'inbox') _resendDraw();
  }

  function _validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
  function _vEmail(v){ v = String(v || '').trim(); if (!v) return W8('emailEmpty'); if (v.length > 254) return W8('emailLong'); if (!_validEmail(v)) return W8('badEmail'); return null; }
  function _vPass(v){ v = String(v || ''); if (!v) return W8('passEmpty'); if (Array.from(v).length < 8) return W8('shortPass'); if (Array.from(v).length > 128) return W8('longPass'); return null; }
  function _busy(btn, on, label){ if (!btn) return; btn.disabled = !!on; if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); var b = btn.querySelector('.bl'); if (b && label) b.textContent = label; }

  function doSignUp(){
    try { localStorage.removeItem('ai_uk_guest'); window.__AI_GUEST = false; } catch (e) {}
    var btn = document.getElementById('ai-signup');
    if (btn && btn.disabled) return;
    var email = (document.getElementById('ai-su-email').value || '').trim();
    var pass  = document.getElementById('ai-su-pass').value || '';
    if (!email && !pass) { _fieldErr('ai-su-email', W8('needBoth')); return; }
    var e1 = _vEmail(email), e2 = _vPass(pass);
    _fieldErr('ai-su-pass', e2); _fieldErr('ai-su-email', e1);
    if (e1 || e2) return;
    if (navigator.onLine === false) { msgK('offline', 'err'); return; }
    _busy(btn, true, W8('creating')); MSG_KEY = null; msg('');
    AI.auth.signUp(email, pass).then(function (r) {
      _busy(btn, false, W8('signup'));
      AUTH_EMAIL = email; INBOX_KIND = 'signup';
      try { localStorage.setItem('ai_uk_had_account', '1'); } catch (e) {}
      if (r && r.session) { return enterApp(); }   // only if confirmation is ever turned off
      /* Deliberately NOT branching on r.already: a different screen for an address that is already registered would
         leak exactly what Supabase's anti-enumeration behaviour protects. Everyone sees the same screen. */
      SENT_AT = Date.now();
      setMode('inbox'); _focusH();
    }).catch(function (e) {
      _busy(btn, false, W8('signup'));
      var raw = (e && e.message) ? e.message : '';
      if (_isOfflineErr(e)) { msgK('offline', 'err'); } else { msg(raw || 'Could not create your account.', 'err'); }
    });
  }

  function doReset(){
    var btn = document.getElementById('ai-reset');
    if (btn && btn.disabled) return;
    var email = (document.getElementById('ai-rs-email').value || '').trim();
    var e1 = _vEmail(email); _fieldErr('ai-rs-email', e1); if (e1) return;
    if (navigator.onLine === false) { msgK('offline', 'err'); return; }
    _busy(btn, true);
    AI.auth.resetPassword(email).then(function () {
      _busy(btn, false);
      AUTH_EMAIL = email; INBOX_KIND = 'reset'; SENT_AT = Date.now();
      /* Same screen whether or not the address exists: no enumeration leak. */
      setMode('inbox'); _focusH();
    }).catch(function (e) {
      _busy(btn, false);
      var raw = (e && e.message) ? e.message : '';
      if (_isOfflineErr(e)) { msgK('offline', 'err'); } else { msg(raw || 'Could not send the email.', 'err'); }
    });
  }

  function doSavePassword(){
    var btn = document.getElementById('ai-savepass');
    if (btn && btn.disabled) return;
    var p1 = document.getElementById('ai-np-pass').value || '';
    var p2 = document.getElementById('ai-np-pass2').value || '';
    var e1 = _vPass(p1); _fieldErr('ai-np-pass', e1); if (e1) return;
    if (p1 !== p2) { _fieldErr('ai-np-pass2', W8('mismatch')); return; }
    _busy(btn, true, W8('savingPass'));
    AI.auth.updatePassword(p1).then(function () {
      msgK('passSaved', 'ok');
      /* The recovery link already signed them in. Drop the token out of the address bar first. */
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      RECOVERY = false;
      return enterApp();
    }).catch(function (e) {
      _busy(btn, false, W8('savePass'));
      var raw = (e && e.message) ? e.message : '';
      if (_isOfflineErr(e)) { msgK('offline', 'err'); }
      else if (/session|expired|token/i.test(raw)) { msgK('recoverExpired', 'err'); }
      else { msg(raw || 'Could not change your password.', 'err'); }
    });
  }

  /* O2: "Send it again" after 30 seconds (Supabase also limits these; its own wait is honoured if it asks for longer) */
  var SENT_AT = 0, RESEND_WAIT = 30000, RESEND_TIMER = null;
  function _resendDraw(){
    var btn = document.getElementById('ai-resend'), cd = document.getElementById('ai-resend-cd'); if (!btn || !cd) return;
    var left = Math.max(0, Math.ceil((SENT_AT + RESEND_WAIT - Date.now()) / 1000));
    if (left > 0) {
      btn.disabled = true; cd.innerHTML = IC.clock + _esc(W8('resendIn', { t: '0:' + String(Math.min(59, left)).padStart(2, '0') }));
      if (!RESEND_TIMER) RESEND_TIMER = setInterval(_resendDraw, 1000);
    } else {
      btn.disabled = false; cd.innerHTML = '';
      if (RESEND_TIMER) { clearInterval(RESEND_TIMER); RESEND_TIMER = null; }
    }
  }
  function doResend(){
    var btn = document.getElementById('ai-resend');
    if (Date.now() < SENT_AT + RESEND_WAIT) { _resendDraw(); return; }
    btn.disabled = true;
    var again = (INBOX_KIND === 'reset') ? AI.auth.resetPassword(AUTH_EMAIL) : AI.auth.resendConfirm(AUTH_EMAIL);
    again.then(function () {
      SENT_AT = Date.now(); RESEND_WAIT = 30000;
      msgK(INBOX_KIND === 'reset' ? 'resetSent' : 'resent', 'ok'); _resendDraw();
    }).catch(function (e) {
      var raw = (e && e.message) ? e.message : '', m = /(\d+)\s*seconds?/i.exec(raw);
      if (m) { SENT_AT = Date.now(); RESEND_WAIT = (+m[1]) * 1000; _resendDraw(); return; }
      btn.disabled = false;
      if (_isOfflineErr(e)) msgK('offline', 'err'); else msg(raw || 'Could not send the email.', 'err');
    });
  }
  function hideOverlay() {
    var o = document.getElementById('ai-auth');
    if (o) o.style.display = 'none';
    if (RESEND_TIMER) { clearInterval(RESEND_TIMER); RESEND_TIMER = null; }
    // Sign-out lives in the header avatar menu (appSignOut) - no floating button.
  }

  // ---- offline session: reveal the cached app instead of trapping on login ----
  function _isOfflineErr(e){ var raw=(e&&e.message)?e.message:String(e||''); return (navigator.onLine===false) || /failed to fetch|networkerror|load failed|fetch|timeout|offline/i.test(raw); }
  /* -400: THIS project's session only. Both apps share one host, so "any sb-*-auth-token" was also
     true for a farmer signed in to the other app only (the shared-origin trap, -331). */
  function _hasPersistedSession(){
    try{ var ref = window.AI && window.AI.projectRef; if (ref) return !!localStorage.getItem('sb-' + ref + '-auth-token'); }catch(e){}
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i); if(k && /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true; } }catch(e){} return false; }
  function _offlineReveal(){
    // The app's own boot (bootAgriInsights -> loadState) already populated ST from this
    // device's localStorage, so the user has their last-synced data. Reveal it; the topbar
    // sync indicator shows the offline state and the outbox/relational flush runs on reconnect.
    _voOff(false);
    _bootRenderIfDeferred();
    hideOverlay();
    try{ if(typeof window.toast==='function') window.toast('You\u2019re offline \u2014 showing your last synced data. Changes save on this device and sync when you reconnect.','info'); }catch(e){}
  }

  /* One door into the app, so the three ways a session can appear — an existing
     session at boot, a password sign-in, and the confirmation link coming back
     from the farmer's inbox — cannot double-hydrate each other. */
  /* Did the farmer arrive on a password-reset link? Read at load, BEFORE supabase-js
     parses and strips the fragment. A recovery link carries a real session, so without
     this flag the ordinary "session appeared → go into the app" path would swallow it
     and the farmer would never get to type a new password. */
  var RECOVERY = /(^|[#&])type=recovery/.test(window.location.hash || '');

  /* ── -400 (B9, D2): this computer's saved figures straight away, view only ──────────────────
     A farmer who is signed in (THIS project's token) and whose device copy is theirs - the saved
     state is stamped with the account and farm it was loaded for (index-uk.html saveState /
     loadState, __aiSnapOwner), and those match the token's account and the active farm - sees
     the farm as soon as the app has booted from that copy, instead of the sign-in form. Until the
     server's copy has landed (hydrate finished, AI.sync.open()), nothing can be changed: ONE guard
     (_viewOnly) holds every tap, key and input in capture phase before any handler sees it, so no
     writer can start, and a tap says "One moment, getting your latest figures". Saves were already
     held until open() and stay so; the catch-up, the unsent-edits rule (F2) and the two-device
     guards are untouched. Figures that changed on the server are redrawn in place by hydrate's
     closing nav() on the page the farmer is on. Anything that does not match (no stamp, another
     account or farm, storage wiped or unreadable, a first-run farm, a recovery link) shows
     "Opening your farm..." and waits as before - never the sign-in form for a signed-in farmer. */
  var _viewOnly = false, _revealed = false, _hydrated = false, _voToastAt = 0;
  function _voChip(text, spin){
    var c = document.getElementById('ai-vo-chip');
    if (!c) { c = document.createElement('div'); c.id = 'ai-vo-chip'; c.setAttribute('role', 'status'); (document.body || document.documentElement).appendChild(c); }
    c.innerHTML = (spin ? '<span class="spin"></span>' : '<span aria-hidden="true">\u2713</span>') + '<span>' + _esc(text) + '</span>';
    try { var at = window.LAST_SAVED_AT ? new Date(window.LAST_SAVED_AT) : null;
      if (at && !isNaN(at)) c.title = 'Showing what this computer last saved at ' + ('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2) + ' \u2014 getting your latest figures'; } catch (e) {}
    return c;
  }
  function _voOn(){ _viewOnly = true; try { document.documentElement.classList.add('ai-viewonly'); } catch (e) {} _voChip('Updating\u2026', true); }
  function _voOff(done){
    var was = _viewOnly; _viewOnly = false;
    try { document.documentElement.classList.remove('ai-viewonly'); } catch (e) {}
    var c = document.getElementById('ai-vo-chip'); if (!c) return;
    if (done && was) { _voChip('Up to date', false); setTimeout(function () { c.style.opacity = '0'; setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 450); }, 1200); }
    else if (c.parentNode) c.parentNode.removeChild(c);
  }
  window.aiViewOnly = function () { return _viewOnly; };
  var _VO_KEYS_OK = { ArrowUp:1, ArrowDown:1, ArrowLeft:1, ArrowRight:1, PageUp:1, PageDown:1, Home:1, End:1 };
  function _voGuard(ev){
    if (!_viewOnly) return;
    var t = ev.target;
    try { if (t && t.closest && (t.closest('#ai-vo-chip') || t.closest('#ai-auth') || t.closest('#sw-update-notice'))) return; } catch (e) {}
    if (ev.type === 'keydown' && _VO_KEYS_OK[ev.key] && !ev.ctrlKey && !ev.metaKey && !ev.altKey) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (ev.type === 'focusin') { try { if (t && t.blur) t.blur(); } catch (e) {} return; }
    if (ev.type === 'click' || ev.type === 'keydown' || ev.type === 'submit') {
      var now = Date.now();
      if (now - _voToastAt > 1500) { _voToastAt = now; try { if (typeof window.toast === 'function') window.toast('One moment, getting your latest figures', 'info'); } catch (e) {} }
    }
  }
  ['click','dblclick','mousedown','mouseup','auxclick','keydown','keypress','input','beforeinput','change','submit','paste','cut','drop','dragstart','focusin','contextmenu']
    /* on window, in capture: the very first listener any event meets (before the app's own window/document listeners) */
    .forEach(function (type) { try { window.addEventListener(type, _voGuard, true); } catch (e) {} });
  function _localMatches(uid){
    try {
      if (RECOVERY || window.__AI_GUEST || !uid) return false;
      if (window.STATE_LOADED_FROM_DISK !== true) return false;          /* nothing (readable) was saved here */
      var o = window.__aiSnapOwner, fid = AI.farm.active();
      if (!o || !fid || o.uid !== uid || o.farm !== fid) return false;    /* not stamped for this account and farm */
      if (localStorage.getItem('ai_uk_state_uid') !== uid || localStorage.getItem('ai_uk_state_farm') !== fid) return false;
      if (_sessionUid() !== uid) return false;
      if (window.ST && window.ST.firstRun) return false;                  /* a farm still being set up opens its wizard */
      return true;
    } catch (e) { return false; }
  }
  window.aiLocalRevealable = function () { return _localMatches(_sessionUid()); };   /* for the -400 harness */
  function _scheduleReveal(uid){
    if (!(window.AI && AI.sync && AI.sync.whenLocalReady)) return;
    AI.sync.whenLocalReady(8000).then(function (ok) {
      if (!ok || _hydrated || _revealed) return;
      var ov = document.getElementById('ai-auth');
      if (!ov || ov.style.display === 'none' || AUTH_MODE !== 'opening') return;
      if (!_localMatches(uid)) return;
      _revealed = true; _voOn();
      try { var ob = document.getElementById('ob-overlay'); if (ob) ob.style.display = 'none'; } catch (e) {}
      hideOverlay();
    });
  }
  /* The figures shown were not this account's or farm's after all, or the open failed: cover them again. */
  function _unreveal(mode){
    /* -432e F4 class: a stale session put the card on "Opening your farm..." and the "no session -> sign in" that
       followed lost the demo's "Create your farm ->" ask. The farmer's own ask wins, once. */
    if (mode === 'signin' && WANT_SIGNUP) mode = 'signup';
    WANT_SIGNUP = false;
    if (_revealed) { _revealed = false; _voOff(false); }
    var o = document.getElementById('ai-auth'); if (o) o.style.display = 'flex';
    if (mode) setMode(mode);
  }
  function _bootRenderIfDeferred(){
    try { if (window.__aiBootRenderDeferred && typeof nav === 'function') { window.__aiBootRenderDeferred = false; nav(window.CURRENT_PAGE || 'dashboard'); } } catch (e) {}
  }

  var _entering = false;
  function enterApp(){
    if (_entering) return Promise.resolve();
    _entering = true;
    return hydrate().then(function () { _hydrated = true; window.__AI_HYDRATED_AT = Date.now(); _voOff(true); hideOverlay(); }).catch(function (e) {   /* -414: the phone's HMRC list is written on the next change after this (a clean load writes nothing) */
      _entering = false;
      /* never left on "Opening your farm..." or on figures that may not be theirs */
      if (_revealed || AUTH_MODE === 'opening') { _unreveal('signin'); msgK('openFail', 'err'); }
      throw e;
    });
  }

  // ---- sign in -------------------------------------------------------------
  function doSignIn() {
    // Signing in with a real account always leaves guest mode behind.
    try { localStorage.removeItem('ai_uk_guest'); window.__AI_GUEST = false; } catch (e) {}
    var btn = document.getElementById('ai-signin');
    if (btn && btn.disabled) return;
    var email = (document.getElementById('ai-email').value || '').trim();
    var pass = document.getElementById('ai-pass').value || '';
    if (!email && !pass) { _fieldErr('ai-email', W8('needBoth')); return; }
    var e1 = email ? (_validEmail(email) ? null : W8('badEmail')) : W8('emailEmpty'), e2 = pass ? null : W8('passEmpty');
    _fieldErr('ai-pass', e2); _fieldErr('ai-email', e1); if (e1 || e2) return;
    if (navigator.onLine === false) { msgK('offline', 'err'); return; }
    _busy(btn, true, W8('signing')); MSG_KEY = null; msg('');
    AI.auth.signIn(email, pass)
      .then(function () { try { localStorage.setItem('ai_uk_had_account', '1'); } catch (e) {} return enterApp(); })
      .catch(function (e) {
        _busy(btn, false, W8('signin'));
        var raw = (e && e.message) ? e.message : '';
        var offline = !navigator.onLine || /failed to fetch|networkerror|load failed|fetch/i.test(raw);
        if (offline) { msgK('offline', 'err'); }
        else if (/not confirmed/i.test(raw)) { AUTH_EMAIL = email; INBOX_KIND = 'signup'; SENT_AT = 0; setMode('inbox'); msg(W8('notYet', { email: email }), 'err'); }
        else if (/invalid login|invalid credentials|invalid email or password/i.test(raw)) { msgK('noMatch', 'err'); try { document.getElementById('ai-pass').focus(); } catch (x) {} }
        else { msg(raw || 'Sign-in failed. Check your details.', 'err'); }
      });
  }

  // ---- ensure a farm, load its data into ST, re-render ---------------------
  /* The signed-in user's id, read from the persisted session. Used to tell whether
     the data already on this device belongs to the account that is signing in. */
  /* -398 (B7 F2): the server's budget onto this device - unless this device still has a budget edit it has not sent.
   ST.budgets was replaced by the server's copy FIRST and AI.sync.catchUp() ran after it, so the catch-up then sent
   the server's own copy back and the farmer's unsent edit was gone. Recurring and assets were already guarded by
   isUnsent(); the budget now is too, and the payments marked paid with it (they are saved in the same budget save).
   catchUp() then sends this device's copy. Read by tools/uk-b7f-398-harness.html from this file. */
function aiApplyCoreBudgets(core){
  if (!window.ST || !core) return 'none';
  var unsent = !!(window.AI && AI.sync && AI.sync.isUnsent && AI.sync.isUnsent('budget'));
  if (core.budgets && !unsent) {
    /* Keep any category targets this device already has when the server has none.
       The server payload replaces ST.budgets wholesale, so without this the first
       load after the catTargets migration would wipe targets that had never had
       anywhere to sync to - losing them at the exact moment they became savable. */
    var _localCT = (ST.budgets && ST.budgets.catTargets) || null, _localLk = (ST.budgets && ST.budgets.locked) || null;
    var _localGrid = (ST.budgets && ST.budgets.grid) || null;   /* -399 (8A): whitelist 3 of 3 - the Spreadsheet */
    ST.budgets = core.budgets;
    if (!ST.budgets.catTargets && _localCT) ST.budgets.catTargets = _localCT;
    if (!ST.budgets.locked && _localLk) ST.budgets.locked = _localLk;   /* -371 */
    /* -399 (8A): the Spreadsheet. No grid from the server (its tables not made yet, or not read) keeps this device's;
       a server with no saved Spreadsheet keeps one this device saved before the tables existed (sent next, as the
       category targets were). Then the cells follow the month totals (another device may have changed a month). */
    var _hasFarm = function (g) { try { return Object.keys((g && g.scen) || {}).some(function (k) { return g.scen[k] && g.scen[k].src === 'farm'; }); } catch (e) { return false; } };
    var _gridResend = false;
    if (!ST.budgets.grid && _localGrid) ST.budgets.grid = _localGrid;
    else if (_localGrid && _hasFarm(_localGrid) && !_hasFarm(ST.budgets.grid)) { ST.budgets.grid = _localGrid; _gridResend = true; }
    try { if (typeof window.bgGridSync === 'function' && window.bgGridSync('totals') > 0) _gridResend = true; } catch (e) {}
    try { if (_gridResend && window.AI && AI.budget && AI.farm && AI.farm.active()) AI.budget.save(ST.budgets).catch(function () {}); } catch (e) {}
    /* -398 F8: targets saved under a merged category's old name follow it */
    try { if (typeof window.bgtMigrateCatTargets === 'function') window.bgtMigrateCatTargets(); } catch(e){}
  }
  if (core.taxPaid && typeof core.taxPaid === 'object' && !unsent) ST.taxPaid = core.taxPaid;   /* -373 */
  return unsent ? 'kept' : 'server';
}
window.aiApplyCoreBudgets = aiApplyCoreBudgets;
function _sessionUid(){
    /* This app's own session first. Both apps live on one host, so localStorage holds a
       token for each Supabase project, and taking the first sb-*-auth-token found
       returned the OTHER app's account id about as often as this one's. Hydrate read
       that as "a different farmer is signed in", threw away everything this device had
       not managed to send, and reset the local stores - silently. Caught live on the SA
       test account on 16 Sep 2026: an asset saved while the connection was down was
       gone on the next load, with the status green (-331). */
    try{
      var ref = (window.AI && window.AI.projectRef) || null;
      if (ref) {
        var mine = localStorage.getItem('sb-' + ref + '-auth-token');
        if (!mine) return null;                 /* signed out of THIS app */
        var mv = JSON.parse(mine || '{}');
        return (mv.user && mv.user.id) || (mv.currentSession && mv.currentSession.user && mv.currentSession.user.id) || null;
      }
    }catch(e){}
    /* Older builds had no project ref to ask for; keep the scan as the fallback. */
    try{
      for (var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || '{}');
          return (v.user && v.user.id) || (v.currentSession && v.currentSession.user && v.currentSession.user.id) || null;
        }
      }
    }catch(e){}
    return null;
  }

  /* Ask the server for this account's farms, but only trust an EMPTY answer when we
     are certain the read was authenticated and had time to settle. Returns
     {farms, sure}; sure:false means "do not draw conclusions". */
  function _minWithConfidence(){
    var _sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
    return AI.init().auth.getSession().then(function (res) {
      var sess = res && res.data ? res.data.session : null;
      if (!sess || !sess.user || !sess.user.id) return { farms: [], sure: false };
      return AI.farm.mine().then(function (f1) {
        if (f1 && f1.length) return { farms: f1, sure: true };
        return _sleep(600).then(function(){ return AI.farm.mine(); }).then(function (f2) {
          if (f2 && f2.length) return { farms: f2, sure: true };
          return _sleep(1200).then(function(){ return AI.farm.mine(); }).then(function (f3) {
            return { farms: f3 || [], sure: true };
          });
        });
      });
    }).catch(function (e) {
      console.error('farm list check failed:', e);
      return { farms: [], sure: false };
    });
  }

  function hydrate(opts) {
    opts = opts || {};
    var isNewFarm = false, needOnboarding = false, activeRow = null;
    /* Deciding "this is a brand-new user" is the single most destructive call in the
       sign-in path: get it wrong and the farmer is handed an empty farm while their
       real one sits invisible on the server. RLS answers an unauthenticated read with
       an EMPTY LIST, not an error, so "no farms" and "not authenticated yet" look
       identical. An earlier attempt asked twice with no delay — both calls raced the
       same unsettled session and still created a duplicate. So: confirm a session
       FIRST (getSession resolves from storage and waits for supabase-js to finish
       initialising, no network round-trip), then re-ask with real gaps, and only ever
       create when three spaced, authenticated reads all come back empty. */
    return _minWithConfidence().then(function (res) {
      if (!res.sure) {
        /* We could not establish an authenticated read. Refusing to guess: an error
           here leaves the farmer on the sign-in card, which is recoverable. Creating
           a farm is not. */
        throw new Error('farm-list-unconfirmed');
      }
      if (!res.farms.length) {
        isNewFarm = true;
        return AI.farm.create('My Farm').then(function(){ return null; });
      }
      return res.farms;
    }).then(function (farms) {
      if (!farms || !farms.length) { return AI.farm.active(); }   // just created one
      /* The active-farm pointer is stored per BROWSER, so it outlives a sign-out and
         can name a farm this account cannot see. Every read then comes back empty and
         every write fails against RLS, with nothing on screen to explain why. The
         server's list is the authority. */
      var act = AI.farm.active(), ok = false;
      for (var i = 0; i < farms.length; i++) { if (farms[i].id === act) { ok = true; break; } }
      if (!ok) {
        /* Choosing a default on a device with no usable pointer: prefer a farm that
           has actually been set up (owner_name is written when onboarding finishes)
           over an auto-created empty "My Farm". A farmer signing in on a second
           device should land on their records, not on a blank duplicate. */
        var pick = null;
        for (var k = 0; k < farms.length; k++) { if (farms[k].owner_name) { pick = farms[k]; break; } }
        AI.farm.setActive((pick || farms[0]).id);
      }
      act = AI.farm.active();
      for (var j = 0; j < farms.length; j++) { if (farms[j].id === act) { activeRow = farms[j]; break; } }
      return act;
    }).then(function () {
      /* Whose data is already sitting on this device? A mismatch means the demo seed
         or another farmer's records are in the stores, and the server payloads below
         will NOT clear them on their own: the per-module apply steps deliberately keep
         local rows when the server returns none, so an empty (new) farm leaves every
         demo herd, block, worker and plan in place. */
      var fid = AI.farm.active(), uid = _sessionUid(), sameU = false, sameF = false;
      try {
        sameU = (localStorage.getItem('ai_uk_state_uid')  === uid);
        sameF = (localStorage.getItem('ai_uk_state_farm') === fid);
      } catch(e){}
      if (isNewFarm || !sameU || !sameF) {
        /* -400: figures already shown from this device are not this account's farm: cover them while it loads. */
        if (_revealed) _unreveal('opening');
        /* Unsent changes on this device belong to another account or farm: never send them. */
        try { if (window.AI && AI.sync) AI.sync.discardUnsent(); } catch(e){}
        try { if (typeof window.aiAccountReset === 'function') window.aiAccountReset(); } catch(e){}
      }
      try { localStorage.setItem('ai_uk_state_uid', uid || ''); localStorage.setItem('ai_uk_state_farm', fid || ''); } catch(e){}
      /* -400 (B9): the asset, loan and relational READS start now, beside the finance core (each
         waits only for the column probe, the category maps and this device's own copy). Areas
         with something unsent are not read early: they are read after the catch-up below has
         sent them, as before. Every APPLY below is unchanged - same place, same isUnsent guard.
         See AI.load.prefetch in ai-data-uk.js. A brand-new farm reads no relational areas. */
      try { if (AI.load.prefetch) AI.load.prefetch(fid, isNewFarm ? { skip: ['livestock','crops','orchard','plan','workers','profile','coopSettlements','rules','rainfall'] } : null); } catch (e) {}
      return AI.load.financeCore(fid);
    }).then(function (core) {
      // Replace the app's working data with the farm's real data.
      if (window.ST) { ST.txns = (window.preservePendingTxns ? window.preservePendingTxns(core.txns || []) : (core.txns || [])); if (!(window.AI && AI.sync && AI.sync.isUnsent('recurring'))) ST.recurring = core.recurring || []; aiApplyCoreBudgets(core); if (core.batches && !(window.AI && AI.sync && AI.sync.isUnsent('imports'))) ST.importBatches = core.batches;
        /* Has this farmer ever been through setup? A farm auto-created at first
           sign-in has no owner_name until obFinish saves one, so "no owner AND no
           transactions" is an un-onboarded farm on any device. Requiring the empty
           ledger too keeps an established farm (whose owner_name predates the
           profile push) from being handed a setup wizard it does not need. */
        needOnboarding = isNewFarm || !!(activeRow && !activeRow.owner_name && !(core.txns || []).length);
        if (needOnboarding) { try { if (typeof window.aiShowOnboarding === 'function') window.aiShowOnboarding(); } catch(e){} }
        else { ST.firstRun = false; }
      }
      // currentMonth is a local "trailing window" anchor the backend doesn't persist — financeCore returns it as null,
      // which blanked the boot-time anchor on every sign-in (money views then fell back to a computed default). Re-anchor
      // it to the real current month here. Only sets the label; never shifts transaction dates, so real data is untouched.
      try { if (window.ST && ST.budgets) { var _d=(window.APP_TODAY?new Date(window.APP_TODAY):new Date());   /* ALWAYS today (-369): the cloud keeps the month the budget was last saved in */ var _ml=(window.MONTH_LABELS_SHORT)||['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; ST.budgets.currentMonth=_ml[_d.getMonth()]+' '+_d.getFullYear(); } } catch (e) {}
      // Brand-new pilot farm: wipe any in-memory demo defaults across ALL modules
      // so the user starts on a clean slate and can begin entering data straight away.
      if (isNewFarm && typeof window.clearAllToFresh === 'function') {
        try { window.clearAllToFresh(); if (typeof window.saveState === 'function') window.saveState(); } catch (e) {}
      }
      // Load the asset register + loans before first render (net-worth uses them).
      /* Send what this device never got to send BEFORE any server copy is applied. The loans are
         the FIRST thing hydrate overwrites, so a catch-up placed after them ran with the server's
         copy already in memory: it pushed that back, cleared the marks, and the change left unsent
         when the app closed was gone. Traced live on 16 Sep 2026 - loans fetched at 1.9s, catch-up
         at 2.0s holding only the server's row. */
      var _take = function (n, f) { return AI.load.take ? AI.load.take(n, f) : AI.load[n](f); };
      return (AI.sync ? AI.sync.catchUp() : Promise.resolve()).then(function () { return Promise.all([
        _take('assets', AI.farm.active()),
        _take('loans', AI.farm.active())
      ]); }).then(function (res) {
        var assets = res[0], loanData = res[1];
        try {
          /* Never load over assets this device has not managed to send yet (-411):
             until -411 an asset whose write failed was wiped here, silently. */
          if (window.ST_ASSETS && assets && !(window.AI && AI.sync && AI.sync.isUnsent('assets'))) {
            /* Keep the number each asset was given when it was registered. Dealing them
               out fresh on every load (a.id = i + 1) moved every asset below a deleted
               one, and a payment linked to "asset 3" then named a different machine -
               reproduced against the shipped lookup on 16 Sep 2026. Only rows written
               before the local_id column arrive without a number; those get the lowest
               free ones. */
            var _astUsed = {}, _astNext = 1;
            assets.forEach(function (a) { if (a && a.id != null) _astUsed[a.id] = 1; });
            assets.forEach(function (a) {
              if (!a || a.id != null) return;
              while (_astUsed[_astNext]) _astNext++;
              a.id = _astNext; _astUsed[_astNext] = 1;
            });
            ST_ASSETS.assets = assets;
            /* past the highest id in use, not the count: a sparse list minted a duplicate. */
            if (typeof window.astRepairIds === 'function') window.astRepairIds(ST_ASSETS);
            else ST_ASSETS.nextId = assets.length + 1;
            /* The register is in: ties on payments to machines that are no longer in it are
               cleared quietly, on this device only - the server let go of them when the
               machine went (-332). */
            try { if (typeof window.astSweepDeadPaymentLinks === 'function') window.astSweepDeadPaymentLinks(); } catch (e) {}
          }
        } catch (e) { console.error('Asset hydrate failed:', e); }
        try {
          /* Never load over facilities this device has not managed to send yet. */
          if (window.ST_LOANS && loanData && !(window.AI && AI.sync && AI.sync.isUnsent('loans'))) {
            ST_LOANS.loans = loanData.loans || [];
            ST_LOANS.overdrafts = loanData.overdrafts || [];
            ST_LOANS.coopAccounts = loanData.coopAccounts || [];
            ST_LOANS.archived = loanData.archived || [];
            // Monthly paid-marks (Item 3): restore so a confirmed month survives reload + new device.
            if (loanData.confirmed) ST_LOANS.confirmed = loanData.confirmed;
            /* The counters live on this device only, while the facilities come back from the
               server: number past what is in use, and renumber anything that arrived twice. */
            try { if (typeof window.lnRepairFacilityIds === 'function') window.lnRepairFacilityIds(ST_LOANS); } catch (e) {}
            // Loan->asset link (Item 2): resolve the stored asset UUID back to the
            // asset's current local id (assets were applied just above).
            if (window.ST_ASSETS && ST_ASSETS.assets) {
              var _byUuid = {};
              ST_ASSETS.assets.forEach(function (a) { if (a._aiId) _byUuid[a._aiId] = a.id; });
              ST_LOANS.loans.concat(ST_LOANS.archived || []).forEach(function (l) {
                if (l._assetUuid && _byUuid[l._assetUuid] != null) l.assetId = _byUuid[l._assetUuid];
              });
            }
          }
        } catch (e) { console.error('Loan hydrate failed:', e); }
      }).catch(function (e) { console.error('Asset/loan load failed:', e); });
    }).then(function () {
      // Cross-device persistence: load every relational module from the backend so a
      // farmer signing in on a new device sees ALL their data, not demo defaults.
      // Each module applies independently (its own try/catch) so one failure can't
      // break the others. Skipped for brand-new farms (nothing saved yet).
      if (isNewFarm) return;
      var fid = AI.farm.active();
      /* Send what this device never got to send BEFORE loading over it. After financeCore,
         so the column probes have run and a settings catch-up sends every column. */
      /* -400: each read was started early by AI.load.prefetch where that was safe; take() hands it over,
         or reads now if the area had something unsent or was written to since. */
      var _tk = function (n) { try { return Promise.resolve(AI.load.take ? AI.load.take(n, fid) : AI.load[n](fid)); } catch (e) { return Promise.reject(e); } };
      return Promise.all([
        _tk('livestock').catch(function (e) { console.error('livestock load', e); return null; }),
        _tk('crops').catch(function (e) { console.error('crops load', e); return null; }),
        _tk('orchard').catch(function (e) { console.error('orchard load', e); return null; }),
        _tk('plan').catch(function (e) { console.error('plan load', e); return null; }),
        _tk('workers').catch(function (e) { console.error('workers load', e); return null; }),
        _tk('profile').catch(function (e) { console.error('profile load', e); return null; }),
        _tk('coopSettlements').catch(function (e) { console.error('coop load', e); return null; }),
        /* Filing rules. Never fatal: an older project has no category_rules table,
           and load.rules answers null rather than throwing. */
        _tk('rules').catch(function (e) { console.error('rules load', e); return null; }),
        /* The rain book. Never fatal: an older project has no rainfall tables. */
        (AI.load.rainfall ? _tk('rainfall').catch(function () { return null; }) : Promise.resolve(null)),
        /* -421: the phone's HMRC marks (farm_documents FILING rows). Never fatal. */
        (AI.load.documents ? _tk('documents').catch(function (e) { console.error('documents load', e); return null; }) : Promise.resolve(null))
      ]).then(function (r) {
        var ls = r[0], cr = r[1], orc = r[2], pl = r[3], wk = r[4], pf = r[5], coop = r[6], rl = r[7], rn = r[8];
        try { if (window.ST && Array.isArray(r[9]) && typeof window.ukPhoneDocsApply === 'function') window.ukPhoneDocsApply(r[9]); } catch (e) { console.error('documents apply', e); }   /* -421 */
        /* Never load over an area that still has something unsent on this device. */
        var _unsent = function (a) { try { return !!(AI.sync && AI.sync.isUnsent(a)); } catch (e) { return false; } };
        try { if (window.ST_LS && ls && !_unsent('livestock')) { var _lsHas = ((ls.herds&&ls.herds.length)||(ls.fields&&ls.fields.length)||(ls.animals&&ls.animals.length)); var _lsLoc = ((ST_LS.herd&&ST_LS.herd.length)||(ST_LS.fields&&ST_LS.fields.length)); if (_lsHas || !_lsLoc) { ST_LS.fields = ls.fields || []; ST_LS.herd = ls.herds || []; if (ls.benchmarks) ST_LS.benchmarks = ls.benchmarks; ST_LS.moves = ls.moves || []; ST_LS.treatments = ls.treatments || []; ST_LS.removedTreatments = ls.removedTreatments || []; ST_LS.animals = ls.animals || []; ST_LS.health = ls.health || []; ST_LS.breedings = ls.breedings || []; /* Herds whose stored count did not yet include a move recorded elsewhere - the phone at a gate, or another computer (UK phone, phase 3). load.livestock has folded them in; this is what the farmer is told on the Dashboard. Never saved to localStorage. */ ST_LS._stockRecon = (ls.stockRecon && ls.stockRecon.length) ? ls.stockRecon : null; /* Animals a phone sale or death took off by ear tag: already off the list above; their rows go from the server too, as the desktop's own "Which animals left?" does. */ if (ls.animalsOff && ls.animalsOff.length && AI.livestock && AI.livestock.removeAnimal) { ls.animalsOff.forEach(function (id) { AI.livestock.removeAnimal(id).catch(function (e) { console.error('animal off', e); }); }); } } } } catch (e) { console.error('livestock apply', e); }
        try { if (window.ST_CROP && cr && !_unsent('crops')) { var _crHas = ((cr.lands&&cr.lands.length)||(cr.events&&cr.events.length)||(cr.inputs&&cr.inputs.length)); var _crLoc = ((ST_CROP.lands&&ST_CROP.lands.length)||(ST_CROP.events&&ST_CROP.events.length)); if (_crHas || !_crLoc) { ST_CROP.lands = cr.lands || []; ST_CROP.events = cr.events || []; ST_CROP.inputs = cr.inputs || []; ST_CROP.removed = cr.removed || []; if (cr.season) ST_CROP.season = cr.season; if (cr.compliance) ST_CROP.compliance = cr.compliance; } } } catch (e) { console.error('crops apply', e); }
        try { if (window.ST_FRUIT && orc && !_unsent('orchard')) { var _orcHas = (orc.blocks && orc.blocks.length); var _locHas = (ST_FRUIT.blocks && ST_FRUIT.blocks.length); if (_orcHas || !_locHas) { _obKeepLocal(orc.blocks, ST_FRUIT.blocks); ST_FRUIT.blocks = orc.blocks || []; ST_FRUIT.pricing = orc.pricing || {}; ST_FRUIT.sprayDiary = orc.sprayDiary || {}; ST_FRUIT.removedSprays = orc.removedSprays || []; ST_FRUIT.harvest = orc.harvest || []; ST_FRUIT.removedHarvest = orc.removedHarvest || []; if (orc.comply) ST_FRUIT.comply = orc.comply; try{ if(window.orComplyEnsure) orComplyEnsure(); }catch(_){} if (orc.market) ST_FRUIT.market = orc.market; if (typeof window.orRebuildPhi === 'function') { try { window.orRebuildPhi(); } catch (_) {} } } } } catch (e) { console.error('orchard apply', e); }
        try { if (window.ST_PLAN && !_unsent('plan')) { var _plHas = (pl && ((pl.crops&&pl.crops.length)||(pl.events&&pl.events.length))); var _plLoc = ((ST_PLAN.crops&&ST_PLAN.crops.length)||(ST_PLAN.events&&ST_PLAN.events.length)); if (pl && (_plHas || !_plLoc)) { ST_PLAN.crops = pl.crops || []; ST_PLAN.events = pl.events || []; ST_PLAN.fromBackend = true; if (typeof window.planSyncToCurrentYear === 'function') { try { window.planSyncToCurrentYear(); } catch (_) {} } } else if (!pl && typeof window.cropInitialPlanSync === 'function') { try { window.cropInitialPlanSync(true); } catch (_) {} } } } catch (e) { console.error('plan apply', e); }
        try { if (window.ST_WORK && wk && !_unsent('workers')) { var _wkHas = (wk.workers && wk.workers.length); var _wkLoc = (ST_WORK.workers && ST_WORK.workers.length); if (_wkHas || !_wkLoc) { ST_WORK.workers = wk.workers || []; if (wk.settingsRow && AI.workers && AI.workers.apply) { AI.workers.apply(ST_WORK, wk.settingsRow); } if (wk.payroll) { ST_WORK.paye = wk.payroll.paye || {}; ST_WORK.bonus = wk.payroll.bonus || {}; ST_WORK.extra = wk.payroll.extra || {}; ST_WORK.seasonal = wk.payroll.seasonal || {}; } ST_WORK.payRuns = wk.payRuns || []; } } } catch (e) { console.error('workers apply', e); }
        /* -414: vatCategory arrives only from farms.vat_category (behind its probe); without the column it is absent and this device's stagger stays */
        try { if (window.ST && pf && !_unsent('settings')) { Object.keys(pf).forEach(function (k) { if (k.charAt(0) !== '_' && pf[k] != null) ST[k] = pf[k]; }); } } catch (e) { console.error('profile apply', e); }
        /* Rainfall. Where the farm is and how it keeps its book ride on the farm row;
           the server's copy wins unless this device has settings still to send. */
        try {
          if (window.ST_RAIN && pf && pf._rain && !_unsent('settings')) {
            var _rp = pf._rain.prefs || null, _rl = pf._rain.loc || null;
            var _moved = _rl && (!ST_RAIN.loc || ST_RAIN.loc.lat !== _rl.lat || ST_RAIN.loc.lon !== _rl.lon);
            if (_rl) ST_RAIN.loc = _rl;
            if (_moved) { ST_RAIN.normal = ST_RAIN.normal && ST_RAIN.normal.override ? { monthly: null, override: ST_RAIN.normal.override } : null; ST_RAIN.sat = null; ST_RAIN.ea = null; ST_RAIN.nvzMap = null; ST_RAIN.fc = null; }
            if (_rp) {
              if (_rp.mode) ST_RAIN.mode = _rp.mode;
              if (_rp.yearStart) ST_RAIN.yearStart = _rp.yearStart;
              if (_rp.normalOverride) { ST_RAIN.normal = ST_RAIN.normal || { monthly: null }; ST_RAIN.normal.override = _rp.normalOverride; }
              if (Array.isArray(_rp.notKept)) ST_RAIN.notKept = _rp.notKept;
              if (_rp.fillSet) { ST_RAIN.fillFromSat = _rp.fillFromSat !== false; ST_RAIN.fillSet = true; }
              if (typeof _rp.conv09 === 'boolean') ST_RAIN.conv09 = _rp.conv09;
              if (_rp.soils) ST_RAIN.soils = _rp.soils;
              if (_rp.nvz === true || _rp.nvz === false) ST_RAIN.nvz = _rp.nvz;
              if (_rp.fitMm || _rp.fitDays) ST_RAIN.rule = { fitMm: _rp.fitMm || 20, fitDays: _rp.fitDays || 7, set: true };
              /* A cleared figure travels too: the key is always sent, null included. */
              if ('drillDays' in _rp || 'drillContractor' in _rp) { ST_RAIN.drillDays = _rp.drillDays || null; ST_RAIN.drillContractor = !!_rp.drillContractor; }
              if (_rp.land) ST_RAIN.land = _rp.land;
              if (_rp.fieldLimits && typeof _rp.fieldLimits === 'object') ST_RAIN.fieldLimits = _rp.fieldLimits;
              if (_rp.wetSeen) ST_RAIN.wetSeen = _rp.wetSeen;
            }
            ST_RAIN.prefsSet = true;   /* now this device holds the farm's answer, and may send it back */
          }
        } catch (e) { console.error('rainfall settings hydrate', e); }
        /* The book: merged by id, so a second computer gets the first one's readings
           and keeps its own. A reading's id is its gauge and day, so the same morning
           can never arrive twice. Nothing is taken while this device has rain unsent. */
        try {
          if (window.ST_RAIN && rn && !_unsent('rain')) {
            var _byId = {}, _gById = {}, _add = 0;
            (ST_RAIN.log = ST_RAIN.log || []).forEach(function (x) { if (x && x.id) _byId[x.id] = x; });
            /* A reading removed here and not yet removed there is never taken back. */
            var _gone = {}; (ST_RAIN.gone || []).forEach(function (id) { _gone[String(id)] = 1; });
            (rn.log || []).forEach(function (x) { if (!x || !x.id || _gone[String(x.id)]) return; if (_byId[x.id]) { for (var k in x) _byId[x.id][k] = x[k]; } else { ST_RAIN.log.push(x); _add++; } });
            (ST_RAIN.gauges = ST_RAIN.gauges || []).forEach(function (g) { if (g && g.id) _gById[g.id] = g; });
            var _gGone = {}; (ST_RAIN.goneGauges || []).forEach(function (id) { _gGone[String(id)] = 1; });
            (rn.gauges || []).forEach(function (g) { if (g && g.id && !_gById[g.id] && !_gGone[String(g.id)]) ST_RAIN.gauges.push(g); });
            /* The housing log, merged the same way; one removed here is never taken back. */
            if (Array.isArray(rn.housing)) {
              var _hById = {}, _hGone = {};
              (ST_RAIN.housing = ST_RAIN.housing || []).forEach(function (x) { if (x && x.id) _hById[x.id] = x; });
              (ST_RAIN.goneHousing || []).forEach(function (id) { _hGone[String(id)] = 1; });
              rn.housing.forEach(function (x) { if (!x || !x.id || _hGone[String(x.id)]) return; if (_hById[x.id]) { for (var k in x) _hById[x.id][k] = x[k]; } else ST_RAIN.housing.push(x); });
            }
            try { if (typeof rnRepairGaugeIds === 'function') rnRepairGaugeIds(); } catch (e2) {}
            if (typeof rnSync === 'function') { try { rnSync(); } catch (e3) {} }
            if (typeof renderRainfall === 'function' && document.getElementById('pg-rainfall')) { try { renderRainfall(); } catch (e4) {} }
            if (typeof rnDashSync === 'function') { try { rnDashSync(); } catch (e5) {} }
          }
        } catch (e) { console.error('rainfall hydrate', e); }
        /* Mirror the identity onto FARM, which is what the reports, statements and tax
           screens actually read. This line used to carry FARM.name alone, so a farmer
           signing in on a second device got their farm's NAME back and nothing else:
           FARM.vat stayed false and the Tax screen reported "not registered for VAT"
           to a VAT-registered farm. syncFarmFromST derives all six fields from ST,
           which pf has just been applied to, so it is correct whether the profile came
           from the server, from localStorage, or was never saved at all. */
        try { if (typeof window.syncFarmFromST === 'function') window.syncFarmFromST(); } catch (e) { console.error('farm identity apply', e); }
        /* And repaint the header. syncTopbarFarm runs once at boot, before sign-in has
           loaded anything, so the farm chip kept the "My Farm" name that create_farm()
           gives a brand-new farm until the next reload. */
        try { if (typeof window.syncTopbarFarm === 'function') window.syncTopbarFarm(); } catch (e) {}
        /* Guarded like the rest (-411): a settlement import this device has not sent
           must not be replaced by the server's copy without it. */
        try { if (window.ST && Array.isArray(coop) && !_unsent('coop')) ST.coopSettlements = coop; } catch (e) { console.error('coop apply', e); }
        /* Filing rules. null means the table is not there, so the device keeps its
           own - only an actual array replaces them. Before this the rules never
           left the machine that made them. */
        try { if (window.ST && Array.isArray(rl) && !_unsent('rules')) ST.catRules = rl; } catch (e) { console.error('rules apply', e); }
        try { if (typeof window.saveState === 'function') window.saveState(); } catch (e) {}
      }).catch(function (e) { console.error('Relational hydrate failed:', e); });
    }).then(function () {
      /* Signed-in users skip the app's first-run onboarding wizard — UNLESS they have
         never been through it. This step used to hide the wizard unconditionally, which
         was right when every account was provisioned by hand (the farm was already set
         up for them). With self-serve sign-up it meant no farmer ever saw onboarding:
         it ran a moment after aiShowOnboarding() and closed it again, so they landed on
         the dashboard with no farm name, no farm type and — the serious part — no POPIA
         consent ever recorded. */
      try {
        if (!needOnboarding) {
          var ov = document.getElementById('ob-overlay');
          if (ov) ov.style.display = 'none';
        }
      } catch (e) {}
      /* -400 (D2): the data in memory is now this account's farm - stamp the saved copy with it, so the next open
         can show it straight away (and only to this account, on this farm). */
      try { window.__aiDataOwner = { uid: _sessionUid(), farm: AI.farm.active() }; if (typeof window.saveState === 'function') window.saveState(); } catch (e) {}
      try { window.__aiBootRenderDeferred = false; } catch (e) {}
      try {
        /* -400: figures already on screen are redrawn where the farmer is, not moved to the dashboard */
        if (typeof nav === 'function') nav((opts.silent || _revealed) && window.CURRENT_PAGE ? window.CURRENT_PAGE : 'dashboard');
        else if (typeof updateDashboardFigures === 'function') updateDashboardFigures();
      } catch (e) {}
      try {
        /* The first load has finished: saves that were waiting for it go now. */
        if (window.AI && AI.sync) AI.sync.open();
        if (typeof window.updateSyncIndicator === 'function') window.updateSyncIndicator();
        /* The load found copies left by the old replace-all doubling and is showing one of
           each: save those areas now, so the server drops the rest (-368). */
        if (window.AI && AI.load && AI.load.healed && Object.keys(AI.load.healed()).length && typeof window.flushRelationalToBackend === 'function') {
          try { console.warn('AgriInsights: clearing repeated copies from the server:', JSON.stringify(AI.load.healed())); } catch (_) {}
          window.flushRelationalToBackend();
        }
      } catch (e) {}
    });
  }

  // ---- boot: wait for DOM + AI, then check for an existing session ---------
  function start() {
    if (!window.AI) { msg('Backend not loaded (check ai-data-uk.js).', 'err'); return; }
    /* Guest/demo mode is checked FIRST. An earlier version of this guard returned
       before the demo hand-off below, so ?demo=1 left the sign-in overlay covering a
       fully-rendered app — the guard blocked the demo it was meant to preserve. */
    if (window.__AI_BACKEND_BLOCKED && !window.__AI_GUEST) {
      try {
        ['ai-tabs','ai-pane-in','ai-pane-up','ai-pane-reset','ai-pane-newpass','ai-pane-inbox','ai-pane-opening']
          .forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; });
        var sub=document.getElementById('ai-sub');
        if (sub) sub.textContent = 'Preview build — explore the demo farm';
        msg('Accounts are not open yet. Have a look around the demo farm.', 'ok');
      } catch (e) {}
      return;
    }
    // Run AFTER the app's own boot has populated ST (setTimeout defers past it).
    setTimeout(function () {
      // Guest demo mode (?demo=1 / ai_uk_guest flag): no login, no backend. Hide the sign-in
      // overlay and hand off to the app's guarded demo runtime. Never calls getSession /
      // signIn / setActive, so _hasBackend() stays false and nothing reaches Supabase.
      if (window.__AI_GUEST) {
        var od = document.getElementById('ai-auth'); if (od) od.style.display = 'none';
        try { if (typeof window.aiDemoStart === 'function') window.aiDemoStart(); } catch (e) {}
        return;
      }
      // Offline boot with a cached session: don't trap the user on a login they can't
      // complete offline — reveal their already-loaded local data.
      if (navigator.onLine === false && _hasPersistedSession()) { _offlineReveal(); return; }
      /* The confirmation link returns to this page with the session in the URL
         fragment. supabase-js is on the implicit flow with detectSessionInUrl,
         so it parses that itself — but the parse finishes asynchronously, after
         getSession() below may already have answered "no session". This listener
         is what actually lets a farmer through on the confirmation bounce, and
         enterApp()'s guard keeps it from racing the getSession path. */
      try {
        AI.init().auth.onAuthStateChange(function (evt, session) {
          if (!session) return;
          var ov = document.getElementById('ai-auth');
          if (!ov || ov.style.display === 'none') return;   // already inside the app
          /* A recovery session means "prove you can read this inbox", not "you are
             signed in" — send them to the new-password screen instead of the app. */
          if (evt === 'PASSWORD_RECOVERY' || RECOVERY) { RECOVERY = true; setMode('newpass'); return; }
          enterApp().catch(function () {});
        });
      } catch (e) {}
      /* -400 (5a + D2): this project's token is on the device - the farmer is signed in. Never show them
         the sign-in form while the farm opens; and if this device's saved copy is theirs, show it now. */
      var _tokUid = RECOVERY ? null : _sessionUid();
      if (_tokUid) { setMode('opening'); _scheduleReveal(_tokUid); }
      AI.init().auth.getSession().then(function (res) {
        var session = res && res.data ? res.data.session : null;
        if (session && RECOVERY) { _unreveal('newpass'); return; }
        if (session) {
          enterApp().catch(function (e) {
            if (_isOfflineErr(e) && _hasPersistedSession()) { _offlineReveal(); }
            // else: a genuine error — overlay stays for sign-in (enterApp put the form back)
          });
        } else if (_hasPersistedSession() && navigator.onLine === false) {
          // getSession couldn't confirm offline, but a cached token exists
          _offlineReveal();
        } else if (_revealed || AUTH_MODE === 'opening') {
          /* the token on the device no longer opens a session (signed out elsewhere, expired): sign in again */
          _unreveal('signin');
        }
        // else: no session — overlay stays visible for sign-in
      }).catch(function (e) {
        if (_hasPersistedSession() && _isOfflineErr(e)) { _offlineReveal(); }
        else if (_revealed || AUTH_MODE === 'opening') { _unreveal('signin'); }
        // else: overlay stays visible
      });
    }, 0);
  }

  // ---- Tier-1 cross-device: re-pull from the cloud when the app regains focus ----
  var _lastRefresh = 0, _refreshing = false;
  function refreshFromCloud(){
    if (window.__AI_GUEST) return;                                            // guest demo: never pull account data into the sandbox
    if (_refreshing) return;
    if (navigator.onLine === false) return;                                   // offline: outbox handles it
    if (!(window.AI && AI.farm && AI.farm.active()) || !_hasPersistedSession()) return;  // signed-in only
    var ae = document.activeElement;                                          // don't yank data mid-edit
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    try { if (document.querySelector('[id$="-bg"].on')) return; } catch(e){}  // a modal is open
    if (Date.now() - _lastRefresh < 20000) return;                           // debounce ~20s
    _refreshing = true; _lastRefresh = Date.now();
    try { if (window.flushTxnOutbox) window.flushTxnOutbox(); } catch(e){}    // push local writes first
    /* Push what is waiting, WAIT for it to land, and only then load. Loading while saves
       were still on their way copied the server's older copy over the farmer's change.
       hydrate() also sends anything an earlier session never sent, and never loads over an
       area that still has something unsent. Before the first load has finished nothing is
       pushed here: those saves wait for that load, and waiting on them would never end. */
    var pushes = [];
    try {
      if (!(AI.sync && !AI.sync.isOpen())) {
        if (AI.profile && window.ST) pushes.push(AI.profile.save(ST).catch(function(){}));
        if (AI.loans && window.ST_LOANS) pushes.push(AI.loans.saveAll(ST_LOANS).catch(function(){}));
        if (AI.livestock && window.ST_LS) pushes.push(AI.livestock.saveAll(ST_LS).catch(function(){}));
        if (AI.crop && window.ST_CROP) pushes.push(AI.crop.saveAll(ST_CROP).catch(function(){}));
        if (AI.orchard && window.ST_FRUIT) pushes.push(AI.orchard.saveAll(ST_FRUIT).catch(function(){}));
        if (AI.plan && window.ST_PLAN) pushes.push(AI.plan.saveAll(ST_PLAN).catch(function(){}));
        if (AI.workers && window.ST_WORK) pushes.push(AI.workers.saveAll(ST_WORK).catch(function(){}));
      }
    } catch(e){}
    Promise.all(pushes)
      .then(function(){ return (AI.sync && AI.sync.idle) ? AI.sync.idle(15000) : null; })
      .then(function(){ return hydrate({silent:true}); })
      .catch(function(){})
      .then(function(){ _refreshing = false; });
  }
  window.refreshFromCloud = refreshFromCloud;
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) refreshFromCloud(); });
  window.addEventListener('online', function(){ refreshFromCloud(); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { injectUI(); start(); });
  } else { injectUI(); start(); }
})();
