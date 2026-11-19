'use strict';
/*
 * editor-core.js  (no dependencies)
 *
 * Shared by build-editor.js (creates editor.html) and apply-changes.js (writes the client's changes back).
 * It reads the site's HTML files, finds every piece of editable text, gives each one a stable key,
 * and knows the exact character range of that text inside the file so it can be replaced safely.
 */
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ settings */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style', 'textarea']);
const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 'span', 'small', 'sup', 'sub', 'abbr', 'mark', 'code', 's']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'head', 'svg', 'iframe', 'select', 'option', 'textarea', 'input', 'img',
  'picture', 'source', 'video', 'audio', 'canvas', 'template', 'form-hidden']);
/* parts of the page that are driven by scripts or are not wording the client should touch */
const SKIP_CLASSES = ['footer-copyright', 'jg-hero-card', 'jg-hero-dots', 'jg-hero-arrow', 'jg-current-year', 'jg-preloader'];
const SKIP_IDS = ['jg-preloader'];
const CONTACT_HREF = /^(mailto:|tel:|https?:\/\/wa\.me)/i;
const SHARED_SECTIONS = new Set(['header', 'footer', 'cta']);

const PAGE_NAMES = {
  'index': ['home', 'Home'], 'about': ['about', 'About Us'], 'services': ['services', 'Services'],
  'areas-we-serve': ['areas', 'Areas We Serve'], 'projects': ['projects', 'Projects'], 'clients': ['clients', 'Clients'],
  'contact': ['contact', 'Contact'], 'careers': ['careers', 'Careers'], 'blog': ['blog', 'Blog'],
  'blog-building-plan-approval-mumbai': ['article', 'Blog Article'], '404': ['404', 'Page Not Found']
};
const PAGE_ORDER = ['index', 'about', 'services', 'areas-we-serve', 'projects', 'clients', 'contact', 'careers', 'blog',
  'blog-building-plan-approval-mumbai', '404'];

/* ------------------------------------------------------------------ entities */
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', rarr: '→',
  larr: '←', middot: '·', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', times: '×', deg: '°', euro: '€',
  pound: '£', rupee: '₹', sect: '§', para: '¶', check: '✓'
};
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (x) { return m; }
    }
    const v = NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}
function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}
function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ html parser (tolerant, keeps character offsets) */
function readOpenTag(src, i) {
  let j = i + 1;
  const nm = /^[a-zA-Z][^\s>\/]*/.exec(src.slice(j, j + 80));
  const tag = nm[0].toLowerCase();
  j += nm[0].length;
  const attrs = {};
  let selfClose = false;
  while (j < src.length) {
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === '>') { j++; break; }
    if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
    if (src[j] === '/') { j++; continue; }
    let k = j;
    while (k < src.length && !/[\s=>\/]/.test(src[k])) k++;
    if (k === j) { j++; continue; }
    const name = src.slice(j, k).toLowerCase();
    j = k;
    while (j < src.length && /\s/.test(src[j])) j++;
    let val = '';
    if (src[j] === '=') {
      j++;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '"' || src[j] === "'") {
        const q = src[j];
        const e = src.indexOf(q, j + 1);
        val = src.slice(j + 1, e === -1 ? src.length : e);
        j = e === -1 ? src.length : e + 1;
      } else {
        let k2 = j;
        while (k2 < src.length && !/[\s>]/.test(src[k2])) k2++;
        val = src.slice(j, k2);
        j = k2;
      }
    }
    attrs[name] = val;
  }
  return { tag, attrs, end: j, selfClose };
}

function parseHTML(src) {
  const root = { type: 'el', tag: '#root', attrs: {}, children: [], parent: null, openStart: 0, openEnd: 0, closeStart: src.length, closeEnd: src.length };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const n = src.length;
  let i = 0;
  const pushText = (a, b) => {
    if (b > a) top().children.push({ type: 'text', start: a, end: b, raw: src.slice(a, b), parent: top() });
  };
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { pushText(i, n); break; }
    if (lt > i) pushText(i, lt);
    i = lt;
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e === -1 ? n : e + 3; continue; }
    if (src[i + 1] === '!' || src[i + 1] === '?') { const e = src.indexOf('>', i); i = e === -1 ? n : e + 1; continue; }
    if (src[i + 1] === '/') {
      const m = /^<\/([a-zA-Z][^\s>\/]*)[^>]*>/.exec(src.slice(i, i + 300));
      if (!m) { pushText(i, i + 1); i++; continue; }
      const name = m[1].toLowerCase();
      let idx = -1;
      for (let s = stack.length - 1; s > 0; s--) if (stack[s].tag === name) { idx = s; break; }
      if (idx > 0) {
        stack[idx].closeStart = i; stack[idx].closeEnd = i + m[0].length;
        while (stack.length > idx) { const el = stack.pop(); if (el.closeStart === null) { el.closeStart = i; el.closeEnd = i; } }
      }
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(src[i + 1] || '')) {
      const t = readOpenTag(src, i);
      const el = { type: 'el', tag: t.tag, attrs: t.attrs, children: [], parent: top(), openStart: i, openEnd: t.end, closeStart: null, closeEnd: null };
      top().children.push(el);
      i = t.end;
      if (VOID.has(t.tag) || t.selfClose) { el.closeStart = el.closeEnd = t.end; el.isVoid = true; continue; }
      if (RAW_TEXT.has(t.tag)) {
        const re = new RegExp('</' + t.tag + '\\s*>', 'ig');
        re.lastIndex = i;
        const m = re.exec(src);
        const e = m ? m.index : n;
        if (e > i) el.children.push({ type: 'text', start: i, end: e, raw: src.slice(i, e), parent: el });
        el.closeStart = e; el.closeEnd = m ? e + m[0].length : n;
        i = el.closeEnd;
        continue;
      }
      stack.push(el);
      continue;
    }
    pushText(i, i + 1);
    i++;
  }
  while (stack.length > 1) { const el = stack.pop(); if (el.closeStart === null) { el.closeStart = n; el.closeEnd = n; } }
  return root;
}

/* ------------------------------------------------------------------ small helpers on the tree */
const isEl = (n) => n.type === 'el';
const isWs = (n) => n.type === 'text' && decodeEntities(n.raw).replace(/[ \t\r\n\f]+/g, '') === '';
function hasText(n) {
  if (n.type === 'text') return !isWs(n);
  return n.children.some(hasText);
}
const isVoidish = (n) => isEl(n) && n.tag !== 'br' && !hasText(n);
function classesOf(el) { return (el.attrs['class'] || '').split(/\s+/).filter(Boolean); }
function elEnd(n) { return n.type === 'text' ? n.end : n.closeEnd; }
function elStart(n) { return n.type === 'text' ? n.start : n.openStart; }

function inlineOnly(n) {
  if (n.type === 'text') return true;
  if (n.tag === 'br') return true;
  if (isVoidish(n)) return true;
  return INLINE.has(n.tag) && n.children.every(inlineOnly);
}

function shouldSkip(el) {
  if (SKIP_TAGS.has(el.tag)) return true;
  const cl = classesOf(el);
  if (cl.some((c) => SKIP_CLASSES.includes(c))) return true;
  if (SKIP_IDS.includes(el.attrs.id)) return true;
  if (el.tag === 'a' && CONTACT_HREF.test(el.attrs.href || '')) return true; /* phone, email and WhatsApp links are managed by the developer */
  return false;
}

/* ------------------------------------------------------------------ turning a run of nodes into an editable value */
function serializeSegments(nodes, src, kind) {
  const segs = [];
  (function walk(list) {
    for (const c of list) {
      if (c.type === 'text') segs.push({ k: 'text', s: decodeEntities(c.raw) });
      else if (c.tag === 'br') segs.push({ k: 'br' });
      else if (isVoidish(c)) segs.push({ k: 'tag', s: src.slice(c.openStart, c.closeEnd) });
      else {
        segs.push({ k: 'tag', s: src.slice(c.openStart, c.openEnd) });
        walk(c.children);
        segs.push({ k: 'tag', s: '</' + c.tag + '>' });
      }
    }
  })(nodes);
  /* collapse whitespace the way a browser would */
  const out = [];
  let lastSpace = true;
  for (const sg of segs) {
    if (sg.k === 'text') {
      let s = sg.s.replace(/[ \t\r\n\f]+/g, ' ');
      if (lastSpace && s.startsWith(' ')) s = s.slice(1);
      if (s.length) { out.push({ k: 'text', s }); lastSpace = s.endsWith(' '); }
    } else if (sg.k === 'br') {
      const l = out[out.length - 1];
      if (l && l.k === 'text' && l.s.endsWith(' ')) l.s = l.s.slice(0, -1);
      out.push({ k: 'br' });
      lastSpace = true;
    } else {
      out.push({ k: 'tag', s: sg.s.replace(/[ \t\r\n\f]+/g, ' ') });
    }
  }
  const l = out[out.length - 1];
  if (l && l.k === 'text' && l.s.endsWith(' ')) l.s = l.s.slice(0, -1);
  return out.map((sg) => {
    if (sg.k === 'br') return kind === 'html' ? '<br>' : '\n';
    if (sg.k === 'tag') return sg.s;
    return kind === 'html' ? escapeText(sg.s) : sg.s;
  }).join('');
}

/* decide whether `el` is one editable block, and if so describe it */
function buildBlock(el, src) {
  const kids = el.children;
  if (!kids.some(hasText)) return null;
  const trimmable = (n) => isWs(n) || isVoidish(n);
  let a = 0;
  let b = kids.length - 1;
  while (a <= b && trimmable(kids[a])) a++;
  while (b >= a && trimmable(kids[b])) b--;
  if (a > b) return null;
  const middle = kids.slice(a, b + 1);
  if (!middle.every(inlineOnly)) return null;
  const hasInlineEl = middle.some((n) => isEl(n) && n.tag !== 'br');
  const kind = hasInlineEl ? 'html' : 'text';
  const start = elStart(middle[0]);
  const end = elEnd(middle[middle.length - 1]);
  return { kind, original: serializeSegments(middle, src, kind), start, end };
}

/* ------------------------------------------------------------------ selectors and labels */
const DYNAMIC_CLASS = /^(jg-reveal|jg-in$|is-|current-menu|active$|wp-|menu-item)/;
function selectorOf(el) {
  const parts = [];
  for (let n = el; n && n.tag !== '#root' && n.tag !== 'html'; n = n.parent) {
    if (n.tag === 'body') { parts.unshift('body'); break; }
    let s = n.tag;
    if (n.attrs.id) s += '#' + n.attrs.id;
    const cl = classesOf(n).filter((c) => !DYNAMIC_CLASS.test(c)).slice(0, 2);
    if (cl.length) s += '.' + cl.join('.');
    const same = n.parent.children.filter((x) => isEl(x) && x.tag === n.tag);
    if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
    parts.unshift(s);
  }
  return parts.join(' > ');
}
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'; }
function stripJg(s) { return s.replace(/^jg-/, ''); }

function baseOf(el) {
  const cl = classesOf(el).filter((c) => !DYNAMIC_CLASS.test(c) && !/^(col-|container|row$|no-padd|creative$)/.test(c));
  return cl.length ? slugify(stripJg(cl[0])) : el.tag;
}
function typeLabel(el) {
  const cl = classesOf(el).join(' ');
  if (el.attrs['data-to'] !== undefined) return 'Stat number';
  if (/^h[1-6]$/.test(el.tag)) return 'Heading ' + el.tag[1] + (classesOf(el).includes('jg-sr-only') ? ' (hidden, read by search engines)' : '');
  if (/\bsubtitle\b|parent-subtitle/.test(cl)) return 'Small heading';
  if (/caption/.test(cl)) return 'Caption';
  if (el.tag === 'button' || /btn|a-btn/.test(cl)) return 'Button label';
  if (el.tag === 'a') return 'Link text';
  if (el.tag === 'label' || /label/.test(cl)) return 'Label';
  if (el.tag === 'li') return 'List item';
  if (el.tag === 'p') return 'Paragraph';
  if (el.tag === 'td' || el.tag === 'th') return 'Table cell';
  if (el.tag === 'blockquote') return 'Quote';
  return 'Text';
}

/* ------------------------------------------------------------------ extracting one page */
function sectionInfo(el, siblingsOfBody) {
  const cl = classesOf(el);
  if (el.tag === 'header') return { kind: 'header', name: 'header' };
  if (el.tag === 'footer') return { kind: 'footer', name: 'footer' };
  if (cl.includes('top-banner')) return { kind: 'banner', name: 'banner' };
  if (el.tag === 'section') {
    const c = cl.filter((x) => !DYNAMIC_CLASS.test(x))[0];
    return { kind: c && stripJg(c) === 'cta' ? 'cta' : 'section', name: c ? slugify(stripJg(c)) : 'section' };
  }
  return null;
}

function extractPage(src, file) {
  const root = parseHTML(src);
  const find = (n, tag) => { for (const c of n.children) { if (isEl(c)) { if (c.tag === tag) return c; const r = find(c, tag); if (r) return r; } } return null; };
  const html = find(root, 'html') || root;
  const body = find(html, 'body');
  const fields = [];
  const warnings = [];
  const elFieldRange = new Map();
  const secCount = {};
  const secOf = new Map();

  function newSection(el, info) {
    const base = info.name;
    secCount[base] = (secCount[base] || 0) + 1;
    return { id: secCount[base] > 1 ? base + '-' + secCount[base] : base, kind: info.kind, el, counters: {} };
  }

  function makeField(el, blk, section) {
    const base = baseOf(el);
    section.counters[base] = (section.counters[base] || 0) + 1;
    const f = {
      file, tag: el.tag, base, n: section.counters[base], section: { id: section.id, kind: section.kind, el: section.el },
      typeLabel: typeLabel(el), selector: selectorOf(el), kind: blk.kind, original: blk.original,
      occurrences: [{ file, mode: 'inner', start: blk.start, end: blk.end, openStart: el.openStart, openEnd: el.openEnd }],
      stat: el.attrs['data-to'] !== undefined, el
    };
    return f;
  }

  function descend(el, section, out) {
    for (const c of el.children) {
      if (!isEl(c)) continue;
      const before = out.length;
      visit(c, section, out);
      if (out === fields) elFieldRange.set(c, [before, out.length]);
    }
  }

  function visit(c, section, out) {
    if (shouldSkip(c)) return;
    let sec = section;
    const info = sectionInfo(c);
    if (info) sec = newSection(c, info);
    else if (!sec && c.parent === body) sec = newSection(c, { kind: 'block', name: slugify(stripJg(classesOf(c)[0] || c.tag)) });
    if (!sec) { descend(c, sec, out); return; }

    if (c.attrs['aria-hidden'] === 'true') {
      /* a hidden copy of an earlier element (used by the endless sliders): its text follows the original */
      const prev = c.parent.children.filter(isEl);
      const pi = prev.indexOf(c);
      let primary = null;
      for (let k = pi - 1; k >= 0; k--) {
        if (prev[k].tag === c.tag && (prev[k].attrs['class'] || '').trim() === (c.attrs['class'] || '').trim()) { primary = prev[k]; break; }
      }
      const tmp = [];
      const savedCounters = Object.assign({}, sec.counters);
      descend(c, sec, tmp);
      sec.counters = savedCounters;
      const pr = primary && elFieldRange.get(primary);
      if (pr) {
        const pf = fields.slice(pr[0], pr[1]);
        if (pf.length === tmp.length && pf.every((f, k) => f.tag === tmp[k].tag && f.original === tmp[k].original)) {
          pf.forEach((f, k) => f.occurrences.push(tmp[k].occurrences[0]));
        } else warnings.push(file + ': hidden copy of ' + selectorOf(c) + ' does not match its original, left alone');
      }
      return;
    }

    /* a wrapper whose only content is one inline element: edit the inner element instead */
    const nonVoid = c.children.filter((x) => (x.type === 'text' ? !isWs(x) : !isVoidish(x) && x.tag !== 'br'));
    const wrapperOnly = nonVoid.length === 1 && isEl(nonVoid[0]) && INLINE.has(nonVoid[0].tag);
    if (!wrapperOnly) {
      const blk = buildBlock(c, src);
      if (blk) { out.push(makeField(c, blk, sec)); return; }
    }
    descend(c, sec, out);
  }

  if (body) descend(body, null, fields);

  /* page title and the description shown in search results */
  const meta = [];
  const tm = /<title>([\s\S]*?)<\/title>/i.exec(src);
  if (tm) {
    const start = tm.index + 7;
    const val = decodeEntities(tm[1]).replace(/[ \t\r\n\f]+/g, ' ').trim();
    const occ = [{ file, mode: 'inner', start, end: start + tm[1].length }];
    [['property', 'og:title'], ['name', 'twitter:title']].forEach(([attr, nm]) => {
      const g = grab2(src, attr, nm, file);
      if (g && g.value === val) occ.push(g.occ);
    });
    meta.push({ file, name: 'title', label: 'Page title (browser tab and search results)', original: val, occurrences: occ });
  }
  const dm = grab2(src, 'name', 'description', file);
  if (dm) {
    const occ = [dm.occ];
    [['property', 'og:description'], ['name', 'twitter:description']].forEach(([attr, nm]) => {
      const g = grab2(src, attr, nm, file);
      if (g && g.value === dm.value) occ.push(g.occ);
    });
    meta.push({ file, name: 'description', label: 'Page description (search results)', original: dm.value, occurrences: occ });
  }
  return { file, fields, meta, warnings, root };
}
function grab2(src, attr, name, file) {
  const re = new RegExp('<meta\\s[^>]*?' + attr + '="' + name + '"[^>]*>', 'i');
  const m = re.exec(src);
  if (!m) return null;
  const cm = /\scontent="([^"]*)"/i.exec(m[0]);
  if (!cm) return null;
  const s = m.index + cm.index + cm[0].indexOf('"') + 1;
  return { value: decodeEntities(cm[1]).replace(/[ \t\r\n\f]+/g, ' ').trim(), occ: { file, mode: 'attr', start: s, end: s + cm[1].length } };
}

/* ------------------------------------------------------------------ whole site */
function sectionLabel(fields, sec) {
  const first = (pred) => fields.find((f) => f.section.id === sec.id && pred(f));
  if (sec.kind === 'header') return 'Menu and header';
  if (sec.kind === 'footer') return 'Footer';
  if (sec.kind === 'banner') return 'Page banner (title at the top)';
  if (fields.some((f) => f.section.id === sec.id && f.stat)) return 'Numbers strip (counters)';
  if (sec.id === 'sr-only') return 'Main heading (not visible on the page, read by Google)';
  const sub = first((f) => f.typeLabel === 'Small heading');
  const head = first((f) => /^Heading/.test(f.typeLabel));
  const pick = sub && head ? sub.original + ' · ' + head.original : (sub || head || first(() => true));
  const text = typeof pick === 'string' ? pick : pick ? pick.original : sec.id;
  return text.replace(/\n/g, ' ').replace(/<[^>]+>/g, '').slice(0, 70);
}

function extractSite(dir) {
  const files = fs.readdirSync(dir).filter((f) => /\.html$/i.test(f));
  const known = PAGE_ORDER.filter((n) => files.includes(n + '.html'));
  const extra = files.map((f) => f.replace(/\.html$/i, '')).filter((n) => !PAGE_ORDER.includes(n)).sort();
  const order = known.concat(extra);
  const pages = order.map((n) => ({ file: n + '.html', slug: (PAGE_NAMES[n] || [slugify(n), n])[0], title: (PAGE_NAMES[n] || [0, n.replace(/-/g, ' ')])[1] }));
  const warnings = [];
  const perPage = pages.map((p) => {
    const src = fs.readFileSync(path.join(dir, p.file), 'utf8');
    const r = extractPage(src, p.file);
    warnings.push(...r.warnings);
    return { page: p, src, ...r };
  });

  /* give every field its final key; text that is identical on several pages (menu, footer, call-to-action) is shared */
  const finalFields = [];
  const sharedGroups = new Map();
  perPage.forEach((pp) => {
    const labels = {};
    pp.fields.forEach((f) => {
      labels[f.section.id] = labels[f.section.id] || sectionLabel(pp.fields, f.section);
      f.sectionLabel = labels[f.section.id];
      const slug = slugify(f.base === f.section.id ? f.base + f.n : f.section.id + '-' + f.base + f.n);
      f.localKey = slug;
      if (SHARED_SECTIONS.has(f.section.kind)) {
        const sig = [f.section.kind, f.section.id, f.base, f.n, f.original].join('|');
        if (!sharedGroups.has(sig)) sharedGroups.set(sig, []);
        sharedGroups.get(sig).push({ pp, f });
      } else finalFields.push({ ...f, page: pp.page.slug, key: pp.page.slug + '__' + slug });
    });
    /* page title / description */
    pp.meta.forEach((m) => finalFields.push({
      key: pp.page.slug + '__page-' + m.name, page: pp.page.slug, tag: m.name, base: 'page-' + m.name, section: { id: 'meta', kind: 'meta' },
      sectionLabel: 'Title and description shown in Google', typeLabel: m.label, selector: m.name === 'title' ? 'head > title' : 'head > meta[name=description]',
      kind: 'text', original: m.original, occurrences: m.occurrences, meta: true, order: -1
    }));
  });
  sharedGroups.forEach((list) => {
    const pagesHit = new Set(list.map((x) => x.pp.page.slug));
    if (pagesHit.size >= 2) {
      const { f } = list[0];
      const sec = f.section;
      finalFields.push({
        ...f, page: 'shared', key: 'shared__' + f.localKey, sectionLabel: f.sectionLabel, appearsOn: pagesHit.size,
        occurrences: [].concat(...list.map((x) => x.f.occurrences))
      });
    } else list.forEach(({ pp, f }) => finalFields.push({ ...f, page: pp.page.slug, key: pp.page.slug + '__' + f.localKey }));
  });
  /* order: by page order then position in the file */
  const pageIdx = {};
  pages.forEach((p, i) => { pageIdx[p.slug] = i; });
  pageIdx.shared = 999;
  finalFields.forEach((f) => { f.order = f.order === -1 ? -1 : f.occurrences[0].start; });
  finalFields.sort((a, b) => (pageIdx[a.page] - pageIdx[b.page]) || (a.order - b.order));
  /* keys must be unique */
  const seen = new Set();
  finalFields.forEach((f) => { let k = f.key; let i = 2; while (seen.has(k)) k = f.key + '-' + i++; f.key = k; seen.add(k); });
  return { pages, fields: finalFields, warnings, perPage };
}

/* ------------------------------------------------------------------ validating and writing a new value */
function normWs(s) { return s.replace(/[ \t\r\n\f]+/g, ' ').trim(); }

/* html values may only use the inline tags that already exist in that field's original text */
function sanitizeHtmlValue(value, original) {
  const allowedOpen = new Set();
  const allowedTags = new Set(['br']);
  (original.match(/<[^>]+>/g) || []).forEach((t) => {
    if (/^<\//.test(t)) return;
    const m = /^<([a-zA-Z][^\s>\/]*)/.exec(t);
    if (m) { allowedTags.add(m[1].toLowerCase()); allowedOpen.add(normWs(t)); }
  });
  const parts = value.split(/(<[^>]*>)/);
  const stack = [];
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if (p[0] === '<' && p[p.length - 1] === '>') {
      const closing = /^<\/\s*([a-zA-Z][^\s>\/]*)\s*>$/.exec(p);
      if (closing) {
        const t = closing[1].toLowerCase();
        if (stack.pop() !== t) throw new Error('tags are not closed in the right order (</' + t + '>)');
        out += '</' + t + '>';
        continue;
      }
      if (/^<br\s*\/?>$/i.test(p)) { out += '<br>'; continue; }
      const om = /^<([a-zA-Z][^\s>\/]*)/.exec(p);
      if (!om || !allowedTags.has(om[1].toLowerCase()) || !allowedOpen.has(normWs(p).replace(/\s*\/>$/, '>'))) {
        throw new Error('contains markup that is not in the original text: ' + p.slice(0, 60));
      }
      stack.push(om[1].toLowerCase());
      out += normWs(p);
    } else {
      out += p.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[ \t\r\n\f]+/g, ' ');
    }
  }
  if (stack.length) throw new Error('a tag is left open (<' + stack[stack.length - 1] + '>)');
  return out.trim();
}

function renderValue(field, value) {
  if (field.kind === 'html') return sanitizeHtmlValue(value, field.original);
  return escapeText(value.replace(/\r\n?/g, '\n').trim()).replace(/\n/g, '<br>');
}

/* plain comparison form, used to decide whether a field really changed */
function comparable(field, value) {
  if (field.kind === 'html') {
    try { return decodeEntities(normWs(sanitizeHtmlValue(value, field.original))); } catch (e) { return value; }
  }
  return value.replace(/\r\n?/g, '\n').replace(/[ \t\f]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

function buildEdits(field, value, srcByFile) {
  const edits = [];
  const isMeta = !!field.meta;
  const body = field.kind === 'html' ? null : value;
  for (const occ of field.occurrences) {
    const src = srcByFile[occ.file];
    if (occ.mode === 'attr') {
      edits.push({ file: occ.file, start: occ.start, end: occ.end, text: escapeAttr(normWs(value)) });
    } else if (isMeta) {
      edits.push({ file: occ.file, start: occ.start, end: occ.end, text: escapeText(normWs(value)) });
    } else {
      const old = src.slice(occ.start, occ.end);
      const lead = /^\s*/.exec(old)[0];
      const trail = /\s*$/.exec(old.slice(lead.length))[0];
      edits.push({ file: occ.file, start: occ.start, end: occ.end, text: lead + renderValue(field, value) + trail });
    }
    if (field.stat && occ.openStart !== undefined) {
      const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(.*)$/.exec(normWs(value));
      if (m) {
        let tag = src.slice(occ.openStart, occ.openEnd);
        const setAttr = (t, name, v) => {
          const re = new RegExp('(\\s' + name + '=)(["\'])[^"\']*\\2');
          return re.test(t) ? t.replace(re, '$1"' + escapeAttr(v) + '"') : t;
        };
        tag = setAttr(setAttr(tag, 'data-to', m[1]), 'data-suffix', m[2]);
        edits.push({ file: occ.file, start: occ.openStart, end: occ.openEnd, text: tag });
      }
    }
  }
  return edits;
}

module.exports = {
  parseHTML, extractPage, extractSite, decodeEntities, escapeText, escapeAttr, normWs, sanitizeHtmlValue, renderValue, comparable, buildEdits,
  PAGE_NAMES, PAGE_ORDER
};
