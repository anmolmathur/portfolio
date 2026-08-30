#!/usr/bin/env node
/*
 * Build the resume + cover letter from resume/data/resume.<locale>.json.
 *
 *   node resume/build.cjs            -> en + es
 *   node resume/build.cjs en         -> just en
 *
 * Emits, per locale:
 *   Anmol_Mathur_Resume_<LOC>.pdf      designed, 3 pages + cover letter
 *   Anmol_Mathur_Resume_ATS_<LOC>.pdf  plain text layer for job portals
 */
const fs = require('fs');
const path = require('path');
const { build } = require('./render.cjs');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

const locales = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'es'];

(async () => {
  let bad = false;
  for (const loc of locales) {
    const src = path.join(ROOT, 'data', `resume.${loc}.json`);
    if (!fs.existsSync(src)) { console.warn(`skip ${loc}: missing ${src}`); continue; }
    const d = JSON.parse(fs.readFileSync(src, 'utf8'));

    for (const [theme, tag] of [['designed', 'Resume'], ['ats', 'Resume_ATS']]) {
      const out = path.join(DIST, `Anmol_Mathur_${tag}_${loc.toUpperCase()}.pdf`);
      const overflow = await build(d, theme, out);
      const kb = Math.round(fs.statSync(out).size / 1024);
      console.log(`${overflow.length ? 'WARN ' : 'ok   '} ${path.basename(out)}  ${kb} KB`);
      overflow.forEach(o => { bad = true; console.log(`        overflow -> ${o}`); });
    }
  }
  process.exit(bad ? 1 : 0);
})();
