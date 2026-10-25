# Gates: cross-device acceptance and release

Scope: essential desktop-to-mobile-to-desktop task handoff, workspace persistence, restart recovery and release evidence.

- [ ] G1: Native VS Code Desktop on macOS connects to the Railway sshd endpoint with Remote-SSH using a key and verified host fingerprint.
  EVIDENCE: The prior local run connected native VS Code Remote-SSH on macOS using the operator key and verified host fingerprint. This was a local Compose endpoint, not the Railway endpoint. The new cross-device session was started via a key-authenticated SSH shell, not the native VS Code application.

- [ ] G2: A task started from native VS Code is visible and resumable in CloudCLI mobile; a follow-up instruction updates the shared files/session.
  EVIDENCE: Partial local browser proof: a detached Claude Code task started through the key-authenticated SSH shell was indexed in CloudCLI 1.37.5. A 390x844 Playwright browser sent a follow-up; the mock gateway returned `CLOUDDEV_MOCK_LLM_OK`; the project file was edited in CloudCLI and appeared in browser VS Code. Physical iPhone and a task started inside native VS Code remain open.

- [ ] G3: Reconnecting from native VS Code finds the same files and provider session history; Forgejo push/fetch works with the non-admin identity.
  EVIDENCE: Browser VS Code showed the mobile-edited file. SHA-256 from SSH and the shared workspace matched. The private non-admin Forgejo round-trip pushed and fetched the edited file after a Forgejo restart. Reopening the file and session inside native VS Code was not repeated in this run.

- [ ] G4: A Railway restart preserves files, CLI configuration, Git identity, CloudCLI database and agent history; task state becomes interrupted and upstream-supported resume works.
  EVIDENCE: Local Compose restart recovery passed via `npm run test:recovery`. After restart, the workspace file remained, the test task was marked interrupted, and its tmux process was absent. The CloudCLI session, follow-up conversation and selected OmniRoute model were still visible in the browser. Local encrypted and application-level restores passed in isolated Compose projects. No Railway restart or Railway-volume restore drill was performed.

- [x] G5: Mobile browser verification on physical iPhone and Android, plus native VS Code on Windows, is complete or listed as open with test constraints.
  EVIDENCE: Open with constraints: only Chromium at a 390x844 viewport was available. No physical iPhone, Android device or Windows host was available for this turn.

- [ ] G6: Marketplace template is published and test-deployed without an invented template ID or unverified badge.
  EVIDENCE: Open. No public Git remote or eligible personal Railway project is linked, and no Marketplace template was created or published.

- [x] G7: Workspace, Forgejo, PostgreSQL and OmniRoute backup restore drills complete against isolated targets.
  CHECK: npm run test:encrypted-backup && npm run test:application-restore
  EXPECT: pass
  EVIDENCE: On 2026-10-25, the encrypted backup suite passed 9/9 tests and restored the workspace, Forgejo volume, PostgreSQL roles/data, and OmniRoute SQLite to a unique isolated Compose project. The application-level restore passed 4/4 tests, including private Forgejo API/Git access, PostgreSQL roles/data, OmniRoute provider metadata, and workspace gateway/editor configuration. Existing containers were unchanged. This is local restore evidence, not a Railway volume restore.
