# Gates: Railway template and marketplace

Scope: The four-service Railway template is verified in the requested personal workspace before public Marketplace claims or a deploy button are added.

- [x] G1: IaC and Composer variable contracts match current official Railway docs and the pinned package.
  CHECK: npm run check:railway-template && npm run check:railway
  EXPECT: pass
  EVIDENCE: `npm run check:railway-template` passed 4 tests and `npm run check:railway` passed with Railway 3.16.0 and TypeScript 7.0.2 on 2026-10-25.

- [x] G2: The Railway CLI is authenticated to the Schero94 personal workspace and a dedicated empty test project is selected.
  EVIDENCE: CLI `whoami` confirmed the personal workspace. A new empty validation project and its `production` environment were read back with no services. No existing project was touched.

- [x] G3: A reviewed Railway config plan has no unexpected deletes or changes.
  EVIDENCE: `railway config plan --file .railway/railway.ts --environment production --json` returned `diagnostics: []`, an empty current graph, and only 4 service/database plus 3 volume creates. The plan includes EU West, private references, TCP proxies and sleep disabled, with no deletes or changes to existing resources. It was not applied.

- [ ] G4: A fresh-project deploy confirms all four services, region, references, generated secrets, domains, TCP proxy, volumes, and disabled sleeping.
  EVIDENCE: pending

- [ ] G5: Cross-device, private Git, provider mock, and restart recovery acceptance pass on the Railway deployment.
  EVIDENCE: pending

- [ ] G6: A real restore is completed and verified for all required persistent stores.
  EVIDENCE: pending

- [ ] G7: Railway publishes the reviewed template and provides the actual template URL before README buttons are enabled.
  EVIDENCE: pending
