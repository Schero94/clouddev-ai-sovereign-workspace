# Gates: README and repository discovery

Scope: README and GitHub metadata accurately describe the product and help developers discover and evaluate it.

- [x] G1: README covers verified features, setup, provider use, Railway, security, privacy, restore, costs, troubleshooting, licenses, and changelog.
  CHECK: node --test tests/unit/readme-launch.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/readme-launch.test.mjs` passed all 8 tests on 2026-10-25. README documents the encrypted backup workflow and states what the local restore test does not verify.

- [x] G2: README contains no placeholder template ID, unsupported compliance/security claim, fictitious price/rating, or unverified capacity number.
  CHECK: node --test tests/unit/readme-launch.test.mjs
  EXPECT: # fail 0
  EVIDENCE: `node --test tests/unit/readme-launch.test.mjs` passed all 8 tests on 2026-10-25. It rejects fabricated template URLs, one-click verification, universal provider support, unsupported security claims, or unmeasured capacity claims.

- [x] G3: Public GitHub description, homepage, and topic list match the published product and site.
  EVIDENCE: `gh repo view Schero94/clouddev-ai-sovereign-workspace --json ...` read back the product description, the GitHub Pages homepage URL, and 13 relevant topics on 2026-10-25.

- [ ] G4: Repository social preview is an actual readable image with accurate alt/context in the surrounding content.
  EVIDENCE: pending
