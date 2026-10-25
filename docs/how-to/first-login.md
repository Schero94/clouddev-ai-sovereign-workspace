---
title: First login and workspace setup
description: Sign in to the CloudDev AI launchpad, create separate service accounts, connect Forgejo, and give the agents a scoped OmniRoute key.
tags:
  - CloudDev AI first login
  - workspace onboarding
  - Forgejo setup
  - OmniRoute setup
  - Codex CLI
  - Claude Code
---

# First login and workspace setup

Use this guide after deploying a tested instance. The current Railway template is not published or verified, so these steps do not imply a working Marketplace deployment. Start with the [release status](../operations/RELEASE_STATUS.md) and the [Railway deployment guide](deploy-on-railway.md).

## 1. Sign in to the workspace

1. In Railway, open the `clouddev-ide` service and find its generated HTTPS domain under **Settings → Networking**.
2. Open that domain in a browser. If the sign-in page asks for the workspace password, use the generated `CODE_SERVER_PASSWORD` from the deployment inputs. It is not a default password.
3. Save the password in a password manager. Do not paste it into a terminal, chat, Git issue, or repository. After first access, seal the Railway variable if the variable inventory says it can be sealed.
4. The launchpad opens with service health, desktop connection details, and first-run steps. CloudCLI, Forgejo, and OmniRoute keep separate accounts. Workspace sign-in does not sign you in to those services.

The launchpad screenshots below are captures from the local build. They show the actual service cards, not a Railway deployment.

<div class="cd-screenshot-grid cd-screenshot-grid--guide">
<figure class="cd-screenshot cd-screenshot--desktop">
<img src="../../assets/screenshots/launchpad-services-desktop.png" alt="CloudDev AI desktop launchpad with Open CloudCLI, Browser VS Code, Open Forgejo, Manage AI providers, Start Codex, and Start Claude actions." width="980" height="301" loading="lazy" decoding="async">
<figcaption><strong>Desktop launchpad</strong><span>Use a service card to open its interface. Forgejo and OmniRoute ask for their own sign-in.</span></figcaption>
</figure>
<figure class="cd-screenshot cd-screenshot--mobile">
<img src="../../assets/screenshots/launchpad-services-mobile.png" alt="CloudDev AI mobile launchpad with the same six service cards in a vertical layout." width="364" height="795" loading="lazy" decoding="async">
<figcaption><strong>Phone layout</strong><span>Open the same workspace origin from an iPhone or Android browser.</span></figcaption>
</figure>
</div>

## 2. Create the CloudCLI account

1. On the launchpad, click **Open CloudCLI**.
2. Create the single local CloudCLI account when its first-run screen asks you to. Keep its login separate from the workspace password.
3. Return to the launchpad after setup. CloudCLI holds the mobile-first workspace home and provider session history.

<figure class="cd-screenshot cd-screenshot--mobile">
<img src="../../assets/screenshots/cloudcli-first-run-mobile.png" alt="CloudCLI first-run account form on a 390-pixel-wide mobile viewport, with empty username and password fields." width="390" height="844" loading="lazy" decoding="async">
<figcaption><strong>CloudCLI first run</strong><span>Local account-creation screen with no username or password entered.</span></figcaption>
</figure>

The launchpad shortcut is not a shared sign-on service. CloudCLI, Forgejo, and OmniRoute have their own authentication.

## 3. Set up Forgejo for Git

1. Click **Open Forgejo** and sign in with the generated bootstrap administrator account listed in the [Railway variable guide](../operations/RAILWAY_TEMPLATE_VARIABLES.md).
2. Change the bootstrap password. Create a regular, non-admin account for normal repository work and create a private repository.
3. In **Browser VS Code**, open **Terminal → New Terminal** and run:

   ```sh
   git-setup
   ```

4. Copy the public key printed by `git-setup`. In Forgejo, sign in as the regular user and add that public key to the account's SSH keys.
5. Keep the private key in the persistent workspace home. Do not use an administrator token or add it to the agent's environment.

If the generated bootstrap password is no longer available, use the documented Forgejo recovery procedure. Do not expose the administrator token to the workspace to work around a missing password.

<figure class="cd-screenshot cd-screenshot--desktop">
<img src="../../assets/screenshots/forgejo-login-desktop.png" alt="Forgejo 17.0.0 local sign-in page with empty username and password fields." width="1440" height="900" loading="lazy" decoding="async">
<figcaption><strong>Forgejo sign-in</strong><span>Local login form. The capture contains no username, password, repository, or account data.</span></figcaption>
</figure>

## 4. Add a provider in OmniRoute

1. Return to the launchpad and click **Manage AI providers**.
2. Sign in to OmniRoute with its generated bootstrap password. Change that password before adding provider credentials.
3. In OmniRoute's authenticated dashboard, add a provider account using its documented integration. Provider credentials belong here, not in the Railway template or workspace environment.
4. Create an inference key with only the model access needed by this workspace. Keep the provider master key in OmniRoute.

The list of providers and models depends on the pinned OmniRoute release and the provider account. CloudDev does not package provider keys or promise that every model supports both agents.

## 5. Connect the agent CLIs

1. Click **Browser VS Code**, then choose **Terminal → New Terminal**.
2. Run `ai-setup`. Enter the internal OmniRoute URL if it is not already filled in. When prompted for an inference key, paste the scoped key, not an OmniRoute administrator key or provider master key. The input is hidden. The command saves it in the persistent home with restricted file permissions.
3. Choose only models shown by the live model list. Run `ai-status` to check the gateway and `ai-models` to list models the scoped key can use.
4. Restart the workspace if `ai-setup` tells you to, so CloudCLI loads the restricted inference configuration.
5. Start a task with `ai-codex` or `ai-claude` from an interactive terminal. Do not start a paid provider request until you have checked the provider's current billing and usage terms.

## 6. Create or open a project

Keep Git checkouts under `/workspace/projects`. Clone the private repository using the workspace Git identity, or create a repository in Forgejo and add its remote. Review repository instructions and scripts before running them. The agent shares the workspace user's file access and can make outbound connections.

## If the first run does not work

- **A service card is unavailable:** select **Refresh** in the launchpad's System health section, then review [troubleshooting](../operations/TROUBLESHOOTING.md).
- **Forgejo rejects a push:** check that `git-setup` created the workspace key and that its public half belongs to the regular Forgejo account.
- **No models appear:** add a provider or update the scoped key's allowed models in OmniRoute, then rerun `ai-models` and `ai-setup`.
- **An old task is interrupted:** review it in CloudCLI and resume only when the provider exposes a supported action. A workspace restart cannot restart the old in-memory process.

See [connect the clients](connect-clients.md) for desktop, browser, and phone access.
