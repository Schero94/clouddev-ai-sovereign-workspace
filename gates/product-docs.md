# Gates: Product docs and screenshots

Scope: The public site and click-through guides use real product evidence, clear route choices, and no unsupported claims.

- [x] G1: Strict documentation build and public artifact scan pass.
  CHECK: npm run docs:check
  EXPECT: Documentation artifact passed
  EVIDENCE: `npm run docs:check` passed locally with 18 contract tests, strict MkDocs build, and public-artifact path/credential scan. GitHub Pages run `40243212219` passed the prior 17-test version for commit `1643fb465d7a7e25c851ae76437c4c465a5bc676`; the latest root-ledger contract is included in the pending next Pages build.

- [x] G2: Every displayed product screenshot exists in the generated site and has non-empty descriptive alt text and a caption/source.
  CHECK: node --test tests/unit/docs-screenshots.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/docs-screenshots.test.mjs` passed 2 tests on 2026-10-25. All 8 displayed captures resolve to local files with alt text, dimensions, captions and local-build context; unused and cropped captures are excluded.

- [x] G3: Deployment, provider setup, client connection, and recovery guides name the actual screen/control and expected result.
  CHECK: node --test tests/unit/docs-site.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/docs-site.test.mjs` passed 12 tests, including the clean-checkout release-status generation order and Railway, onboarding, provider, client and recovery guidance contracts.

- [x] G4: Real browser validation confirms links, desktop/mobile layout, image loading, navigation, and no horizontal overflow.
  EVIDENCE: Playwright CLI verified the public Pages site at 1440px and 390x844 after run `40243212219`. The document width was 1425px and 375px respectively, both launchpad screenshots loaded, and the browser console reported 0 errors and warnings.

- [x] G5: Screenshots contain no credentials, personal account data, project IDs, private repository content, or test secrets.
  EVIDENCE: Manually inspected all 14 source PNG captures. Forms are empty; no credentials, account identifiers, Railway project IDs, or private repository contents are visible. One horizontally cropped OmniRoute mobile capture and unused local captures are excluded from the generated site.

- [x] G6: Current GitHub Pages deployment corresponds to the reviewed source commit.
  EVIDENCE: Pages Actions run `40244029687` succeeded for commit `52edd889a5b181178bbda20da57a6bcc22b6edfa`; the live home and release-status routes return HTTP 200. The published status page reports 17/24 gates and Playwright verifies desktop and 390px layouts, images, links, and no console errors.
