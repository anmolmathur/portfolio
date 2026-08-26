# Photos needed

Upload these two files into **this folder** (`images/`) on branch
`claude/portfolio-conversational-agent-r6ulfx`, using GitHub's web UI:
open the folder → **Add file → Upload files** → drag → **Commit changes**.

Filenames matter — the code looks for these exact names.

| Save as | Which photo | Used for |
|---|---|---|
| `anmol_blazer.jpg` | Black blazer, teal pocket square, composed closed-lip smile | Social/LinkedIn share card, and the hero's static fallback |
| `anmol_shirt.jpg` | Blue-and-white striped shirt, open collar, warm open smile | About Me |

## Requirements

- **Format:** JPEG or PNG. Lowercase `.jpg` — the existing files use `.JPG`,
  which breaks on case-sensitive Linux servers if the HTML disagrees.
- **Size:** the originals, not resized copies. At least 1200px on the short
  edge. I generate the responsive AVIF/WebP variants from them; starting from an
  already-compressed copy bakes in artefacts that cannot be removed.
- **Framing:** head and shoulders, roughly centred, with a little room above the
  head. Both photos you sent already fit.
- **Don't** pre-crop to a circle or add a border. The site does the round crop
  in CSS, and a baked-in circle can't be undone.

## After uploading

Tell me they're in and I'll:

1. Point `content/site.json` at them (currently pointing at the old photos).
2. Generate responsive WebP/AVIF variants at 1x and 2x with explicit dimensions,
   so there's no layout shift while they load.
3. Produce background-removed cutouts for on-page use. The cream studio backdrop
   glows against the dark theme, and a cutout also matches the 3D avatar's
   treatment, giving the two a shared visual language. The framed original stays
   for the social card, where a solid background is wanted.

## Optional third

The travel candid (fedora, sunlit street) as `anmol_candid.jpg` if you want it in
the footer as a personal note. Not required.
