# QoreBridge DAM Mini-App Integration — Implementation Plan (Part 1: DAM SDK + Backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed QoreBridge as a DAM mini-app with wallet signing proxied from the DAM's connected wallet to the bridge iframe via postMessage.

**Architecture:** The DAM SDK gains `getWalletProvider()` returning an EIP-1193 provider over postMessage. The DAM Runtime proxies signing requests to its connected wallet. QoreBridge adds a `DamWalletConnector` (Wagmi custom connector) and auto-connects when running inside the DAM.

**Tech Stack:** TypeScript, Vitest, React 18, Wagmi v2, Viem, postMessage API

---

## File Map

### DAM SDK (`/Users/chengfeng.fan/WORK/mini-app/sdk/`)
- Modify: `src/types.ts` — add `EIP1193Provider` interface
- Modify: `src/MiniAppSDK.ts` — add `getWalletProvider()` method
- Modify: `src/MiniAppSDK.test.ts` — add wallet provider tests

### DAM Backend (`/Users/chengfeng.fan/WORK/mini-app/`)
- Modify: `migrations/001_scopes.sql` — add `wallet:sign` scope row
- Modify: `internal/handlers/context.go` — no change needed (scope enforcement is runtime-only)

### DAM Web (`/Users/chengfeng.fan/WORK/mini-app/web/`)
- Modify: `src/components/AppRuntime.tsx` — add `useWalletProxy` hook inline
- Modify: `src/components/AppRuntime.test.tsx` — add wallet proxy tests

### QoreBridge (`/Users/chengfeng.fan/WORK/bridge-v1-app-main/`)
- Create: `src/lib/damConnector.ts` — Wagmi custom connector
- Create: `src/hooks/useDamContext.ts` — DAM context detection
- Modify: `src/app/providers.tsx` — conditionally add DamWalletConnector
- Modify: `src/components/BridgeCard.tsx` — hide connect button in DAM mode

---

## Task 1: Add `wallet:sign` scope to DAM backend

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/mini-app/migrations/001_scopes.sql`

- [ ] **Step 1: Add the scope row**

Open `/Users/chengfeng.fan/WORK/mini-app/migrations/001_scopes.sql` and append:

```sql
INSERT INTO scopes (id, label, description) VALUES
  ('wallet:sign', 'Sign transactions', 'Allow this app to request transaction signing from your connected wallet');
```

The full file should now end with:
```sql
INSERT INTO scopes (id, label, description) VALUES
  ('identity:read',    'Read your identity',           'Access your user ID and display name'),
  ('wallet:read',      'Read your wallet addresses',   'Access your connected wallet addresses'),
  ('portfolio:read',   'Read your portfolio',          'Access your current holdings (coin, amount, value)'),
  ('portfolio:history','Read your transaction history','Access your read-only transaction history');

INSERT INTO scopes (id, label, description) VALUES
  ('wallet:sign', 'Sign transactions', 'Allow this app to request transaction signing from your connected wallet');
```

- [ ] **Step 2: Commit**

```bash
cd /Users/chengfeng.fan/WORK/mini-app
git add migrations/001_scopes.sql
git commit -m "feat: add wallet:sign scope to registry"
```

---

## Task 2: Add `EIP1193Provider` type to DAM SDK

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/mini-app/sdk/src/types.ts`

- [ ] **Step 1: Write the failing test**

In `/Users/chengfeng.fan/WORK/mini-app/sdk/src/MiniAppSDK.test.ts`, add this import at the top and test at the bottom of the describe block:

```typescript
import type { EIP1193Provider } from './types'

// inside describe('MiniAppSDK', () => { ... })

it('getWalletProvider throws when wallet:sign not in granted_scopes', async () => {
  const sdk = new MiniAppSDK()
  const promise = sdk.getContext()
  sendContextMessage(mockPayload) // mockPayload has granted_scopes: ['wallet:read']
  await promise
  expect(() => sdk.getWalletProvider()).toThrow('wallet:sign scope not granted')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/sdk
npm test
```

Expected: FAIL — `getWalletProvider is not a function` or similar.

- [ ] **Step 3: Add `EIP1193Provider` to types.ts**

Append to `/Users/chengfeng.fan/WORK/mini-app/sdk/src/types.ts`:

```typescript
export interface EIP1193RequestArguments {
  method: string
  params?: unknown[]
}

export interface EIP1193Provider {
  request(args: EIP1193RequestArguments): Promise<unknown>
}
```

- [ ] **Step 4: Commit types**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/sdk
git add src/types.ts
git commit -m "feat: add EIP1193Provider type to SDK"
```

---

## Task 3: Implement `getWalletProvider()` in DAM SDK

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/mini-app/sdk/src/MiniAppSDK.ts`
- Modify: `/Users/chengfeng.fan/WORK/mini-app/sdk/src/index.ts`

- [ ] **Step 1: Add more failing tests**

Add these tests to the describe block in `MiniAppSDK.test.ts`:

```typescript
it('getWalletProvider returns an EIP1193Provider when wallet:sign is granted', async () => {
  const sdk = new MiniAppSDK()
  const promise = sdk.getContext()
  sendContextMessage({
    ...mockPayload,
    granted_scopes: ['wallet:read', 'wallet:sign'],
  })
  await promise
  const provider = sdk.getWalletProvider()
  expect(provider).toBeDefined()
  expect(typeof provider.request).toBe('function')
})

it('getWalletProvider.request posts wallet_request and resolves with result', async () => {
  const sdk = new MiniAppSDK()
  const ctxPromise = sdk.getContext()
  sendContextMessage({
    ...mockPayload,
    granted_scopes: ['wallet:read', 'wallet:sign'],
  })
  await ctxPromise

  const provider = sdk.getWalletProvider()
  const reqPromise = provider.request({ method: 'eth_accounts', params: [] })

  // Simulate parent responding
  const calls = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls
  const walletCall = calls.find(c => c[0]?.type === 'wallet_request')
  expect(walletCall).toBeDefined()
  const { requestId } = walletCall[0]

  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'wallet_response', requestId, result: ['0xabc'] },
  }))

  const result = await reqPromise
  expect(result).toEqual(['0xabc'])
})

it('getWalletProvider.request rejects when parent returns error', async () => {
  const sdk = new MiniAppSDK()
  const ctxPromise = sdk.getContext()
  sendContextMessage({
    ...mockPayload,
    granted_scopes: ['wallet:read', 'wallet:sign'],
  })
  await ctxPromise

  const provider = sdk.getWalletProvider()
  const reqPromise = provider.request({ method: 'eth_sendTransaction', params: [] })

  const calls = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls
  const walletCall = calls.find(c => c[0]?.type === 'wallet_request')
  const { requestId } = walletCall[0]

  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'wallet_response', requestId, error: { code: 4001, message: 'User rejected' } },
  }))

  await expect(reqPromise).rejects.toMatchObject({ code: 4001, message: 'User rejected' })
})

it('getWalletProvider.request times out after 60s', async () => {
  const sdk = new MiniAppSDK()
  const ctxPromise = sdk.getContext()
  sendContextMessage({
    ...mockPayload,
    granted_scopes: ['wallet:read', 'wallet:sign'],
  })
  await ctxPromise

  const provider = sdk.getWalletProvider()
  const reqPromise = provider.request({ method: 'eth_accounts', params: [] })
  vi.advanceTimersByTime(60001)
  await expect(reqPromise).rejects.toMatchObject({ code: -32603, message: 'Request timed out' })
})

it('concurrent requests resolve independently', async () => {
  const sdk = new MiniAppSDK()
  const ctxPromise = sdk.getContext()
  sendContextMessage({
    ...mockPayload,
    granted_scopes: ['wallet:read', 'wallet:sign'],
  })
  await ctxPromise

  const provider = sdk.getWalletProvider()
  const p1 = provider.request({ method: 'eth_accounts', params: [] })
  const p2 = provider.request({ method: 'eth_chainId', params: [] })

  const calls = (window.parent.postMessage as ReturnType<typeof vi.fn>).mock.calls
  const walletCalls = calls.filter(c => c[0]?.type === 'wallet_request')
  expect(walletCalls).toHaveLength(2)

  const [id1, id2] = walletCalls.map(c => c[0].requestId)
  expect(id1).not.toBe(id2)

  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'wallet_response', requestId: id2, result: '0x1' },
  }))
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'wallet_response', requestId: id1, result: ['0xabc'] },
  }))

  expect(await p1).toEqual(['0xabc'])
  expect(await p2).toBe('0x1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/sdk
npm test
```

Expected: multiple FAILs — `getWalletProvider is not a function`.

- [ ] **Step 3: Implement `getWalletProvider()` in MiniAppSDK.ts**

Replace the full content of `/Users/chengfeng.fan/WORK/mini-app/sdk/src/MiniAppSDK.ts` with:

```typescript
import type { Context, EIP1193Provider, EIP1193RequestArguments } from './types'

export interface MiniAppSDKOptions {
  timeout?: number
}

export class MiniAppSDK {
  private readonly timeout: number
  private cachedContext: Context | null = null
  private pendingPromise: Promise<Context> | null = null

  constructor(options: MiniAppSDKOptions = {}) {
    this.timeout = options.timeout ?? 5000
  }

  getContext(): Promise<Context> {
    if (this.cachedContext !== null) {
      return Promise.resolve(this.cachedContext)
    }
    if (this.pendingPromise !== null) {
      return this.pendingPromise
    }

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
      if (pendingRequests.size === 0) {
        window.removeEventListener('message', responseHandler)
      }
      if (error) {
        pending.reject(error)
      } else {
        pending.resolve(result)
      }
    }

    return {
      request({ method, params = [] }: EIP1193RequestArguments): Promise<unknown> {
        return new Promise((resolve, reject) => {
          const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

          if (pendingRequests.size === 0) {
            window.addEventListener('message', responseHandler)
          }

          const timer = setTimeout(() => {
            pendingRequests.delete(requestId)
            if (pendingRequests.size === 0) {
              window.removeEventListener('message', responseHandler)
            }
            reject({ code: -32603, message: 'Request timed out' })
          }, 60000)

          pendingRequests.set(requestId, { resolve, reject, timer })
          parent.postMessage({ type: 'wallet_request', requestId, method, params }, '*')
        })
      },
    }
  }
}
```

- [ ] **Step 4: Export `EIP1193Provider` from index.ts**

Read `/Users/chengfeng.fan/WORK/mini-app/sdk/src/index.ts` and add the export:

```typescript
export { MiniAppSDK } from './MiniAppSDK'
export type { Context, EIP1193Provider, EIP1193RequestArguments } from './types'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/sdk
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/sdk
git add src/MiniAppSDK.ts src/MiniAppSDK.test.ts src/index.ts
git commit -m "feat: add getWalletProvider() to MiniAppSDK with EIP-1193 postMessage proxy"
```
