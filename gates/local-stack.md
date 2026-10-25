# Gates: local stack and Railway infrastructure

Scope: Compose, service integration, persistent stores, IaC and Railway template configuration.

- [x] G1: The Compose model validates and contains independent persistent volumes.
  CHECK: npm run check:compose
  EXPECT: pass
  EVIDENCE: `npm run check:compose` passed for the normal Compose stack and the mock integration profile.

- [x] G2: All service images build without unpinned production tags.
  CHECK: docker compose build
  EXPECT: done
  EVIDENCE: `./scripts/verify-local.sh` built the pinned Forgejo, OmniRoute, and IDE images successfully with Docker's classic builder. The buildx plugin was unavailable, so multi-arch build features were not exercised.

- [x] G3: Unit and service security suites pass.
  CHECK: npm test && npm run test:security
  EXPECT: pass
  EVIDENCE: `npm test` passed 111 tests with 3 skipped and 0 failures. `npm run test:security` passed its static checks across 84 source files. Forgejo's bootstrap suite passed 15 tests.

- [x] G4: Railway IaC type-checks without changing a live project.
  CHECK: npm run check:railway
  EXPECT: pass
  EVIDENCE: `npm run check:railway` passed. No linked Railway project was modified.

- [ ] G5: Fresh Railway service confirms `europe-west4-drams3a`, app sleep off, HTTP plus TCP proxy, and required volume mounts.
  EVIDENCE: pending
