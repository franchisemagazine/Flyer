# Verification — 2026-09-21

## Production release verified

- Live app: https://flyers-red.vercel.app/
- Existing project: `flyers` (`prj_AKZVAle2oXZCbKoG4AvEXtUNvw6f`).
- Production deployment: `dpl_DJcKRXAjRuU7kB9m5WCRMuZJcysK`, state **READY**, with both existing production aliases assigned and no alias error. Vercel build duration was about 10 seconds.
- Deployed source commit: `568cd80b576a98fc91274024cd07cb64d1c27c44`.
- GitHub Actions run: https://github.com/franchisemagazine/Flyer/actions/runs/35597115082 (attempt 4). Test/build and API deployment jobs both passed. The repository secret authenticated successfully and the REST deployer created a fresh production release.
- Live health endpoint returned HTTP 200, version `2.0.0`, 1,447 models, exact-model matching, and `aiEnabled: false`.

## Passed in the live desktop browser

- Category and model search populated while typing. Phones exposed 467 models; Accessories exposed 203 models in a scrollable list.
- Exact iPhone 13 lookup returned Apple's iPhone 13 image and its official source link. Image confirmation remained required before generation.
- Created an original-photo flyer with optional fields empty; downloaded and visually inspected the actual 1024 × 1536 PNG. No optional information box or contact details appeared. The browser download event listener timed out, but the downloaded PNG was present on disk and its dimensions/content were verified.
- Entered synthetic WhatsApp/email details and additional information, regenerated, and visually confirmed all three in the preview.
- Editing details disabled the stale download. Changing categories cleared the model/reference and required a new selection.
- Uploaded a disposable PNG fixture and verified that the upload reached review with confirmation still required. The fixture was not confirmed as an actual accessory photo. Test entries were cleared by reloading afterward.
- No warnings or errors from the app origin were captured during these checks. Browser-extension metadata errors were unrelated to the app. This is a browser check, not a production runtime-log audit.
- Screenshot: [Live app with synthetic test details](docs/flyers-live-verification-20260921.jpg).

## Passed locally

- Original app verification: 18 automated tests passed; production asset build succeeded.
- `npm run check` now passes all 23 tests (18 app tests and five deployment checks) and builds production assets. The deployment checks cover source-file exclusions, fixed project identity, token requirements, official API destination, and request ordering. They use mocks and do not establish live write access.
- `npm run deploy:api:plan` validates and lists the REST upload payload without credentials or network requests.
- Syntax checks: app, combobox and renderer JavaScript passed `node --check`.
- Catalog: 1,448 original entries preserved, 1,447 unique normalized models.
- Exact-model lookup: live API handler returned the official iPhone 13 image, not a generic social preview. Parser checks distinguished base, Pro and Pro Max model sections.
- PNG export: native Canvas render checks produced 1024 × 1536 clean, contact and long-text fixtures. Checked omission of blank contacts/additional-information boxes and wrapping of long unbroken text; visually inspected exports. This is renderer verification, not browser interaction testing.
- Server guards: no-key AI setup response, invalid model rejection, unsupported-model upload fallback, malformed input and invalid-origin handling.

## Still pending

- Mobile-device layout and touch interaction checks.
- Live AI regeneration. Production reports AI disabled; `OPENAI_API_KEY` and `FLYERS_TEAM_KEY` are required as server-side Vercel environment variables. Original-photo flyers work without them.

The original-photo workflow is deployed and verified. AI generation is not configured or verified.
