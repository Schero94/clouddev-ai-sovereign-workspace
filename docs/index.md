---
title: CloudDev AI docs
description: Set up and operate a private, persistent CloudDev AI workspace across desktop, browser, and mobile.
---

<div class="cd-home" markdown="1">

<div class="cd-hero" markdown="1">

<div class="cd-hero__copy" markdown="1">

<p class="cd-eyebrow"><span class="cd-eyebrow__dot"></span> SINGLE-USER WORKSPACE <span class="cd-eyebrow__divider">/</span> PERSISTENT BY DESIGN</p>

# One workspace.<br><span class="cd-gradient">Every screen.</span> {.cd-home-title}

<p class="cd-lead">Use native VS Code, browser VS Code, or CloudCLI on your phone. Each connects to the same project tree and supported agent-session history.</p>

<div class="cd-actions" markdown="1">

[Set up your workspace](getting-started.md){ .cd-button .cd-button--primary }
[Check release status](operations/RELEASE_STATUS.md){ .cd-button .cd-button--quiet }

</div>

<p class="cd-hero__note">Files and session artifacts are shared. Separate editor windows do not share UI state. A workspace restart interrupts running agent processes.</p>

</div>

<div class="cd-architecture" role="img" aria-label="VS Code Desktop, browser IDE, and CloudCLI mobile connect to one persistent workspace at slash workspace.">
<div class="cd-architecture__caption"><span>ONE REMOTE WORKSPACE</span><span class="cd-architecture__caption-line"></span><span>THREE CLIENTS</span></div>
<div class="cd-clients">
<div class="cd-client"><span class="cd-client__icon cd-client__icon--vscode">VS</span><span class="cd-client__copy"><strong>VS Code Desktop</strong><small>Key-only Remote-SSH</small></span><span class="cd-client__signal"></span></div>
<div class="cd-client"><span class="cd-client__icon cd-client__icon--browser">&lt;/&gt;</span><span class="cd-client__copy"><strong>Browser IDE</strong><small>code-server</small></span><span class="cd-client__signal"></span></div>
<div class="cd-client"><span class="cd-client__icon cd-client__icon--mobile">C</span><span class="cd-client__copy"><strong>CloudCLI mobile</strong><small>Phone and tablet</small></span><span class="cd-client__signal"></span></div>
</div>
<div class="cd-bus" aria-hidden="true"><span></span><span></span><span></span></div>
<div class="cd-workspace-core">
<div class="cd-workspace-core__mark" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
<div class="cd-workspace-core__copy"><small>PERSISTENT WORKSPACE VOLUME</small><strong>/workspace</strong><span>projects <i></i> Git checkouts <i></i> session artifacts</span></div>
</div>
<div class="cd-architecture__foot"><span>ONE USER</span><span class="cd-architecture__foot-line"></span><span>ONE PROJECT TREE</span><span class="cd-architecture__foot-line"></span><span>PRIVATE INSTANCE</span></div>

</div>

</div>

<div class="cd-release-note" markdown="1">
<span class="cd-release-note__icon" aria-hidden="true">↗</span>
<p><strong>Before you deploy</strong><br>Review the release gates first. A local build is not proof of a fresh Railway deployment.</p>
[Open release status](operations/RELEASE_STATUS.md){ .cd-inline-link }
</div>

<h2 class="cd-section-title">Find your next step <span>01 / 03</span></h2>

<div class="cd-route-grid" markdown="1">

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">01 <span>DEPLOY</span></p>
## Get the workspace running
Follow the local quick start or prepare a Railway deployment. See which settings are automatic and which need your input.

[Start setup](getting-started.md){ .cd-route-card__link }
</div>

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">02 <span>UNDERSTAND</span></p>
## Know what shares state
Review the service boundaries, persistent paths, client connections, and where provider requests go.

[Explore the architecture](architecture.md){ .cd-route-card__link }
</div>

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">03 <span>OPERATE</span></p>
## Keep it healthy
Check variables, recovery actions, backups, and the evidence required before a release.

[Open the control plane](operations/CONTROL_PLANE.md){ .cd-route-card__link }
</div>

</div>

<div class="cd-guardrails" markdown="1">
<div class="cd-guardrails__lead" markdown="1">
<p class="cd-eyebrow">BUILT AROUND CLEAR BOUNDARIES</p>
## Private by default. Honest about recovery.
Provider master keys stay in OmniRoute. The workspace receives a scoped inference credential. After a restart, running tasks are marked interrupted; resume them only through a supported, user-initiated action.
</div>
<div class="cd-guardrails__links" markdown="1">
[Security hardening](security/SECURITY_HARDENING.md){ .cd-guardrail-link }
[Data flows](privacy/DATA_FLOW.md){ .cd-guardrail-link }
[Backup and restore](security/BACKUP_RESTORE.md){ .cd-guardrail-link }
</div>
</div>

<p class="cd-home-footer">Source, tests, and full release evidence live in the <a href="https://github.com/Schero94/clouddev-ai-sovereign-workspace">GitHub repository</a>.</p>

</div>
