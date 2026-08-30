# Resume build

One content file per locale produces four PDFs. Never hand-edit a PDF — edit the
JSON and rebuild.

```bash
node resume/build.cjs          # en + es
node resume/build.cjs en       # one locale
RESUME_DEBUG=1 node resume/build.cjs   # print per-page fill heights
```

## Output (`resume/dist/`, published copies in `docs/`)

| File | What it is | Use it for |
|---|---|---|
| `Anmol_Mathur_Resume_EN.pdf` | designed CV, 3 pages + cover letter on page 4 | email, recruiters, the website |
| `Anmol_Mathur_Resume_ATS_EN.pdf` | same content, plain text layer | job portals, applicant tracking systems |
| `Anmol_Mathur_Resume_ES.pdf` | Spanish, designed | Spain / LATAM applications |
| `Anmol_Mathur_Resume_ATS_ES.pdf` | Spanish, plain | Spanish job portals |

## Design

Petrol navy `#0E3A5C` with a bronze `#B87333` accent. Header band carries the name,
headline, contact line and headshot; a dated timeline rail runs down the experience.
The accent appears once or twice a page — as the rule stub on a section heading, the
dot on the rail, the dash on a bullet — never as a marker on every heading.

Three pages is a hard constraint, and the designed layout is ~90pt narrower than the
plain one because dates sit in a left gutter. Rather than cut the source and lose
keywords from the ATS copy, `DESIGNED_BULLETS` in `render.cjs` caps how many bullets
the *designed* layout shows per role; the ATS rendition still prints all of them.
Spanish runs longer, so `resume.es.json` carries its own `designedBullets` override.

## Why this is not a browser render

`render.cjs` draws the PDF directly with pdfkit rather than printing HTML. That
buys three things the previous Canva export did not have:

1. **A single reading order.** The old CV was two-column. Text extractors read it
   in paint order, so the sidebar landed *inside* the profile paragraph and
   between a job title and its employer. Every layout here is one logical column;
   the visual grouping (competency chips, the education grid) is drawn, not
   floated around text.
2. **Exact pagination.** Three pages plus the letter, enforced. `RESUME_DEBUG=1`
   prints the fill height of each page against the 804pt limit so it is obvious
   when a copy edit is about to push a page over.
3. **Base-14 fonts.** Helvetica needs no embedding and maps cleanly to characters
   on extraction. Section headings carry almost no letter-spacing on purpose:
   at the tracking the old design used, `PROFESSIONAL SUMMARY` extracts as
   `P R O F E S S I O N A L   S U M M A RY` and no parser matches the section.

## Editing

- Role bullets accept `<b>` and `<i>`.
- The rupee sign is not in WinAnsi; `winansi()` rewrites `₹` to `INR`.
- Page 1 carries the two most recent roles, page 2 the next four, page 3 the
  final two plus education/technology/publications. Change the slices in
  `build.cjs` if a role is added.

## Verifying a change

```bash
node resume/build.cjs && pdftotext resume/dist/Anmol_Mathur_Resume_ATS_EN.pdf - | head -40
```

That output is what an ATS sees. If it reads like the document, it parses.
