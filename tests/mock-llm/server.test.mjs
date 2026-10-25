import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createMockLlmServer } from "./server.mjs";

test("mock provider requires its test-only key, returns models and forwards non-streaming completions", async t => {
  const mock = createMockLlmServer({ apiKey: "test-only-key" });
  mock.server.listen(0, "127.0.0.1");
  await once(mock.server, "listening");
  t.after(() => new Promise(resolve => mock.server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${mock.server.address().port}`;

  const anonymous = await fetch(`${baseUrl}/v1/models`);
  assert.equal(anonymous.status, 401);
  const catalog = await fetch(`${baseUrl}/v1/models`, { headers: { authorization: "Bearer test-only-key" } });
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).data[0].id, "mock-model");

  const completion = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer test-only-key", "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-model", messages: [{ role: "user", content: "synthetic prompt" }] }),
  });
  assert.equal(completion.status, 200);
  assert.equal((await completion.json()).choices[0].message.content, "CLOUDDEV_MOCK_LLM_OK");
  assert.deepEqual(mock.metrics(), {
    modelRequests: 1,
    completionRequests: 1,
    streamingRequests: 0,
    messageRequests: 0,
    streamingMessageRequests: 0,
    unauthorizedRequests: 1,
    lastModel: "mock-model",
  });
});

test("mock provider supports Anthropic Messages API and its SSE event stream", async t => {
  const mock = createMockLlmServer({ apiKey: "test-only-key" });
  mock.server.listen(0, "127.0.0.1");
  await once(mock.server, "listening");
  t.after(() => new Promise(resolve => mock.server.close(resolve)));
  const url = `http://127.0.0.1:${mock.server.address().port}/v1/messages`;
  const request = { model: "mock-model", max_tokens: 32, messages: [{ role: "user", content: "synthetic prompt" }] };

  const unauthorized = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  assert.equal(unauthorized.status, 401);

  const completion = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": "test-only-key", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  assert.equal(completion.status, 200);
  assert.equal((await completion.json()).content[0].text, "CLOUDDEV_MOCK_LLM_OK");

  const streaming = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": "test-only-key", "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ ...request, stream: true }),
  });
  const stream = await streaming.text();
  assert.equal(streaming.status, 200);
  assert.match(stream, /event: message_start/);
  assert.match(stream, /CLOUDDEV_MOCK_LLM_OK/);
  assert.match(stream, /event: message_stop/);
  assert.equal(mock.metrics().messageRequests, 2);
  assert.equal(mock.metrics().streamingMessageRequests, 1);
  assert.equal(mock.metrics().unauthorizedRequests, 1);
});

test("mock provider emits OpenAI-compatible streaming chunks without retaining prompt content", async t => {
  const mock = createMockLlmServer({ apiKey: "test-only-key" });
  mock.server.listen(0, "127.0.0.1");
  await once(mock.server, "listening");
  t.after(() => new Promise(resolve => mock.server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${mock.server.address().port}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: "Bearer test-only-key", "content-type": "application/json" },
    body: JSON.stringify({ model: "mock-model", stream: true, messages: [{ role: "user", content: "private fixture text" }] }),
  });
  const streamed = await response.text();
  assert.equal(response.status, 200);
  const streamedText = streamed.split("\n")
    .filter(line => line.startsWith("data: {") && !line.includes('"finish_reason":"stop"'))
    .map(line => JSON.parse(line.slice("data: ".length)).choices[0].delta.content || "")
    .join("");
  assert.equal(streamedText, "CLOUDDEV_MOCK_LLM_OK");
  assert.match(streamed, /data: \[DONE\]/);
  assert.equal(JSON.stringify(mock.metrics()).includes("private fixture text"), false);
  assert.equal(mock.metrics().streamingRequests, 1);
});
