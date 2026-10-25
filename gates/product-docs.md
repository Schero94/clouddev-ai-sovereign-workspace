# Gates: Product docs and screenshots

Scope: The public site and click-through guides use real product evidence, clear route choices, and no unsupported claims.

- [ ] G1: Strict documentation build and public artifact scan pass.
  CHECK: npm run docs:check
  EXPECT: Documentation artifact passed
  EVIDENCE: pending

- [ ] G2: Every displayed product screenshot exists in the generated site and has non-empty descriptive alt text and a caption/source.
  CHECK: node --test tests/unit/docs-screenshots.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G3: Deployment, provider setup, client connection, and recovery guides name the actual screen/control and expected result.
  CHECK: node --test tests/unit/docs-site.test.mjs
  EXPECT: # fail 0
  EVIDENCE: pending

- [ ] G4: Real browser validation confirms links, desktop/mobile layout, image loading, navigation, and no horizontal overflow.
  EVIDENCE: pending

- [ ] G5: Screenshots contain no credentials, personal account data, project IDs, private repository content, or test secrets.
  EVIDENCE: pending

- [ ] G6: Current GitHub Pages deployment corresponds to the reviewed source commit.
  EVIDENCE: pending
