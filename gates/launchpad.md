# Gates: launchpad cross-device onboarding

Scope: compact authenticated entry points for the shared mobile, browser and SSH workspace.

- [x] G1: CloudCLI mobile, browser VS Code, Forgejo, OmniRoute, SSH setup and recovery status are reachable without duplicating session chat.
  CHECK: node --test services/launchpad/src/server.test.mjs
  EXPECT: pass
  EVIDENCE: The launchpad unit test passed in `npm test`; the 390x844 browser run showed the CloudCLI session alongside project files and SSH recovery status.

- [x] G2: Desktop and mobile layouts render with accessible links and no secret values in responses.
  CHECK: npm run check:launchpad
  EXPECT: pass
  EVIDENCE: `npm run check:launchpad` passed. The live local status API contained only health, links, SSH fingerprint and recovery counts. Mobile browser verification used a 390x844 Chromium viewport, not a physical phone.
