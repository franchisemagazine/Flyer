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

## Multi-image product references

- A single selected model keeps the existing flow: exact-image lookup or one manual upload.
- With two or more selected models, the upload control accepts up to 6 PNG/JPEG/WebP references and shows them in a review gallery.
- Each uploaded image can be assigned to one selected model or left as a general / lineup reference.
- Multi-image references are compressed client-side to keep the request safely bounded; the server also validates count, combined payload, image signatures, and model assignments.
- The image-generation prompt receives an explicit image-to-model map so references are not swapped or blended between products.
- Model values beginning with `MBPRO` remain unchanged internally for SKU/search compatibility but display as **MacBook Pro** in the user interface and generated flyer copy.

## Image generation

- **Template-locked AI regeneration** is the flyer creation path. The server sends the verified product reference plus the PCS flyer template to the image model and asks it to produce the complete 1024 × 1536 portrait artwork while preserving the supplied template architecture. The prompt explicitly forbids invented company slogans or taglines and treats the template as authoritative.
- AI generation remains disabled unless `OPENAI_API_KEY` is configured as a server-side Vercel environment variable. Never put the API key in the front end. `OPENAI_IMAGE_MODEL` defaults to `gpt-image-2.5-sunburst` and can be changed for account availability.
- There is no front-end password or team access code. Keep the OpenAI key server-side, use provider spend limits, and keep the app's origin/rate-limit protections in place. The in-process request limit is only a backstop, not a durable quota across all server instances.
- AI output always requires a second visual confirmation before download because generated product details or rendered text can differ from the verified inputs.

## Creative direction and custom catalog values

- The former Additional Information field is now **Creative vision / requirements**. It is sent to the image model as art-direction instructions only; it is not approved flyer copy and should not be rendered verbatim. It may influence product lighting, angle, depth, emphasis and subtle scene treatment, but the supplied PCS template wins whenever a request conflicts with the template.
- Model and Condition fields support adding a new value directly from the searchable dropdown. New values are normalized and saved in the current browser so that user's subsequent visits retain them.
- Flyer intentionally has no dependency on Franchise Magazine USA / Match infrastructure. Cross-visitor shared catalog persistence must use a PCS-owned datastore before it is enabled globally.

## Curated PCS product image library

- The Drive folder supplied by PCS is treated as the master source for manually approved product imagery.
- `data/curated-images.json` contains only manually verified exact model-to-image mappings. The app does **not** fuzzy-match arbitrary Drive filenames.
- Production deployment runs `npm run sync:curated-images`, downloads only the approved Drive file IDs, verifies MIME signature, byte size and SHA-256, and writes the copies into `public/product-library/`.
- If a Drive file changes, hash verification fails and production deployment is blocked until the replacement image is reviewed and the manifest is deliberately updated.
- The product-image endpoint checks the curated server library before official/web lookup. If no exact curated mapping exists, the existing official/reputable-web verification flow remains the fallback.
- Ambiguous Mac, AirPods, watch-band, case and packaging images are intentionally not auto-mapped merely because their filenames look similar.

## Exact image lookup

Automatic lookup uses exact Apple identification sections first when available. If that does not produce a match, the server performs a web image search for the selected catalog model, prioritizes manufacturer and reputable product sources, verifies that the exact model name/code appears on the source page, and only then imports a supported image. The source page is shown and user confirmation remains mandatory. The web fallback rejects non-HTTPS/private-network targets, disables redirects, and enforces byte/time limits. When multiple models are selected, automatic lookup is disabled and the user must upload one verified lineup/reference image representing every selected model.

## Catalog provenance and limits

`data/catalog.json` preserves all 1,448 recovered model names, all 74 condition labels and the original categories and locations from deployment `dpl_FABSajBkqQQKnvPaJrxd4ZArX4Gu`. Location aliases are normalized only for display. The recovered data had no category-to-model IDs. `lib/catalog.js` uses conservative family classification; ambiguous codes remain under **Electronics**. `data/category-overrides.json` is the authoritative place to add verified mappings. Do not assert that every SKU has been verified against inventory master data. The model picker shows only models assigned to the chosen category.

## State, uploads, and privacy

The browser validates actual catalog selections, supports multi-select Model, Condition and Location fields, permits validated browser-local additions for Model and Condition, limits image uploads to 10 MB, decodes and resizes reference images, checks optional contact fields, and invalidates old previews/downloads after relevant changes. Image fetches are cancelled when the model selection changes. Generation uses a locked snapshot, so late responses cannot be attached to another selection. The verified product reference, selected product data, optional WhatsApp/email, and any Creative vision / requirements are sent to the image-generation service so the complete artwork can be rendered as one image. Creative direction is treated as instruction rather than flyer copy. This app does not intentionally persist those values after the request. Downloads are 1024 × 1536 PNGs, and optional contact/additional information is omitted when not supplied.

## Company separation

PCS Flyer is a PCS Wireless application and must remain isolated from Franchise Magazine USA / Match infrastructure. It does not use the Match Supabase project, Match tables, Match credentials, or Match application data. Any future shared datastore for Flyer must be owned by PCS/Flyer infrastructure.

## Recovery

The source package contains the raw catalog, original brand-template bytes, all app and server code, tests and build configuration. The output directory can be regenerated with `npm run build`. Never deploy a response-body error as a source file; verify HTML content, manifest and the full browser workflow after deployment. This rebuild does not claim that untested AI calls or production deployment have succeeded.
