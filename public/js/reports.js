/*
 * /reports — client.
 *
 * Fetches from /api/reports/*, renders, and gets out of the way. No framework
 * and no build step: the page is a handful of tables and one chart, and the
 * server already did the aggregation.
 *
 * Everything user- or PostHog-supplied reaches the DOM through textContent or
 * a created text node. Event names and property values originate in a browser I
 * do not control, so building rows with innerHTML would be a stored-XSS hole in
 * a page that renders whatever anyone chose to send my collector.
 */
(function () {
  var S = window.__REPORTS__ || { days: 7, site: 'all' };
  var qs = function (id) { return document.getElementById(id); };

  var errorBox = qs('error');
  var logBody = qs('log').querySelector('tbody');
  var loadMore = qs('load-more');
  var eventFilter = qs('event-filter');

  var state = { cursor: null, eventName: '', loading: false };

  /* ── helpers ───────────────────────────────────────────────────────────── */

  function query(extra) {
    var p = new URLSearchParams({ days: S.days, site: S.site });
    for (var k in (extra || {})) if (extra[k] !== null && extra[k] !== '') p.set(k, extra[k]);
    return p.toString();
  }

  function num(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('en-IN');
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  async function getJSON(url) {
    var res = await fetch(url, { headers: { Accept: 'application/json' } });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(body.error || (res.status + ' ' + res.statusText));
    return body;
  }

  /** A <td>, built from text only. */
  function cell(text, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text === null || text === undefined || text === '' ? '—' : String(text);
    return td;
  }

  function setRows(tableId, items, build, emptyText) {
    var body = qs(tableId).querySelector('tbody');
    body.textContent = '';
    if (!items || !items.length) {
      var tr = document.createElement('tr');
      tr.className = 'rp-empty';
      var td = document.createElement('td');
      td.colSpan = qs(tableId).querySelectorAll('thead th').length;
      td.textContent = emptyText || 'Nothing recorded in this window.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    items.forEach(function (item, i) { body.appendChild(build(item, i, items)); });
  }

  /** A count cell with a proportional bar — reading a table of numbers is much
      faster with a shape attached to it. */
  function countCell(value, max) {
    var td = cell(num(value), 'n');
    var bar = document.createElement('span');
    bar.className = 'rp-bar';
    bar.style.width = (max > 0 ? Math.max(2, (value / max) * 100) : 0) + '%';
    td.appendChild(bar);
    return td;
  }

  function siteBadge(site) {
    var span = document.createElement('span');
    span.className = 'rp-site ' + (site === 'immersive' ? 'rp-site-b' : 'rp-site-a');
    span.textContent = site || '—';
    var td = document.createElement('td');
    td.appendChild(span);
    return td;
  }

  var fmtTime = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  function when(iso) {
    var d = new Date(iso);
    return isNaN(d) ? String(iso) : fmtTime.format(d);
  }
  function ago(iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (!isFinite(s)) return '—';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  /* ── chart ─────────────────────────────────────────────────────────────── */

  /**
   * Grouped daily bars, drawn as inline SVG.
   *
   * Built with createElementNS rather than an innerHTML string so day labels
   * and values cannot inject markup, and so it inherits the theme's tokens.
   */
  function renderChart(daily) {
    var host = qs('chart');
    host.textContent = '';
    if (!daily || !daily.length) {
      var p = document.createElement('p');
      p.className = 'rp-count';
      p.textContent = 'No events in this window.';
      host.appendChild(p);
      return;
    }

    // Collapse [day, site] rows into one row per day with a column per site.
    var byDay = new Map();
    daily.forEach(function (r) {
      var d = String(r.day).slice(0, 10);
      var e = byDay.get(d) || { day: d, a: 0, b: 0 };
      if (r.site === 'immersive') e.b += Number(r.events) || 0;
      else e.a += Number(r.events) || 0;
      byDay.set(d, e);
    });
    var days = [...byDay.values()].sort(function (x, y) { return x.day < y.day ? -1 : 1; });

    var W = 1000, H = 170, PAD_B = 22, PAD_L = 34;
    var max = Math.max.apply(null, days.map(function (d) { return Math.max(d.a, d.b); }).concat([1]));
    var plotH = H - PAD_B;
    var slot = (W - PAD_L) / days.length;
    var barW = Math.max(2, Math.min(18, (slot - 4) / 2));

    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');

    function add(tag, attrs, text) {
      var el = document.createElementNS(NS, tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      if (text !== undefined) el.textContent = text;
      svg.appendChild(el);
      return el;
    }

    // Three gridlines is enough to read a magnitude off without clutter.
    [0, 0.5, 1].forEach(function (f) {
      var y = plotH - f * plotH;
      add('line', { x1: PAD_L, x2: W, y1: y, y2: y, class: 'rp-gridline' });
      add('text', { x: 0, y: y + 3, class: 'rp-axis' }, num(Math.round(max * f)));
    });

    days.forEach(function (d, i) {
      var x = PAD_L + i * slot + (slot - barW * 2) / 2;
      [['a', 'var(--brand-500)'], ['b', 'var(--accent)']].forEach(function (pair, j) {
        var v = d[pair[0]];
        if (!v) return;
        var h = Math.max(1, (v / max) * plotH);
        var bar = add('rect', {
          x: x + j * barW, y: plotH - h, width: barW - 1, height: h,
          fill: pair[1], rx: 2,
        });
        var t = document.createElementNS(NS, 'title');
        t.textContent = d.day + ' · ' + (pair[0] === 'a' ? 'anmolmathur.com' : 'immersive') + ' · ' + num(v);
        bar.appendChild(t);
      });

      // Label every day when there are few, then thin out so they never collide.
      var every = days.length <= 10 ? 1 : Math.ceil(days.length / 10);
      if (i % every === 0) {
        add('text', {
          x: PAD_L + i * slot + slot / 2, y: H - 6,
          class: 'rp-axis', 'text-anchor': 'middle',
        }, d.day.slice(5));
      }
    });

    host.appendChild(svg);
  }

  /* ── panels ────────────────────────────────────────────────────────────── */

  async function loadSummary() {
    try {
      var d = await getJSON('/api/reports/summary?' + query());
      showError('');

      var t = d.totals || {};
      [['events', t.events], ['pageviews', t.pageviews], ['visitors', t.visitors], ['sessions', t.sessions]]
        .forEach(function (pair) {
          var el = document.querySelector('[data-stat="' + pair[0] + '"]');
          if (el) el.textContent = num(pair[1]);
        });

      renderChart(d.daily);

      var maxEvent = Math.max.apply(null, (d.byEvent || []).map(function (r) { return r.c; }).concat([1]));
      setRows('by-event', d.byEvent, function (r) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        var span = document.createElement('span');
        span.className = 'rp-ev' + (String(r.event).charAt(0) === '$' ? ' is-auto' : '');
        span.textContent = r.event;
        td.appendChild(span);
        tr.appendChild(td);
        tr.appendChild(siteBadge(r.site));
        tr.appendChild(countCell(r.c, maxEvent));
        tr.appendChild(cell(ago(r.last_seen), 'rp-time'));
        // Clicking an event name filters the log below to it.
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', function () {
          eventFilter.value = r.event;
          applyEventFilter();
          qs('log').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return tr;
      });

      var maxPage = Math.max.apply(null, (d.pages || []).map(function (r) { return r.views; }).concat([1]));
      setRows('pages', d.pages, function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(cell(r.path, 'rp-mono'));
        tr.appendChild(siteBadge(r.site));
        tr.appendChild(countCell(r.views, maxPage));
        tr.appendChild(cell(num(r.visitors), 'n'));
        return tr;
      });

      var maxRef = Math.max.apply(null, (d.referrers || []).map(function (r) { return r.c; }).concat([1]));
      setRows('referrers', d.referrers, function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(cell(r.source));
        tr.appendChild(countCell(r.c, maxRef));
        tr.appendChild(cell(num(r.visitors), 'n'));
        return tr;
      });

      var maxDev = Math.max.apply(null, (d.devices || []).map(function (r) { return r.c; }).concat([1]));
      setRows('devices', d.devices, function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(cell(r.device));
        tr.appendChild(cell(r.browser));
        tr.appendChild(countCell(r.c, maxDev));
        return tr;
      });

      var maxC = Math.max.apply(null, (d.countries || []).map(function (r) { return r.c; }).concat([1]));
      setRows('countries', d.countries, function (r) {
        var tr = document.createElement('tr');
        tr.appendChild(cell(r.country));
        tr.appendChild(countCell(r.c, maxC));
        tr.appendChild(cell(num(r.visitors), 'n'));
        return tr;
      });

      // Only meaningful once immersive traffic exists; hidden rather than empty.
      var hasConcepts = (d.concepts || []).length > 0;
      qs('concepts-card').hidden = !hasConcepts;
      if (hasConcepts) {
        var maxCon = Math.max.apply(null, d.concepts.map(function (r) { return r.c; }).concat([1]));
        setRows('concepts', d.concepts, function (r) {
          var tr = document.createElement('tr');
          tr.appendChild(cell(r.concept));
          tr.appendChild(countCell(r.c, maxCon));
          tr.appendChild(cell(num(r.visitors), 'n'));
          return tr;
        });
      }

      qs('meta').textContent =
        'Last ' + d.days + ' days · ' + (d.site === 'all' ? 'both sites' : d.site) +
        ' · updated ' + when(d.generated_at) + (d.cached ? ' (cached)' : '');
    } catch (err) {
      showError('Could not load the summary: ' + err.message);
    }
  }

  /* ── the log ───────────────────────────────────────────────────────────── */

  function logRow(e) {
    var tr = document.createElement('tr');
    tr.appendChild(cell(when(e.timestamp), 'rp-time'));

    var evTd = document.createElement('td');
    var ev = document.createElement('span');
    ev.className = 'rp-ev' + (String(e.event).charAt(0) === '$' ? ' is-auto' : '');
    ev.textContent = e.event;
    evTd.appendChild(ev);
    tr.appendChild(evTd);

    tr.appendChild(siteBadge(e.site));
    tr.appendChild(cell(e.path, 'rp-mono'));

    // The captured properties, as key=value pills. Values are stringified and
    // clipped: an object or a long string would otherwise blow the row height.
    var props = document.createElement('td');
    props.className = 'rp-props';
    var keys = Object.keys(e.props || {});
    if (!keys.length) {
      props.textContent = '—';
    } else {
      keys.slice(0, 8).forEach(function (k) {
        var v = e.props[k];
        var text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        var pill = document.createElement('span');
        pill.className = 'rp-prop';
        var b = document.createElement('b');
        b.textContent = k + '=';
        pill.appendChild(b);
        pill.appendChild(document.createTextNode(text.length > 60 ? text.slice(0, 60) + '…' : text));
        pill.title = k + ' = ' + text;
        props.appendChild(pill);
      });
      if (keys.length > 8) props.appendChild(document.createTextNode(' +' + (keys.length - 8) + ' more'));
    }
    tr.appendChild(props);

    tr.appendChild(cell(e.person, 'rp-mono'));
    tr.appendChild(cell([e.country, e.device].filter(Boolean).join(' · ')));
    return tr;
  }

  async function loadEvents(append) {
    if (state.loading) return;
    state.loading = true;
    loadMore.disabled = true;

    try {
      var d = await getJSON('/api/reports/events?' + query({
        event: state.eventName,
        before: append ? state.cursor : null,
        limit: 150,
      }));
      showError('');

      if (!append) logBody.textContent = '';
      // Strip the "Loading…"/empty placeholder before the first real row lands.
      var placeholder = logBody.querySelector('.rp-empty');
      if (placeholder) placeholder.remove();

      d.events.forEach(function (e) { logBody.appendChild(logRow(e)); });

      state.cursor = d.next;
      loadMore.hidden = !d.next;

      var total = logBody.querySelectorAll('tr').length;
      qs('log-count').textContent = total
        ? total + ' event' + (total === 1 ? '' : 's') + (d.next ? ' (more available)' : '')
        : '';

      if (!total) {
        var tr = document.createElement('tr');
        tr.className = 'rp-empty';
        var td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = state.eventName
          ? 'No "' + state.eventName + '" events in this window.'
          : 'No events recorded in this window.';
        tr.appendChild(td);
        logBody.appendChild(tr);
      }
    } catch (err) {
      showError('Could not load the event log: ' + err.message);
    } finally {
      state.loading = false;
      loadMore.disabled = false;
    }
  }

  /* ── wiring ────────────────────────────────────────────────────────────── */

  function applyEventFilter() {
    state.eventName = eventFilter.value.trim();
    state.cursor = null;
    loadEvents(false);
  }

  // Debounced: this hits ClickHouse, so it must not fire per keystroke.
  var debounce;
  eventFilter.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(applyEventFilter, 350);
  });

  loadMore.addEventListener('click', function () { loadEvents(true); });

  qs('refresh').addEventListener('click', async function () {
    var btn = this;
    btn.dataset.busy = '1';
    try {
      await fetch('/api/reports/refresh', { method: 'POST' });
      state.cursor = null;
      await Promise.all([loadSummary(), loadEvents(false)]);
    } catch (err) {
      showError('Refresh failed: ' + err.message);
    } finally {
      delete btn.dataset.busy;
    }
  });

  /* Live mode. Only re-polls the log — the aggregates move slowly and each one
     is a separate ClickHouse query. Paused while the tab is hidden so a
     forgotten tab doesn't hammer PostHog all day. */
  var timer = null;
  qs('autorefresh').addEventListener('change', function () {
    clearInterval(timer);
    if (!this.checked) return;
    timer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      state.cursor = null;
      loadEvents(false);
    }, 20_000);
  });

  /* ── Weekly reports ────────────────────────────────────────────────────── */

  /** "30 Aug, 09:32 · 2h ago" — the date to identify it, the age to rank it. */
  function when_(iso) { return when(iso) + ' · ' + ago(iso); }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  var viewer = qs('viewer');
  var viewerFrame = qs('viewer-frame');

  function openReport(file) {
    var url = '/api/reports/archive/file?name=' + encodeURIComponent(file.name);
    qs('viewer-title').textContent = file.name;
    qs('viewer-open').href = url;
    viewerFrame.src = url;
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeReport() {
    viewer.hidden = true;
    // Blank the src so the report stops running and a stale page never flashes
    // behind the next one that opens.
    viewerFrame.src = 'about:blank';
    document.body.style.overflow = '';
  }

  qs('viewer-close').addEventListener('click', closeReport);
  viewer.addEventListener('click', function (e) { if (e.target === viewer) closeReport(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !viewer.hidden) closeReport();
  });

  async function loadWeekly() {
    var host = qs('weekly');
    try {
      var d = await getJSON('/api/reports/archive');
      host.textContent = '';

      if (!d.files.length) {
        var p = document.createElement('p');
        p.className = 'rp-weekly-empty';
        p.textContent = 'No weekly report yet — the first one lands on Saturday morning.';
        host.appendChild(p);
        qs('weekly-count').textContent = '';
        return;
      }

      var list = document.createElement('div');
      list.className = 'rp-weekly-list';
      d.files.forEach(function (f) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rp-weekly-item';

        var dot = document.createElement('span');
        dot.className = 'rp-dot';
        dot.textContent = f.ext.toUpperCase().slice(0, 4);

        var body = document.createElement('span');
        var name = document.createElement('span');
        name.className = 'rp-weekly-name';
        name.textContent = f.name;
        var when = document.createElement('span');
        when.className = 'rp-weekly-when';
        when.textContent = when_(f.modified);
        body.appendChild(name);
        body.appendChild(document.createElement('br'));
        body.appendChild(when);

        var meta = document.createElement('span');
        meta.className = 'n';
        meta.textContent = fmtSize(f.size);

        btn.appendChild(dot);
        btn.appendChild(body);
        btn.appendChild(meta);
        btn.addEventListener('click', function () { openReport(f); });
        list.appendChild(btn);
      });
      host.appendChild(list);
      qs('weekly-count').textContent =
        d.count + ' report' + (d.count === 1 ? '' : 's');
    } catch (err) {
      host.textContent = '';
      var p2 = document.createElement('p');
      p2.className = 'rp-weekly-empty';
      p2.textContent = 'Could not list weekly reports: ' + err.message;
      host.appendChild(p2);
    }
  }

  loadWeekly();
  loadSummary();
  loadEvents(false);
})();
