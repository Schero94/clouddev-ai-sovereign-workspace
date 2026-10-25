# Gates: Provider onboarding and compatibility

Scope: Provider setup explains only officially supported integrations and does not encourage account, subscription, or rate-limit circumvention.

- [x] G1: Provider docs distinguish Codex ChatGPT sign-in from OpenAI API-key usage through OmniRoute.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: # todo 0 | # duration_ms 41.263416

- [x] G2: DeepSeek setup is checked against DeepSeek's current API docs, including model/auth and billing caveats.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: # todo 0 | # duration_ms 41.803917

- [x] G3: Free/no-auth provider discovery is dynamic and clearly states that availability, limits, and terms can change.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: # todo 0 | # duration_ms 41.144584

- [x] G4: No subscription-token extraction, account rotation, quota evasion, or shared maintainer credential is implemented or documented as a feature.
  CHECK: node --test tests/unit/provider-docs.test.mjs
  EXPECT: # fail 0
  EVIDENCE: # todo 0 | # duration_ms 43.103959

- [x] G5: Codex and Claude CLI mock forwarding remains green without paid-provider calls.
  CHECK: npm run test:mock-provider
  EXPECT: pass
  EVIDENCE: > node scripts/verify-mock-llm.mjs | Mock integration passed: restricted model catalog, anonymous inference denial, OpenAI chat and streaming, Anthropic Messages and streaming, plus live Codex and Cla
