# Deploying this site to GitHub Pages

**No build step. No framework.** This is hand-written static HTML, CSS and JS — no React, no Vite,
no npm, no `node_modules`. There is nothing to compile: the files in this folder *are* the production
files. Upload them as they are.

## What to upload

Everything in this `dist/` folder — **the contents, not the folder itself**:

```
index.html          ← entry point, named exactly index.html
.nojekyll           ← keep this (see note below)
assets/css/tokens.css
assets/css/base.css
assets/css/components.css
assets/css/sections.css
assets/js/main.js
```

Total: 50.9 KB, 6 requests, zero external dependencies.

## Steps

```bash
# from inside this dist/ folder
git init
git add -A
git commit -m "Deploy FundMe landing page"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: **main**, folder: **/ (root)**
- Save, wait ~1 minute.

Your site will be at `https://<you>.github.io/<repo>/`.

If you prefer to keep the whole project in one repo instead, copy these files to the repo root — but
note the sibling `docs/` folder in this project holds project documentation, so do **not** choose the
"/docs" folder option in Pages settings or it will publish the markdown instead of the site.

## Why `.nojekyll`

GitHub Pages runs Jekyll by default, which **ignores any file or folder starting with an underscore**.
Nothing here starts with one today, but the empty `.nojekyll` file disables Jekyll entirely so a future
`_partial.css` or similar can never silently 404. Keep it, and make sure your git client doesn't skip
dotfiles when you upload.

## Paths — already fixed for a subpath

A project site is served from `/<repo>/`, not the domain root, so **absolute paths break**. All paths
here are relative and were tested against a simulated `https://user.github.io/fundme-site/`:

| Was | Now |
|---|---|
| `href="/"` (logo ×3) | `href="./"` |
| `/terms/` `/privacy/` `/cookies/` `/legal/` | `./terms/` etc. |
| CSS + JS | already relative — unchanged |

Verified after deploy-simulation: all 6 files returned 200, CSS applied (`body` background resolved to
the sand token, not white), `main.js` executed (all 6 FAQ items upgraded, 3 tour tabs wired), 5 "Apply
now" CTAs present, no horizontal overflow.

There are **no `url()` references to external files** anywhere in the CSS — every icon is an inline
`data:` URI and every image is a CSS gradient. That is why nothing can 404 on a different base path.

## Before this goes in front of real traffic

These are not deployment blockers, but the site is not launch-ready:

1. **`{{PLACEHOLDER}}` values are visible throughout** — deliberately, per the client brief, so nobody
   ships invented numbers. Fill them from `../docs/company-profile.md`, which lists every one.
2. **`{{BOOKING_URL}}` is a literal string in the CTA `href`.** All five "Apply now" buttons currently
   link nowhere. This is the single most important thing to fix — the page has exactly one conversion
   action and it is not wired up.
3. **`{{SITE_URL}}`** appears in the canonical and OG tags. Set it to your real Pages URL
   (`https://<you>.github.io/<repo>`) or your custom domain, or search engines will index it wrong.
4. **`./terms/`, `./privacy/`, `./cookies/`, `./legal/` do not exist yet** and will 404. The client brief
   requires privacy and terms live *before any traffic*.
5. **`og:image` points at `og.png`, which is not in this bundle.** Social shares will have no preview
   image until you add one (1200×630).

## Custom domain

Add a file named `CNAME` (no extension) next to `index.html` containing just your domain, e.g.
`www.fundme.example`. Then point a DNS `CNAME` record at `<you>.github.io`. Update `{{SITE_URL}}` to match.

## If this were a React/Vite project

It isn't — but for reference, since you asked. You would run `npm run build`, upload the **`dist/`**
folder (Vite) or **`build/`** folder (Create React App), and critically set the base path, because a
project site is not at the domain root:

```js
// vite.config.js
export default { base: '/<repo>/' }
```
```json
// package.json, for Create React App
"homepage": "https://<you>.github.io/<repo>"
```

Skipping that step is the usual cause of a deployed React site loading a blank white page with 404s on
every JS and CSS file. The plain-HTML approach here sidesteps the problem entirely.
