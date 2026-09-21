# Verification — 2026-09-21

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

- Force-deployment to the existing Vercel project `flyers`. The connected Vercel app can read project state but returns `Tool deploy_to_vercel not found` for a deployment request using its documented file-tree schema. The GitHub Actions workflow deploys the repository source directly through the REST API once the `VERCEL_TOKEN` repository secret is configured. Check the actual Actions run and Vercel deployment state before claiming a successful release.
- Live browser end-to-end checks of dropdowns, image upload/lookup, state invalidation, PNG download, mobile layout and console errors. The browser environment could not access the local development server.
- Live AI regeneration. The existing project has no environment variables; `OPENAI_API_KEY` and `FLYERS_TEAM_KEY` are required. AI remains disabled until configured, without blocking original-photo flyers.

Production has not been changed by this rebuild. Do not describe this package as a verified live deployment.
