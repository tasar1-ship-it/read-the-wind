/* Read the Wind and Start Clean (Lukas) — reading, marking and export.
   Same reading engine as the 49er theory book, build of 14 September 2026,
   with the storage repairs of build 5 (25 September 2026) and, from build 6
   (4 October 2026), marking in every chapter of the one-file book.
   Everything is stored on this device. Nothing leaves it until Export. */
(function () {
  'use strict';

  // If this file is ever included twice on one page, every listener would be
  // attached twice and the walkthrough would speak each line twice. Run once.
  if (window.__lkbooted) return;
  window.__lkbooted = true;

  var D = window.BOOKDATA || { SRC: {}, WSRC: {}, BOOK: [] };
  var MK = 'lk.marks.v1';
  var PF = 'lk.prefs.v1';
  var SIZES = ['17px', '20px', '23px', '26px'];
  var THEMES = ['light', 'sepia', 'dark'];
  var THEME_LABEL = { light: 'Bright', sepia: 'Sepia', dark: 'Dark' };
  var EMAIL = 'tasar1@me.com';
  var NEEDS = ['An example', 'A picture', 'Say it more simply',
               'Tell me more', 'Something to try on the water'];

  // ------------------------------------------------------------- storage
  function readJSON(k, d) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }
    catch (e) { return d; }
  }
  function writeJSON(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('Could not save on this device'); return false; }
  }

  /* Build 5. Marks used to be read once when a page opened and the whole
     list written back on every change. A second tab, or a page Safari kept
     from before a swipe back, still held its old list and wrote it over the
     newer one, and the marks made in between were gone. Now every change
     reads the newest list first, and a list that cannot be read is parked
     under its own name instead of being written over. */
  var hold = false;                               // a damaged list could not be parked: write nothing
  function loadMarks() {
    var raw;
    try { raw = localStorage.getItem(MK); }
    catch (e) { return null; }                    // storage refused: keep what is in memory
    if (!raw) return [];
    try {
      var v = JSON.parse(raw);
      if (Array.isArray(v)) { hold = false; return v; }
    } catch (e) { /* damaged */ }
    hold = !park(raw);
    return [];
  }
  function park(raw) {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf(MK + '.damaged.') === 0 && localStorage.getItem(k) === raw) return true;
      }
      localStorage.setItem(MK + '.damaged.' + Date.now(), raw);
      return true;
    } catch (e) { return false; }
  }
  var marks = loadMarks() || [];
  function latest() {
    var cur = loadMarks();
    if (cur) marks = cur;
    return marks;
  }
  function mutate(fn) {
    latest();
    var r = fn(marks);
    saveMarks();
    return r;
  }
  /* An edit to a mark another tab has deleted puts it back with the edit,
     because the reader is looking at it and has just typed something. */
  function updateMark(id, patch, fallback) {
    return mutate(function (L) {
      var m = null;
      for (var i = 0; i < L.length; i++) if (L[i].id === id) { m = L[i]; break; }
      if (!m && fallback) { m = fallback; L.push(m); }
      if (m) for (var k in patch) if (patch.hasOwnProperty(k)) m[k] = patch[k];
      return m;
    });
  }
  /* What the page shows is compared with what storage holds now, so a change
     made in another tab, or before a swipe back, is drawn when the page is
     looked at again. */
  var drawn = null;
  function refresh() {
    latest();
    if (JSON.stringify(marks) === drawn) return;
    renderAll();
    showMarksPage();
  }
  window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });
  window.addEventListener('storage', function (e) { if (!e.key || e.key === MK) refresh(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });

  /* Best-effort storage can be cleared by Safari; persistent storage is not.
     The answer is recorded and shown on the Marks page, not assumed. */
  var persisted = null;
  if (navigator.storage && navigator.storage.persist) {
    (navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false))
      .then(function (already) { return already ? true : navigator.storage.persist(); })
      .then(function (ok) { persisted = !!ok; showMarksPage(); })
      .catch(function () { persisted = false; });
  }

  /* Inside another page (the claude.ai link), Safari gives the book storage
     that it throws away when it closes. Say so, rather than let marks vanish. */
  var framed = false;
  try { framed = window.self !== window.top; } catch (e) { framed = true; }
  var UA = navigator.userAgent || '';
  var webkit = /(CriOS|FxiOS|EdgiOS)/.test(UA) ||
    (/AppleWebKit/.test(UA) && !/(Chrome|Chromium|Edg|OPR|Android)\//.test(UA));
  var fragile = framed && webkit;
  var BROWSER = /(CriOS|FxiOS|EdgiOS)/.test(UA) || !webkit ? 'This browser' : 'Safari';
  /* opened from the Home Screen icon */
  var standalone = navigator.standalone === true ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  var HERE = /iPhone|Android.+Mobile/.test(UA) ? 'this phone' :
    (/iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)) ? 'this iPad' :
    'this computer';

  var prefs = readJSON(PF, {});
  if (prefs.size == null) prefs.size = 1;
  if (!prefs.theme) {
    // follow the iPad's own appearance until the reader chooses otherwise
    prefs.theme = (window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  /* saved says whether the last change reached storage, so the reader is
     told the truth instead of a cheerful toast over a failed write */
  var saved = true;
  function saveMarks() {
    if (hold) { saved = false; return false; }
    try { localStorage.setItem(MK, JSON.stringify(marks)); saved = true; }
    catch (e) { saved = false; }
    return saved;
  }
  function said(msg) {
    toast(saved ? msg : hold ? 'Not saved: marks cannot be saved here right now'
                             : 'Not saved: this device refused to store it');
  }
  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --------------------------------------------------------------- prefs
  function applyPrefs() {
    document.documentElement.style.setProperty('--fs', SIZES[prefs.size] || SIZES[1]);
    THEMES.forEach(function (t) { document.body.classList.remove('t-' + t); });
    document.body.classList.add('t-' + (prefs.theme || 'light'));
    var mb = document.getElementById('btn-mode');
    if (mb) mb.textContent = prefs.theme === 'dark' ? 'Bright' : 'Dark';
  }
  applyPrefs();

  // --------------------------------------------------------------- chrome
  var toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  var toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 1900);
  }

  var scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = '<div class="sheet"></div>';
  document.body.appendChild(scrim);
  var sheet = scrim.firstChild;
  scrim.addEventListener('click', function (e) { if (e.target === scrim) closeSheet(); });

  function openSheet(html) {
    sheet.innerHTML = html;
    scrim.classList.add('on');
    sheet.scrollTop = 0;
  }
  function closeSheet() { scrim.classList.remove('on'); sheet.innerHTML = ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------------------------------------------------- reading settings
  function readingSheet() {
    openSheet(
      '<h3>Reading</h3><p class="meta">Applies on this device only.</p>' +
      '<div class="setrow"><span>Text size</span><div class="seg" id="seg-size">' +
      SIZES.map(function (s, i) {
        return '<button data-i="' + i + '" aria-pressed="' + (prefs.size === i) +
          '" style="font-size:' + (12 + i * 2) + 'px">A</button>';
      }).join('') + '</div></div>' +
      '<div class="setrow"><span>Background</span><div class="seg" id="seg-theme">' +
      THEMES.map(function (t) {
        return '<button data-t="' + t + '" aria-pressed="' + (prefs.theme === t) + '">' +
          THEME_LABEL[t] + '</button>';
      }).join('') + '</div></div>' +
      voiceControl() +
      '<div class="row"><button class="btn btn-p" data-close="1">Done</button></div>');

    var sel = sheet.querySelector('#sel-voice');
    if (sel) sel.addEventListener('change', function () {
      prefs.voice = sel.value || '';
      writeJSON(PF, prefs);
      sampleVoice();
    });

    sheet.querySelector('#seg-size').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      prefs.size = +b.dataset.i; writeJSON(PF, prefs); applyPrefs(); readingSheet();
    });
    sheet.querySelector('#seg-theme').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      prefs.theme = b.dataset.t; writeJSON(PF, prefs); applyPrefs(); readingSheet();
    });
  }

  function voiceControl() {
    if (!('speechSynthesis' in window)) return '';
    var vs = spokenVoices().slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    if (!vs.length) {
      return '<label>Voice for the walkthrough</label>' +
        '<p class="meta">No voices have loaded yet. Press Click Me once, then come back here.</p>';
    }
    var best = pickVoice();
    var opts = '<option value="">Best available (' + esc(best ? best.name : 'default') + ')</option>' +
      vs.map(function (v) {
        return '<option value="' + esc(v.voiceURI) + '"' +
          (prefs.voice === v.voiceURI ? ' selected' : '') + '>' +
          esc(v.name) + ' (' + esc(v.lang) + ')</option>';
      }).join('');
    return '<label for="sel-voice">Voice for the walkthrough</label>' +
      '<select id="sel-voice">' + opts + '</select>' +
      '<p class="meta">A woman\'s voice, so the male voices are left out of this list. ' +
      'Pick one and it speaks a line so you can hear it. For a much ' +
      'better voice, download an Enhanced or Premium English voice on this iPad under ' +
      'Settings, Accessibility, Spoken Content, Voices, then come back here.</p>';
  }

  // ------------------------------------------------------------ tag cards
  function tagSheet(kind, n) {
    var rec, title, sub;
    if (kind === 's') {
      rec = D.SRC[n];
      title = 'Source S' + n;
      sub = 'Checked against the source on 21 September 2026.';
    } else {
      var key = document.querySelector('article') &&
        document.querySelector('article').dataset.key;
      var txt = D.WSRC[key] && D.WSRC[key][n];
      rec = txt ? { t: txt.replace(/\s*https?:\/\/\S+\s*$/, ''), u: (txt.match(/https?:\/\/\S+/g) || []) } : null;
      title = 'Source W' + n;
      sub = 'Fetched while this chapter was written.';
    }
    if (!rec) { toast('No entry for that tag'); return; }
    var urls = (rec.u || []).map(function (u) {
      return '<a class="su" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a>';
    }).join('');
    openSheet(
      '<h3>' + esc(title) + '</h3><p class="meta">' + esc(sub) + '</p>' +
      '<p>' + esc(rec.t) + '</p>' + urls +
      '<div class="row">' +
      '<button class="btn btn-p" data-close="1">Close</button></div>');
  }

  /* ------------------------------------------------- explanation panels */
  function paras(t) {
    return String(t || '').split('\n').filter(function (s) { return s.trim(); })
      .map(function (s) { return '<p>' + esc(s.trim()) + '</p>'; }).join('');
  }

  function panelSheet(kind, id, el) {
    var rec = kind === 'g' ? (D.GLOSS || {})[id] : (D.LOCAL || {})[id];
    if (!rec) { toast('That explanation is missing'); return; }
    var sec = el && el.closest('[data-sec]');
    var secnum = sec ? sec.dataset.sec : (rec.s || '');
    openSheet(
      '<h3>' + esc(rec.t) + '</h3>' +
      '<p class="meta">' + (kind === 'g' ? 'What this means' : 'Why this works') +
      (secnum ? ' &middot; section ' + esc(secnum) : '') + '</p>' +
      paras(rec.b) +
      '<div class="row">' +
      '<button class="btn" id="pn-ask">Still not clear</button>' +
      (kind === 'g' ? '<a class="btn" href="glossary.html#' + esc(id) + '">All terms</a>' : '') +
      '<button class="btn btn-p" data-close="1">Close</button></div>');
    var art = artOf(el);
    sheet.querySelector('#pn-ask').addEventListener('click', function () {
      askAboutPanel(rec.t, secnum, art);
    });
  }

  function askAboutPanel(title, secnum, art) {
    var pch = art ? art.dataset.ch : null, pkey = art ? art.dataset.key : null;
    openSheet(
      '<h3>Ask for a better explanation</h3>' +
      '<p class="meta">' + esc(title) + (secnum ? ' &middot; section ' + esc(secnum) : '') + '</p>' +
      '<label>What would help here?</label><div class="chips" id="pn-needs">' +
      NEEDS.map(function (n) {
        return '<button class="chip" data-n="' + esc(n) + '" aria-pressed="false">' + esc(n) + '</button>';
      }).join('') + '</div>' +
      '<label>Anything more specific</label>' +
      '<textarea id="pn-t" placeholder="Optional. Say which part does not land."></textarea>' +
      '<div class="row"><button class="btn" data-close="1">Cancel</button>' +
      '<button class="btn" id="pn-ok">Save</button>' +
      '<button class="btn btn-p" id="pn-send">Save and email</button></div>');

    var pneed = '';
    var pn = sheet.querySelector('#pn-needs');
    if (pn) pn.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      var on = c.getAttribute('aria-pressed') === 'true';
      Array.prototype.forEach.call(pn.querySelectorAll('.chip'), function (x) {
        x.setAttribute('aria-pressed', 'false');
      });
      c.setAttribute('aria-pressed', on ? 'false' : 'true');
      pneed = on ? '' : c.dataset.n;
    });

    function commitPanel() {
      var mk = {
        id: uid(), ch: pch, key: pkey, sec: secnum || pch, scope: 'panel',
        block: '', start: 0, end: 0, raw: '', quote: title,
        type: 'request', need: pneed || 'Explain it more simply',
        note: sheet.querySelector('#pn-t').value.trim(), ts: Date.now()
      };
      mutate(function (L) { L.push(mk); });
      renderAll(); closeSheet(); said('Request saved');
      return mk;
    }
    sheet.querySelector('#pn-ok').addEventListener('click', commitPanel);
    sheet.querySelector('#pn-send').addEventListener('click', function () {
      emailRequest(commitPanel());
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    var g = e.target.closest('.gl');
    if (g) { e.preventDefault(); panelSheet('g', g.dataset.g, g); return; }
    var lb = e.target.closest('.lmb');
    if (lb) { e.preventDefault(); panelSheet('l', lb.dataset.l, lb); return; }
    var t = e.target.closest('a.tg');
    if (t) {
      e.preventDefault();
      if (t.dataset.s) tagSheet('s', t.dataset.s);
      else if (t.dataset.w) tagSheet('w', t.dataset.w);
      return;
    }
    var m = e.target.closest('mark.hl');
    if (m) { e.preventDefault(); markSheet(m.dataset.id); }
  });

  var rb = document.getElementById('btn-read');
  if (rb) rb.addEventListener('click', readingSheet);
  var modeb = document.getElementById('btn-mode');
  if (modeb) modeb.addEventListener('click', function () {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    writeJSON(PF, prefs);
    applyPrefs();
  });
  var mb = document.getElementById('btn-marks');
  if (mb) mb.addEventListener('click', function () { location.href = 'marks.html'; });

  // ---------------------------------------------------------- page setup
  /* A page holds one chapter. The one-file book holds all of them in one
     document, so everything below works on whichever chapter the words,
     the mark or the button belongs to. */
  var articles = Array.prototype.slice.call(document.querySelectorAll('article.ch'));
  function artOf(el) { return el && el.closest ? el.closest('article.ch') : null; }
  function artFor(ch) {
    for (var i = 0; i < articles.length; i++) if (articles[i].dataset.ch === ch) return articles[i];
    return null;
  }

  // wrap tables so a wide appendix table scrolls rather than breaking the page
  Array.prototype.forEach.call(document.querySelectorAll('.wrap table'), function (tb) {
    if (tb.parentNode.classList.contains('tscroll')) return;
    var w = document.createElement('div');
    w.className = 'tscroll';
    tb.parentNode.insertBefore(w, tb);
    w.appendChild(tb);
  });

  // ------------------------------------------------------- text anchoring
  function blockText(el) {
    if (el._txt == null) el._txt = el.textContent;
    return el._txt;
  }

  function offsetIn(el, node, off) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n, total = 0;
    while ((n = walk.nextNode())) {
      if (n === node) return total + off;
      total += n.nodeValue.length;
    }
    return -1;
  }

  /* The readable quote for a range of the block's text, with the source-tag
     chips and the small why buttons left out, so an exported passage reads
     as the book reads. */
  function sliceClean(el, start, end) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n, pos = 0, out = '';
    while ((n = walk.nextNode())) {
      var len = n.nodeValue.length, a = pos, b = pos + len;
      pos = b;
      if (b <= start) continue;
      if (a >= end) break;
      if (n.parentNode && n.parentNode.closest && n.parentNode.closest('.tg, .lmb')) continue;
      out += n.nodeValue.slice(Math.max(0, start - a), Math.min(len, end - a));
    }
    return out.replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').trim();
  }

  function wrapRange(el, start, end, attrs) {
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var n, pos = 0, targets = [];
    while ((n = walk.nextNode())) {
      var len = n.nodeValue.length, a = pos, b = pos + len;
      if (b > start && a < end) {
        targets.push({ node: n, from: Math.max(0, start - a), to: Math.min(len, end - a) });
      }
      pos = b;
      if (pos >= end) break;
    }
    targets.forEach(function (t) {
      var node = t.node;
      if (t.to < node.nodeValue.length) node.splitText(t.to);
      if (t.from > 0) node = node.splitText(t.from);
      var m = document.createElement('mark');
      m.className = attrs.cls;
      m.dataset.id = attrs.id;
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
    });
    return targets.length > 0;
  }

  /* Where a marked passage sits now. The saved place first. If a later build
     has changed the paragraph or added one before it, the same words nearest
     the old place in the same paragraph. Failing that, a passage of a dozen
     letters or more is looked for in the same section, then in the chapter,
     and used only if it occurs there once. A mark that cannot be placed is
     still kept, and still listed on the Marks page. */
  function locate(mk, article) {
    var raw = mk.raw;
    if (typeof raw !== 'string' || !raw) return null;
    var el = null;
    try { el = article.querySelector('[data-b="' + cssq(mk.block) + '"]'); } catch (e) { /* odd name */ }
    if (el) {
      var full = blockText(el);
      if (full.slice(mk.start, mk.end) === raw) return { el: el, s: mk.start };
      var near = nearest(full, raw, +mk.start || 0);
      if (near >= 0) return { el: el, s: near };
    }
    if (raw.length < 12) return null;
    var blocks = Array.prototype.slice.call(article.querySelectorAll('[data-b]'));
    var sec = String(mk.block || '').split(':')[0];
    var inSec = blocks.filter(function (b) { return b.dataset.b.split(':')[0] === sec; });
    return only(inSec, raw) || only(blocks, raw);
  }
  function only(blocks, raw) {
    var hits = [];
    blocks.forEach(function (b) {
      var t = blockText(b), k = t.indexOf(raw);
      while (k >= 0 && hits.length < 2) { hits.push({ el: b, s: k }); k = t.indexOf(raw, k + 1); }
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function nearest(full, raw, at) {
    var best = -1, j = full.indexOf(raw);
    while (j >= 0) {
      if (best < 0 || Math.abs(j - at) < Math.abs(best - at)) best = j;
      j = full.indexOf(raw, j + 1);
    }
    return best;
  }

  function renderMark(mk) {
    var art = artFor(mk.ch);
    if (!art || mk.scope === 'chapter') return false;
    var at = locate(mk, art);
    if (!at) return false;
    var cls = 'hl' + (mk.note ? ' has-note' : '') + (mk.type === 'request' ? ' is-request' : '');
    return wrapRange(at.el, at.s, at.s + mk.raw.length, { cls: cls, id: mk.id });
  }

  function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function renderAll() {
    drawn = JSON.stringify(marks);
    if (!articles.length) return;
    articles.forEach(function (art) {
      Array.prototype.forEach.call(art.querySelectorAll('mark.hl'), function (m) {
        var p = m.parentNode;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
        p.normalize();
      });
    });
    var orphans = 0;
    marks.forEach(function (mk) {
      if (artFor(mk.ch) && mk.scope !== 'chapter' && mk.scope !== 'panel') {
        if (!renderMark(mk)) orphans++;
      }
    });
    if (orphans) console.warn(orphans + ' mark(s) could not be placed on this page');
    articles.forEach(function (art) {
      var btn = art.querySelector('.askbtn');
      if (!btn) return;
      var has = marks.some(function (m) { return m.ch === art.dataset.ch && m.scope === 'chapter'; });
      btn.classList.toggle('has', has);
      btn.querySelector('.askbtn-l').textContent = has ? 'Request sent to the list' : 'Request more detail';
    });
  }

  // ------------------------------------------------------ selection tool
  var tool = document.createElement('div');
  tool.className = 'seltool';
  tool.innerHTML = '<button data-a="highlight">Highlight</button>' +
                   '<button data-a="note">Note</button>' +
                   '<button data-a="request">Ask</button>' +
                   '<button data-a="copy">Copy</button>';
  document.body.appendChild(tool);

  var pending = null;

  function hideTool() { tool.classList.remove('on'); pending = null; }

  function onSelect() {
    if (!articles.length) return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideTool(); return; }
    var r = sel.getRangeAt(0);
    var host = r.commonAncestorContainer;
    if (host.nodeType === 3) host = host.parentNode;
    var block = host.closest('[data-b]');
    var art = artOf(block);
    if (!block || !art) { hideTool(); return; }

    var start = offsetIn(block, r.startContainer, r.startOffset);
    var end = offsetIn(block, r.endContainer, r.endOffset);
    if (start < 0 || end < 0 || end - start < 2) { hideTool(); return; }

    // snap to whole words, so an exported quote never begins or ends mid-word
    var txt = blockText(block), word = /[A-Za-z0-9À-ɏ'’-]/;
    while (start > 0 && word.test(txt.charAt(start - 1))) start--;
    while (end < txt.length && word.test(txt.charAt(end))) end++;

    var sec = block.closest('[data-sec]');
    pending = {
      ch: art.dataset.ch, key: art.dataset.key,
      block: block.dataset.b,
      sec: sec ? sec.dataset.sec : (block.dataset.b || '').split(':')[0],
      start: start, end: end,
      raw: txt.slice(start, end),
      quote: sliceClean(block, start, end)
    };

    var rect = r.getBoundingClientRect();
    tool.classList.add('on');
    var tw = tool.offsetWidth, th = tool.offsetHeight;
    var left = Math.min(Math.max(8, rect.left + rect.width / 2 - tw / 2), window.innerWidth - tw - 8);
    var top = rect.bottom + 10;
    if (top + th > window.innerHeight - 8) top = Math.max(8, rect.top - th - 10);
    tool.style.left = left + 'px';
    tool.style.top = top + 'px';
  }

  document.addEventListener('selectionchange', function () { setTimeout(onSelect, 10); });
  document.addEventListener('scroll', function () { if (pending) hideTool(); }, true);

  tool.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !pending) return;
    var a = b.dataset.a;
    var p = pending;
    if (a === 'copy') {
      copy(p.quote); hideTool(); window.getSelection().removeAllRanges(); return;
    }
    if (a === 'highlight') {
      addMark(p, 'highlight', '', '');
      hideTool(); window.getSelection().removeAllRanges(); return;
    }
    hideTool();
    window.getSelection().removeAllRanges();
    composeSheet(p, a);
  });

  function addMark(p, type, note, need) {
    var mk = {
      id: uid(), ch: p.ch, key: p.key, sec: p.sec, block: p.block,
      start: p.start, end: p.end, raw: p.raw, quote: p.quote,
      type: type, note: note || '', need: need || '', ts: Date.now()
    };
    mutate(function (L) { L.push(mk); });
    renderAll();
    said(type === 'request' ? 'Request saved' : type === 'note' ? 'Note saved' : 'Highlighted');
    return mk;
  }

  function composeSheet(p, type, existing) {
    var isReq = type === 'request';
    openSheet(
      '<h3>' + (isReq ? 'Ask for more detail' : 'Add a note') + '</h3>' +
      '<p class="meta">Section ' + esc(p.sec) + '</p>' +
      '<div class="quote">' + esc(p.quote) + '</div>' +
      (isReq ? '<label>What do you need here?</label><div class="chips" id="needs">' +
        NEEDS.map(function (n) {
          return '<button class="chip" data-n="' + esc(n) + '" aria-pressed="' +
            (existing && existing.need === n) + '">' + esc(n) + '</button>';
        }).join('') + '</div>' : '') +
      '<label>' + (isReq ? 'Anything more specific' : 'Your note') + '</label>' +
      '<textarea id="cmp-t" placeholder="' +
      (isReq ? 'Optional. What exactly is unclear?' : 'What you want to remember about this passage') +
      '">' + esc(existing ? existing.note : '') + '</textarea>' +
      '<div class="row">' +
      (existing ? '<button class="btn btn-d" id="cmp-del">Delete</button>' : '') +
      '<button class="btn" data-close="1">Cancel</button>' +
      '<button class="btn' + (isReq ? '' : ' btn-p') + '" id="cmp-ok">Save</button>' +
      (isReq ? '<button class="btn btn-p" id="cmp-send">Save and email</button>' : '') +
      '</div>');

    var need = existing ? existing.need : '';
    var needsEl = sheet.querySelector('#needs');
    if (needsEl) needsEl.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      var on = c.getAttribute('aria-pressed') === 'true';
      Array.prototype.forEach.call(needsEl.querySelectorAll('.chip'), function (x) {
        x.setAttribute('aria-pressed', 'false');
      });
      c.setAttribute('aria-pressed', on ? 'false' : 'true');
      need = on ? '' : c.dataset.n;
    });

    function commit() {
      var txt = sheet.querySelector('#cmp-t').value.trim();
      var mk;
      if (existing) {
        mk = updateMark(existing.id, { note: txt, need: need, ed: Date.now() }, existing);
        renderAll(); showMarksPage();
        said('Saved');
      } else {
        mk = addMark(p, type, txt, need);
      }
      closeSheet();
      return mk;
    }
    sheet.querySelector('#cmp-ok').addEventListener('click', commit);
    var send = sheet.querySelector('#cmp-send');
    if (send) send.addEventListener('click', function () { emailRequest(commit()); });
    var del = sheet.querySelector('#cmp-del');
    if (del) del.addEventListener('click', function () { removeMark(existing.id); closeSheet(); });
  }

  function removeMark(id) {
    mutate(function (L) {
      for (var i = L.length - 1; i >= 0; i--) if (L[i].id === id) L.splice(i, 1);
    });
    renderAll(); said('Removed');
    showMarksPage();
  }

  function markSheet(id) {
    var mk = latest().filter(function (m) { return m.id === id; })[0];
    if (!mk) { renderAll(); return; }             // deleted in another tab

    openSheet(
      '<h3>' + (mk.type === 'request' ? 'Your request' : mk.note ? 'Your note' : 'Highlight') + '</h3>' +
      '<p class="meta">Section ' + esc(mk.sec) + (mk.need ? ' &middot; ' + esc(mk.need) : '') + '</p>' +
      '<div class="quote">' + esc(mk.quote) + '</div>' +
      (mk.note ? '<p>' + esc(mk.note) + '</p>' : '') +
      '<div class="row">' +
      '<button class="btn btn-d" id="ms-del">Delete</button>' +
      '<button class="btn" id="ms-edit">' + (mk.type === 'request' ? 'Edit request' : 'Edit note') + '</button>' +
      (mk.type === 'request' ? '<button class="btn" id="ms-mail">Email it</button>' : '') +
      '<button class="btn btn-p" data-close="1">Close</button></div>');
    sheet.querySelector('#ms-del').addEventListener('click', function () { removeMark(id); closeSheet(); });
    var msm = sheet.querySelector('#ms-mail');
    if (msm) msm.addEventListener('click', function () { closeSheet(); emailRequest(mk); });
    sheet.querySelector('#ms-edit').addEventListener('click', function () {
      composeSheet(mk, mk.type === 'request' ? 'request' : 'note', mk);
    });
  }

  // -------------------------------------------------- chapter ask button
  Array.prototype.forEach.call(document.querySelectorAll('.askbtn'), function (askBtn) {
  askBtn.addEventListener('click', function () {
    var art = artOf(askBtn);
    var chNum = askBtn.dataset.ch, chKey = art ? art.dataset.key : askBtn.dataset.ch;
    var existing = latest().filter(function (m) {
      return m.ch === chNum && m.scope === 'chapter';
    })[0];
    var need = existing ? existing.need : '';
    openSheet(
      '<h3>Request more detail</h3>' +
      '<p class="meta">Chapter ' + esc(askBtn.dataset.ch) + '. ' + esc(askBtn.dataset.title) + '</p>' +
      '<label>What do you need in this chapter?</label><div class="chips" id="needs">' +
      NEEDS.map(function (n) {
        return '<button class="chip" data-n="' + esc(n) + '" aria-pressed="' +
          (need === n) + '">' + esc(n) + '</button>';
      }).join('') + '</div>' +
      '<label>Anything more specific</label>' +
      '<textarea id="cmp-t" placeholder="Which part of the chapter, and what is missing?">' +
      esc(existing ? existing.note : '') + '</textarea>' +
      '<div class="row">' +
      (existing ? '<button class="btn btn-d" id="cmp-del">Delete</button>' : '') +
      '<button class="btn" data-close="1">Cancel</button>' +
      '<button class="btn" id="cmp-ok">Save</button>' +
      '<button class="btn btn-p" id="cmp-send">Save and email</button></div>');

    var needsEl = sheet.querySelector('#needs');
    needsEl.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      var on = c.getAttribute('aria-pressed') === 'true';
      Array.prototype.forEach.call(needsEl.querySelectorAll('.chip'), function (x) {
        x.setAttribute('aria-pressed', 'false');
      });
      c.setAttribute('aria-pressed', on ? 'false' : 'true');
      need = on ? '' : c.dataset.n;
    });
    function commitChapter() {
      var txt = sheet.querySelector('#cmp-t').value.trim();
      var mk;
      if (existing) mk = updateMark(existing.id, { note: txt, need: need, ed: Date.now() }, existing);
      else {
        mk = {
          id: uid(), ch: chNum, key: chKey, sec: chNum, scope: 'chapter',
          block: '', start: 0, end: 0, raw: '', quote: '',
          type: 'request', note: txt, need: need, ts: Date.now()
        };
        mutate(function (L) { L.push(mk); });
      }
      renderAll(); closeSheet(); said('Request saved');
      return mk;
    }
    sheet.querySelector('#cmp-ok').addEventListener('click', commitChapter);
    sheet.querySelector('#cmp-send').addEventListener('click', function () {
      emailRequest(commitChapter());
    });
    var del = sheet.querySelector('#cmp-del');
    if (del) del.addEventListener('click', function () {
      if (existing) removeMark(existing.id);
      closeSheet();
    });
  });
  });

  // ----------------------------------------------------------- marks page
  function chTitle(ch) {
    var c = D.BOOK.filter(function (x) { return x.num === ch; })[0];
    return c ? c.num + '. ' + c.title : 'Chapter ' + ch;
  }
  function secTitle(ch, sec) {
    var c = D.BOOK.filter(function (x) { return x.num === ch; })[0];
    if (!c) return '';
    var s = c.sections.filter(function (x) { return x.num === sec; })[0];
    return s ? s.title : '';
  }
  function order() {
    var idx = {};
    D.BOOK.forEach(function (c, i) { idx[c.num] = i; });
    return marks.slice().sort(function (a, b) {
      var d = (idx[a.ch] == null ? 99 : idx[a.ch]) - (idx[b.ch] == null ? 99 : idx[b.ch]);
      if (d) return d;
      return String(a.sec).localeCompare(String(b.sec), undefined, { numeric: true }) ||
             a.ts - b.ts;
    });
  }

  function showMarksPage() { if (document.getElementById('mk-list')) renderMarksPage(); }

  function renderMarksPage() {
    var list = document.getElementById('mk-list');
    if (!list) return;
    latest();
    var st = document.getElementById('mk-state');
    if (st) st.innerHTML = backupState();
    var f = (document.getElementById('mk-filter') || {}).value || 'all';
    var rows = order().filter(function (m) { return f === 'all' || m.type === f; });
    if (!rows.length) {
      list.innerHTML = '<p class="empty">Nothing marked yet. Select any passage while ' +
        'reading to highlight it, add a note, or ask for more detail.</p>';
      return;
    }
    var out = [], lastCh = null;
    rows.forEach(function (m) {
      if (m.ch !== lastCh) {
        out.push('<h2 class="parth">' + esc(chTitle(m.ch)) + '</h2>');
        lastCh = m.ch;
      }
      var kind = m.type === 'request' ? 'request' : m.type === 'note' ? 'note' : 'highlight';
      var label = m.scope === 'chapter' ? 'Whole chapter' : 'Section ' + m.sec;
      out.push(
        '<div class="mk" data-id="' + esc(m.id) + '">' +
        '<div class="mk-h"><span class="mk-s">' + esc(label) + '</span>' +
        '<span class="mk-c">' + esc(secTitle(m.ch, m.sec)) + '</span>' +
        '<span class="mk-k ' + kind + '">' + esc(m.need || kind) + '</span></div>' +
        (m.quote ? '<div class="mk-q">' + esc(m.quote) + '</div>' : '') +
        (m.note ? '<p class="mk-n"><b>' +
          (m.type === 'request' ? 'Asked' : 'Note') + ':</b> ' + esc(m.note) + '</p>' : '') +
        '<div class="mk-a">' +
        '<a href="ch' + esc(m.key || m.ch) + '.html#' +
        (m.scope === 'chapter' ? '' : 'sec-' + String(m.sec).replace(/\./g, '-')) +
        '">Open in the book</a>' +
        '<button data-del="' + esc(m.id) + '">Delete</button>' +
        '</div></div>');
    });
    list.innerHTML = out.join('');
  }

  /* ----------------------------------------------------------- backup
     Build 5, after marks went missing. Back up puts a copy of every mark in
     the Files app. Put back reads that copy, or the text of any email sent
     with Email to Dad, since its last line is the same list. Putting back
     only adds: nothing already here is removed or replaced by an older copy. */
  var BK = 'lk.backup.v1';
  var BACKUP_KIND = 'Read the Wind marks';
  var MARKER = '--- machine-readable copy below, leave it in place ---';

  function backupJSON() {
    var o = {
      kind: BACKUP_KIND, v: 1, build: D.BUILD || '',
      saved: new Date().toISOString(), count: marks.length, marks: marks
    };
    var dmg = damagedList();
    if (dmg.length) o.damaged = dmg;              // unreadable old lists, kept for Dad
    return JSON.stringify(o, null, 1);
  }

  /* Only the fields the book writes, of the kinds it writes them. A pasted
     or hand-edited file cannot then hang a chapter or break the Marks page. */
  var TYPES = { highlight: 1, note: 1, request: 1 };
  function clean(m) {
    if (!m || typeof m !== 'object') return null;
    if (typeof m.id !== 'string' || !/^m[0-9a-z]{4,40}$/.test(m.id)) return null;   // as uid() makes them
    if (typeof m.type !== 'string' || !TYPES.hasOwnProperty(m.type)) return null;
    var scope = m.scope === 'chapter' || m.scope === 'panel' ? m.scope : undefined;
    var str = function (v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; };
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
    var out = {
      id: m.id, ch: str(m.ch, 8), key: str(m.key, 8), sec: str(m.sec, 12),
      block: str(m.block, 24), start: num(m.start), end: num(m.end),
      raw: str(m.raw, 4000), quote: str(m.quote, 4000),
      type: m.type, note: str(m.note, 4000), need: str(m.need, 80), ts: num(m.ts)
    };
    if (scope) out.scope = scope;
    else if (!out.raw) return null;               // a passage mark needs its words
    if (typeof m.ed === 'number' && isFinite(m.ed)) out.ed = m.ed;
    return out;
  }

  function mergeMarks(incoming) {
    var added = 0, updated = 0;
    mutate(function (L) {
      var at = Object.create(null);
      L.forEach(function (m, i) { at[m.id] = i; });
      incoming.forEach(function (x) {
        var m = clean(x);
        if (!m) return;
        var i = at[m.id];
        if (i == null) { at[m.id] = L.length; L.push(m); added++; }
        else if ((m.ed || m.ts || 0) > (L[i].ed || L[i].ts || 0)) { L[i] = m; updated++; }
      });
    });
    return { added: added, updated: updated, kept: marks.length };
  }

  /* A backup file, a bare list, or a whole pasted email thread. Every copy
     of the list in the text is read, since a reply thread quotes older ones,
     and all of them are merged. Mail can wrap the long line, quote it with >
     (once or several times) or add a signature under it; each of those is
     undone before a copy is given up. */
  function parseList(s) {
    var tries = [s, s.replace(/\r?\n/g, ''), s.replace(/\r?\n/g, ' ')];
    for (var n = 0; n < tries.length; n++) {
      try {
        var o = JSON.parse(tries[n]);
        if (Array.isArray(o)) return o;
        if (o && Array.isArray(o.marks)) return o.marks;
      } catch (e) { /* try the next shape */ }
    }
    return null;
  }
  function marksFromText(text) {
    var t = String(text || '').replace(/^[ \t]*(?:>[ \t]?)+/gm, '').trim();
    if (!t) return null;
    var whole = parseList(t);
    if (whole) return whole;
    var found = [], parts = t.split(MARKER);
    if (parts.length === 1) parts = ['', t.slice(Math.max(0, t.indexOf('[')))];
    for (var i = 1; i < parts.length; i++) {
      var seg = parts[i].trim(), list = null, k = seg.indexOf(']');
      while (k >= 0 && !list) {                   // the list ends at one of its ] signs
        list = parseList(seg.slice(0, k + 1));
        k = seg.indexOf(']', k + 1);
      }
      if (list) found = found.concat(list);
    }
    if (!found.length) {
      var j = t.indexOf('{');
      var o = j >= 0 ? parseList(t.slice(j)) : null;
      if (o) found = o;
    }
    return found.length ? found : null;
  }

  function shareFile(name, text, mime, done) {
    if (navigator.share) {
      var payload = { title: name, text: text };
      if (navigator.canShare && window.File) {
        try {
          var file = new File([text], name, { type: mime });
          if (navigator.canShare({ files: [file] })) payload = { files: [file], title: name };
        } catch (e) { /* fall through to text share */ }
      }
      navigator.share(payload).then(function () { if (done) done(); }, function (err) {
        if (err && err.name === 'AbortError') { toast('Not saved'); return; }
        cannotSave();
      });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    if (done) done();
  }

  /* Some copies of the book, such as the one inside the claude.ai page, are
     not allowed to save a file. The email to Dad carries the same list. */
  function cannotSave() {
    openSheet('<h3>This copy cannot save a file</h3>' +
      '<p>Press Email to Dad instead. The email carries all your marks, and Put back ' +
      'can read them from it later.</p>' +
      '<div class="row"><button class="btn" data-close="1">Close</button>' +
      '<button class="btn btn-p" id="cs-mail">Email to Dad</button></div>');
    sheet.querySelector('#cs-mail').addEventListener('click', function () {
      closeSheet(); mailAll();
    });
  }

  function noteBackup() {
    writeJSON(BK, { ts: Date.now(), n: marks.length });
    showMarksPage();
  }

  function damagedList() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf(MK + '.damaged.') === 0) out.push(localStorage.getItem(k));
      }
    } catch (e) { /* storage refused */ }
    return out;
  }

  function when(ts) {
    var days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    return 'on ' + new Date(ts).toLocaleDateString('en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function backupState() {
    var b = readJSON(BK, null), out = [];
    var since = marks.filter(function (m) { return !b || (m.ed || m.ts || 0) > b.ts; }).length;
    if (marks.length && !b) {
      out.push('<b>' + (marks.length === 1 ? 'This mark is' : 'These ' + marks.length + ' marks are') +
               ' only on ' + HERE + '.</b> Press Back up to keep a copy in the Files app.');
    } else if (marks.length && since) {
      out.push('<b>' + since + ' new mark' + (since === 1 ? '' : 's') + ' since your last backup</b> (' +
               when(b.ts) + '). Press Back up again.');
    } else if (marks.length) {
      out.push('Backed up ' + when(b.ts) + '. Nothing new since.');
    }
    if (fragile) {
      out.push('<span class="warn">' + BROWSER + ' forgets marks made in this copy of the book when it ' +
               'closes. Press Back up after reading. When the book is on your Home Screen, read it ' +
               'there and press Put back once.</span>');
    } else if (persisted === false && !standalone) {
      out.push('<span class="warn">' + BROWSER + ' has not promised to keep these marks. When the book ' +
               'is on your Home Screen, read it there, and press Put back once to bring these marks with you.</span>');
    } else if (persisted === false) {
      out.push('<span class="warn">' + BROWSER + ' has not promised to keep these marks. Back up after reading.</span>');
    }
    if (hold) {
      out.push('<span class="warn">Marks cannot be saved here right now. Tell Dad.</span>');
    } else if (damagedList().length) {
      out.push('<span class="warn">An older list of marks could not be read. It is kept safe and ' +
               'goes into every Back up. Tell Dad.</span>');
    }
    return out.join(' ');
  }

  function restoreSheet() {
    openSheet(
      '<h3>Put your marks back</h3>' +
      '<p class="meta">This only adds marks. Nothing already here is removed. A mark you deleted ' +
      'after that backup comes back too, so delete it again.</p>' +
      '<div class="row"><button class="btn btn-p" id="rs-file">Choose the backup file</button></div>' +
      '<label for="rs-t">Or paste an email you sent Dad</label>' +
      '<textarea id="rs-t" placeholder="Paste the whole email, with the long line at the bottom"></textarea>' +
      '<div class="row"><button class="btn" data-close="1">Cancel</button>' +
      '<button class="btn btn-p" id="rs-ok">Put them back</button></div>');
    sheet.querySelector('#rs-file').addEventListener('click', function () {
      var fi = document.getElementById('mk-file');
      closeSheet();
      if (fi) fi.click();
    });
    sheet.querySelector('#rs-ok').addEventListener('click', function () {
      applyRestore(sheet.querySelector('#rs-t').value);
    });
  }

  function applyRestore(text) {
    var incoming = marksFromText(text);
    if (!incoming) { toast('No marks found in that'); return; }
    var r = mergeMarks(incoming);
    closeSheet();
    renderAll();
    showMarksPage();
    said(r.added + r.updated === 0 ? 'Nothing new to put back' :
         r.added + ' put back' + (r.updated ? ', ' + r.updated + ' updated' : '') + ', ' + r.kept + ' in all');
  }

  function exportText() {
    var lines = ['Read the Wind book: marks and requests',
                 'Exported ' + new Date().toLocaleDateString('en-GB',
                   { day: 'numeric', month: 'long', year: 'numeric' }),
                 'Build ' + (D.BUILD || ''), ''];
    var lastCh = null;
    order().forEach(function (m) {
      if (m.ch !== lastCh) { lines.push('', '## ' + chTitle(m.ch), ''); lastCh = m.ch; }
      var head = m.scope === 'chapter' ? 'Whole chapter' : m.sec + ' ' + secTitle(m.ch, m.sec);
      lines.push(head + '  [' + (m.need || m.type).toUpperCase() + ']');
      if (m.quote) lines.push('    "' + m.quote + '"');
      if (m.note) lines.push('    ' + (m.type === 'request' ? 'Asked: ' : 'Note: ') + m.note);
      lines.push('');
    });
    lines.push('', '--- machine-readable copy below, leave it in place ---', '');
    lines.push(JSON.stringify(marks));
    return lines.join('\n');
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied'); },
        function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Copied'); }
    catch (e) { toast('Copy failed, select the text manually'); }
    document.body.removeChild(ta);
  }

  /* A page cannot send mail itself. These open the Mail app with everything
     written and addressed, so the reader taps send. Nothing is transmitted
     from the device by the page. */
  function openMail(subject, body) {
    var url = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) +
              '&body=' + encodeURIComponent(body);
    if (url.length > 1900) {
      copy(body);
      url = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' +
        encodeURIComponent('The full list is on the clipboard. Paste it here, then send.\n\n');
      toast('Too long for a mail link, so it is copied. Paste it in.');
    }
    window.location.href = url;
  }

  function requestBody(mk) {
    var L = ['Read the Wind book, question for Dad', ''];
    L.push('Chapter: ' + chTitle(mk.ch));
    if (mk.scope === 'chapter') L.push('Scope: the whole chapter');
    else L.push('Section: ' + mk.sec + ' ' + secTitle(mk.ch, mk.sec));
    if (mk.need) L.push('Needs: ' + mk.need);
    if (mk.quote) L.push('', 'Passage:', '"' + mk.quote + '"');
    if (mk.note) L.push('', 'Asked:', mk.note);
    L.push('', 'Build ' + (D.BUILD || ''));
    return L.join('\n');
  }

  function mailAll() {
    if (!latest().length) { toast('Nothing to email yet'); return; }
    var reqs = marks.filter(function (m) { return m.type === 'request'; }).length;
    openMail('Read the Wind book, ' + marks.length + ' marks and ' + reqs + ' questions',
             exportText());
  }

  function emailRequest(mk) {
    var where = mk.scope === 'chapter' ? 'chapter ' + mk.ch : 'section ' + mk.sec;
    openMail('Read the Wind book, question on ' + where, requestBody(mk));
  }

  if (document.body.dataset.page === 'marks') {
    renderMarksPage();
    var fl = document.getElementById('mk-filter');
    if (fl) fl.addEventListener('change', renderMarksPage);
    document.getElementById('mk-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]');
      if (b) removeMark(b.dataset.del);
    });
    var bk = document.getElementById('mk-backup');
    if (bk) bk.addEventListener('click', function () {
      if (!latest().length && !damagedList().length) { toast('Nothing to back up yet'); return; }
      var name = 'read-the-wind-marks-' + new Date().toISOString().slice(0, 10) + '.json';
      shareFile(name, backupJSON(), 'application/json', function () {
        noteBackup(); toast('Backed up');
      });
    });
    var rs = document.getElementById('mk-restore');
    if (rs) rs.addEventListener('click', restoreSheet);
    var fi = document.getElementById('mk-file');
    if (fi) fi.addEventListener('change', function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { applyRestore(r.result); fi.value = ''; };
      r.onerror = function () { toast('That file could not be read'); fi.value = ''; };
      r.readAsText(f);
    });
    document.getElementById('mk-copy').addEventListener('click', function () {
      if (!latest().length) { toast('Nothing to copy yet'); return; }
      copy(exportText());
    });
    document.getElementById('mk-email').addEventListener('click', mailAll);
    document.getElementById('mk-export').addEventListener('click', function () {
      if (!latest().length) { toast('Nothing to export yet'); return; }
      var text = exportText();
      var name = 'read-the-wind-marks-' + new Date().toISOString().slice(0, 10) + '.txt';
      if (navigator.share) {
        var payload = { title: 'Read the Wind marks', text: text };
        if (navigator.canShare && window.File) {
          try {
            var file = new File([text], name, { type: 'text/plain' });
            if (navigator.canShare({ files: [file] })) payload = { files: [file], title: name };
          } catch (e) { /* fall through to text share */ }
        }
        navigator.share(payload).then(noteBackup, function () { copy(text); });
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        noteBackup();
        toast('Exported');
      }
    });
  }

  /* ------------------------------------------------- spoken walkthrough
     Read aloud with the browser's own speech synthesis: no service, no key,
     works offline. Split into short utterances because iOS truncates long
     ones, and queued so each sentence starts the next. */
  var TOUR = [
    'Hello, Lukas. This is your book about starts and the upwind leg. Here is how it works. Six things.',
    'One. A word with a dotted line under it has an explanation behind it. Tap it and a small panel tells you what it means, and what the coach calls it in Spanish.',
    'Two. The small gold button that says why opens the reason behind an idea. Tap it when you want to know why, not only what.',
    'Three. The pictures move. Watch each one a few times. The wind arrow is always at the top, and the mark is always right under it.',
    'Four. Every section ends with On the water: one thing to try, and how you know you have got it.',
    'Five. Select any words with your finger and you can highlight them, write a note, ask a question, or copy them.',
    'Six. Everything you mark stays on this iPad or phone. Open Marks when you are ready and press Email to Dad. The email is already written, and you tap send. Press Back up there too, after reading, so a copy is kept safe.',
    'That is everything. Enjoy it, and see you on the water.'
  ];

  var speaking = false;

  /* Voice choice. The best-sounding iOS voices are the Enhanced and Premium
     ones, and they exist only if the reader has downloaded them under
     Settings, Accessibility, Spoken Content, Voices. Rank what is present and
     let the reader override it, because only they can hear the result. */
  var FEMALE = new RegExp('(Serena|Kate|Martha|Stephanie|Samantha|Karen|Moira|Tessa|' +
    'Fiona|Allison|Ava|Susan|Zoe|Nicky|Joelle|Catherine|Emily|Sara|Female)', 'i');
  var BETTER = /(Premium|Enhanced|Neural|Natural|Siri)/i;
  /* The walkthrough is read by a woman, so the male voices are taken out of the
     list altogether rather than ranked below the female ones: ranking loses if
     the list arrives late and the platform default speaks first. */
  var MALE = new RegExp('\\b(Aaron|Albert|Alex|Arthur|Bruce|Daniel|Eddy|Fred|Gordon|Grandpa|'
    + 'Jacques|Jamie|Junior|Lee|Nathan|Oliver|Ralph|Reed|Rishi|Rocko|Thomas|Tom|Xander|'
    + 'David|Mark|George|Ryan|Guy|Male|Man)\\b', 'i');

  function englishVoices() {
    var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    return vs.filter(function (v) { return /^en/i.test(v.lang); });
  }

  function spokenVoices() {
    var vs = englishVoices().filter(function (v) { return !MALE.test(v.name); });
    /* only if this iPad carries no female English voice at all */
    return vs.length ? vs : englishVoices();
  }

  /* iOS fills the voice list asynchronously, and until it does getVoices()
     returns nothing and the platform speaks in its own default voice, which is
     often male. That is why the first press sounded male and the second did
     not. Ask for the list early and keep asking. */
  function warmVoices() {
    if (!window.speechSynthesis) return;
    try { speechSynthesis.getVoices(); } catch (e) {}
  }

  function whenVoices(cb) {
    if (spokenVoices().length) { cb(); return; }
    warmVoices();
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (spokenVoices().length || tries > 15) { clearInterval(iv); cb(); }
    }, 60);
  }

  function voiceScore(v) {
    /* Naturalness first: the iPad's Siri and Premium voices are far easier to
       follow than the older compact ones, so they outrank a female name. */
    var s = 0;
    /* iOS names its Siri voices by number, so the name does not say whether
       the voice is a woman's. A named female Enhanced voice is preferred over
       an unnamed Siri one rather than the other way round. */
    if (/Siri/i.test(v.name)) s += (FEMALE.test(v.name) ? 220 : 40);
    else if (/Premium/i.test(v.name)) s += 170;
    else if (/(Enhanced|Neural|Natural)/i.test(v.name)) s += 150;
    if (FEMALE.test(v.name)) s += 90;
    if (/(Compact|eSpeak|Albert|Zarvox|Trinoids|Whisper|Bad News|Good News)/i.test(v.name)) s -= 400;
    if (/^en[-_]GB/i.test(v.lang)) s += 25;
    else if (/^en[-_](US|AU|IE|NZ|ZA)/i.test(v.lang)) s += 12;
    if (v.localService) s += 5;
    return s;
  }

  function pickVoice() {
    var vs = spokenVoices();
    if (!vs.length) return null;
    if (prefs.voice) {
      var chosen = vs.filter(function (v) { return v.voiceURI === prefs.voice; })[0];
      if (chosen) return chosen;
    }
    return vs.slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); })[0];
  }

  function sampleVoice() {
    if (!('speechSynthesis' in window)) return;
    try { speechSynthesis.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance('Hello, Lukas. This is your book about the upwind leg.');
    var v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-GB'; }
    speechSynthesis.speak(u);
  }

  if (window.speechSynthesis) {
    warmVoices();
    speechSynthesis.onvoiceschanged = warmVoices;
    window.addEventListener('load', warmVoices);
    document.addEventListener('pointerdown', warmVoices, true);
    document.addEventListener('touchstart', warmVoices, true);
  }

  var tourBtn = document.getElementById('btn-tour');

  function setTourBtn(on) {
    if (!tourBtn) return;
    tourBtn.classList.toggle('playing', on);
    tourBtn.querySelector('.tourbtn-l').textContent = on ? 'Stop' : 'Click Me';
    tourBtn.querySelector('.tourbtn-i').innerHTML = on ? '&#9632;' : '&#9654;';
  }

  function stopTour() {
    speaking = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    setTourBtn(false);
  }

  function startTour() {
    speaking = true;
    setTourBtn(true);
    var i = 0;
    function next() {
      if (!speaking || i >= TOUR.length) { stopTour(); return; }
      /* resolved per line, so a list that arrives late still corrects itself */
      var voice = pickVoice();
      var u = new SpeechSynthesisUtterance(TOUR[i++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'en-GB'; }
      u.rate = 0.92; u.pitch = 1; u.volume = 1;
      u.onend = next;
      u.onerror = function () { stopTour(); };
      speechSynthesis.speak(u);
    }
    if (spokenVoices().length) { next(); return; }
    /* A silent line spoken inside the press keeps iOS's gesture requirement
       satisfied and is itself what makes the list appear. */
    try {
      var warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      speechSynthesis.speak(warm);
    } catch (e) {}
    whenVoices(next);
  }

  if (tourBtn) tourBtn.addEventListener('click', function () {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      // no speech on this browser: show the same walkthrough as text instead
      openSheet('<h3>How this book works</h3>' +
        '<p class="meta">This browser cannot read aloud, so here it is in writing.</p>' +
        TOUR.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
        '<div class="row"><button class="btn btn-p" data-close="1">Close</button></div>');
      return;
    }
    if (speaking) { stopTour(); return; }
    startTour();
  });

  window.addEventListener('pagehide', function () { if (speaking) stopTour(); });

  /* The pictures move only while they are on the screen. A chapter holds
     dozens of small animations, and an iPad should not run the hidden ones. */
  if ('IntersectionObserver' in window) {
    var figio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var sv = en.target;
        if (!sv.pauseAnimations) return;
        try { if (en.isIntersecting) sv.unpauseAnimations(); else sv.pauseAnimations(); }
        catch (e) { /* a browser without SMIL control: the picture simply keeps moving */ }
      });
    }, { rootMargin: '150px 0px' });
    Array.prototype.forEach.call(document.querySelectorAll('figure.fig svg'), function (sv) { figio.observe(sv); });
  }

  /* the warning for the claude.ai copy, once per visit, under the top bar so
     every page and every view of the one-file book shows it */
  if (fragile) {
    var seen = false;
    try { seen = sessionStorage.getItem('lk.fragile.v1') === '1'; } catch (e) {}
    var bar = document.querySelector('header.bar');
    if (bar && !seen) {
      var fwrap = document.createElement('div');
      fwrap.className = 'wrap framewrap';
      fwrap.innerHTML = '<div class="framenote"><p><b>' + BROWSER + ' may forget your marks in this ' +
        'copy of the book.</b> Press Back up on the Marks page after reading. When the book is ' +
        'on your Home Screen, read it there and press Put back once.</p>' +
        '<button class="btn" type="button">OK</button></div>';
      bar.parentNode.insertBefore(fwrap, bar.nextSibling);
      fwrap.querySelector('button').addEventListener('click', function () {
        try { sessionStorage.setItem('lk.fragile.v1', '1'); } catch (e) {}
        if (fwrap.parentNode) fwrap.parentNode.removeChild(fwrap);
      });
    }
  }

  renderAll();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline is optional */ });
    });
  }
})();
