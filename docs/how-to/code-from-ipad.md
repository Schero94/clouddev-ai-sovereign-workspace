---
title: Code from an iPad with Claude Code and Codex
description: Run Claude Code, Codex, VS Code, Node.js, and Python on your own Railway workspace and use them from an iPad, iPhone, or Android browser.
tags:
  - code from iPad
  - vibe coding on iPad
  - Claude Code on iPad
  - Codex on iPad
  - VS Code on iPad
  - Railway workspace
---

# Code from an iPad with Claude Code and Codex

**Short answer:** yes. An iPad cannot run Claude Code, Codex, Node.js, or
Python itself. CloudDev AI runs them on your own Railway project, and the iPad
uses Safari. You keep one workspace that also works from a phone or a
computer.

## What runs where

| On the iPad | On your Railway project |
| --- | --- |
| Safari, or the page added to the Home Screen | Claude Code CLI and Codex CLI |
| CloudCLI, a touch-friendly chat for both agents | Browser VS Code (code-server) |
| Browser VS Code | Node.js 26.13.1 LTS, Python 3.15.2, uv, pnpm, Git |
| Nothing to install | OmniRoute, which holds your ChatGPT, Claude, or DeepSeek access |

Files, Git history, and agent sessions live on one Railway volume at
`/workspace`. Close the iPad, then open the same project from a phone or a
computer.

## Setup in three taps

1. **Deploy the template on Railway.** Railway generates every password and
   secret for the deployment. You do not type a password into a form.
2. **Sign in.** Open the workspace address and enter the generated workspace
   password from the Railway variables. Then choose Sign in with ChatGPT or
   Sign in with Claude, or add a DeepSeek API key. The workspace connects its
   own limited inference key. You do not paste a key into Terminal.
3. **Open the AI chat.** Tap **Open the AI chat** on the start page, then
   tap Share and **Add to Home Screen**. It opens like an app from then on.

The release status page lists what is still open before the template is
published. See [Release status](../operations/RELEASE_STATUS.md).

## Tools included in the workspace

- Claude Code, Codex, and OpenCode, with pinned versions. All three use the
  OmniRoute gateway without extra setup
- Playwright with Chromium, so CloudCLI Browser can open web pages for the agents
- CloudCLI with its Linux plugins, including the terminal, task queue, and
  session manager, plus the TaskMaster CLI
- Node.js 26.13.1 LTS with npm and pnpm
- Python 3.15.2 through uv. Debian's own `python3` stays for system tools
- VS Code extensions from Open VSX: Python, Python Debugger, ESLint, Prettier,
  Tailwind CSS IntelliSense, Markdown All in One, YAML, Even Better TOML, and
  Error Lens

## Limits to know before you start

- The iPad needs a network connection. Nothing runs offline.
- Railway bills the always-on workspace by usage. See Railway's pricing page.
- A Railway restart stops running agent processes. Files and saved session
  history stay. Resume through the supported provider action.
- Prompts and code go to the AI provider you sign in to, under that
  provider's terms.
- This is a single-user workspace, not a shared team service.

## Questions people ask

**Can I use Claude Code on an iPad?**
Yes, through a server. Claude Code runs in this Railway workspace, and you use
it from CloudCLI or the VS Code terminal in Safari.

**Can I use VS Code on an iPad?**
Yes. Browser VS Code runs in the workspace and opens in Safari. Desktop VS
Code Remote-SSH is for computers only.

**Do I need a Mac?**
No. A Railway account and an AI provider account are enough.

**Which AI models work?**
ChatGPT and Claude through their official sign-in in OmniRoute, and DeepSeek
with its API key. See [Connect a provider](providers.md).
