# OKX Context MCP Deployment & Verification Guide

This guide describes how to deploy TheMarketBrew's OKX-facing context service
and verify that OKX can consume it as a paid context/data provider.

## Service Shape

Deploy the isolated app, not the production web API entry point:

```bash
cd backend
uvicorn app.okx_main:app --host 0.0.0.0 --port 8000
```

Routes:

```text
GET  /api/okx-mcp/discovery
POST /api/okx-mcp/persona-context
POST /api/okx-mcp/market-data
```

`discovery` is public. `persona-context` and `market-data` are the paid context
resources.

## Environment

Minimum data env:

```text
FMP_API_KEY=...
FRED_API_KEY=...
INSFORGE_BASE_URL=...
INSFORGE_SERVICE_KEY=...
OPENROUTER_API_KEY=...   # only needed if vector embedding search is used
```

OKX SDK payment env:

```text
OKX_MCP_PAYMENT_ENABLED=true
OKX_MCP_PAYMENT_MODE=sdk
OKX_MCP_NETWORK=eip155:196
OKX_MCP_PAY_TO_ADDRESS=0x...
OKX_MCP_PERSONA_CONTEXT_PRICE=$0.05
OKX_MCP_MARKET_DATA_PRICE=$0.03
OKX_MCP_MAX_TIMEOUT_SECONDS=300

OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
OKX_BASE_URL=https://web3.okx.com
```

For an OKX-managed reverse proxy instead of in-app SDK middleware:

```text
OKX_MCP_PAYMENT_ENABLED=false
OKX_MCP_PAYMENT_MODE=proxy
```

Then configure OKX to protect only the two POST resources above.

## Local Verification Without Payment

Run with payment disabled:

```bash
cd backend
OKX_MCP_PAYMENT_ENABLED=false uvicorn app.okx_main:app --reload
```

Health:

```bash
curl -sS http://127.0.0.1:8000/health
curl -sS http://127.0.0.1:8000/ready
```

Discovery:

```bash
curl -sS http://127.0.0.1:8000/api/okx-mcp/discovery | jq '.data.tools | keys'
```

Expected tools:

```text
themarketbrew_discovery
themarketbrew_persona_context
themarketbrew_market_data
```

Persona context without vector/external evidence:

```bash
curl -sS -X POST http://127.0.0.1:8000/api/okx-mcp/persona-context \
  -H 'Content-Type: application/json' \
  -d '{
    "question":"NVDA AI capex 框架怎么看？",
    "persona":"qinbafrank",
    "ticker":"NVDA",
    "include_evidence_map":false,
    "include_vector_evidence":false,
    "include_lens_body":false
  }' | jq '.data.selected_persona.username, .data.selected_lenses[0]'
```

Market data catalog:

```bash
curl -sS -X POST http://127.0.0.1:8000/api/okx-mcp/market-data \
  -H 'Content-Type: application/json' \
  -d '{"data_type":"catalog"}' | jq '.data.auth, .data.data.tools | keys'
```

## OKX SDK Payment Verification

Install dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Start with OKX SDK enabled:

```bash
OKX_MCP_PAYMENT_ENABLED=true \
OKX_MCP_PAYMENT_MODE=sdk \
OKX_MCP_PAY_TO_ADDRESS=0xYourPayeeAddress \
OKX_API_KEY=... \
OKX_SECRET_KEY=... \
OKX_PASSPHRASE=... \
uvicorn app.okx_main:app --reload
```

Unpaid paid-resource request should return HTTP 402 before business logic:

```bash
curl -sS -i -X POST http://127.0.0.1:8000/api/okx-mcp/persona-context \
  -H 'Content-Type: application/json' \
  -d '{"question":"NVDA 怎么看？","ticker":"NVDA"}' | sed -n '1,20p'
```

Expected:

```text
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: ...
```

Discovery should still return 200:

```bash
curl -sS -i http://127.0.0.1:8000/api/okx-mcp/discovery | sed -n '1,8p'
```

Expected:

```text
HTTP/1.1 200 OK
```

In OKX Agentic Wallet flow, the buyer's agent receives the 402 challenge, pays
on X Layer, retries with the payment signature, OKX verifies/settles, and only
then the backend returns the context/data payload.

## MCP Package Verification

```bash
cd mcp/themarketbrew
npm install
npm run build
npm run inspect
npm run smoke
npm run smoke:adapter
THEMARKETBREW_BACKEND_URL=http://127.0.0.1:8000/api npm run smoke:live
```

Expected:

- `smoke` lists exactly three tools.
- `smoke:adapter` hits mock `/api/okx-mcp/*` endpoints.
- `smoke:live` returns either real context/data or structured
  `payment_required` for paid endpoints.

## OKX Marketplace Registration Draft

Service type:

```text
A2MCP
```

Endpoint:

```text
https://<okx-service-domain>/api/okx-mcp
```

Suggested service prompt:

```text
You are connected to TheMarketBrew OKX Context MCP.

Use themarketbrew_discovery first to inspect available personas, data sections,
and limits. Use themarketbrew_persona_context for persona methodology, selected
lenses, and historical evidence. Use themarketbrew_market_data for current
stock, macro, calendar, report, and news facts.

The service returns context and data only. You must write the final answer with
your own model. Do not impersonate a persona. Separate methodology context,
direct historical evidence, current market facts, and inference. Do not provide
direct buy/sell/add/reduce instructions or exact price targets.
```

Paid resources:

```text
POST /api/okx-mcp/persona-context  $0.05 exact one-time
POST /api/okx-mcp/market-data      $0.03 exact one-time
```

Discovery:

```text
GET /api/okx-mcp/discovery free
```

## Production Checklist

- [ ] Deploy `uvicorn app.okx_main:app`, not `app.main`.
- [ ] Confirm `/api/okx-mcp/discovery` returns 200 publicly.
- [ ] Confirm unpaid POST paid endpoints return 402 when payment is enabled.
- [ ] Confirm paid OKX Agentic Wallet call retries and returns JSON context.
- [ ] Confirm response `data.auth.account_required=false`.
- [ ] Confirm no TheMarketBrew login/device endpoints are exposed in MCP tools.
- [ ] Confirm logs show no website chat agent calls for OKX requests.
- [ ] Confirm settlement address is a 0x EVM address on X Layer.
- [ ] Confirm prices and marketplace listing copy with OKX.

## Regression Checks

Production web API should be unchanged:

```bash
cd backend
python -m pytest tests/test_okx_mcp.py tests/test_architecture.py -q
```

If you also run `app.main`, `/api/okx-mcp/*` should not exist there unless a
future change explicitly registers the OKX router in the production app.

