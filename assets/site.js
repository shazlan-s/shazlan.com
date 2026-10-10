// Shazlan.com — renders the page from content.json.
// To add something to the site, add an entry to content.json. No code changes needed.

(function () {
  var KINDS = [
    ['video', 'Videos'], ['photo', 'Photos'], ['post', 'Posts'],
    ['music', 'Music'], ['quote', 'Quotes'], ['link', 'Links'], ['comment', 'Comments']
  ];
  var ROW = 4; // must match grid-auto-rows in site.css

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  // ---- Embeds -------------------------------------------------------------

  var loaded = {};
  function loadScript(src, done) {
    if (loaded[src]) { if (loaded[src] === true) done(); else loaded[src].push(done); return; }
    loaded[src] = [done];
    var s = document.createElement('script');
    s.async = true; s.src = src;
    s.onload = function () { var q = loaded[src]; loaded[src] = true; q.forEach(function (f) { f(); }); };
    document.body.appendChild(s);
  }

  function instagram(item, withCaption) {
    var link = el('a', { href: item.url, target: '_blank', rel: 'noopener', text: 'View this post on Instagram' });
    var attrs = {
      'class': 'instagram-media',
      'data-instgrm-permalink': item.url + '?utm_source=ig_embed',
      'data-instgrm-version': '14'
    };
    if (withCaption) attrs['data-instgrm-captioned'] = '';
    return el('blockquote', attrs, [link]);
  }

  function youtube(item) {
    var id = (item.url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    var box = el('div', { 'class': 'yt' });
    box.style.cssText = 'position:relative;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:#111';
    box.appendChild(el('iframe', {
      src: 'https://www.youtube-nocookie.com/embed/' + id,
      title: item.title || 'YouTube video', loading: 'lazy', allowfullscreen: '',
      allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture',
      style: 'position:absolute;inset:0;width:100%;height:100%;border:0'
    }));
    return box;
  }

  function spotify(item) {
    var path = item.url.replace(/^https?:\/\/open\.spotify\.com\//, '').split('?')[0];
    return el('iframe', {
      src: 'https://open.spotify.com/embed/' + path, loading: 'lazy', title: item.title || 'Spotify',
      allow: 'encrypted-media', style: 'width:100%;height:352px;border:0;border-radius:12px'
    });
  }

  function linkCard(item) {
    var a = el('a', { 'class': 'linkcard', href: item.url, target: '_blank', rel: 'noopener' }, [
      el('span', { 'class': 'label', text: 'Link · ' + new URL(item.url).hostname.replace(/^www\./, '') }),
      el('span', { 'class': 'linktitle', text: item.title || item.url })
    ]);
    a.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:22px;border:1px solid var(--line);border-radius:6px;background:#fff;text-decoration:none';
    return a;
  }

  function media(item) {
    if (item.platform === 'instagram') return instagram(item);
    if (item.platform === 'youtube') return youtube(item);
    if (item.platform === 'spotify') return spotify(item);
    return linkCard(item);
  }

  // Trimmed Instagram embed: only the photo/video frame shows; the post opens on Instagram on click.
  var IG_HEAD = 54, IG_FOOT = 154; // Instagram embed header and footer heights (px)
  function trimmed(item) {
    var box = el('div', { 'class': 'mask' });
    if (item.ratio) box.style.setProperty('--r', item.ratio);
    box.appendChild(instagram(item));
    // Clicking opens the post on Instagram itself (the Instagram app on phones), where videos always play.
    var hit = el('a', { 'class': 'hit', href: item.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open ' + (item.kind === 'video' ? 'video' : 'photo') + ' from @' + item.account + ' on Instagram' + (item.tags ? ': ' + item.tags.join(', ') : '') });
    box.appendChild(hit);
    if (item.kind === 'video') box.classList.add('reel');
    // Once Instagram sizes its iframe, work out the photo's shape from it (unless content.json gives a ratio).
    if (!item.ratio && window.ResizeObserver) {
      // The shape is measured once, from the first proper size Instagram reports, then kept.
      // (Instagram can report a wrong size after a tile is hidden and shown again by a filter.)
      var r = 0;
      var watch = new ResizeObserver(function () {
        var f = box.querySelector('iframe.instagram-media');
        if (!f) return;
        var h = f.getBoundingClientRect().height, w = box.getBoundingClientRect().width;
        if (w <= 0) return;
        if (!r) {
          var mediaH = h - IG_HEAD - IG_FOOT;
          if (h > 200 && mediaH > 40) { r = w / mediaH; box.style.setProperty('--r', r.toFixed(4)); }
        }
        // Reels are tall (9:16) inside a wider frame, which leaves black side bars. Zoom in to fill.
        if (r && item.kind === 'video') {
          box.style.setProperty('--s', Math.max(1, r / 0.5625).toFixed(3));
          box.style.setProperty('--oy', (IG_HEAD + 1 + (w / r) / 2) + 'px');
        }
      });
      watch.observe(box);
      new MutationObserver(function () {
        var f = box.querySelector('iframe.instagram-media');
        if (f && !f.__watched) { f.__watched = true; watch.observe(f); }
      }).observe(box, { childList: true, subtree: true });
    }
    return box;
  }

  // Tags under a piece. Clicking one searches the site for it.
  var onTag = function () {};
  function tagList(item) {
    if (!item.tags || !item.tags.length) return null;
    var row = el('div', { 'class': 'tags' });
    item.tags.forEach(function (t) {
      var b = el('button', { 'class': 'tag', type: 'button', text: t, 'aria-label': 'Show more tagged ' + t });
      b.addEventListener('click', function () { onTag(t); });
      row.appendChild(b);
    });
    return row;
  }

  var PLATFORM = { instagram: 'Instagram', youtube: 'YouTube', spotify: 'Spotify', apple: 'Apple Music', threads: 'Threads' };
  // The grey box: who posted it, where and when (linking to the original post), then the original caption.
  // A post that shares something (a Threads post linking to a reel, say) is credited to the post,
  // with a line naming what it shares; the picture itself opens the shared piece.
  var THING = { video: 'video', photo: 'post', music: 'track', link: 'link' };
  function handle(name, social) {
    var acct = (name || '').replace(/^@/, '');
    return social && acct && !/\s/.test(acct) ? '@' + acct : acct; // channel names with spaces get no @
  }
  function sourceBox(item) {
    var social = item.platform === 'instagram' || item.platform === 'youtube' || item.platform === 'threads';
    var parts, href, second = item.caption;
    if (item.via) {
      var by = (item.via.match(/threads\.(?:com|net)\/@([\w.]+)/) || [])[1];
      parts = [handle(by, true), 'Threads', fmtDate(item.date)];
      href = item.via;
      var thing = item.platform === 'instagram' && item.kind === 'video' ? 'reel' : (THING[item.kind] || 'post');
      var owner = handle(item.account, social);
      second = 'Sharing a ' + thing + (owner ? ' by ' + owner : '') + (item.caption ? ': ' + item.caption : '');
    } else {
      var who = handle(item.account, social);
      parts = [item.source === 'shared' && social ? 'Shared from ' + who : who];
      if (PLATFORM[item.platform]) parts.push(PLATFORM[item.platform]);
      parts.push(fmtDate(item.date));
      href = item.url;
    }
    return el('div', { 'class': 'source' }, [
      el('a', { 'class': 'label', href: href, target: '_blank', rel: 'noopener', text: parts.filter(Boolean).join(' \u00b7 ') }),
      second ? el('span', { 'class': 'orig', text: second }) : null
    ]);
  }
  function credit(item) {
    return el('div', { 'class': 'credit' }, [
      sourceBox(item),
      item.note ? el('span', { 'class': 'note', text: item.note }) : null,
      tagList(item)
    ]);
  }

  // ---- Tiles for other platforms ---------------------------------------
  function playIcon() {
    var p = el('span', { 'class': 'playbtn', 'aria-hidden': 'true' });
    p.innerHTML = '<svg width="16" height="16" viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="#111"/></svg>';
    return p;
  }

  // YouTube: the video's thumbnail; it plays right here on click.
  function youtubeTile(item) {
    var id = (item.url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    var box = el('div', { 'class': 'tile wide' });
    box.appendChild(el('img', { src: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', alt: item.caption || 'YouTube video', loading: 'lazy' }));
    var hit = el('button', { 'class': 'hit', type: 'button', 'aria-label': 'Play video' + (item.caption ? ': ' + item.caption : '') }, [playIcon()]);
    hit.addEventListener('click', function () {
      box.innerHTML = '';
      box.appendChild(el('iframe', {
        src: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1',
        title: item.caption || 'YouTube video', allowfullscreen: '',
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen'
      }));
    });
    box.appendChild(hit);
    return box;
  }

  // Spotify: the album art; the player appears in its place on click.
  function spotifyTile(item) {
    var path = item.url.replace(/^https?:\/\/open\.spotify\.com\//, '').split('?')[0];
    var box = el('div', { 'class': 'tile square' });
    if (item.image) box.appendChild(el('img', { src: item.image, alt: item.caption || 'Album art', loading: 'lazy' }));
    var hit = el('button', { 'class': 'hit', type: 'button', 'aria-label': 'Play ' + (item.caption || 'track') + ' on Spotify' }, [playIcon()]);
    hit.addEventListener('click', function () {
      box.className = 'tile player';
      box.innerHTML = '';
      box.appendChild(el('iframe', {
        src: 'https://open.spotify.com/embed/' + path + '?autoplay=1', title: item.caption || 'Spotify',
        allow: 'autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture'
      }));
    });
    box.appendChild(hit);
    return box;
  }

  // Apple Music: the album art; Apple's player appears in its place on click.
  function appleTile(item) {
    var u = new URL(item.url);
    var song = u.searchParams.has('i') || /\/song\//.test(u.pathname);
    u.hostname = 'embed.music.apple.com';
    u.searchParams.delete('uo');
    var box = el('div', { 'class': 'tile square' });
    if (item.image) box.appendChild(el('img', { src: item.image, alt: item.caption || 'Album art', loading: 'lazy' }));
    var hit = el('button', { 'class': 'hit', type: 'button', 'aria-label': 'Play ' + (item.caption || 'track') + ' on Apple Music' }, [playIcon()]);
    hit.addEventListener('click', function () {
      box.className = 'tile player apple' + (song ? ' song' : '');
      box.innerHTML = '';
      box.appendChild(el('iframe', {
        src: u.toString(), title: item.caption || 'Apple Music',
        allow: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write',
        sandbox: 'allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation'
      }));
    });
    box.appendChild(hit);
    return box;
  }

  // A web link: its preview image; opens the page in a new tab.
  function linkTile(item) {
    var a = el('a', { 'class': 'tile link', href: item.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open ' + (item.caption || item.url) });
    if (item.image) a.appendChild(el('img', { src: item.image, alt: '', loading: 'lazy' }));
    var go = el('span', { 'class': 'go', 'aria-hidden': 'true' });
    go.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18"><path d="M5 13L13 5M6 5h7v7" stroke="#111" stroke-width="1.6" fill="none"/></svg>';
    a.appendChild(go);
    return a;
  }

  // Threads photo or video post: Threads' own embed, trimmed to the words and pictures.
  // Its header (name, Follow) and footer (date, buttons) are clipped. Opens on Threads on click.
  var TH_HEAD = 62, TH_FOOT = 78; // Threads embed header and footer heights (px)
  function threadsTile(item) {
    var box = el('div', { 'class': 'tmask' });
    box.appendChild(el('blockquote', {
      'class': 'text-post-media', 'data-text-post-permalink': item.url, 'data-text-post-version': '0'
    }, [el('a', { href: item.url, target: '_blank', rel: 'noopener', text: 'View on Threads' })]));
    var hit = el('a', { 'class': 'hit', href: item.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open the original post on Threads' });
    box.appendChild(hit);
    if (window.ResizeObserver) {
      // Measured once from the first proper size Threads reports, then kept (same reason as Instagram).
      var h = 0;
      var watch = new ResizeObserver(function () {
        var f = box.querySelector('iframe');
        if (!f || h) return;
        var fh = f.getBoundingClientRect().height;
        if (fh > TH_HEAD + TH_FOOT + 60) { h = fh - TH_HEAD - TH_FOOT; box.style.setProperty('--h', h + 'px'); }
      });
      new MutationObserver(function () {
        var f = box.querySelector('iframe');
        if (f && !f.__watched) { f.__watched = true; watch.observe(f); }
      }).observe(box, { childList: true, subtree: true });
    }
    return box;
  }

  // A text post (Threads, X): the words are the picture.
  function textTile(item) {
    var a = el('a', { 'class': 'tile text', href: item.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open the original post' }, [
      el('p', { 'class': 'words', text: item.text || '' })
    ]);
    var go = el('span', { 'class': 'go', 'aria-hidden': 'true' });
    go.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18"><path d="M5 13L13 5M6 5h7v7" stroke="#111" stroke-width="1.6" fill="none"/></svg>';
    a.appendChild(go);
    return a;
  }

  // A quote from an article or blog post: the line itself, set large on a dark card.
  function quoteTile(item) {
    var a = el('a', { 'class': 'tile quote', href: item.url, target: '_blank', rel: 'noopener', 'aria-label': 'Read the full piece: ' + (item.caption || item.url) }, [
      el('span', { 'class': 'mark', 'aria-hidden': 'true', text: '\u201c' }),
      el('blockquote', { 'class': 'words', text: item.text || '' })
    ]);
    var go = el('span', { 'class': 'go', 'aria-hidden': 'true' });
    go.innerHTML = '<svg width="16" height="16" viewBox="0 0 18 18"><path d="M5 13L13 5M6 5h7v7" stroke="#111" stroke-width="1.6" fill="none"/></svg>';
    a.appendChild(go);
    return a;
  }

  function tile(item) {
    if (item.kind === 'quote') return quoteTile(item);
    if (item.platform === 'instagram') return trimmed(item);
    if (item.platform === 'youtube') return youtubeTile(item);
    if (item.platform === 'spotify') return spotifyTile(item);
    if (item.platform === 'apple') return appleTile(item);
    if (item.platform === 'threads' && item.kind !== 'post') return threadsTile(item);
    if (item.kind === 'post') return textTile(item);
    return linkTile(item);
  }


  function processEmbeds() {
    if (document.querySelector('blockquote.instagram-media')) {
      loadScript('https://www.instagram.com/embed.js', function () {
        if (window.instgrm) window.instgrm.Embeds.process();
      });
    }
    if (document.querySelector('blockquote.text-post-media')) {
      loadScript('https://www.threads.com/embed.js', function () {});
    }
  }

  // ---- Masonry ------------------------------------------------------------

  var gapPx = 22;
  function fit(card) {
    var h = card.getBoundingClientRect().height;
    card.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + gapPx) / ROW));
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) { fit(e.target); });
  }) : null;

  // ---- Page ---------------------------------------------------------------

  function render(data) {
    // Archived pieces stay in content.json (so the daily import knows not to re-add them) but never show.
    var site = data.site, items = data.items.filter(function (i) { return !i.archived; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    document.getElementById('intro').textContent = site.intro;
    document.getElementById('copy').textContent = '© ' + new Date().getFullYear() + ' ' + site.name;
    var links = document.getElementById('links');
    site.links.forEach(function (l) { links.appendChild(el('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.label })); });

    // Now
    var now = items.filter(function (i) { return i.now; })[0];
    if (now) {
      var sec = document.getElementById('now');
      sec.appendChild(el('h2', { 'class': 'section-title', text: 'Now' }));
      sec.appendChild(el('div', { 'class': 'now-media' }, [now.platform === 'instagram' ? trimmed(now) : tile(now)]));
      sec.appendChild(el('div', { 'class': 'now-text' }, [
        now.note ? el('h3', { 'class': 'now-title', text: now.note }) : null,
        sourceBox(now),
        tagList(now)
      ]));
      sec.hidden = false;
    }

    // Grid
    var grid = document.getElementById('grid');
    gapPx = parseFloat(getComputedStyle(grid).columnGap) || 22;
    var rest = items.filter(function (i) { return !i.now; });

    function makeCard(item, n, inPins) {
      // Size: "small" (1 column), "medium" (2) or "large" (3, the full row). "large": true is the old way of saying medium.
      // Pinned pieces always sit one column wide in the pinned row.
      var size = inPins ? 'small' : (item.size || (item.large ? 'medium' : 'small'));
      var card = el('article', { 'class': 'card' + (size === 'medium' ? ' big' : size === 'large' ? ' full' : ''), 'data-kind': item.kind }, [
        tile(item),
        credit(item)
      ]);
      card.dataset.text = [item.title, item.text, item.note, item.caption, item.account, item.platform, item.kind].concat(item.tags || []).join(' ').toLowerCase();
      card.style.animationDelay = (n * 50) + 'ms';
      return card;
    }

    // Pinned: up to three pieces held under Now, whatever arrives later.
    var pinned = rest.filter(function (i) { return i.pinned; }).slice(0, 3);
    var pinSec = document.getElementById('pinned');
    if (pinned.length) {
      var row = pinSec.querySelector('.pins');
      pinned.forEach(function (item, n) { row.appendChild(makeCard(item, n, true)); });
      pinSec.hidden = false;
    }

    rest.forEach(function (item, n) {
      var card = makeCard(item, n, false);
      // A pinned piece also lives in the grid, but only shows there when someone filters or searches.
      if (pinned.indexOf(item) !== -1) card.dataset.pinned = '1';
      grid.appendChild(card);
      if (ro) ro.observe(card);
    });

    // Filters: only show kinds that have content
    var nav = document.getElementById('filters');
    var counts = { all: rest.length };
    rest.forEach(function (i) { counts[i.kind] = (counts[i.kind] || 0) + 1; });
    var choices = [['all', 'All']].concat(KINDS.filter(function (k) { return counts[k[0]]; }));
    var state = { kind: 'all', q: '' };
    var empty = el('p', { 'class': 'empty', hidden: '' });
    grid.parentNode.appendChild(empty);
    function apply() {
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
      var browsing = state.kind === 'all' && !words.length;
      grid.querySelectorAll('.card').forEach(function (c) {
        var ok = (state.kind === 'all' || c.dataset.kind === state.kind) &&
          words.every(function (w) { return c.dataset.text.indexOf(w) !== -1; }) &&
          !(browsing && c.dataset.pinned);
        c.hidden = !ok; if (ok) shown++;
      });
      document.getElementById('now').hidden = !now || !browsing;
      document.getElementById('pinned').hidden = !pinned.length || !browsing;
      document.getElementById('rest-title').hidden = !browsing;
      empty.hidden = shown > 0;
      empty.textContent = shown ? '' : 'Nothing here matches \u201c' + state.q.trim() + '\u201d.';
    }
    choices.forEach(function (k) {
      var b = el('button', { 'class': 'pill', type: 'button', 'aria-pressed': k[0] === 'all' ? 'true' : 'false' }, [
        document.createTextNode(k[1]), el('span', { 'class': 'n', text: String(counts[k[0]]) })
      ]);
      b.addEventListener('click', function () {
        nav.querySelectorAll('.pill').forEach(function (p) { p.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        state.kind = k[0]; apply();
      });
      nav.appendChild(b);
    });

    apply();
    var search = document.getElementById('search');
    search.addEventListener('input', function () { state.q = search.value; apply(); });
    onTag = function (t) {
      search.value = t; state.q = t; apply();
      document.querySelector('.top').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };


    window.addEventListener('resize', function () {
      gapPx = parseFloat(getComputedStyle(grid).columnGap) || 22;
      grid.querySelectorAll('.card').forEach(fit);
    });

    processEmbeds();
  }

  fetch('content.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {
      document.getElementById('grid').textContent = 'Content could not be loaded.';
    });
})();
