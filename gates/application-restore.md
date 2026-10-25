# Gates: application-level restore

Scope: Verify realistic four-store application recovery in a newly named isolated Compose project, beyond the synthetic data-level fixture restore.

- [x] G1: Isolated restore preserves PostgreSQL roles/data, a private Forgejo repository usable through authenticated non-admin API and Git access, OmniRoute authentication/provider metadata, and workspace gateway/editor configuration, without overstating CloudCLI session recovery.
  CHECK: npm run test:application-restore
  EXPECT: /# tests 4\n# suites 1\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 0/
  EVIDENCE: # todo 0 | # duration_ms 44197.090125
