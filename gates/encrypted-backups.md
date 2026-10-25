# Gates: operator-key-encrypted backups

Scope: Export the local workspace, Forgejo volume, PostgreSQL data and OmniRoute data as encrypted artifacts that can be restored in an isolated Compose project.

- [x] G1: The backup command requires write-quiescence acknowledgement, validates its destination and age recipient, uses restrictive output permissions, and never prints credential values.
  CHECK: node --test tests/unit/backup-encryption.test.mjs
  EXPECT: /# tests 7\n# suites 0\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: `node --test tests/unit/backup-encryption.test.mjs` passed 7 tests on 2026-10-25, including missing recipient/quiescence failures, path validation, mode-0600 encrypted artifacts, checksums, cleanup and secret redaction.

- [x] G2: Data is streamed directly into age encryption. No plaintext archive reaches persistent storage; OmniRoute's consistent SQLite snapshot remains in ephemeral tmpfs.
  CHECK: npm run test:encrypted-backup
  EXPECT: /# tests 9\n# suites 0\n# pass 9\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: `npm run test:encrypted-backup` passed 9/9 tests with no skips on 2026-10-25. The test generated an ephemeral age key, encrypted five artifacts including PostgreSQL globals, restored all four stores into unique isolated Compose projects, and checked that pre-existing containers did not change.

- [x] G3: The encrypted PostgreSQL, workspace, Forgejo and OmniRoute artifacts decrypt with the operator identity and restore into a separately named isolated Compose project.
  CHECK: npm run test:encrypted-restore
  EXPECT: /# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: `npm run test:encrypted-restore` passed 2/2 tests with no skips on 2026-10-25. The isolated restore verified the workspace, Forgejo volume, PostgreSQL roles/data, and OmniRoute SQLite marker and integrity.

- [x] G4: The private age identity is not stored in Railway variables, the repository, Docker contexts, `/workspace`, or agent process environments.
  CHECK: npm run test:security
  EXPECT: /Security static checks passed across 93 source files/
  EVIDENCE: `npm run test:security` passed across 93 source files. The test identity is temporary and generated outside the repository; it is not stored in Railway, `/workspace`, Docker contexts, or agent environment configuration.
