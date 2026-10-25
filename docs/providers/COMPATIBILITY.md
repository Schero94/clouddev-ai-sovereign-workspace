# Provider compatibility

CloudDev routes its terminal coding agents through the OmniRoute CLI version pinned by this repository: **3.8.52**. Compatibility depends on both the agent's request protocol and the model/provider route exposed by the running OmniRoute instance. A model appearing in the catalog does not prove that every client feature works with it.

The [provider setup guide](../how-to/providers.md) walks through connecting a provider and selecting models. This page records what the current integration supports and what has not been verified.

## Compatibility matrix

| Client or provider path | Gateway protocol and discovery | Evidence and limits |
| --- | --- | --- |
| Codex CLI through `ai-codex` | CloudDev invokes `omniroute run codex` with the selected model and an OpenAI Responses-compatible provider at the OmniRoute `/v1` endpoint. The upstream Codex setup command also generates profiles from the live `/v1/models` catalog. | The repository's local mock-provider integration exercises the pinned Codex CLI through OmniRoute. This is not a live OpenAI API test and does not establish feature parity for every upstream model. |
| Claude Code through `ai-claude` | CloudDev invokes `omniroute run claude`; the upstream launcher configures Claude Code's Anthropic Messages-compatible route and injects the gateway token at process launch. | The repository's local mock-provider integration exercises the pinned Claude Code CLI through OmniRoute. This is not a live Anthropic API test and does not establish feature parity for every upstream model. |
| OpenAI API connection | Add the provider in OmniRoute and use only a model exposed by the authenticated live catalog. Codex API-key routing uses OpenAI API billing. | CloudDev's mock tests verify its Codex protocol path, not a paid OpenAI account or every OpenAI model capability. |
| Anthropic API connection | Add the provider in OmniRoute and use a catalog model that supports the Anthropic Messages route required by Claude Code. | CloudDev's mock tests verify the client-to-gateway path, not a paid Anthropic account or every Anthropic model capability. |
| DeepSeek API connection | OmniRoute 3.8.52's DeepSeek registry declares OpenAI chat-completions as its default format, with OpenAI Responses-compatible and Anthropic-compatible formats also declared. Select a model only when it appears in the live catalog and check the route expected by the chosen CLI. | The pinned source declares these formats. This repository does not include a live DeepSeek-provider test, so provider-specific behavior and feature parity are **not live-tested**. |
| Other OpenAI-compatible APIs | Use a provider integration that OmniRoute officially lists or documents. Its base URL, authentication format, model mapping, and required wire protocol must all match. | No blanket compatibility claim is made. A custom URL or an OpenAI-compatible label alone does not prove that a model supports Codex, Claude Code, tools, streaming, or other features. |
| Free or no-key connections | Use only entries present in the running OmniRoute provider and model catalog. | Availability, terms, model names, and usage limits belong to the upstream provider and can change. CloudDev does not promise that a free route will remain available. |

The mock tests are `scripts/verify-mock-llm.mjs`, `tests/mock-llm/run-agents.mjs`, and `services/ide/test/omniroute-run.integration.test.mjs`. They use test-only credentials and a local mock endpoint. They do not make paid provider requests.

## Codex sign-in is not the same as API routing

OpenAI documents that ChatGPT sign-in and API-key sign-in are distinct local Codex authentication methods. OpenAI states that API-key usage is billed at standard OpenAI API rates and does not use ChatGPT plan credits. See [Codex authentication](https://developers.openai.com/codex/auth).

CloudDev's supported Codex route is the API-compatible path through OmniRoute. It does not relay or consume a ChatGPT subscription through OmniRoute. Signing in directly to Codex with ChatGPT is a separate authentication mode and is not evidence that requests pass through this gateway. This project does not claim that the pinned OmniRoute release provides a permitted ChatGPT-subscription relay.

Do not use token extraction, browser-cookie copying, account rotation, quota circumvention, rate-limit evasion, or shared credentials. Use provider credentials issued for the API product and follow that provider's current terms.

## DeepSeek API billing

DeepSeek API access requires an API key. DeepSeek's API documentation describes Bearer authentication and links to [create an API key](https://platform.deepseek.com/api_keys). The DeepSeek API is token-billed. Its pricing table lists input and output prices per one million tokens, and says prices can change. Check the [current DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing) before selecting a model or sending a paid request. **DeepSeek API access is not free.**

The DeepSeek consumer website and the DeepSeek API are separate products. Do not infer API price, quota, or API-key entitlement from access to the consumer website.

## What the model list means

`ai-models` and `ai-setup` query the authenticated OmniRoute chat-model catalog. The list reflects what the current gateway key can see. CloudDev does not maintain a static list of model IDs and does not certify every listed model against both agents.

Before using a model for real work:

1. Check the provider's current API protocol and feature support.
2. Confirm the model appears in `ai-models` for the configured inference key.
3. Select it for one agent with `ai-setup`.
4. Test with a short, non-sensitive request. A real provider request may be billable.
5. Re-check the provider's price, retention, region, and usage terms before sending confidential code or prompts.

Gateway key policies in OmniRoute 3.8.52 include model and connection access controls. Apply the narrowest policy the current UI supports. The coding agents need an inference key to make requests, so an agent running as the workspace user can read that scoped key. File mode `0600` prevents access by other Unix users, not by the agent process running as the same user. Provider master credentials remain in OmniRoute.

## Primary sources

- [OmniRoute CLI tools documentation](https://omniroute.hagicode.com/en-US/reference/cli-tools)
- [OmniRoute CLI integrations guide at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/docs/guides/CLI-INTEGRATIONS.md)
- [OmniRoute v3.8.52 source tree](https://github.com/cheaper-inference/OmniRoute/tree/v3.8.52)
- [Codex setup source at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/setup-codex.mjs)
- [Claude Code setup source at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/setup-claude.mjs)
- [OmniRoute run command source at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/commands/run.mjs)
- [OmniRoute API key policy source at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/bin/cli/key-policy.mjs)
- [DeepSeek provider registry at v3.8.52](https://github.com/cheaper-inference/OmniRoute/blob/v3.8.52/open-sse/config/providers/registry/deepseek/index.ts)
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth)
- [OpenAI API key dashboard](https://platform.openai.com/api-keys)
- [DeepSeek API authentication and key creation](https://api-docs.deepseek.com/api/deepseek-api)
- [DeepSeek API key console](https://platform.deepseek.com/api_keys)
- [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing)

Reviewed against the repository's OmniRoute 3.8.52 pin and the linked upstream documentation on 2026-10-25. Provider catalogs, terms, prices, and model capabilities can change after this review.
