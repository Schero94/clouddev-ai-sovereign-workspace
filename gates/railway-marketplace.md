# Gates: Railway template and marketplace

Scope: The four-service Railway template is verified in the requested personal workspace before public Marketplace claims or a deploy button are added.

- [ ] G1: IaC and Composer variable contracts match current official Railway docs and the pinned package.
  CHECK: npm run check:railway-template && npm run check:railway
  EXPECT: pass
  EVIDENCE: pending

- [ ] G2: The Railway CLI is authenticated to the Schero94 personal workspace and a dedicated empty test project is selected.
  EVIDENCE: pending

- [ ] G3: A reviewed Railway config plan has no unexpected deletes or changes.
  EVIDENCE: pending

- [ ] G4: A fresh-project deploy confirms all four services, region, references, generated secrets, domains, TCP proxy, volumes, and disabled sleeping.
  EVIDENCE: pending

- [ ] G5: Cross-device, private Git, provider mock, and restart recovery acceptance pass on the Railway deployment.
  EVIDENCE: pending

- [ ] G6: A real restore is completed and verified for all required persistent stores.
  EVIDENCE: pending

- [ ] G7: Railway publishes the reviewed template and provides the actual template URL before README buttons are enabled.
  EVIDENCE: pending
