#!/usr/bin/env node
'use strict';
/*
 * build-editor.js  (Node.js 14+, no packages needed)
 *
 *   node build-editor.js [--pages <folder>]
 *
 * Reads every .html page, extracts all editable text (see editor-core.js) and writes:
 *   editor.html            one self-contained file for the client (text, fonts and styles are inside it, works offline)
 *   editor-manifest.json   what the text said when the editor was built; apply-changes.js uses it to detect stale edits
 *
 * Run it again whenever the website text changes, then send the client the new editor.html.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./editor-core.js');

const args = process.argv.slice(2);
const pi = args.indexOf('--pages');
function findPagesDir() {
  if (pi >= 0) return path.resolve(args[pi + 1]);
  const cands = [path.resolve(__dirname, '..', 'pages'), path.resolve(__dirname, '..'), path.resolve(process.cwd(), 'pages'), process.cwd()];
  for (const c of cands) {
    try { if (fs.readdirSync(c).some((f) => /\.html$/i.test(f) && f !== 'editor.html')) return c; } catch (e) { /* next */ }
  }
  return null;
}
const pagesDir = findPagesDir();
if (!pagesDir) { console.error('Could not find the folder with the .html pages. Use --pages <folder>.'); process.exit(1); }

const site = core.extractSite(pagesDir);
site.warnings.forEach((w) => console.warn('Note: ' + w));

const fields = site.fields.map((f) => ({
  key: f.key, page: f.page, sectionId: f.section.id, sectionKind: f.section.kind, sectionLabel: f.sectionLabel,
  tag: f.tag, typeLabel: f.typeLabel, selector: f.selector, kind: f.kind, original: f.original,
  stat: !!f.stat, meta: !!f.meta, appearsOn: f.appearsOn || 0
}));
const pages = site.pages.map((p) => ({ slug: p.slug, title: p.title, file: p.file }));
pages.push({ slug: 'shared', title: 'Menu, footer and bottom banner (all pages)', tab: 'All pages', file: '' });
const data = { builtAt: new Date().toISOString(), pages, fields };
data.buildId = crypto.createHash('sha1').update(JSON.stringify({ pages, fields })).digest('hex').slice(0, 12);

const b64 = (f) => fs.readFileSync(path.join(__dirname, 'fonts', f)).toString('base64');
let tpl = fs.readFileSync(path.join(__dirname, 'editor.template.html'), 'utf8');
const json = JSON.stringify(data).split('<').join('\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
tpl = tpl.replace('__INTER__', () => b64('inter-latin.woff2')).replace('__JOST__', () => b64('jost-latin.woff2'))
  .replace('__BUILT__', () => data.builtAt.slice(0, 10)).replace('__DATA__', () => json);
fs.writeFileSync(path.join(__dirname, 'editor.html'), tpl, 'utf8');

const manifest = { builtAt: data.builtAt, buildId: data.buildId, pagesDir, fields: {} };
site.fields.forEach((f) => { manifest.fields[f.key] = { original: f.original, kind: f.kind, page: f.page, files: [...new Set(f.occurrences.map((o) => o.file))] }; });
fs.writeFileSync(path.join(__dirname, 'editor-manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');

const per = {};
fields.forEach((f) => { per[f.page] = (per[f.page] || 0) + 1; });
console.log('Pages folder: ' + pagesDir);
console.log('Editable text fields: ' + fields.length);
Object.keys(per).forEach((k) => console.log('  ' + k.padEnd(10) + per[k]));
console.log('Wrote editor.html (' + Math.round(fs.statSync(path.join(__dirname, 'editor.html')).size / 1024) + ' KB) and editor-manifest.json');
