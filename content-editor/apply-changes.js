#!/usr/bin/env node
'use strict';
/*
 * apply-changes.js  (Node.js 14+, no packages needed)
 *
 * Takes the JSON file the client downloaded from editor.html and writes the new wording into your HTML files.
 *
 *   node apply-changes.js changes.json                 apply the changes
 *   node apply-changes.js changes.json --dry-run       show what would change, write nothing
 *
 * Options
 *   --pages <folder>      folder that holds the .html files (default: ../pages if it exists, otherwise the project folder)
 *   --manifest <file>     editor-manifest.json made by build-editor.js (default: the one next to this script).
 *                         Used to stop a change being applied to a page whose text has been edited since the editor was built.
 *   --force               apply even when the page text no longer matches the manifest
 *   --no-backup           do not copy the original files into backups/ first
 *
 * What it does for every key in the JSON:
 *   - finds that piece of text in the HTML (same logic as the editor, see editor-core.js)
 *   - replaces ONLY that text; the rest of the file is left exactly as it was
 *   - text that appears on every page (menu, footer, call-to-action) is changed on every page
 *   - numbers in the counters are also written to the counter's data-to attribute so the animation shows the new value
 *   - unknown keys, unsafe markup and text that did not change are reported and skipped
 */
const fs = require('fs');
const path = require('path');
const core = require('./editor-core.js');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--pages', '--manifest'].includes(args[i - 1])));

if (!files.length || flag('--help') || flag('-h')) {
  console.log('Usage: node apply-changes.js <changes.json> [--dry-run] [--pages <folder>] [--manifest <file>] [--force] [--no-backup]');
  process.exit(files.length ? 0 : 1);
}

function findPagesDir() {
  if (opt('--pages')) return path.resolve(opt('--pages'));
  const cands = [path.resolve(__dirname, '..', 'pages'), path.resolve(__dirname, '..'), path.resolve(process.cwd(), 'pages'), process.cwd()];
  for (const c of cands) {
    try { if (fs.readdirSync(c).some((f) => /\.html$/i.test(f) && f !== 'editor.html')) return c; } catch (e) { /* next */ }
  }
  return null;
}

const pagesDir = findPagesDir();
if (!pagesDir) { console.error('Could not find the folder with the .html pages. Use --pages <folder>.'); process.exit(1); }

let changes;
try {
  changes = JSON.parse(fs.readFileSync(path.resolve(files[0]), 'utf8'));
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('the file must contain one JSON object');
} catch (e) { console.error('Cannot read ' + files[0] + ': ' + e.message); process.exit(1); }

const manifestPath = opt('--manifest') ? path.resolve(opt('--manifest')) : path.join(__dirname, 'editor-manifest.json');
let manifest = null;
if (fs.existsSync(manifestPath)) { try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).fields; } catch (e) { console.warn('Note: could not read the manifest (' + e.message + '), continuing without it.'); } }

const dry = flag('--dry-run');
const force = flag('--force');
const site = core.extractSite(pagesDir);
const byKey = new Map(site.fields.map((f) => [f.key, f]));
const srcByFile = {};
site.perPage.forEach((pp) => { srcByFile[pp.page.file] = pp.src; });

const report = { applied: [], unchanged: [], unknown: [], rejected: [], drift: [] };
const editsByFile = {};
const preview = (s) => (s.length > 70 ? s.slice(0, 67) + '...' : s).replace(/\n/g, ' / ');

for (const [key, value] of Object.entries(changes)) {
  if (key.startsWith('__')) continue;
  const field = byKey.get(key);
  if (!field) { report.unknown.push(key); continue; }
  if (typeof value !== 'string') { report.rejected.push([key, 'the new text must be a string']); continue; }
  if (value.length > 20000) { report.rejected.push([key, 'text is too long']); continue; }
  if (core.comparable(field, value) === core.comparable(field, field.original)) { report.unchanged.push(key); continue; }
  if (manifest && manifest[key] !== undefined && manifest[key].original !== field.original && !force) {
    report.drift.push([key, 'the text on the page is now "' + preview(field.original) + '" but the editor was built with "' + preview(manifest[key].original) + '"']);
    continue;
  }
  let edits;
  try {
    if (field.kind === 'html') core.sanitizeHtmlValue(value, field.original); /* throws on unsafe markup */
    edits = core.buildEdits(field, value, srcByFile);
  } catch (e) { report.rejected.push([key, e.message]); continue; }
  edits.forEach((e) => { (editsByFile[e.file] = editsByFile[e.file] || []).push(e); });
  report.applied.push({ key, from: field.original, to: value, pages: new Set(field.occurrences.map((o) => o.file)).size, field });
}

/* write the files */
const changedFiles = [];
const newSrc = {};
for (const [file, edits] of Object.entries(editsByFile)) {
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].end > edits[i - 1].start) { console.error('Two changes overlap in ' + file + ' - nothing was written. Please report this to the developer.'); process.exit(2); }
  }
  let s = srcByFile[file];
  edits.forEach((e) => { s = s.slice(0, e.start) + e.text + s.slice(e.end); });
  newSrc[file] = s;
  changedFiles.push(file);
}

if (!dry && changedFiles.length) {
  if (!flag('--no-backup')) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const bdir = path.join(__dirname, 'backups', stamp);
    fs.mkdirSync(bdir, { recursive: true });
    changedFiles.forEach((f) => fs.copyFileSync(path.join(pagesDir, f), path.join(bdir, f)));
    console.log('Backup of the original pages: ' + bdir);
  }
  changedFiles.forEach((f) => fs.writeFileSync(path.join(pagesDir, f), newSrc[f], 'utf8'));
}

/* check the result by reading the files again */
let verified = 0;
const failed = [];
if (!dry && changedFiles.length) {
  const after = core.extractSite(pagesDir);
  const afterByKey = new Map(after.fields.map((f) => [f.key, f]));
  report.applied.forEach((a) => {
    const nf = afterByKey.get(a.key);
    if (nf && core.comparable(nf, nf.original) === core.comparable(a.field, a.to)) verified++; else failed.push(a.key);
  });
}

/* summary */
console.log('');
console.log((dry ? 'DRY RUN - nothing was written.  ' : '') + 'Pages folder: ' + pagesDir);
report.applied.forEach((a) => console.log('  ' + (dry ? 'would change' : 'changed') + '  ' + a.key + (a.pages > 1 ? '  (on ' + a.pages + ' pages)' : '') + '\n      was: ' + preview(a.from) + '\n      now: ' + preview(a.to)));
console.log('');
console.log('Changed: ' + report.applied.length + '   Already up to date: ' + report.unchanged.length + '   Files ' + (dry ? 'that would be' : '') + ' written: ' + changedFiles.length + (changedFiles.length ? ' (' + changedFiles.join(', ') + ')' : ''));
if (!dry && report.applied.length) console.log('Checked after writing: ' + verified + ' of ' + report.applied.length + ' changes read back correctly.');
if (failed.length) console.log('!! These did not read back as expected, please check: ' + failed.join(', '));
if (report.unknown.length) console.log('Unknown keys (not found in the pages, skipped): ' + report.unknown.join(', '));
report.rejected.forEach(([k, m]) => console.log('Rejected ' + k + ': ' + m));
report.drift.forEach(([k, m]) => console.log('Skipped ' + k + ': ' + m + '  (use --force to apply anyway)'));
process.exit(failed.length || report.rejected.length ? 2 : 0);
