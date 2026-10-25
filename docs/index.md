---
title: CloudDev AI documentation
description: Learn how the single-user CloudDev AI workspace connects VS Code Desktop, browser VS Code, and CloudCLI to one persistent project tree.
tags:
  - CloudDev AI
  - Railway workspace
  - VS Code Remote-SSH
  - browser IDE
  - CloudCLI mobile
  - OmniRoute
---

<div class="cd-home" markdown="1">

<div class="cd-hero" markdown="1">

<div class="cd-hero__copy" markdown="1">

<p class="cd-eyebrow"><span class="cd-eyebrow__dot"></span> SINGLE-USER WORKSPACE <span class="cd-eyebrow__divider">/</span> ONE PERSISTENT PROJECT TREE</p>

# One workspace. <br><span class="cd-gradient">Every screen.</span> {.cd-home-title}

<p class="cd-lead">Move between VS Code Desktop, browser VS Code, and CloudCLI on your phone. They work with the same persistent projects and supported agent-session artifacts.</p>

<div class="cd-actions" markdown="1">

[See how deployment works](how-to/deploy-on-railway.md){ .cd-button .cd-button--primary }
[Explore the features](features.md){ .cd-button .cd-button--quiet }

</div>

<p class="cd-hero__note">Editor windows do not share UI state. A workspace restart stops running processes. Review interrupted tasks and resume only through a provider-supported action.</p>

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
<p><strong>Railway release status</strong><br>No live Railway template or verified one-click deployment is available yet. Check the open gates before using this as a production deployment guide.</p>
[Review release evidence](operations/RELEASE_STATUS.md){ .cd-inline-link }
</div>

<section class="cd-visual-section" aria-labelledby="cd-launchpad-heading">
<div class="cd-visual-heading">
<p class="cd-eyebrow">THE WORKSPACE LAUNCHPAD</p>
<h2 id="cd-launchpad-heading">A clear starting point on desktop and phone</h2>
<p>The images below are from the local launchpad build. They show the real service cards, not a live Railway deployment.</p>
</div>
<div class="cd-screenshot-grid">
<figure class="cd-screenshot cd-screenshot--desktop">
<img src="assets/screenshots/launchpad-services-desktop.png" alt="Desktop launchpad with cards for CloudCLI, browser VS Code, Forgejo, OmniRoute, Codex, and Claude Code." width="980" height="301" loading="lazy" decoding="async">
<figcaption><strong>Desktop launchpad</strong><span>Captured from the local build. Each destination uses its own service sign-in where required.</span></figcaption>
</figure>
<figure class="cd-screenshot cd-screenshot--mobile">
<img src="assets/screenshots/launchpad-services-mobile.png" alt="Mobile launchpad showing the six workspace service cards stacked for a narrow screen." width="364" height="795" loading="lazy" decoding="async">
<figcaption><strong>Mobile layout</strong><span>The same launchpad actions fit a phone screen.</span></figcaption>
</figure>
</div>
<p class="cd-evidence-note">The captures document the local interface only. Railway domains, service health, Remote-SSH, and Marketplace publication still require live acceptance checks.</p>
</section>

<h2 class="cd-section-title">Choose a path <span>START HERE</span></h2>

<div class="cd-route-grid" markdown="1">

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">01 <span>CAPABILITIES</span></p>
## See what is included
Review the workspace surfaces, persistent data, provider routing, and the limits that still apply.

[Open the feature list](features.md){ .cd-route-card__link }
</div>

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">02 <span>DEPLOY</span></p>
## Prepare a Railway project
Follow the Composer steps and distinguish the documented setup from a verified live template.

[Read the Railway guide](how-to/deploy-on-railway.md){ .cd-route-card__link }
</div>

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">03 <span>FIRST RUN</span></p>
## Sign in and finish setup
Use the generated workspace password, create regular service accounts, and connect your own provider.

[Follow first login](how-to/first-login.md){ .cd-route-card__link }
</div>

<div class="cd-route-card" markdown="1">
<p class="cd-route-card__index">04 <span>DEVICES</span></p>
## Connect your clients
Set up key-only Remote-SSH, browser VS Code, and the CloudCLI mobile interface.

[Connect desktop and mobile](how-to/connect-clients.md){ .cd-route-card__link }
</div>

</div>

<div class="cd-home-footer" markdown="1">

More detail: [local quick start](getting-started.md), [architecture](architecture.md), and the [operations control plane](operations/CONTROL_PLANE.md).

</div>

<div class="cd-guardrails" markdown="1">
<div class="cd-guardrails__lead" markdown="1">
<p class="cd-eyebrow">BUILT AROUND CLEAR BOUNDARIES</p>
## Private workspace, defined limits
Provider master keys stay in OmniRoute. Agent processes can read the scoped inference key they use and can make outbound connections. Railway Private Networking does not filter that egress. A restart interrupts running work; supported session recovery is manual.
</div>
<div class="cd-guardrails__links" markdown="1">
[Security hardening](security/SECURITY_HARDENING.md){ .cd-guardrail-link }
[Data flows](privacy/DATA_FLOW.md){ .cd-guardrail-link }
[Backup and restore](security/BACKUP_RESTORE.md){ .cd-guardrail-link }
</div>
</div>

<p class="cd-home-footer">Source, tests, and release evidence live in the <a href="https://github.com/Schero94/clouddev-ai-sovereign-workspace">GitHub repository</a>.</p>

</div>
