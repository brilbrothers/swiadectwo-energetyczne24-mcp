# swiadectwo-energetyczne24-mcp

[![npm](https://img.shields.io/npm/v/swiadectwo-energetyczne24-mcp)](https://www.npmjs.com/package/swiadectwo-energetyczne24-mcp)
[![license](https://img.shields.io/npm/l/swiadectwo-energetyczne24-mcp)](LICENSE)
[![test](https://github.com/brilbrothers/swiadectwo-energetyczne24-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/brilbrothers/swiadectwo-energetyczne24-mcp/actions/workflows/test.yml)

MCP server for ordering **energy performance certificates in Poland**
(*świadectwo charakterystyki energetycznej*) from
[swiadectwo-energetyczne24.pl](https://swiadectwo-energetyczne24.pl).

An AI assistant can answer questions about the offer and prices, collect the
property data one question at a time, attach documents and hand the user a
payment link. Legal consents and payment are always completed by a person on
the website — the server never takes card data or consents.

## Install

Claude Code:

```bash
claude mcp add swiadectwo-energetyczne24 -- npx -y swiadectwo-energetyczne24-mcp
```

Claude Desktop, Cursor and other clients (`mcpServers` in the config file):

```json
{
  "mcpServers": {
    "swiadectwo-energetyczne24": {
      "command": "npx",
      "args": ["-y", "swiadectwo-energetyczne24-mcp"]
    }
  }
}
```

Clients that speak Streamable HTTP can skip the package and connect straight to
the remote server — no token needed:

```json
{
  "mcpServers": {
    "swiadectwo-energetyczne24": {
      "type": "http",
      "url": "https://swiadectwo-energetyczne24.pl/api/mcp"
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `get_certificate_options` | Property types with base prices, paid add-ons, document types, allowed values |
| `get_certificate_information` | Offer, process, lead time, documents, legal basis, FAQ, contact |
| `create_certificate_order` | Creates an order and returns its `order_id` and one-time `access_token` |
| `get_certificate_order_requirements` | What is still missing, with a ready question and allowed values per field |
| `update_certificate_order` | Fills in fields of an order |
| `get_certificate_order` | Current data of an order |
| `get_certificate_order_status` | Order, payment and certificate status |
| `calculate_certificate_price` | Price of a specific order (net, VAT, gross, line items) |
| `get_payment_link` | Link to the page where the user gives consents and pays |
| `create_document_upload_url` | Pre-signed upload URL for a photo or document |
| `add_property_document` | Attaches an uploaded file to the order |

The list above is informational: this package is a thin stdio client that
forwards every message to `https://swiadectwo-energetyczne24.pl/api/mcp`, so
tools, schemas, prices and questions always come from the live service.
Form values and messages for the end user are in Polish.

## How it works

- JSON-RPC 2.0 over stdio, one message per line, forwarded over Streamable HTTP.
- No dependencies; Node.js 20 or newer.
- Public endpoint, rate limit 60 requests per 10 minutes per IP address.
- Each order is protected by its own `access_token`, returned once by
  `create_certificate_order`; `order_id` alone opens nothing.

Environment variables (optional):

| Variable | Meaning |
| --- | --- |
| `SE24_MCP_URL` | Endpoint to forward to (default `https://swiadectwo-energetyczne24.pl/api/mcp`) |
| `SE24_MCP_TOKEN` | Bearer token, only if the endpoint requires one (the public one does not) |

## Development

```bash
npm test
```

`test.js` starts the server, performs a real handshake (`initialize`,
`notifications/initialized`, `tools/list`, `tools/call`) and compares the price
returned by the tool with the one published at
[`/api/pricing`](https://swiadectwo-energetyczne24.pl/api/pricing). It also
checks that the versions in `package.json` and `server.json` agree. GitHub
Actions repeats it every week.

Releasing a new version — in this order:

1. Bump `version` in `package.json` and in `server.json` (`version` and `packages[].version`).
2. `npm test`
3. `npm publish` (the package must exist on npm before the registry sees it).
4. Push to `main` — a change in `server.json` starts the workflow that publishes to the
   [MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=swiadectwo).

## Po polsku

Serwer MCP serwisu [swiadectwo-energetyczne24.pl](https://swiadectwo-energetyczne24.pl):
asystent AI (Claude, ChatGPT, Cursor i inne klienty MCP) odpowiada na pytania o
ofertę i ceny, zbiera dane nieruchomości, dołącza dokumenty i podaje link do
płatności za świadectwo charakterystyki energetycznej. Zgody i płatność zawsze
potwierdza człowiek na stronie.

Instalacja w Claude Code:

```bash
claude mcp add swiadectwo-energetyczne24 -- npx -y swiadectwo-energetyczne24-mcp
```

Opis narzędzi i API po polsku: [swiadectwo-energetyczne24.pl/api](https://swiadectwo-energetyczne24.pl/api#mcp).

## License

Code: [MIT](LICENSE). Content returned by the service: see [NOTICE](NOTICE).
