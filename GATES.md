# Acceptance gates

No gate is considered passed until its command or live check has been run and the result recorded here.

| Gate | Evidence required | Status |
|---|---|---|
| Repository baseline | Git repository, rules, design, plan | In progress |
| Unit tests | `npm test` and shell test output | Not run |
| Security checks | secret scan, dependency audit, container scan | Not run |
| Compose configuration | `docker compose config --quiet` | Not run |
| Container builds | Build every service image | Not run |
| Local health | All service health checks pass | Not run |
| Forgejo round-trip | Create private repo, clone, commit, push, fetch | Not run |
| Mock model routing | Authenticated request reaches mock provider through OmniRoute | Not run |
| Codex integration | CLI request forwarded through OmniRoute to mock provider | Not run |
| Claude Code integration | CLI request forwarded through OmniRoute to mock provider | Not run |
| Restart persistence | IDE files, Forgejo repo, PostgreSQL and OmniRoute config survive restart | Not run |
| Railway IaC | Typecheck and `railway config plan` in a linked test project | Not run |
| Railway deployment | Fresh test project deployment reaches `SUCCESS`, all service checks pass | Not run |
| Marketplace | Template created, published, and test-deployed | Not run |
| Backup restore | Restore each required store into an isolated target and verify contents | Not run |
| Performance | Measured idle and single-agent CPU, RAM and storage with documented method | Not run |
