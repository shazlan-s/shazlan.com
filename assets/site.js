// Shazlan.com — renders the page from content.json.
// To add something to the site, add an entry to content.json. No code changes needed.

(function () {
  var KINDS = [
    ['video', 'Videos'], ['photo', 'Photos'], ['post', 'Posts'],
    ['music', 'Music'], ['link', 'Links'], ['comment', 'Comments']
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

  function instagram(item) {
    var link = el('a', { href: item.url, target: '_blank', rel: 'noopener', text: 'View this post on Instagram' });
    return el('blockquote', {
      'class': 'instagram-media',
      'data-instgrm-permalink': item.url + '?utm_source=ig_embed',
      'data-instgrm-version': '14'
    }, [link]);
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

  // Someone else's post: a card in the site's own style. The original opens on click.
  function sharedCard(item) {
    var handle = '@' + (item.account || '').replace(/^@/, '');
    var where = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : 'Web';
    var what = item.kind === 'video' ? 'reel' : 'post';
    var btn = el('button', { 'class': 'shared', type: 'button', 'aria-label': 'Open ' + handle + "'s " + what }, [
      el('div', { 'class': 'row' }, [
        el('span', { 'class': 'label', text: 'Shared · ' + where + ' ' + what })
      ]),
      el('div', { 'class': 'who2' }, [
        el('div', { 'class': 'avatar', 'aria-hidden': 'true', text: handle.charAt(1).toUpperCase() }),
        el('div', { 'class': 'acct' }, [
          el('span', { 'class': 'handle', text: handle }),
          item.title ? el('span', { 'class': 'desc', text: item.title }) : null
        ])
      ]),
      item.note ? el('span', { 'class': 'say', text: item.note }) : null,
      el('span', { 'class': 'label', text: 'Opens the original' })
    ]);
    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('width', '18'); arrow.setAttribute('height', '18'); arrow.setAttribute('viewBox', '0 0 18 18'); arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<path d="M5 13L13 5M6 5h7v7" stroke="#111" stroke-width="1.5" fill="none"/>';
    btn.firstChild.appendChild(arrow);
    btn.addEventListener('click', function () { openOriginal(item, btn); });
    return btn;
  }

  var lastFocus = null;
  function openOriginal(item, from) {
    var lb = document.getElementById('lb'), body = document.getElementById('lb-body');
    body.innerHTML = '';
    body.appendChild(media(item));
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lastFocus = from;
    document.getElementById('lb-close').focus();
    processEmbeds();
  }
  function closeOriginal() {
    var lb = document.getElementById('lb');
    if (lb.hidden) return;
    lb.hidden = true;
    document.getElementById('lb-body').innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  function processEmbeds() {
    if (document.querySelector('blockquote.instagram-media')) {
      loadScript('https://www.instagram.com/embed.js', function () {
        if (window.instgrm) window.instgrm.Embeds.process();
      });
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
    var site = data.site, items = data.items.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    document.getElementById('intro').textContent = site.intro;
    document.getElementById('copy').textContent = '© ' + new Date().getFullYear() + ' ' + site.name;
    var links = document.getElementById('links');
    site.links.forEach(function (l) { links.appendChild(el('a', { href: l.url, target: '_blank', rel: 'noopener', text: l.label })); });

    // Now
    var now = items.filter(function (i) { return i.now; })[0];
    if (now) {
      var sec = document.getElementById('now');
      sec.appendChild(el('div', { 'class': 'now-media' }, [media(now)]));
      sec.appendChild(el('div', { 'class': 'now-text' }, [
        el('span', { 'class': 'label', text: 'Now · ' + fmtDate(now.date) }),
        now.title ? el('h2', { 'class': 'now-title', text: now.title }) : null,
        now.note ? el('p', { 'class': 'now-note', text: now.note }) : null
      ]));
      sec.hidden = false;
    }

    // Grid
    var grid = document.getElementById('grid');
    gapPx = parseFloat(getComputedStyle(grid).columnGap) || 22;
    var rest = items.filter(function (i) { return !i.now; });
    rest.forEach(function (item, n) {
      var shared = item.source === 'shared';
      var card = el('article', { 'class': 'card' + (item.large ? ' big' : ''), 'data-kind': item.kind }, [
        shared ? sharedCard(item) : media(item),
        !shared && item.note ? el('div', { 'class': 'meta' }, [el('span', { 'class': 'note', text: item.note })]) : null
      ]);
      card.style.animationDelay = (n * 50) + 'ms';
      grid.appendChild(card);
      if (ro) ro.observe(card);
    });

    // Filters: only show kinds that have content
    var nav = document.getElementById('filters');
    var counts = { all: rest.length };
    rest.forEach(function (i) { counts[i.kind] = (counts[i.kind] || 0) + 1; });
    var choices = [['all', 'All']].concat(KINDS.filter(function (k) { return counts[k[0]]; }));
    choices.forEach(function (k) {
      var b = el('button', { 'class': 'pill', type: 'button', 'aria-pressed': k[0] === 'all' ? 'true' : 'false' }, [
        document.createTextNode(k[1]), el('span', { 'class': 'n', text: String(counts[k[0]]) })
      ]);
      b.addEventListener('click', function () {
        nav.querySelectorAll('.pill').forEach(function (p) { p.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        grid.querySelectorAll('.card').forEach(function (c) { c.hidden = !(k[0] === 'all' || c.dataset.kind === k[0]); });
        document.getElementById('now').hidden = !now || k[0] !== 'all';
      });
      nav.appendChild(b);
    });

    document.getElementById('lb-close').addEventListener('click', closeOriginal);
    document.getElementById('lb').addEventListener('click', function (e) { if (e.target.id === 'lb') closeOriginal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOriginal(); });

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
