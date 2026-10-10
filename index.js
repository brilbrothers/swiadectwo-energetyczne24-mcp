#!/usr/bin/env node
// MCP server for swiadectwo-energetyczne24.pl — a thin stdio client.
//
// Every JSON-RPC message read from stdin (one per line) is forwarded to the
// public Streamable HTTP endpoint and the answer is written back to stdout.
// No tools, prices or rules live here: the list of tools, their schemas and
// all data come from the service itself, so what a model sees over stdio is
// exactly what it would see over HTTP. No dependencies on purpose.

import { createInterface } from "node:readline";

const ENDPOINT =
  process.env.SE24_MCP_URL?.trim() ||
  "https://swiadectwo-energetyczne24.pl/api/mcp";
const TIMEOUT_MS = 60_000;
const USER_AGENT = "swiadectwo-energetyczne24-mcp (stdio)";

/** Negotiated in `initialize`, then sent as a header on every later request. */
let protocolVersion = null;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** Requests carry both `method` and `id`; notifications and responses don't. */
function isRequest(message) {
  return (
    message !== null &&
    typeof message === "object" &&
    typeof message.method === "string" &&
    (typeof message.id === "string" || typeof message.id === "number")
  );
}

function fail(payload, text) {
  const messages = Array.isArray(payload) ? payload : [payload];
  for (const message of messages) {
    // A notification must never be answered — not even with an error.
    if (!isRequest(message)) continue;
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32000, message: text },
    });
  }
}

/** JSON-RPC messages from a `text/event-stream` body (`data:` lines per event). */
function parseEventStream(body) {
  const messages = [];
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) messages.push(JSON.parse(data));
  }
  return messages;
}

function remember(messages) {
  for (const message of messages) {
    const version = message?.result?.protocolVersion;
    if (typeof version === "string") protocolVersion = version;
  }
}

async function forward(payload) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "user-agent": USER_AGENT,
  };
  if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
  const token = process.env.SE24_MCP_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;

  let response;
  let body;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    body = await response.text();
  } catch (error) {
    fail(payload, `Cannot reach ${ENDPOINT}: ${error?.message ?? error}`);
    return;
  }

  // 202 Accepted: the server took a notification, there is nothing to relay.
  if (response.status === 202 || !body.trim()) {
    if (!response.ok) fail(payload, `${ENDPOINT} answered HTTP ${response.status}`);
    return;
  }

  let messages;
  try {
    const type = response.headers.get("content-type") ?? "";
    const parsed = type.includes("text/event-stream")
      ? parseEventStream(body)
      : JSON.parse(body);
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    fail(payload, `${ENDPOINT} answered HTTP ${response.status} with an unreadable body`);
    return;
  }

  // Errors raised before the JSON-RPC layer (rate limit, body too large) come
  // back as plain JSON without an id — turn them into a proper error reply.
  if (!messages.every((message) => message?.jsonrpc === "2.0")) {
    const reason = messages[0]?.error?.message ?? messages[0]?.error ?? "";
    fail(
      payload,
      `${ENDPOINT} answered HTTP ${response.status}${typeof reason === "string" && reason ? `: ${reason}` : ""}`,
    );
    return;
  }

  remember(messages);
  for (const message of messages) send(message);
}

const pending = new Set();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on("line", (line) => {
  if (!line.trim()) return;
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const task = forward(payload).finally(() => pending.delete(task));
  pending.add(task);
});

lines.on("close", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
