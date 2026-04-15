---
title: QoreBridge DAM Mini-App Integration
date: 2026-04-15
status: draft
---

# QoreBridge DAM Mini-App Integration

## Overview

Embed QoreBridge as a mini-app inside the Qore3 DAM marketplace. The bridge runs in an iframe and uses the DAM's connected wallet for transaction signing — no separate wallet connection required inside the iframe.

## Architecture

Three components are modified:

1. **DAM SDK** (`@qore3/mini-app-sdk`) — adds `getWalletProvider()` returning an EIP-1193 provider over postMessage
2. **DAM Runtime** (`AppRuntime.tsx`) — proxies EIP-1193 requests from the iframe to the DAM's connected wallet
3. **QoreBridge** — adds a `DamWalletConnector` (Wagmi custom connector) and detects DAM context to hide RainbowKit UI

The bridge remains fully functional as a standalone app when loaded outside the DAM.

## Data Flow

```
iframe loads
  → SDK sends `ready`
  → DAM sends context (with wallet:sign scope)
  → DamWalletConnector calls sdk.getWalletProvider()
  → Wagmi auto-connects → bridge shows address, hides connect button

User clicks Bridge
  → Wagmi calls eth_sendTransaction on SDK provider
  → SDK posts { type: 'wallet_request', requestId, method, params } to parent
  → DAM Runtime validates wallet:sign scope + method whitelist
  → Forwards to DAM wallet (MetaMask etc.)
  → User approves in MetaMask
  → DAM Runtime posts { type: 'wallet_response', requestId, result: txHash }
  → SDK resolves promise → Wagmi gets txHash → bridge shows status
```

## Components

### 1. DAM SDK — `@qore3/mini-app-sdk`

New method on `MiniAppSDK`:

```typescript
getWalletProvider(): EIP1193Provider
```

- Returns an EIP-1193 compliant provider
- Throws `Error('wallet:sign scope not granted')` if scope is missing
- Implements `request({ method, params })` by posting `wallet_request` to parent and awaiting `wallet_response`
- Each request gets a unique `requestId` (UUID) for correlation
- Times out after 60 seconds with `{ code: -32603, message: 'Request timed out' }`

New postMessage types:

```typescript
// iframe → parent
{ type: 'wallet_request', requestId: string, method: string, params: unknown[] }

// parent → iframe
{ type: 'wallet_response', requestId: string, result?: unknown, error?: { code: number, message: string } }
```

### 2. DAM Runtime — `AppRuntime.tsx`

New `useWalletProxy` hook:

- Listens for `wallet_request` messages from the iframe
- Validates origin matches registered `iframe_url`
- Checks `wallet:sign` is in `installation.granted_scopes` — rejects with `{ code: 4100 }` if not
- Whitelisted methods: `eth_accounts`, `eth_chainId`, `eth_sendTransaction`, `wallet_switchEthereumChain`, `personal_sign`
- Rejects disallowed methods with `{ code: 4200, message: 'Method not supported' }`
- Forwards allowed requests to DAM's wagmi wallet client
- Posts `wallet_response` back with result or error

### 3. QoreBridge — new files

**`src/lib/damConnector.ts`** — Wagmi custom connector:
- Calls `sdk.getWalletProvider()` for the underlying provider
- Implements `connect()`, `disconnect()`, `getAccount()`, `getChainId()`, `getProvider()`
- Auto-connects on mount when in DAM mode

**`src/hooks/useDamContext.ts`**:
- Calls `sdk.getContext()` with a 3s timeout
- Returns `{ isDam: true, context }` or `{ isDam: false }`
- Memoized — only runs once per session

**Modified files:**

- `src/app/providers.tsx` — conditionally adds `DamWalletConnector` to Wagmi connectors list
- `src/components/BridgeCard.tsx` — hides RainbowKit `<ConnectButton>` when `isDam === true` and wallet is connected

### 4. DAM Backend — new scope

Migration `004_wallet_sign_scope.sql`:

```sql
INSERT INTO scopes (name, description, category)
VALUES ('wallet:sign', 'Allow this app to request transaction signing', 'wallet');
```

`InstallModal` shows consent text: _"Allow QoreBridge to request transaction signing from your connected wallet."_

### 5. Bridge manifest

```json
{
  "name": "QoreBridge",
  "description": "Cross-chain USDC/USDT bridge",
  "icon_url": "https://bridge.qore3.com/icon.svg",
  "iframe_url": "https://bridge.qore3.com",
  "required_scopes": ["wallet:read", "wallet:sign"],
  "optional_scopes": ["identity:read"]
}
```

## Error Handling

| Scenario | Behavior |
|---|---|
| `wallet:sign` not granted | Bridge falls back to RainbowKit connect flow |
| User rejects signing | SDK rejects with `{ code: 4001 }` → bridge shows "Transaction rejected" |
| Chain mismatch | Bridge calls `wallet_switchEthereumChain` via proxy → MetaMask prompts user |
| User rejects chain switch | Bridge shows "Please switch to [chain] to continue" |
| Request timeout (60s) | SDK rejects with `{ code: -32603, message: 'Request timed out' }` |
| Disallowed method | Runtime rejects with `{ code: 4200, message: 'Method not supported' }` |
| Running standalone | `useDamContext` returns `isDam: false` → full RainbowKit UI, no behavior change |

## Testing

### DAM SDK unit tests
- `getWalletProvider()` throws when `wallet:sign` not in scopes
- `request()` posts correct message shape with `requestId`
- Concurrent requests resolve independently
- 60s timeout rejects with correct error code

### DAM Runtime unit tests
- Blocks requests when `wallet:sign` not in installation scopes
- Blocks disallowed methods
- Forwards allowed methods and returns result
- Returns user-rejection error correctly

### QoreBridge unit tests
- `useDamContext` returns `isDam: false` when context times out
- `DamWalletConnector` connects using SDK provider, exposes correct address + chainId
- Bridge renders RainbowKit connect button when `isDam: false`
- Bridge hides connect button when `isDam: true` and wallet connected

### Manual E2E checklist
- [ ] Install bridge in DAM with `wallet:sign` scope — consent text shown
- [ ] Open bridge in DAM — no "Connect Wallet" button, address shown
- [ ] Select route, click Bridge — MetaMask signing UI appears in parent window
- [ ] Approve → tx hash returned, bridge shows pending status
- [ ] Reject → bridge shows "Transaction rejected" gracefully
- [ ] Open bridge at standalone URL — RainbowKit works normally

## Scope

This spec covers EVM chains only. Tron and Solana signing via DAM proxy is out of scope for this iteration.
