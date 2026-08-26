# Self-hosted fonts

Empty by design until the font files are added.

## Why this matters

Loading `fonts.googleapis.com` sends every visitor's IP address to Google
**before** they interact with the consent banner. A German court has already
found that to be a GDPR violation (LG München I, 3 O 17493/20), and this site
is about to serve a Spanish page aimed at EU visitors. Self-hosting removes the
request entirely.

It also removes a availability dependency: if the CDN is unreachable, the page
falls back to a system font mid-load and reflows.

## How the fallback works

`server/app.js` checks this directory at boot. If it contains `.woff2` files the
templates use the local `@font-face` block; if it is empty they fall back to the
Google Fonts stylesheet so the site still looks right in the meantime. Drop the
files in, restart, and the third-party request disappears with no code change.

## Getting the files

On any machine with network access:

```bash
npx google-font-installer download Parkinsans -d public/fonts
# or fetch the woff2 files listed by:
curl -H 'User-Agent: Mozilla/5.0' \
  'https://fonts.googleapis.com/css2?family=Parkinsans:wght@300..800&display=swap'
```

Save the `.woff2` files here as `parkinsans-<weight>.woff2`, then update the
`@font-face` rules in `public/css/fonts.css` to match the filenames.

Check the licence before shipping: Parkinsans is offered under the SIL Open Font
License, which permits self-hosting.
