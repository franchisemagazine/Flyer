# PCS Flyers 2.0

Recovered and rebuilt for the existing Vercel project **flyers**, team **ankit-8797**.
Project ID: `prj_AKZVAle2oXZCbKoG4AvEXtUNvw6f`.

## Run and validate

Node.js 22 or newer. No runtime package dependencies.

```sh
npm run check
npm start
```

Open http://localhost:4173. `npm run check` tests the core rules and then builds `dist/`. The build refuses to publish a file-access error as an app page, verifies all 1,448 raw entries (1,447 unique models after consolidating the whitespace-only duplicate `CABLE WATCH  1M`), and writes a SHA-256 manifest.

## Deploy to the EXISTING project

### GitHub Actions

Source: [franchisemagazine/Flyer](https://github.com/franchisemagazine/Flyer).

The `Validate and deploy Flyers` workflow tests and builds every pull request. Pushes to `main` and manual runs on `main` then force a fresh production deployment through the Vercel REST API. The deployment is pinned to the existing project above. Pull requests never receive the deployment token.

One-time connection setup:

1. Create a Vercel access token scoped to the existing `flyers` project (or its `ankit-8797` team) with deployment access.
2. In [repository Actions secrets](https://github.com/franchisemagazine/Flyer/settings/secrets/actions), add a repository secret named `VERCEL_TOKEN`. Paste the value only into GitHub's secret field.
3. Open [the deployment workflow](https://github.com/franchisemagazine/Flyer/actions/workflows/deploy-vercel.yml) and re-run the failed deployment job, or choose **Run workflow** on `main`.

If using a full-account Vercel token instead, also add the repository Actions variable `VERCEL_TOKEN_SCOPE` with value `account`. Project- and team-scoped tokens need no variable. Missing credentials fail the deployment job with a specific setup message; they do not stop the separate test/build job. Deployment IDs and final states appear in the job log and run summary. Subsequent pushes to `main` deploy automatically while preserving the existing Vercel project's domains and protection settings.

### Direct REST API

The API deployer is pinned to the existing `flyers` project and team IDs. It reads `VERCEL_TOKEN` from the execution environment, verifies the project identity before creating anything, runs all tests and the build, uploads an explicit source-file allowlist, and forces a new production deployment through `POST /v13/deployments?forceNew=1`. Use a token scoped to the `flyers` project. Team- and project-scoped tokens infer their scope; an existing full-account token requires `VERCEL_TOKEN_SCOPE=account` so the request explicitly targets the known team. It never uploads local credentials or changes protection settings. Do not put the token in source, chat, or the app's public settings.

```sh
npm run deploy:api:plan    # No credentials or network needed; review file list
npm run deploy:api:check   # Read-only connection check; requires VERCEL_TOKEN
npm run deploy:api         # Deploy and poll until READY or a build error
```

After a deployment is created, its non-secret receipt is saved locally. If the connection is interrupted, inspect the project and resume status polling with `node scripts/deploy-api.mjs --watch <deployment-id>`; do not blindly repeat the create request. A READY build still requires browser verification. In environments that require Node's configured HTTP proxy support, run the script with `node --use-env-proxy` on Node 24.

API reference: https://vercel.com/docs/rest-api/deployments/create-a-new-deployment

### Vercel CLI alternative

Use Vercel CLI with your own normally configured authentication. Do not create a new project.

```sh
npx vercel link --project flyers --scope ankit-8797
npx vercel --prod --force --scope ankit-8797
```

Before confirming, verify the linked project ID matches the ID above. The `vercel.json` build command runs tests and builds validated static assets; API functions are in `api/`. Existing Vercel protection and domain settings must remain unchanged.

## Image generation

- **Full-artwork AI regeneration** is the flyer creation path. The server sends the verified product reference plus the PCS brand/design reference to the image model and asks it to rebuild the entire 1024 × 1536 portrait flyer as one cohesive finished image. The browser no longer draws the product, headline, condition, location, or contacts over a template after generation.
- AI generation remains disabled unless `OPENAI_API_KEY` is configured as a server-side Vercel environment variable. Never put the API key in the front end. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst` and can be changed for account availability.
- There is no front-end password or team access code. Keep the OpenAI key server-side, use provider spend limits, and keep the app's origin/rate-limit protections in place. The in-process request limit is only a backstop, not a durable quota across all server instances.
- AI output always requires a second visual confirmation before download because generated product details or rendered text can differ from the verified inputs.

## Exact image lookup

Automatic lookup reads the exact model section of Apple's official identification pages. It does not use generic product-page social images, fuzzy matches, or silently substitute a newer generation. It currently supports recognizable iPhone and iPad identities when exactly one model is selected. Unmatched models require an uploaded image. When multiple models are selected, automatic lookup is disabled and the user must upload one verified lineup/reference image that accurately represents every selected model. Color/variant verification is mandatory even for an exact model match. Source URLs are shown and all remote image fetching is restricted to explicit official hosts, with redirects disabled and byte/time limits.

## Catalog provenance and limits

`data/catalog.json` preserves all 1,448 recovered model names, all 74 condition labels and the original categories and locations from deployment `dpl_FABSajBkqQQKnvPaJrxd4ZArX4Gu`. Location aliases are normalized only for display. The recovered data had no category-to-model IDs. `lib/catalog.js` uses conservative family classification; ambiguous codes remain under **Electronics**. `data/category-overrides.json` is the authoritative place to add verified mappings. Do not assert that every SKU has been verified against inventory master data. The model picker shows only models assigned to the chosen category.

## State, uploads, and privacy

The browser validates actual catalog selections, supports multi-select Model, Condition and Location fields, limits image uploads to 10 MB, decodes and resizes reference images, checks optional contact fields, and invalidates old previews/downloads after relevant changes. Image fetches are cancelled when the model selection changes. Generation uses a locked snapshot, so late responses cannot be attached to another selection. The verified product reference, selected product data, and any optional WhatsApp, email or additional information entered for the flyer are sent to the image-generation service so the complete artwork can be rendered as one image. This app does not intentionally persist those values after the request. Downloads are 1024 × 1536 PNGs, and optional contact/additional information is omitted when not supplied.

## Recovery

The source package contains the raw catalog, original brand-template bytes, all app and server code, tests and build configuration. The output directory can be regenerated with `npm run build`. Never deploy a response-body error as a source file; verify HTML content, manifest and the full browser workflow after deployment. This rebuild does not claim that untested AI calls or production deployment have succeeded.
