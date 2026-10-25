# Gates: Security and release images

Scope: Security claims match evidence and the exact Railway release images have no unresolved release-blocking findings.

- [ ] G1: Static security checks pass.
  CHECK: npm run test:security
  EXPECT: pass
  EVIDENCE: pending

- [ ] G2: Exact local release images pass the configured high/critical vulnerability threshold.
  CHECK: npm run scan:images
  EXPECT: exit 0
  EVIDENCE: pending

- [ ] G3: Image patches use supported full builds and pass health, auth, and mock-inference tests.
  EVIDENCE: pending

- [ ] G4: Public materials make no military-grade, certification, GDPR, EU-only, or performance guarantee without evidence.
  CHECK: node --test tests/unit/readme-launch.test.mjs tests/unit/docs-site.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G5: Security limitations and remaining risks are linked from the README and product site.
  EVIDENCE: pending
