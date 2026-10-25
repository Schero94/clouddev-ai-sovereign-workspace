# CloudDev AI product launch readiness design

## Goal

Make the public CloudDev AI experience clear, evidence-led, discoverable, and ready for a safe Railway Marketplace release. The README and GitHub metadata should tell the same story as the product documentation.

## Current context

GitHub Pages has a custom responsive landing page, search, navigation, and a generated release-status page. The repository has a four-service Railway IaC definition, a Composer variable contract, and a long README. The public site still lacks product screenshots and a visual click-through guide. The GitHub repository has no topics or homepage metadata. The public release-status page is behind the local ledger. Railway is currently authenticated as Joulee Tech, while publication is intended for the Schero94 personal workspace. The image security gates remain open, and the local Docker CLI cannot reach Colima.

## Approaches considered

1. Append long Markdown pages to the current site. This is quick, but leaves the product story, onboarding, screenshots, and deployment instructions disconnected.
2. Replace MkDocs with a custom marketing site and keep technical docs separately. This offers more design control but duplicates navigation and adds another build system.
3. Extend the existing MkDocs site into one product and operator experience. Keep the current visual system, add a feature-led landing page, real screenshots, focused how-to pages, provider guidance, and a stronger README. This reuses the existing publishing and security checks and is the chosen approach.

## Experience and content

- The landing page explains the single-user workspace, its actual client interfaces, and the four Railway services. It links to deployment, provider setup, security, and current release status.
- Add a concise feature list and a compatibility table. List integrations only when verified against the pinned upstreams. Pull model choices from OmniRoute's live catalog where possible. Do not imply that every CLI or provider supports every protocol feature.
- Add click-by-click guides for deployment, first login, provider setup, desktop/browser/mobile connection, and recovery. Each step names the screen, control, expected result, and recovery path.
- Use genuine captures of the current application and current Composer screens. Scrub credentials, emails, account names, project IDs, and private repository data. Include descriptive alt text and captions. If a live Composer capture is unavailable, link to the current official Railway example and label it as an upstream screenshot. Do not make illustrative art look like a product screenshot.
- Use plain, specific copy. Remove generic promotional language and unsupported claims. Keep AI, Codex, Claude, and provider terms where they help developers find or understand the product.

## Provider and usage boundaries

- Explain ChatGPT-plan sign-in separately from API-key routing. Describe subscription use through OmniRoute only if the exact pinned release and current official provider terms support it.
- Do not provide OAuth-token extraction, browser-cookie copying, account rotation, quota evasion, or shared maintainer credentials. Fallbacks can improve cost or availability only within each provider's terms and limits.
- Document DeepSeek API setup and pricing from DeepSeek's current official docs. Do not present DeepSeek API use as free merely because its consumer website has a free surface.
- Describe OmniRoute's free/no-key catalog as provider-controlled and subject to change. Coding agents receive only the scoped gateway credential needed for inference.

## Security and claims

- Do not use "military-grade" or imply a certification. State implemented controls, measured evidence, and open risks separately.
- Keep the Marketplace release on hold until the exact production images have no unresolved critical/high findings, or a reviewed security decision records the residual risk, and a fresh Railway deployment passes the required checks.
- Do not call the template "one-click verified" until Railway provides a published template URL and a fresh-project test deployment passes.
- Do not claim universal provider compatibility, guaranteed free usage, GDPR compliance, EU-only processing, performance figures, or agent-process survival through a service restart.

## Discoverability

- Keep descriptive titles, summaries, canonical URLs, the sitemap, and crawler access. Add a social preview asset and Open Graph metadata only through a supported, tested MkDocs path.
- Align the repository description, homepage, topics, README, and documentation titles. Use relevant GitHub topics instead of keyword stuffing.
- Use answer-first explanations and links to primary sources. Do not invent ratings, pricing, benchmarks, or structured-data claims.
- Search visibility and AI citations cannot be guaranteed by metadata or schema markup.

## Railway release flow

- Keep the four services and generated secret inputs in the existing Railway Composer contract. Public HTTPS domains, per-deployment secret functions, service icons, Marketplace metadata, and the real deploy URL remain Composer/account concerns where current IaC does not express them.
- Verify the IaC plan in a dedicated test project before applying it. Do not use the Joulee Tech workspace as a substitute for the requested personal account.
- Do not create or publish the template before image security and fresh-project acceptance pass. If personal-account access remains unavailable, finish and verify local work, leave the live gate open, and give the exact next step.

## Acceptance

- Strict documentation build, artifact checks, screenshot/alt checks, README contract tests, and existing application/security tests pass.
- Playwright verifies desktop and phone layouts, navigation, links, image loading, and no horizontal overflow.
- Public screenshots are real, current, readable at phone width, and scrubbed of secrets and personal identifiers.
- GitHub metadata is read back after updating. Railway publication, deployment, cross-device acceptance, and restore remain separate live gates.
