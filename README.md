# Shazlan.com

A one-page collection of things Shazlan has made, found and talked about.

## How it works

- `content.json` holds everything that appears on the site. Add, remove or reorder entries there.
- `index.html`, `assets/site.css` and `assets/site.js` are the page itself. They rarely need to change.
- The site is served by GitHub Pages from the `main` branch.

## Adding a piece

Add an entry to `items` in `content.json`:

```json
{ "kind": "photo", "source": "mine", "platform": "instagram", "url": "https://www.instagram.com/p/XXXX/", "date": "2026-10-10" }
```

- `kind`: `photo`, `video`, `post`, `music`, `quote`, `link` or `comment` (a `quote` or `post` puts its words in `"text"`)
- `source`: `mine` or `shared`
- `platform`: `instagram`, `youtube`, `spotify`, or anything else for a plain link card
- `date`: `YYYY-MM-DD`, used for ordering (newest first)
- Optional: `"note"` (your own site caption, shown under the card), `"caption"` (the original post's caption, shown smaller underneath), `"title"`, `"tags"` (a list of keywords for search, e.g. `["food", "japan"]`), `"size"`: `"small"` (1 column, the default), `"medium"` (2 columns) or `"large"` (3 columns, the full row), `"now": true` (shown at the top; keep only one), `"pinned": true` (held in the "On my mind lately" row under Now; up to three)
