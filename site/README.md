# Citadel Ops — landing page

A single, self-contained static page (`index.html`, no build step) that explains what Citadel
Ops is and what it's for — the story, the feature set, the mission loop, a codename decoder, and
a get-started guide. It mirrors the app's two themes (DEFCON 5 / Cyberwar) with a live toggle.

## Preview locally
Just open the file, or serve the folder:

```bash
npx serve site        # → http://localhost:3000
# or
python3 -m http.server -d site 8080
```

## Publish (GitHub Pages)
Deployment is automated by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every
push to `main` that touches `site/`. The workflow self-enables Pages (`configure-pages` with
`enablement: true`), so no manual Settings step is needed — the page lands at
`https://herbtobias.github.io/citadel-ops/`. (If your account restricts Pages, enable it once under
**Settings → Pages → Source: "GitHub Actions"** and re-run the workflow.)
