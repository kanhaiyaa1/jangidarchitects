// developer helper: lists visible text in the pages that the editor does NOT cover
const fs = require('fs'), path = require('path'), core = require('./editor-core.js');
const dir = process.argv[2] || '..';
const site = core.extractSite(dir);
const SKIP = new Set(['script','style','noscript','head','svg','iframe','select','option','textarea','title']);
let total = 0;
for (const pp of site.perPage) {
  const ranges = [];
  site.fields.forEach(f => f.occurrences.forEach(o => { if (o.file === pp.page.file) ranges.push([o.start, o.end]); }));
  const miss = [];
  (function walk(n, skip) {
    if (n.type === 'text') {
      const txt = core.decodeEntities(n.raw).replace(/\s+/g, ' ').trim();
      if (txt && !skip && !ranges.some(([a, b]) => n.start >= a && n.end <= b + 1)) miss.push(txt.slice(0, 70));
      return;
    }
    const cl = (n.attrs && n.attrs['class'] || '');
    const sk = skip || SKIP.has(n.tag) || /footer-copyright|jg-hero-card|jg-hero-dots|jg-hero-arrow|jg-preloader/.test(cl) || (n.tag === 'a' && /^(mailto:|tel:|https?:\/\/wa\.me)/.test(n.attrs.href || ''));
    n.children.forEach(c => walk(c, sk));
  })(pp.root, false);
  if (miss.length) { console.log('== ' + pp.page.file + ' (' + miss.length + ' uncovered)'); miss.slice(0, 12).forEach(m => console.log('   ', JSON.stringify(m))); }
  total += miss.length;
}
console.log('uncovered text pieces in total:', total);
