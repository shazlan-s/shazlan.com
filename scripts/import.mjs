// Daily import: adds new Instagram and Threads posts to content.json.
// Runs on GitHub Actions. Tokens come from repository secrets and are never printed.
//
// Rules:
//  - Only posts made on or after site.importSince are added (the curated set covers what came before).
//  - A post already in content.json (including archived ones) is never added again.
//  - Hashtags in a caption become tags, so search and tag links work straight away.
//  - Instagram posts shared to Threads are not added twice (matched by their words).
//  - Reposts of other people's Threads posts are skipped; add those by hand.
//  - A Threads post linking to Instagram, YouTube or Spotify comes in as that piece, with your words as its caption.
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

  const fields = 'id,text,media_type,permalink,timestamp,username,is_quote_post,link_attachment_url';
  let url = `https://graph.threads.net/v1.0/me/threads?fields=${fields}&limit=50&access_token=${token}`;
  const out = [];
  while (url) {
    const page = await getJSON(url);
    for (const t of page.data || []) {
      const date = (t.timestamp || '').slice(0, 10);
      if (date < since) return out;
      if (!t.permalink || t.media_type === 'REPOST_FACADE') continue; // reposts of other people's posts don't carry their details
      const pictures = t.media_type && t.media_type !== 'TEXT_POST';
      if (!pictures && !t.text) continue;
      // A text post that links to something the site can show (Instagram, YouTube, Spotify)
      // becomes that piece, with the Threads words as the site caption.
      // Threads doesn't always report the link (posts shared from the Instagram app don't), so the
      // post's public embed page is checked for one as well.
      if (!pictures && !t.link_attachment_url) t.link_attachment_url = await embedLink(t.permalink);
      const linked = !pictures && t.link_attachment_url ? await linkedPiece(t.link_attachment_url) : null;
      if (t.link_attachment_url) console.log(`  ${date} ${t.permalink} links to ${linked ? linked.platform + ' ' + linked.url : 'a web page (kept as a text card)'}`);
      if (linked) {
        out.push(Object.assign(linked, {
          source: ['shazlan', 'pic_shaz', 'shazlans', 'shazlan_s', 'Shazlan Sufian'].includes(linked.account) ? 'mine' : 'shared',
          date, note: (t.text || '').trim() || undefined, via: t.permalink, tags: hashtags(t.text)
        }));
        continue;
      }
      out.push({
        kind: t.media_type === 'VIDEO' ? 'video' : pictures ? 'photo' : 'post',
        source: 'mine', platform: 'threads', account: t.username,
        url: t.permalink, date, text: (t.text || '').trim() || undefined, tags: hashtags(t.text)
      });
    }
    url = page.paging && page.paging.next;
  }
  return out;
}

// The first outside link on a Threads post's public embed page, if any.
async function embedLink(permalink) {
  try {
    const r = await fetch(permalink.replace(/\/$/, '') + '/embed', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const html = (await r.text()).replace(/&amp;/g, '&');
    const wrapped = html.match(/href="https:\/\/l\.facebook\.com\/l\.php\?u=([^"&]+)/);
    if (wrapped) return decodeURIComponent(wrapped[1]);
    const direct = html.match(/href="(https:\/\/(?:www\.)?(?:instagram\.com\/(?:p|reel|reels|tv)\/|youtube\.com\/|youtu\.be\/|open\.spotify\.com\/)[^"]+)"/);
    return direct ? direct[1] : null;
  } catch { return null; }
}

// Work out what a link attached to a Threads post points at. Returns null for anything the site
// shows only as a plain link, so those posts stay as Threads text cards.
async function linkedPiece(raw) {
  let u;
  try {
    u = new URL(raw);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.searchParams.get('u')) u = new URL(u.searchParams.get('u'));
  } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const page = async (url) => { try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); return r.ok ? await r.text() : ''; } catch { return ''; } };
  const json = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : {}; } catch { return {}; } };

  let m = u.pathname.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
  if (host === 'instagram.com' && m) {
    const type = m[1] === 'p' ? 'p' : 'reel';
    const html = await page(`https://www.instagram.com/p/${m[2]}/embed/captioned/`);
    const who = (html.match(/class="UsernameText"[^>]*>([^<]+)/) || [])[1];
    return { kind: type === 'reel' ? 'video' : 'photo', platform: 'instagram', account: who, url: `https://www.instagram.com/${type}/${m[2]}/` };
  }
  const yt = (raw.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/) || [])[1];
  if (yt) {
    const url = `https://www.youtube.com/watch?v=${yt}`;
    const o = await json(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    return { kind: 'video', platform: 'youtube', account: o.author_name, url, caption: o.title };
  }
  if (host === 'open.spotify.com' && /^\/(track|album|playlist|episode|show)\//.test(u.pathname)) {
    const url = `https://open.spotify.com${u.pathname}`;
    const o = await json(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    return { kind: 'music', platform: 'spotify', url, caption: o.title, image: o.thumbnail_url };
  }
  return null;
}

const data = JSON.parse(await readFile(FILE, 'utf8'));
const since = process.env.SINCE || data.site.importSince;
if (!since) throw new Error('site.importSince is not set in content.json');
const known = new Set(data.items.flatMap((i) => [key(i.url), i.via && key(i.via)].filter(Boolean)));

// Instagram posts shared to Threads: Threads copies the caption, so same words within 3 days means
// it's already on the site. A Threads photo with no words is matched to a captionless Instagram post that day.
const words = (t) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const days = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
function fromInstagram(p, pool) {
  const w = words(p.text);
  return pool.some((i) => i.platform === 'instagram' && days(i.date, p.date) <= (w ? 3 : 1) && words(i.caption) === w);
}

console.log(`Importing posts from ${since}${DRY ? ' (dry run)' : ''}`);
let added = [], failed = 0, failures = [];
for (const a of ACCOUNTS) {
  const token = process.env[a.secret];
  if (!token) { console.log(`${a.secret}: not set, skipping`); continue; }
  try {
    const posts = a.platform === 'instagram' ? await instagram(token, since) : await threads(token, since);
    const pool = data.items.concat(added);
    const fresh = posts.filter((p) => {
      if (known.has(key(p.url)) || (p.via && known.has(key(p.via)))) return false;
      if (p.platform === 'threads' && fromInstagram(p, pool)) { console.log(`  skip ${p.date} ${p.url} (same words as an Instagram post)`); return false; }
      return true;
    });
    fresh.forEach((p) => { known.add(key(p.url)); if (p.via) known.add(key(p.via)); });
    console.log(`${a.secret}: ${posts.length} posts since ${since}, ${fresh.length} new`);
    fresh.forEach((p) => console.log(`  + ${p.date} ${p.platform} @${p.account} ${p.url}`));
    added = added.concat(fresh);
  } catch (e) {
    failed++;
    failures.push(`${a.secret}: ${e.message}`);
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
if (failed) {
  // A failed run makes GitHub email the owner. The summary says what broke in plain words.
  process.exitCode = 1;
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, [
      '## New posts could not be fetched',
      '',
      ...failures.map((f) => `- ${f}`),
      '',
      'This usually means an access token has expired or been revoked.',
      'Open a chat in the Shazlan.Com project and ask Claude to fix the import.',
      ''
    ].join('\n'), { flag: 'a' });
  }
}
