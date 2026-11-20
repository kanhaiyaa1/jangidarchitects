# CLAUDE.md - Jangid Architects website

## Client wording changes are protected (standing rule)

The wording the client sent back in `content-editor/changes/jangid-website-changes-*.json` is final and important. It has been applied to the pages and is the source of truth for that text.

- Do NOT override, reword, "correct" or revert any text that came from those JSON files. This includes apparent typos, capitalisation, spacing and naming (for example "ShriNiwas", "Trade one", "approval form IOD").
- This also applies when regenerating pages, rebuilding the editor, or running SEO/copy/cleanup passes.
- Change such text only when the user explicitly says so in that message. Flag problems to the user instead of fixing them.
- A from/to record of every client change is in `content-editor/changes/changes-report-2026-11-19.md`.
- When new client JSON files arrive, apply them with `content-editor/apply-changes.js`, then add them to this rule.
