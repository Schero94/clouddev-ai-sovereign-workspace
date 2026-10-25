# Gates: Provider onboarding and compatibility

Scope: Provider setup explains only officially supported integrations and does not encourage account, subscription, or rate-limit circumvention.

- [ ] G1: Provider docs distinguish Codex ChatGPT sign-in from OpenAI API-key usage through OmniRoute.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G2: DeepSeek setup is checked against DeepSeek's current API docs, including model/auth and billing caveats.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G3: Free/no-auth provider discovery is dynamic and clearly states that availability, limits, and terms can change.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G4: No subscription-token extraction, account rotation, quota evasion, or shared maintainer credential is implemented or documented as a feature.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G5: Codex and Claude CLI mock forwarding remains green without paid-provider calls.
  CHECK: npm run test:mock-provider
  EXPECT: pass
  EVIDENCE: pending
