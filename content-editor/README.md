# Website text editor (for client wording corrections)

Do not upload this folder to the live website. It is only for you and the client.

## The workflow

1. **Build the editor** (whenever the website text has changed)

   ```
   cd content-editor
   node build-editor.js
   ```

   This reads every `.html` page and writes `editor.html` (one file, works offline) and `editor-manifest.json`.

2. **Send `editor.html` to the client.** They open it by double clicking, click any text, correct it, and press
   **Export Changes**. A file such as `jangid-website-changes-2026-11-20.json` downloads. They email that back.

3. **Apply the corrections**

   ```
   node apply-changes.js jangid-website-changes-2026-11-20.json --dry-run   # preview, writes nothing
   node apply-changes.js jangid-website-changes-2026-11-20.json             # apply
   ```

   The original pages are copied to `content-editor/backups/<date-time>/` first.
   Only the corrected text is replaced, the rest of each file stays exactly as it was.

4. **Check the pages, upload the changed files to Hostinger**, then run `node build-editor.js` again so the next
   editor starts from the new text.

## What the client can edit

Headings, paragraphs, list items, button labels, small headings, the counter numbers (20, 100+ ...), form labels and
messages, the page title and the description shown in Google, and the menu, footer and bottom banner (those are
shared, so one change updates all 11 pages).

## What is left alone on purpose

- Phone, email and WhatsApp links (so contact details never go out of step with their links)
- The footer credit line, the home slider caption box (set by the slider script)
- Image descriptions (alt text), the structured data for Google, and any text inside scripts

## Good to know

- Keys look like `home__intro-h21` (page, section, element). The full CSS path is shown on hover in the editor.
- If a page was edited after the editor was built, `apply-changes.js` skips that key and tells you
  (use `--force` to override).
- Replacement text can only use the links and formatting that already exist in that piece of text.
  Anything else (scripts, new tags) is rejected.
- `--pages <folder>` points to the folder with the pages. Default: `../pages` if it exists, otherwise the project folder.
- `node coverage-check.js` lists any visible page text that the editor does not cover.
- Headings use the site's real heading font (Jost). To switch to Cormorant Garamond, change `--heading` at the top of
  `editor.template.html` and run `node build-editor.js`.
