# Gates: Product docs and screenshots

Scope: The public site and click-through guides use real product evidence, clear route choices, and no unsupported claims.

- [x] G1: Strict documentation build and public artifact scan pass.
  CHECK: npm run docs:check
  EXPECT: Documentation artifact passed
  EVIDENCE: `npm run docs:check` passed on 2026-10-25: 16 docs/SEO/screenshot contract tests, strict MkDocs build, and public-artifact path/credential scan.

- [x] G2: Every displayed product screenshot exists in the generated site and has non-empty descriptive alt text and a caption/source.
  CHECK: node --test tests/unit/docs-screenshots.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/docs-screenshots.test.mjs` passed 2 tests on 2026-10-25. All 8 displayed captures resolve to local files with alt text, dimensions, captions and local-build context; unused and cropped captures are excluded.

- [x] G3: Deployment, provider setup, client connection, and recovery guides name the actual screen/control and expected result.
  CHECK: node --test tests/unit/docs-site.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/docs-site.test.mjs` passed 11 tests on 2026-10-25, including Railway, onboarding, provider, client and recovery guidance contracts.

- [x] G4: Real browser validation confirms links, desktop/mobile layout, image loading, navigation, and no horizontal overflow.
  EVIDENCE: Playwright CLI loaded the generated site at desktop and 390x844. Homepage document width was 390px at a 390px viewport. The provider guide had no horizontal overflow, all four screenshots loaded after scrolling, navigation routes resolved, and the browser console reported 0 errors.

- [x] G5: Screenshots contain no credentials, personal account data, project IDs, private repository content, or test secrets.
  EVIDENCE: Manually inspected all 14 source PNG captures. Forms are empty; no credentials, account identifiers, Railway project IDs, or private repository contents are visible. One horizontally cropped OmniRoute mobile capture and unused local captures are excluded from the generated site.

- [ ] G6: Current GitHub Pages deployment corresponds to the reviewed source commit.
  EVIDENCE: pending
