# LG B2B · GNB IA Studio

A dependency-free static web app for shaping the LG Global Business GNB from the workbook-backed information architecture in `260909/LG_B2B_Global_IA.xlsx`.

## Run locally

Serve the folder over HTTP rather than opening `index.html` directly:

```bash
python -m http.server 4173
```

Then open <http://localhost:4173>.

The source intentionally contains only a `[REDACTED]` local-development fallback. In Netlify, define the `STUDIO_PASSWORD` environment variable in the site configuration; the deployed login is validated by `netlify/functions/auth.js`, so the production password is not committed to Git.

## Features

- Password gate backed by a Netlify Function and the provider-side `STUDIO_PASSWORD` secret; local HTTP development uses only a `[REDACTED]` fallback.
- IA imported from the workbook's `Global` sheet into `ia-data.js`.
- File-explorer tree with depth labels, search, expand/collapse, enable/disable controls, and drag-between-row reordering with right-side nesting.
- Dynamic LG GNB preview with the supplied logo image, warm-beige reference background, secondary navigation, active underlines, utility cluster, and responsive mega-menu generated from the current tree state.
- Local browser persistence plus JSON export for handoff.
- Netlify-ready root publish configuration in `netlify.toml`.

## Security boundary

This is a static prototype. The password is client-side and is therefore a UX gate, not a security boundary. For real internal-only access, put the Netlify site behind Netlify Access Control, an identity provider, or a server-side authentication layer, and remove the demo password from the client bundle.

## Source notes

The workbook source contains 183 Global IA records. The app excludes `Consumer` and `Contact us` from the GNB tree because the reference design places Consumer in the utility cluster and Contact us outside the IA navigation.