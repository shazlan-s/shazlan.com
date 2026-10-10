// Daily import: adds new Instagram and Threads posts to content.json.
// Runs on GitHub Actions. Tokens come from repository secrets and are never printed.
//
// Rules:
//  - Only posts made on or after site.importSince are added (the curated set covers what came before).
//  - A post already in content.json (including archived ones) is never added again.
//  - Hashtags in a caption become tags, so search and tag links work straight away.
//  - Instagram posts shared to Threads are not added twice: only Threads text posts come in.
//
// Options (environment variables, set from the "Run workflow" form):
//  DRY_RUN=true   report what would be added without changing anything
//  SINCE=YYYY-MM-DD  override site.importSince for this run

import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../content.json', import.meta.url);
const DRY = process.env.DRY_RUN === 'true';

const ACCOUNTS = [
  { platform: 'instagram', secret: 'IG_TOKEN_SHAZLAN' },
  { platform: 'instagram', secret: 'IG_TOKEN_PIC_SHAZ' },
  { platform: 'threads', secret: 'THREADS_TOKEN' }
];

const key = (url) => (url || '').toLowerCase()
  .replace(/^https?:\/\/(www\.)?/, '')
  .replace(/\/(reel|reels|tv)\//, '/p/')
  .replace(/threads\.net/, 'threads.com')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');

const hashtags = (text) => [...new Set(((text || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1).toLowerCase()))];

async function getJSON(url) {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) {
    const msg = (body.error && (body.error.message || body.error.type)) || r.status;
    throw new Error(String(msg));
  }
  return body;
}

async function instagram(token, since) {
  // Keep the token fresh. Instagram tokens last 60 days; refreshing resets the clock.
  try { await getJSON(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`); }
  catch (e) { console.log(`  token refresh skipped: ${e.message}`); }

  const fields = 'id,caption,media_type,media_product_type,permalink,timestamp,username';
  let url = `https://graph.instagram.com/me/media?fields=${fields}&limit=50&access_token=${token}`;
  const out = [];
  while (url) {
    const page = await getJSON(url);
    for (const m of page.data || []) {
      const date = (m.timestamp || '').slice(0, 10);
      if (date < since) return out;
      out.push({
        kind: m.media_type === 'VIDEO' || m.media_product_type === 'REELS' ? 'video' : 'photo',
        source: 'mine', platform: 'instagram', account: m.username,
        url: m.permalink, date,
        caption: (m.caption || '').trim() || undefined,
        tags: hashtags(m.caption)
      });
    }
    url = page.paging && page.paging.next;
  }
  return out;
}

async function threads(token, since) {
  try { await getJSON(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`); }
  catch (e) { console.log(`  token refresh skipped: ${e.message}`); }

  const fields = 'id,text,media_type,permalink,timestamp,username,is_quote_post';
  let url = `https://graph.threads.net/v1.0/me/threads?fields=${fields}&limit=50&access_token=${token}`;
  const out = [];
  while (url) {
    const page = await getJSON(url);
    for (const t of page.data || []) {
      const date = (t.timestamp || '').slice(0, 10);
      if (date < since) return out;
      if (!t.permalink || !t.text) continue; // reposts and image-only threads are skipped
      // Threads posts with a photo or video are almost always shared over from Instagram,
      // which the site already has. Only text posts are taken from Threads.
      if (t.media_type && t.media_type !== 'TEXT_POST') { console.log(`  skip ${date} ${t.permalink} (has a photo or video, likely from Instagram)`); continue; }
      out.push({
        kind: 'post', source: 'mine', platform: 'threads', account: t.username,
        url: t.permalink, date, text: t.text.trim(), tags: hashtags(t.text)
      });
    }
    url = page.paging && page.paging.next;
  }
  return out;
}

const data = JSON.parse(await readFile(FILE, 'utf8'));
const since = process.env.SINCE || data.site.importSince;
if (!since) throw new Error('site.importSince is not set in content.json');
const known = new Set(data.items.map((i) => key(i.url)));

// Backup check for Instagram posts shared to Threads: same words, posted within 3 days.
const words = (t) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
function fromInstagram(p, pool) {
  const w = words(p.text);
  return w.length > 0 && pool.some((i) => i.platform === 'instagram' && i.caption && words(i.caption) === w && days(i.date, p.date) <= 3);
}

console.log(`Importing posts from ${since}${DRY ? ' (dry run)' : ''}`);
let added = [], failed = 0;
for (const a of ACCOUNTS) {
  const token = process.env[a.secret];
  if (!token) { console.log(`${a.secret}: not set, skipping`); continue; }
  try {
    const posts = a.platform === 'instagram' ? await instagram(token, since) : await threads(token, since);
    const pool = data.items.concat(added);
    const fresh = posts.filter((p) => {
      if (known.has(key(p.url))) return false;
      if (p.platform === 'threads' && fromInstagram(p, pool)) { console.log(`  skip ${p.date} ${p.url} (same words as an Instagram post)`); return false; }
      return true;
    });
    fresh.forEach((p) => known.add(key(p.url)));
    console.log(`${a.secret}: ${posts.length} posts since ${since}, ${fresh.length} new`);
    fresh.forEach((p) => console.log(`  + ${p.date} ${p.platform} @${p.account} ${p.url}`));
    added = added.concat(fresh);
  } catch (e) {
    failed++;
    console.log(`${a.secret}: FAILED (${e.message})`);
  }
}

if (added.length && !DRY) {
  added.forEach((p) => { p.auto = true; Object.keys(p).forEach((k) => p[k] === undefined && delete p[k]); });
  data.items = data.items.concat(added);
  await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`Added ${added.length} piece(s) to content.json`);
} else {
  console.log(added.length ? `Would add ${added.length} piece(s)` : 'Nothing new');
}
if (failed) process.exitCode = 1;
