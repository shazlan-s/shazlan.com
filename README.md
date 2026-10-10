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

- `kind`: `photo`, `video`, `post`, `music`, `link` or `comment`
- `source`: `mine` or `shared`
- `platform`: `instagram`, `youtube`, `spotify`, or anything else for a plain link card
- `date`: `YYYY-MM-DD`, used for ordering (newest first)
- Optional: `"note"` (your own site caption, shown under the card), `"caption"` (the original post's caption, shown smaller underneath), `"title"`, `"tags"` (a list of keywords for search, e.g. `["food", "japan"]`), `"large": true` (spans two columns), `"now": true` (shown at the top; keep only one)
