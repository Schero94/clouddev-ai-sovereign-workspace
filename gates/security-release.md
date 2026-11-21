# Gates: Security and release images

Scope: Security claims match evidence and the exact Railway release images have no unresolved release-blocking findings.

- [x] G1: Static security checks pass.
  CHECK: npm run test:security
  EXPECT: pass
  EVIDENCE: > sh scripts/security-check.sh | Security static checks passed across 93 source files. This does not replace image vulnerability scanning or live authentication tests.

- [x] G2: Exact local release images pass the configured high/critical vulnerability threshold.
  CHECK: npm run scan:images
  EXPECT: /No HIGH or CRITICAL vulnerabilities were found in the configured Compose candidate images/
  EVIDENCE: Passed on 2026-11-21. `npm run scan:images` exited 0 and printed the expected sentence for the four amd64 Compose candidates. The IDE was rebuilt later that day so Caddy accepts `forward_auth`, then rescanned clean. IDs and the release limit are in `docs/security/IMAGE_SCAN.md` and root G17. The local IDE boot was removed. No Railway resource was created.

- [ ] G3: Image patches use supported full builds and pass health, auth, and mock-inference tests.
  EVIDENCE: pending

- [x] G4: Public materials make no military-grade, certification, GDPR, EU-only, or performance guarantee without evidence.
  CHECK: node --test tests/unit/readme-launch.test.mjs tests/unit/docs-site.test.mjs
  EXPECT: # fail 0
  EVIDENCE: # todo 0 | # duration_ms 68.558

- [x] G5: Security limitations and remaining risks are linked from the README and product site.
  EVIDENCE: README links the threat model, hardening guide, image scan and privacy notes. The docs home and security navigation link the threat model, hardening, data flow and restore procedures. README and docs contract tests pass.
