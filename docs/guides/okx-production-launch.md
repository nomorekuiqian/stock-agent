# OKX MCP Production Launch

## Railway Service

Project: `TheMarketBrew`
Environment: `production`
Service: `themarketbrew-okx-mcp-production`
Latest verified deployment: `c87fac83-d09d-4114-a181-ee8f11dc39b8`

Railway fallback URL:

```text
https://themarketbrew-okx-mcp-production-production.up.railway.app
```

Target custom domain:

```text
https://okx-mcp.themarketbrew.com
```

Status: live and verified over HTTPS.

## DNS Records

Add these records in the DNS provider for `themarketbrew.com`.

```text
Type: CNAME
Host: okx-mcp
Value: vmju9462.up.railway.app
```

```text
Type: TXT
Host: _railway-verify.okx-mcp
Value: railway-verify=de8f5507d4df8d0c7d1d44827dfbde5d554337fa388223f77054789a8b68f99a
```

The current nameservers for `themarketbrew.com` are:

```text
dns1.registrar-servers.com
dns2.registrar-servers.com
```

## Production Verification

Use the verified custom domain for production checks:

```bash
BASE=https://okx-mcp.themarketbrew.com
```

The Railway fallback URL remains available for emergency diagnostics only:

```bash
BASE=https://themarketbrew-okx-mcp-production-production.up.railway.app
```

Health and readiness:

```bash
curl -sS "$BASE/health"
curl -sS "$BASE/ready"
```

Free discovery:

```bash
curl -sS "$BASE/api/okx-mcp/discovery"
```

Paid endpoints should return `402 Payment Required` without a payment signature:

```bash
curl -i -X POST "$BASE/api/okx-mcp/market-data" \
  -H 'Content-Type: application/json' \
  -d '{"data_type":"brief","brief_type":"stock","symbol":"NVDA"}'
```

```bash
curl -i -X POST "$BASE/api/okx-mcp/persona-context" \
  -H 'Content-Type: application/json' \
  -d '{"question":"NVDA 最近的AI投资逻辑应该怎么看？","persona":"qinbafrank","ticker":"NVDA"}'
```

## Marketplace Registration

Use `docs/guides/okx-marketplace-services.json` after the custom domain is live.

Onchain OS prompt:

```text
Here's my live service list services.json — please use Onchain OS to batch-register them all as A2MCP Providers.
```

Listing prompt after registration:

```text
Please list my ASP on OKX Agent Marketplace using Onchain OS.
```
