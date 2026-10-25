import assert from "node:assert/strict";

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("The mock router probe input is invalid."); }
}

const { apiKey, models } = await readInput();
if (typeof apiKey !== "string" || typeof models?.codex !== "string" || typeof models?.claude !== "string") {
  throw new Error("The mock router probe requires a scoped inference key and model IDs.");
}
const baseUrl = "http://127.0.0.1:20129";
const authHeaders = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };

const modelsResponse = await fetch(`${baseUrl}/v1/models?kind=chat`, {
  headers: { authorization: `Bearer ${apiKey}` },
});
const modelsBody = await modelsResponse.text();
assert.equal(modelsResponse.status, 200,
  `The scoped key must list its available chat models (HTTP ${modelsResponse.status}, ${modelsResponse.headers.get("content-type") ?? "unknown content type"}).`);
const catalog = JSON.parse(modelsBody);
const modelIds = Array.isArray(catalog?.data) ? catalog.data.map(item => item?.id).filter(id => typeof id === "string") : [];
assert.ok(modelIds.includes(models.codex), "The configured Codex mock model must be visible to the key.");
assert.ok(modelIds.includes(models.claude), "The configured Claude Code mock model must be visible to the key.");

const anonymous = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: models.codex, messages: [{ role: "user", content: "synthetic unauthenticated request" }] }),
});
assert.equal(anonymous.status, 401, "Anonymous inference must remain denied.");

const completionResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ model: models.codex, messages: [{ role: "user", content: "Return the mock marker." }] }),
});
assert.equal(completionResponse.status, 200, "The mock completion must be routed successfully.");
const completion = await completionResponse.json();
assert.match(completion?.choices?.[0]?.message?.content ?? "", /CLOUDDEV_MOCK_LLM_OK/);

const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ model: models.codex, stream: true, messages: [{ role: "user", content: "Stream the mock marker." }] }),
});
assert.equal(streamResponse.status, 200, "The mock streaming completion must be routed successfully.");
const stream = await streamResponse.text();
const streamSummaries = stream.split(/\r?\n/)
  .filter(line => line.startsWith("data: {") || line === "data: [DONE]")
  .map(line => {
    if (line === "data: [DONE]") return { done: true };
    try {
      const frame = JSON.parse(line.slice("data: ".length));
      const choice = frame.choices?.[0];
      return {
        done: false,
        hasContent: typeof choice?.delta?.content === "string",
        content: typeof choice?.delta?.content === "string" ? choice.delta.content : "",
        finishReason: choice?.finish_reason ?? null,
        hasError: Boolean(frame.error),
      };
    } catch {
      return { done: false, invalidFrame: true };
    }
  });
const streamText = streamSummaries.map(frame => frame.content || "").join("");
assert.equal(streamText, "CLOUDDEV_MOCK_LLM_OK",
  `OpenAI-compatible stream returned a different synthetic mock marker (HTTP ${streamResponse.status}).`);
assert.ok(streamSummaries.some(frame => frame.done));

const anthropicHeaders = {
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
};
const messageResponse = await fetch(`${baseUrl}/v1/messages`, {
  method: "POST",
  headers: anthropicHeaders,
  body: JSON.stringify({ model: models.claude, max_tokens: 32, messages: [{ role: "user", content: "Return the mock marker." }] }),
});
assert.equal(messageResponse.status, 200, "The Anthropic-compatible completion must be routed successfully.");
assert.match((await messageResponse.json()).content?.[0]?.text ?? "", /CLOUDDEV_MOCK_LLM_OK/);

const anthropicStreamResponse = await fetch(`${baseUrl}/v1/messages`, {
  method: "POST",
  headers: anthropicHeaders,
  body: JSON.stringify({ model: models.claude, max_tokens: 32, stream: true, messages: [{ role: "user", content: "Stream the mock marker." }] }),
});
assert.equal(anthropicStreamResponse.status, 200, "The Anthropic-compatible stream must be routed successfully.");
const anthropicStream = await anthropicStreamResponse.text();
assert.match(anthropicStream, /event: message_start/);
assert.match(anthropicStream, /CLOUDDEV_MOCK_LLM_OK/);
assert.match(anthropicStream, /event: message_stop/);

const metricsResponse = await fetch("http://clouddev-mock-llm:18080/__test/metrics");
assert.equal(metricsResponse.status, 200);
const upstream = await metricsResponse.json();
assert.ok(upstream.modelRequests >= 1);
assert.ok(upstream.completionRequests >= 2);
assert.ok(upstream.streamingRequests >= 1);
assert.ok(upstream.messageRequests >= 2);
assert.ok(upstream.streamingMessageRequests >= 1);
assert.equal(upstream.unauthorizedRequests, 0, "Only authenticated gateway traffic may reach the provider.");

process.stdout.write(`${JSON.stringify({
  anonymousStatus: anonymous.status,
  modelsListed: { codex: modelIds.includes(models.codex), claude: modelIds.includes(models.claude) },
  openAIChatRouted: true,
  openAIStreamRouted: true,
  anthropicMessagesRouted: true,
  anthropicStreamRouted: true,
  providerMetrics: {
    modelRequests: upstream.modelRequests,
    completionRequests: upstream.completionRequests,
    streamingRequests: upstream.streamingRequests,
    messageRequests: upstream.messageRequests,
    streamingMessageRequests: upstream.streamingMessageRequests,
  },
})}\n`);
