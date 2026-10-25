# Gates: README and repository discovery

Scope: README and GitHub metadata accurately describe the product and help developers discover and evaluate it.

- [ ] G1: README covers verified features, setup, provider use, Railway, security, privacy, restore, costs, troubleshooting, licenses, and changelog.
  CHECK: node --test tests/unit/readme-launch.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G2: README contains no placeholder template ID, unsupported compliance/security claim, fictitious price/rating, or unverified capacity number.
  CHECK: node --test tests/unit/readme-launch.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G3: Public GitHub description, homepage, and topic list match the published product and site.
  EVIDENCE: pending

- [ ] G4: Repository social preview is an actual readable image with accurate alt/context in the surrounding content.
  EVIDENCE: pending
