# QoreBridge DAM Mini-App Integration — Implementation Plan (Part 3: QoreBridge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Parts 1 and 2 must be complete.

---

## Task 5: Add `useDamContext` hook to QoreBridge

**Files:**
- Create: `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/hooks/useDamContext.ts`

The bridge needs to detect whether it's running inside the DAM iframe. It does this by attempting `sdk.getContext()` with a short timeout. If it succeeds and `wallet:sign` is in `granted_scopes`, we're in DAM mode.

The SDK is not published to npm yet — we'll import it directly from the local path using a relative import or a path alias. Since the bridge is a separate repo, copy the SDK source into the bridge as a local lib file.

- [ ] **Step 1: Copy SDK types into bridge**

Create `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/lib/miniAppSdk.ts` with the full SDK implementation (self-contained, no external deps):

```typescript
// Minimal inline copy of @qore3/mini-app-sdk for use inside the bridge iframe.
// Keep in sync with /Users/chengfeng.fan/WORK/mini-app/sdk/src/

export interface EIP1193RequestArguments {
  method: string
  params?: unknown[]
}

export interface EIP1193Provider {
  request(args: EIP1193RequestArguments): Promise<unknown>
}

interface Context {
  installation_id: string
  app_id: string
  granted_scopes: string[]
  wallet?: { addresses: string[] }
  identity?: { userId: string; displayName: string }
}

class MiniAppSDK {
  private readonly timeout: number
  private cachedContext: Context | null = null
  private pendingPromise: Promise<Context> | null = null

  constructor(options: { timeout?: number } = {}) {
    this.timeout = options.timeout ?? 5000
  }

  getContext(): Promise<Context> {
    if (this.cachedContext !== null) return Promise.resolve(this.cachedContext)
    if (this.pendingPromise !== null) return this.pendingPromise

    this.pendingPromise = new Promise<Context>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>

      const handler = (event: MessageEvent) => {
        if (event.data?.type !== 'context') return
        clearTimeout(timer)
        window.removeEventListener('message', handler)
        const payload = event.data.data
        this.cachedContext = {
          installation_id: payload.installation_id,
          app_id: payload.app_id,
          granted_scopes: payload.granted_scopes,
          ...payload.data,
        } as Context
        this.pendingPromise = null
        resolve(this.cachedContext)
      }

      window.addEventListener('message', handler)
      timer = setTimeout(() => {
        window.removeEventListener('message', handler)
        this.pendingPromise = null
        reject(new Error('context timeout'))
      }, this.timeout)

      parent.postMessage({ type: 'ready' }, '*')
    })

    return this.pendingPromise
  }

  getWalletProvider(): EIP1193Provider {
    if (!this.cachedContext) {
      throw new Error('getContext() must be awaited before calling getWalletProvider()')
    }
    if (!this.cachedContext.granted_scopes.includes('wallet:sign')) {
      throw new Error('wallet:sign scope not granted')
    }

    const pendingRequests = new Map<string, {
      resolve: (value: unknown) => void
      reject: (reason: unknown) => void
      timer: ReturnType<typeof setTimeout>
    }>()

    const responseHandler = (event: MessageEvent) => {
      if (event.data?.type !== 'wallet_response') return
      const { requestId, result, error } = event.data
      const pending = pendingRequests.get(requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingRequests.delete(requestId)
      if (pendingRequests.size === 0) window.removeEventListener('message', responseHandler)
      if (error) pending.reject(error)
      else pending.resolve(result)
    }

    return {
      request({ method, params = [] }: EIP1193RequestArguments): Promise<unknown> {
        return new Promise((resolve, reject) => {
          const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
          if (pendingRequests.size === 0) window.addEventListener('message', responseHandler)
          const timer = setTimeout(() => {
            pendingRequests.delete(requestId)
            if (pendingRequests.size === 0) window.removeEventListener('message', responseHandler)
            reject({ code: -32603, message: 'Request timed out' })
          }, 60000)
          pendingRequests.set(requestId, { resolve, reject, timer })
          parent.postMessage({ type: 'wallet_request', requestId, method, params }, '*')
        })
      },
    }
  }
}

// Singleton — one SDK instance per page
export const miniAppSdk = new MiniAppSDK({ timeout: 3000 })
```

- [ ] **Step 2: Create `useDamContext` hook**

Create `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/hooks/useDamContext.ts`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { miniAppSdk } from "@/lib/miniAppSdk";
import type { EIP1193Provider } from "@/lib/miniAppSdk";

export interface DamContext {
  isDam: false
} | {
  isDam: true
  walletAddress: string
  provider: EIP1193Provider
}

let cached: DamContext | null = null

export function useDamContext(): DamContext {
  const [ctx, setCtx] = useState<DamContext>(cached ?? { isDam: false })

  useEffect(() => {
    if (cached !== null) {
      setCtx(cached)
      return
    }

    miniAppSdk.getContext().then((context) => {
      if (!context.granted_scopes.includes('wallet:sign')) {
        cached = { isDam: false }
        setCtx(cached)
        return
      }
      const addresses = context.wallet?.addresses ?? []
      const walletAddress = addresses[0] ?? ''
      const provider = miniAppSdk.getWalletProvider()
      cached = { isDam: true, walletAddress, provider }
      setCtx(cached)
    }).catch(() => {
      cached = { isDam: false }
      setCtx(cached)
    })
  }, [])

  return ctx
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
git add src/lib/miniAppSdk.ts src/hooks/useDamContext.ts
git commit -m "feat: add miniAppSdk inline copy and useDamContext hook"
```

---

## Task 6: Add `DamWalletConnector` for Wagmi

**Files:**
- Create: `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/lib/damConnector.ts`

Wagmi v2 custom connectors implement the `createConnector` factory. The connector uses the DAM EIP-1193 provider as its underlying transport.

- [ ] **Step 1: Create the connector**

Create `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/lib/damConnector.ts`:

```typescript
import { createConnector } from "wagmi";
import type { EIP1193Provider } from "./miniAppSdk";

interface DamConnectorConfig {
  provider: EIP1193Provider
  address: `0x${string}`
}

export function damWalletConnector(config: DamConnectorConfig) {
  return createConnector(() => ({
    id: "dam-wallet",
    name: "DAM Wallet",
    type: "dam-wallet",

    async connect() {
      const chainId = await this.getChainId()
      return { accounts: [config.address], chainId }
    },

    async disconnect() {},

    async getAccounts() {
      return [config.address]
    },

    async getChainId() {
      const result = await config.provider.request({ method: "eth_chainId", params: [] })
      return parseInt(result as string, 16)
    },

    async getProvider() {
      return config.provider
    },

    async isAuthorized() {
      return true
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }))
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
git add src/lib/damConnector.ts
git commit -m "feat: add DamWalletConnector for Wagmi"
```

---

## Task 7: Wire DAM connector into Wagmi providers

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/app/providers.tsx`

The current `wagmiConfig` uses `getDefaultConfig` from RainbowKit which doesn't support injecting custom connectors at runtime. We need to detect DAM mode before rendering and pass the connector in.

- [ ] **Step 1: Update providers.tsx**

Replace the full content of `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/app/providers.tsx` with:

```typescript
"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/config/wagmi";
import { TronLinkProvider } from "@/contexts/TronLinkContext";
import { SolanaWalletProvider } from "@/contexts/SolanaWalletContext";
import { useDamContext } from "@/hooks/useDamContext";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

function InnerProviders({ children }: { children: React.ReactNode }) {
  const damCtx = useDamContext();

  // When in DAM mode, auto-connect via the DAM wallet connector.
  // We still render RainbowKitProvider (needed for chain switching UI),
  // but BridgeCard will hide the connect button.
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TronLinkProvider>
          <SolanaWalletProvider>
            <RainbowKitProvider
              theme={darkTheme({
                accentColor: "#FF8800",
                accentColorForeground: "white",
                borderRadius: "medium",
                fontStack: "system",
              })}
            >
              {damCtx.isDam && <DamAutoConnect provider={damCtx.provider} address={damCtx.walletAddress} />}
              {children}
            </RainbowKitProvider>
          </SolanaWalletProvider>
        </TronLinkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

import { useEffect } from "react";
import { useConnect } from "wagmi";
import { damWalletConnector } from "@/lib/damConnector";
import type { EIP1193Provider } from "@/lib/miniAppSdk";

function DamAutoConnect({ provider, address }: { provider: EIP1193Provider; address: string }) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    const connector = damWalletConnector({
      provider,
      address: address as `0x${string}`,
    });
    connect({ connector });
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <InnerProviders>{children}</InnerProviders>;
}
```

- [ ] **Step 2: Run the dev server manually to verify no build errors**

```bash
# Run this yourself in a terminal:
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
git add src/app/providers.tsx
git commit -m "feat: auto-connect DAM wallet connector when running in DAM iframe"
```

---

## Task 8: Hide connect button in BridgeCard when in DAM mode

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/components/BridgeCard.tsx`

The EVM connect button is rendered at line 394–410 of `BridgeCard.tsx`. When `isDam` is true and the wallet is already connected via `DamAutoConnect`, we skip that branch entirely.

- [ ] **Step 1: Add `useDamContext` import and hide connect button**

In `/Users/chengfeng.fan/WORK/bridge-v1-app-main/src/components/BridgeCard.tsx`:

After the existing imports, add:
```typescript
import { useDamContext } from "@/hooks/useDamContext";
```

Inside the `BridgeCard` function, after the existing hook calls (after line ~40), add:
```typescript
const damCtx = useDamContext();
```

Find this block (around line 394):
```typescript
        ) : fromChain !== TRON_CHAIN_ID && fromChain !== SOLANA_CHAIN_ID && !isConnected ? (
          <div className="w-full">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className={cn(
                    "w-full py-4 rounded-xl font-semibold text-sm",
                    "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                    "text-white transition-all active:scale-[0.98]"
                  )}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
```

Replace it with:
```typescript
        ) : fromChain !== TRON_CHAIN_ID && fromChain !== SOLANA_CHAIN_ID && !isConnected && !damCtx.isDam ? (
          <div className="w-full">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className={cn(
                    "w-full py-4 rounded-xl font-semibold text-sm",
                    "bg-[var(--primary)] hover:bg-[var(--primary-hover)]",
                    "text-white transition-all active:scale-[0.98]"
                  )}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>
```

The only change is adding `&& !damCtx.isDam` to the condition. When in DAM mode, `DamAutoConnect` has already connected the wallet, so `isConnected` will be true and this branch won't be reached anyway — but the guard makes the intent explicit.

- [ ] **Step 2: Run build to verify no TypeScript errors**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
git add src/components/BridgeCard.tsx
git commit -m "feat: hide EVM connect button in DAM mode"
```

---

## Task 9: Add bridge manifest file

**Files:**
- Create: `/Users/chengfeng.fan/WORK/bridge-v1-app-main/public/manifest.json`

- [ ] **Step 1: Create the manifest**

Create `/Users/chengfeng.fan/WORK/bridge-v1-app-main/public/manifest.json`:

```json
{
  "name": "QoreBridge",
  "description": "Cross-chain USDC/USDT bridge — route through CCTP, USDT0, NEAR Intents, and Across",
  "icon_url": "https://bridge.qore3.com/icon.svg",
  "iframe_url": "https://bridge.qore3.com",
  "required_scopes": ["wallet:read", "wallet:sign"],
  "optional_scopes": ["identity:read"],
  "categories": ["defi", "bridge"]
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chengfeng.fan/WORK/bridge-v1-app-main
git add public/manifest.json
git commit -m "feat: add DAM mini-app manifest"
```

---

## Manual E2E Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] Start the DAM backend: `cd /Users/chengfeng.fan/WORK/mini-app && go run main.go`
- [ ] Start the DAM frontend: `cd /Users/chengfeng.fan/WORK/mini-app/web && npm run dev`
- [ ] Start the bridge: `cd /Users/chengfeng.fan/WORK/bridge-v1-app-main && npm run dev`
- [ ] Submit bridge manifest URL in DAM app catalog: `http://localhost:3001/manifest.json`
- [ ] Install bridge in DAM — verify `wallet:sign` consent text shown
- [ ] Open bridge in DAM — verify no "Connect Wallet" button, wallet address shown
- [ ] Enter amount, select route, click Bridge — verify MetaMask signing UI appears
- [ ] Approve → verify tx hash returned, bridge shows pending status
- [ ] Reject → verify bridge shows "Transaction rejected" gracefully
- [ ] Open bridge at `http://localhost:3001` directly — verify RainbowKit connect button works normally
