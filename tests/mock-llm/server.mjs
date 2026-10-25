import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request-too-large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid-json");
  }
}

function completionResponse(model, id = "chatcmpl-clouddev-mock") {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: "CLOUDDEV_MOCK_LLM_OK" },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

async function holdMobileAcceptanceTurn(messages) {
  const containsMarker = Array.isArray(messages) && messages.some(message => {
    const content = typeof message?.content === "string"
      ? message.content
      : Array.isArray(message?.content) ? message.content.map(part => part?.text ?? "").join(" ") : "";
    return content.includes("CLOUDDEV_MOCK_DELAY_FOR_MOBILE_HANDOFF");
  });
  if (containsMarker) await new Promise(resolve => setTimeout(resolve, 8000));
}

export function createMockLlmServer({ apiKey }) {
  if (typeof apiKey !== "string" || apiKey.length < 8 || /[\r\n\0]/.test(apiKey)) {
    throw new Error("A test-only mock API key is required.");
  }
  const metrics = {
    modelRequests: 0,
    completionRequests: 0,
    streamingRequests: 0,
    messageRequests: 0,
    streamingMessageRequests: 0,
    unauthorizedRequests: 0,
    lastModel: null,
  };
  const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://mock.invalid").pathname;
  if (request.method === "GET" && pathname === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (request.method === "GET" && pathname === "/__test/metrics") {
    sendJson(response, 200, { ...metrics });
    return;
  }
  if (request.method === "GET" && pathname === "/v1/models") {
    if (request.headers.authorization !== `Bearer ${apiKey}` && request.headers["x-api-key"] !== apiKey) {
      metrics.unauthorizedRequests += 1;
      sendJson(response, 401, { type: "error", error: { message: "Unauthorized" } });
      return;
    }
    metrics.modelRequests += 1;
    sendJson(response, 200, {
      object: "list",
      data: [{
        id: "mock-model",
        object: "model",
        created: 0,
        owned_by: "clouddev-test",
        type: "model",
        display_name: "CloudDev Mock Model",
        created_at: new Date(0).toISOString(),
      }],
    });
    return;
  }
  if (request.method === "POST" && pathname === "/v1/chat/completions") {
    if (request.headers.authorization !== `Bearer ${apiKey}`) {
      metrics.unauthorizedRequests += 1;
      sendJson(response, 401, { error: { message: "Unauthorized" } });
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, error?.message === "request-too-large" ? 413 : 400, { error: { message: "Invalid test request" } });
      return;
    }
    if (typeof body?.model !== "string" || !Array.isArray(body.messages)) {
      sendJson(response, 400, { error: { message: "A model and message list are required" } });
      return;
    }
    metrics.completionRequests += 1;
    metrics.lastModel = body.model;
    await holdMobileAcceptanceTurn(body.messages);
    if (body.stream !== true) {
      sendJson(response, 200, completionResponse(body.model));
      return;
    }

    metrics.streamingRequests += 1;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const emit = (delta, finishReason = null) => response.write(`data: ${JSON.stringify({
      id: "chatcmpl-clouddev-mock-stream",
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: body.model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`);
    emit({ role: "assistant", content: "CLOUDDEV_" });
    emit({ content: "MOCK_LLM_OK" });
    emit({}, "stop");
    response.end("data: [DONE]\n\n");
    return;
  }
  if (request.method === "POST" && pathname === "/v1/messages") {
    if (request.headers.authorization !== `Bearer ${apiKey}` && request.headers["x-api-key"] !== apiKey) {
      metrics.unauthorizedRequests += 1;
      sendJson(response, 401, { type: "error", error: { type: "authentication_error", message: "Unauthorized" } });
      return;
    }
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, error?.message === "request-too-large" ? 413 : 400, { type: "error", error: { type: "invalid_request_error", message: "Invalid test request" } });
      return;
    }
    if (typeof body?.model !== "string" || !Array.isArray(body.messages)) {
      sendJson(response, 400, { type: "error", error: { type: "invalid_request_error", message: "A model and message list are required" } });
      return;
    }
    metrics.messageRequests += 1;
    metrics.lastModel = body.model;
    await holdMobileAcceptanceTurn(body.messages);
    if (body.stream !== true) {
      sendJson(response, 200, {
        id: "msg_clouddev_mock",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: "CLOUDDEV_MOCK_LLM_OK" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      return;
    }

    metrics.streamingMessageRequests += 1;
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const emit = (event, payload) => response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    emit("message_start", {
      type: "message_start",
      message: { id: "msg_clouddev_mock_stream", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } },
    });
    emit("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "CLOUDDEV_MOCK_LLM_OK" } });
    emit("content_block_stop", { type: "content_block_stop", index: 0 });
    emit("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
    emit("message_stop", { type: "message_stop" });
    response.end();
    return;
  }
  sendJson(response, 404, { error: { message: "Unknown mock route" } });
  });
  return { server, metrics: () => ({ ...metrics }) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server } = createMockLlmServer({ apiKey: process.env.CLOUDDEV_MOCK_LLM_API_KEY });
  const port = Number(process.env.PORT || 18080);
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write("CloudDev mock LLM provider ready. Request bodies and credentials are not logged.\n");
  });

  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
