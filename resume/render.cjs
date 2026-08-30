/*
 * PDF renderer for the resume + cover letter.
 *
 * Deliberately not a browser. Two reasons:
 *   1. Exact page control - the CV has to land on three pages, letter on the fourth.
 *   2. ATS parsing - this emits the PDF base-14 fonts (Helvetica) with a plain
 *      text layer in a single logical reading order. The old Canva export had a
 *      sidebar, and extractors spliced it into the middle of the profile and the
 *      first job. Nothing here can interleave.
 *
 * Two themes off one layout: `designed` (colour, for humans) and `ats` (black on
 * white, for portals that only read the text layer).
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const A4 = { w: 595.28, h: 841.89 };
const M = { l: 42, r: 42, t: 40, b: 38 };
const CW = A4.w - M.l - M.r;
const BOTTOM = A4.h - M.b;

const THEME = {
  designed: {
    navy: '#0E3A5C',     // petrol navy - header band, company names
    accent: '#B87333',   // bronze - used once or twice a page, never as a bullet on every heading
    ink: '#1B2733',
    text: '#33414F',
    muted: '#6A7684',
    rule: '#D5DDE5',
    onDark: '#DCE5EE',
    body: 9.4, lead: 3.4, chips: false, colour: true,
  },
  ats: {
    navy: '#000000', accent: '#000000', ink: '#000000', text: '#000000',
    muted: '#000000', rule: '#000000', onDark: '#000000',
    body: 9, lead: 2.4, chips: false, colour: false, flow: true,
  },
};

// The base-14 fonts use WinAnsi. The rupee sign is not in it.
const winansi = s => String(s).replace(/₹\s?/g, 'INR ');

/* The designed rendition puts dates in a left gutter, which costs ~90pt of text
 * width. Rather than cut the source (and lose keywords from the ATS copy), cap
 * how many bullets the designed layout shows, per role, oldest roles tightest. */
const DESIGNED_BULLETS = [4, 4, 3, 3, 3, 2, 3, 2];

/** Split "a <b>bold</b> c" into styled runs. */
function runs(s) {
  const out = [];
  const re = /<(\/?)([bi])>/g;
  let last = 0, bold = false, ital = false, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), bold, ital });
    if (m[2] === 'b') bold = !m[1];
    if (m[2] === 'i') ital = !m[1];
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: s.slice(last), bold, ital });
  return out.filter(r => r.t.length);
}

class Sheet {
  constructor(doc, th, photo) { this.doc = doc; this.th = th; this.photo = photo; this.overflow = []; }

  gap(n) { this.doc.y += n; }

  fontFor(bold, ital) {
    if (bold) return 'Helvetica-Bold';
    if (ital) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  /**
   * Inline rich text with <b>/<i> runs, wrapped to `width`.
   *
   * Laid out word by word rather than with pdfkit's `continued` option:
   * a third continued fragment makes pdfkit drop to a new line, which put
   * every bolded lead-in on its own line. Placing words directly also gives
   * exact line counts, which is what keeps the CV on three pages.
   */
  rich(str, x, width, opts = {}) {
    const d = this.doc, th = this.th;
    const size = opts.size || th.body;
    const lineGap = opts.lineGap != null ? opts.lineGap : th.lead;
    const align = opts.align || 'left';

    const parts = th.colour
      ? runs(winansi(str))
      : [{ t: winansi(str).replace(/<\/?[bi]>/g, '') }];

    d.fontSize(size).fillColor(opts.color || th.ink);

    // Tokenise into units. A style-run boundary with no whitespace across it
    // (e.g. "<b>...annually</b>, through") is NOT a break opportunity, so glue
    // those fragments into one unit — otherwise a line can open with a comma.
    const frags = [];
    for (const p of parts) {
      const font = this.fontFor(p.bold || opts.bold, p.ital || opts.ital);
      for (const tok of p.t.split(/(\s+)/)) {
        if (!tok.length) continue;
        d.font(font);
        frags.push({ t: tok, font, space: /^\s+$/.test(tok), w: d.widthOfString(tok) });
      }
    }
    const words = [];
    for (const f of frags) {
      const prev = words[words.length - 1];
      if (prev && !prev.space && !f.space) {
        prev.parts.push(f);
        prev.w += f.w;
      } else {
        words.push({ space: f.space, w: f.w, parts: [f] });
      }
    }

    d.font('Helvetica').fontSize(size);
    const lineH = d.currentLineHeight(false) + lineGap;

    let line = [], lineW = 0;
    const flush = (isLast) => {
      while (line.length && line[line.length - 1].space) lineW -= line.pop().w;
      while (line.length && line[0].space) { lineW -= line[0].w; line.shift(); }
      if (!line.length) { line = []; lineW = 0; return; }

      const slack = width - lineW;
      let extra = 0;
      let cx = x;
      if (align === 'right') cx = x + slack;
      else if (align === 'center') cx = x + slack / 2;
      else if (align === 'justify' && !isLast) {
        const gaps = line.filter(w => w.space).length;
        if (gaps > 0 && slack > 0 && slack < width * 0.35) extra = slack / gaps;
      }

      const y = d.y;
      for (const w of line) {
        if (w.space) { cx += w.w + extra; continue; }
        for (const f of w.parts) {
          d.font(f.font).text(f.t, cx, y, { lineBreak: false });
          cx += f.w;
        }
      }
      d.y = y + lineH;
      line = []; lineW = 0;
    };

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (lineW + w.w > width && line.length && !w.space) flush(false);
      line.push(w);
      lineW += w.w;
    }
    flush(true);
    return d.y;
  }

  masthead(p) {
    const d = this.doc, th = this.th;
    if (!th.colour) return this.plainHead(p);

    const BH = 138, PW = 78, PH = 104;
    d.rect(0, 0, A4.w, BH).fillColor(th.navy).fill();
    d.rect(0, BH, A4.w, 3.5).fillColor(th.accent).fill();

    if (this.photo) {
      const px = A4.w - M.r - PW;
      d.image(this.photo, px, 18, { width: PW, height: PH });
      d.rect(px, 18, PW, PH).lineWidth(1).strokeColor('#4E7DA3').stroke();
    }

    const tw = CW - (this.photo ? PW + 26 : 0);
    d.font('Helvetica-Bold').fontSize(28).fillColor('#FFFFFF')
      .text(winansi(p.name).toUpperCase(), M.l, 30, { width: tw, characterSpacing: 0.8 });
    d.font('Helvetica').fontSize(10.4).fillColor(th.accent)
      .text(winansi(p.headline), M.l, d.y + 4, { width: tw, characterSpacing: 0.5 });
    d.font('Helvetica').fontSize(8.3).fillColor(th.onDark)
      .text(winansi([p.location, p.phone, p.email, p.website, p.linkedin].join('   ·   ')),
        M.l, d.y + 7, { width: CW });

    d.y = BH + 18;
  }

  /** ATS rendition: no band, no colour, no photo. */
  plainHead(p) {
    const d = this.doc, th = this.th;
    d.font('Helvetica-Bold').fontSize(19).fillColor('#000')
      .text(winansi(p.name).toUpperCase(), M.l, M.t, { width: CW });
    d.font('Helvetica-Bold').fontSize(11).fillColor('#000')
      .text(winansi(p.headline), M.l, d.y + 3, { width: CW });
    d.font('Helvetica').fontSize(9.6).fillColor('#000')
      .text(winansi([p.location, p.phone, p.email, p.website, p.linkedin].join('  ·  ')),
        M.l, d.y + 5, { width: CW });
    const y = d.y + 6;
    d.moveTo(M.l, y).lineTo(A4.w - M.r, y).lineWidth(0.8).strokeColor('#000').stroke();
    d.y = y + 11;
  }

  /** Continuation pages carry a slim version of the band rather than the full one. */
  runhead(name, label) {
    const d = this.doc, th = this.th;
    const BH = 44;
    d.rect(0, 0, A4.w, BH).fillColor(th.navy).fill();
    d.rect(0, BH, A4.w, 2.5).fillColor(th.accent).fill();
    d.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
      .text(winansi(name).toUpperCase(), M.l, 16, { width: CW * 0.6, characterSpacing: 0.6 });
    d.font('Helvetica').fontSize(8.2).fillColor(th.onDark)
      .text(winansi(label), M.l, 19, { width: CW, align: 'right' });
    d.y = BH + 18;
  }

  tagline(t) {
    const th = this.th;
    this.rich(t, M.l, CW, { size: th.colour ? 9 : th.body, ital: th.colour, color: th.muted, lineGap: 2.6 });
    this.gap(th.colour ? 10 : 8);
  }

  heading(text) {
    const d = this.doc, th = this.th;
    d.font('Helvetica-Bold').fontSize(th.colour ? 9.6 : 11.5).fillColor(th.navy)
      .text(winansi(text).toUpperCase(), M.l, d.y, { width: CW, characterSpacing: th.colour ? 0.8 : 0 });
    const y = d.y + 3.5;
    if (th.colour) {
      d.moveTo(M.l, y).lineTo(M.l + 32, y).lineWidth(1.6).strokeColor(th.accent).stroke();
      d.moveTo(M.l + 32, y).lineTo(A4.w - M.r, y).lineWidth(0.6).strokeColor(th.rule).stroke();
    } else {
      d.moveTo(M.l, y).lineTo(A4.w - M.r, y).lineWidth(0.8).strokeColor('#000').stroke();
    }
    d.y = y + (th.colour ? 8.5 : 6);
  }

  para(text, opts = {}) {
    this.rich(text, M.l, CW, opts);
    this.gap(opts.after != null ? opts.after : 3.5);
  }

  bullets(list, x, width, opts = {}) {
    const d = this.doc, th = this.th;
    const indent = 11;
    for (const b of list) {
      const top = d.y;
      if (th.colour) {
        d.rect(x, top + 3.9, 4.5, 1.1).fillColor(th.accent).fill();
      } else {
        d.font('Helvetica').fontSize(th.body).fillColor('#000')
          .text('•', x, top, { width: 10, lineBreak: false });
      }
      d.y = top;
      this.rich(b, x + indent, width - indent, Object.assign({ color: th.text }, opts));
      this.gap(th.colour ? 3.4 : 2.2);
    }
  }

  /**
   * Designed: date in a left gutter, a bronze dot on the rail, content to the right.
   * The rail is drawn by the caller once it knows where the run of roles ended.
   */
  role(r, L, idx) {
    const d = this.doc, th = this.th;
    const end = r.end === 'Present' ? L.present : r.end;

    if (!th.colour) {
      if (d.y > BOTTOM - 110) { d.addPage(); d.y = M.t; }
      d.font('Helvetica-Bold').fontSize(11.5).fillColor('#000').text(winansi(r.title), M.l, d.y, { width: CW });
      d.font('Helvetica-Bold').fontSize(11).fillColor('#000')
        .text(winansi(`${r.company} · ${r.location}`), M.l, d.y + 1, { width: CW });
      d.font('Helvetica').fontSize(th.body).fillColor('#000')
        .text(winansi(`${r.start} – ${end}`), M.l, d.y, { width: CW });
      d.y += 3;
      this.rich(r.context, M.l, CW, { color: '#000' });
      this.gap(3);
      this.bullets(r.bullets, M.l, CW);
      this.gap(8);
      return;
    }

    const GUT = 58, RAIL = M.l + GUT, TX = RAIL + 16, TW = A4.w - M.r - TX;
    const top = d.y;
    d.font('Helvetica-Bold').fontSize(8.5).fillColor(th.navy)
      .text(winansi(r.start), M.l, top + 1.5, { width: GUT - 12, align: 'right' });
    d.font('Helvetica').fontSize(8.1).fillColor(th.muted)
      .text(winansi(end), M.l, d.y + 0.5, { width: GUT - 12, align: 'right' });
    d.circle(RAIL, top + 6, 3.2).fillColor(th.accent).fill();

    d.y = top;
    d.font('Helvetica-Bold').fontSize(11.4).fillColor(th.ink).text(winansi(r.title), TX, top, { width: TW });
    d.font('Helvetica-Bold').fontSize(9.4).fillColor(th.navy)
      .text(winansi(r.company), TX, d.y + 2, { width: TW, continued: true });
    d.font('Helvetica').fillColor(th.muted).text(winansi(`   ${r.location}`), { continued: false });
    d.y += 4;
    this.rich(r.context, TX, TW, { size: 8.5, ital: true, color: th.muted, lineGap: 2.4 });
    this.gap(4);

    const caps = this.bulletCaps || DESIGNED_BULLETS;
    const cap = caps[idx] != null ? caps[idx] : r.bullets.length;
    this.bullets(r.bullets.slice(0, cap), TX, TW);
    this.gap(10);
    return { rail: RAIL, top };
  }

  /** Draws the vertical rail behind a run of roles. */
  drawRail(rail, from, to) {
    if (!this.th.colour) return;
    this.doc.moveTo(rail, from).lineTo(rail, to).lineWidth(0.8).strokeColor(this.th.rule).stroke();
  }

  /** Three plain columns. The boxed chip grid read as a spreadsheet, so it is gone. */
  chipGrid(items) {
    const d = this.doc, th = this.th;
    if (!th.colour) { this.para(items.join(' · ')); return; }
    const cols = 3, gut = 14, cw = (CW - gut * (cols - 1)) / cols;
    let y = d.y;
    for (let i = 0; i < items.length; i += cols) {
      let maxY = y;
      items.slice(i, i + cols).forEach((t, c) => {
        const x = M.l + c * (cw + gut);
        d.y = y;
        d.rect(x, y + 3.6, 3, 3).fillColor(th.accent).fill();
        d.y = y;
        d.font('Helvetica').fontSize(8.9).fillColor(th.text)
          .text(winansi(t), x + 8, y, { width: cw - 8, lineGap: 1.4 });
        maxY = Math.max(maxY, d.y);
      });
      y = maxY + 3.4;
    }
    d.y = y + 2;
  }

  twoCol(entries, render) {
    const d = this.doc, th = this.th;
    if (!th.colour) { entries.forEach(e => { render(this, e, CW, M.l); this.gap(4); }); return; }
    const gut = 18, cw = (CW - gut) / 2;
    let y = d.y;
    for (let i = 0; i < entries.length; i += 2) {
      let maxY = y;
      entries.slice(i, i + 2).forEach((e, c) => {
        d.y = y;
        render(this, e, cw, M.l + c * (cw + gut));
        maxY = Math.max(maxY, d.y);
      });
      y = maxY + 4;
    }
    d.y = y;
  }

  labelled(label, body, opts = {}) {
    const d = this.doc, th = this.th;
    d.fontSize(opts.size || th.body).font('Helvetica-Bold').fillColor(th.navy)
      .text(winansi(label + ': '), M.l, d.y, { width: CW, continued: true, lineGap: th.lead });
    d.font('Helvetica').fillColor(th.ink).text(winansi(body), { continued: false });
    this.gap(opts.after != null ? opts.after : 2);
  }

  check(label) {
    const pages = this.doc.bufferedPageRange().count;
    if (process.env.RESUME_DEBUG) console.log(`    [${label}] y=${this.doc.y.toFixed(0)} pages=${pages}`);
    if (this.doc.y > BOTTOM) this.overflow.push(`${label}: y=${this.doc.y.toFixed(0)} > ${BOTTOM.toFixed(0)}`);
  }

  mark(label) {
    if (process.env.RESUME_DEBUG) console.log(`      . ${label} y=${this.doc.y.toFixed(0)} p=${this.doc.bufferedPageRange().count}`);
  }
}

function build(d, theme, outPath) {
  const th = THEME[theme];
  const L = d.labels, P = d.person, exp = d.experience;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M.t, bottom: M.b, left: M.l, right: M.r },
    bufferPages: true,
    info: {
      Title: d.meta.title, Author: P.name, Subject: d.meta.subject,
      Keywords: d.meta.keywords, Creator: 'anmolmathur.com resume build',
    },
    lang: d.locale,
    displayTitle: true,
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  const shot = path.join(__dirname, 'assets', 'headshot.jpg');
  const s = new Sheet(doc, th, fs.existsSync(shot) ? shot : null);
  s.bulletCaps = d.designedBullets || DESIGNED_BULLETS;

  const runRoles = (roles, offset) => {
    let rail = null, from = null, to = null;
    roles.forEach((r, i) => {
      const before = doc.y;
      const m = s.role(r, L, offset + i);
      if (m) { rail = m.rail; if (from === null) from = m.top + 10; to = doc.y - 14; }
      void before;
    });
    if (rail !== null) s.drawRail(rail, from, to);
  };

  // ---- page 1 : identity, positioning, two most recent roles
  s.masthead(P);
  if (d.tagline) s.tagline(d.tagline);
  s.heading(L.summary);
  d.summary.forEach(p => s.para(p, { color: th.text }));
  s.gap(4);
  s.heading(L.competencies);
  s.chipGrid(th.colour ? d.competencies.slice(0, 9) : d.competencies);
  s.gap(5);
  s.heading(L.experience);
  runRoles(exp.slice(0, 2), 0);
  s.check('page 1');

  // ---- page 2 : mid-career
  if (th.colour) { doc.addPage(); s.runhead(P.name, L.continued); s.heading(L.experience); }
  runRoles(exp.slice(2, 6), 2);
  s.check('page 2');

  // ---- page 3 : early career + credentials
  if (th.colour) { doc.addPage(); s.runhead(P.name, L.continued); s.heading(L.experience); }
  runRoles(exp.slice(6), 6);

  s.heading(L.education);
  s.twoCol(d.education, (sh, e, w, x) => {
    const dd = sh.doc, t = sh.th;
    dd.font('Helvetica-Bold').fontSize(t.colour ? 9 : 10).fillColor(t.ink)
      .text(winansi(e.degree), x, dd.y, { width: w, lineGap: 0.5 });
    dd.font('Helvetica').fontSize(t.colour ? 8.6 : 10).fillColor(t.navy)
      .text(winansi(e.institution), x, dd.y, { width: w });
    dd.font('Helvetica').fontSize(t.colour ? 8.2 : 10).fillColor(t.muted)
      .text(winansi(`${e.place} · ${e.dates}`), x, dd.y, { width: w });
  });
  s.gap(3);

  s.heading(L.technology);
  d.technology.forEach(t => s.labelled(t.title, t.body, { size: th.colour ? 8.7 : th.body }));
  s.gap(2);

  s.heading(L.publications);
  d.publications.forEach(p => {
    doc.font('Helvetica-Bold').fontSize(th.colour ? 8.9 : 10).fillColor(th.ink)
      .text(winansi(p.title), M.l, doc.y, { width: CW, link: p.url, lineGap: 0.5 });
    doc.font('Helvetica').fontSize(th.colour ? 8.4 : 10).fillColor(th.muted)
      .text(winansi(`${p.outlet}, ${p.year}`), M.l, doc.y, { width: CW });
    s.gap(2.5);
  });
  s.gap(2);

  s.heading(L.beyond || `${L.industries} · ${L.languages}`);
  const ref = { size: th.colour ? 8.7 : th.body };
  s.labelled(L.industries, d.industries.join(' · '), ref);
  s.labelled(L.international, d.international.join(' · '), ref);
  s.labelled(L.languages, d.languages.map(l => `${l.name} (${l.level})`).join(' · '), ref);
  if (d.interests) s.labelled(L.interests, d.interests.join(' · '), ref);
  s.check('page 3');

  // ---- page 4 : cover letter
  const cl = d.coverLetter;
  doc.addPage();
  s.masthead(P);
  s.heading(L.coverLetter);
  s.para(cl.to.join('\n'), { color: th.muted, after: 8 });
  s.para(cl.salutation, { after: 7, color: th.text });
  cl.paragraphs.forEach(p => s.para(p, {
    color: th.text,
    lineGap: th.colour ? 4.2 : th.lead,
    align: th.colour ? 'justify' : 'left',
    after: 8,
  }));
  s.gap(5);
  s.para(cl.closing, { color: th.text, after: 11 });
  doc.font('Helvetica-Bold').fontSize(th.colour ? 11.5 : 10.5).fillColor(th.navy)
    .text(winansi(cl.signature), M.l, doc.y, { width: CW });
  doc.font('Helvetica').fontSize(th.colour ? 8.6 : 10).fillColor(th.muted)
    .text(winansi(`${P.headline} · ${P.phone} · ${P.email}`), M.l, doc.y + 1.5, { width: CW });
  s.check('page 4');

  // ---- footers (designed only)
  if (th.colour) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = A4.h - 26;
      doc.moveTo(M.l, y).lineTo(A4.w - M.r, y).lineWidth(0.5).strokeColor(th.rule).stroke();
      doc.font('Helvetica').fontSize(7.2).fillColor(th.muted)
        .text(winansi(`${P.name}  ·  ${P.email}  ·  ${P.website}`), M.l, y + 5, { width: CW * 0.7, lineBreak: false });
      doc.text(`${i + 1} / ${range.count}`, M.l, y + 5, { width: CW, align: 'right', lineBreak: false });
      doc.page.margins.bottom = keep;
    }
  }

  doc.end();
  return new Promise(res => stream.on('finish', () => res(s.overflow)));
}

module.exports = { build, Sheet, runs, winansi, A4, M, CW, BOTTOM };
