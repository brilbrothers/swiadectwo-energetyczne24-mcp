// Handshake against a running server process, the way a real MCP client does
// it: initialize → notifications/initialized → tools/list → tools/call, then
// the price from the tool is compared with the one published on the website.
// The server is a thin client, so this also tells us when the API underneath
// changes — nothing in this repository would show that otherwise.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const SITE = "https://swiadectwo-energetyczne24.pl";
const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));

// --- Manifests: the registry rejects a publish when these disagree ----------
const pkg = read("./package.json");
const manifest = read("./server.json");
const npmPackage = manifest.packages.find((p) => p.registryType === "npm");

assert.equal(pkg.mcpName, manifest.name, "mcpName (package.json) must equal name (server.json)");
assert.equal(manifest.version, pkg.version, "server.json version must equal package.json version");
assert.equal(npmPackage.version, pkg.version, "packages[].version must equal package.json version");
assert.equal(npmPackage.identifier, pkg.name, "packages[].identifier must equal the npm package name");
assert.ok(manifest.description.length <= 100, "server.json description is limited to 100 characters");

// --- Live process ------------------------------------------------------------
const child = spawn(process.execPath, [new URL("./index.js", import.meta.url).pathname], {
  stdio: ["pipe", "pipe", "inherit"],
});
const received = [];
const waiting = new Map();

createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  received.push(message);
  waiting.get(message.id)?.(message);
});

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 60_000);
    waiting.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

try {
  const init = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "se24-mcp-test", version: pkg.version },
  });
  assert.ok(init.result, `initialize failed: ${JSON.stringify(init.error)}`);
  assert.equal(typeof init.result.protocolVersion, "string");
  assert.equal(init.result.serverInfo.name, "swiadectwo-energetyczne24");
  assert.ok(init.result.capabilities.tools, "server must advertise tools");

  // A notification has no id and must not be answered.
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const list = await request(2, "tools/list", {});
  const tools = list.result.tools.map((tool) => tool.name);
  for (const name of [
    "get_certificate_options",
    "create_certificate_order",
    "get_certificate_order_requirements",
    "calculate_certificate_price",
    "get_payment_link",
  ]) {
    assert.ok(tools.includes(name), `tool ${name} is missing`);
  }

  const call = await request(3, "tools/call", {
    name: "get_certificate_options",
    arguments: { property_type: "dom" },
  });
  assert.ok(!call.result.isError, `tool call failed: ${JSON.stringify(call.result)}`);
  const options = JSON.parse(call.result.content[0].text);
  const house = options.property_types.find((type) => type.slug === "dom");

  const published = await (await fetch(`${SITE}/api/pricing`)).json();
  const publishedHouse = published.propertyTypes.find((type) => type.slug === "dom");
  assert.equal(
    house.base_price_gross_pln,
    publishedHouse.basePricePln,
    "price from the tool differs from the price published on the website",
  );
  assert.ok(house.order_url.startsWith(SITE), "order_url must point to the website");

  assert.deepEqual(
    received.map((message) => message.id),
    [1, 2, 3],
    "exactly one answer per request and none to the notification",
  );

  console.log(
    `ok — protocol ${init.result.protocolVersion}, server ${init.result.serverInfo.version}, ` +
      `${tools.length} tools, dom ${house.base_price_gross_pln} PLN`,
  );
} finally {
  child.stdin.end();
}
