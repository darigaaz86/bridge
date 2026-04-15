# QoreBridge DAM Mini-App Integration — Implementation Plan (Part 2: DAM Runtime)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Part 1 must be complete (wallet:sign scope added, SDK getWalletProvider() implemented).

---

## Task 4: Add wallet proxy to DAM AppRuntime

**Files:**
- Modify: `/Users/chengfeng.fan/WORK/mini-app/web/src/components/AppRuntime.tsx`
- Modify: `/Users/chengfeng.fan/WORK/mini-app/web/src/components/AppRuntime.test.tsx`

The DAM web app does NOT use wagmi — it's a plain React app. The DAM's "connected wallet" in this context is a mock/demo. For the proxy to work, `AppRuntime` needs to forward `wallet_request` messages to whatever wallet the DAM has connected. We'll add a `walletClient` prop (an object with a `request` method matching EIP-1193) so the component stays testable and decoupled from any specific wallet library.

- [ ] **Step 1: Read the existing AppRuntime test to understand the test pattern**

Read `/Users/chengfeng.fan/WORK/mini-app/web/src/components/AppRuntime.test.tsx` before writing new tests.

- [ ] **Step 2: Write failing tests for wallet proxy**

Add these tests to `/Users/chengfeng.fan/WORK/mini-app/web/src/components/AppRuntime.test.tsx`:

```typescript
// Add to existing imports at top of file:
// import { vi } from 'vitest'  (already imported if using vitest)

describe('AppRuntime wallet proxy', () => {
  const mockInstallation = {
    id: 'inst-1',
    user_id: 'user-1',
    app_id: 'app-1',
    app: {
      id: 'app-1',
      name: 'Test App',
      iframe_url: 'http://localhost:4001',
      icon_url: '',
      description: '',
      manifest_url: '',
      categories: [],
      required_scopes: ['wallet:read', 'wallet:sign'],
      optional_scopes: [],
      status: 'approved' as const,
      submitted_at: '',
    },
    granted_scopes: ['wallet:read', 'wallet:sign'],
    installed_at: '',
  }

  it('forwards wallet_request to walletClient and posts wallet_response', async () => {
    const mockWalletClient = {
      request: vi.fn().mockResolvedValue(['0xabc123']),
    }

    render(<AppRuntime installation={mockInstallation} walletClient={mockWalletClient} />)

    // Simulate iframe sending a wallet_request
    const requestId = 'req-1'
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:4001',
      data: { type: 'wallet_request', requestId, method: 'eth_accounts', params: [] },
    }))

    await waitFor(() => {
      expect(mockWalletClient.request).toHaveBeenCalledWith({
        method: 'eth_accounts',
        params: [],
      })
    })
  })

  it('blocks wallet_request when wallet:sign not in granted_scopes', async () => {
    const mockWalletClient = { request: vi.fn() }
    const installationNoSign = {
      ...mockInstallation,
      granted_scopes: ['wallet:read'],
    }

    render(<AppRuntime installation={installationNoSign} walletClient={mockWalletClient} />)

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:4001',
      data: { type: 'wallet_request', requestId: 'req-1', method: 'eth_accounts', params: [] },
    }))

    await new Promise(r => setTimeout(r, 50))
    expect(mockWalletClient.request).not.toHaveBeenCalled()
  })

  it('blocks disallowed methods', async () => {
    const mockWalletClient = { request: vi.fn() }

    render(<AppRuntime installation={mockInstallation} walletClient={mockWalletClient} />)

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://localhost:4001',
      data: { type: 'wallet_request', requestId: 'req-1', method: 'eth_sign', params: [] },
    }))

    await new Promise(r => setTimeout(r, 50))
    expect(mockWalletClient.request).not.toHaveBeenCalled()
  })

  it('ignores wallet_request from wrong origin', async () => {
    const mockWalletClient = { request: vi.fn() }

    render(<AppRuntime installation={mockInstallation} walletClient={mockWalletClient} />)

    window.dispatchEvent(new MessageEvent('message', {
      origin: 'http://evil.com',
      data: { type: 'wallet_request', requestId: 'req-1', method: 'eth_accounts', params: [] },
    }))

    await new Promise(r => setTimeout(r, 50))
    expect(mockWalletClient.request).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/web
npm test
```

Expected: FAIL — `walletClient` prop not accepted, wallet proxy not implemented.

- [ ] **Step 4: Implement wallet proxy in AppRuntime.tsx**

Replace the full content of `/Users/chengfeng.fan/WORK/mini-app/web/src/components/AppRuntime.tsx` with:

```typescript
import { useEffect, useRef, useState } from 'react'
import { getInstallationContext } from '../api/client'
import type { Installation } from '../types'

interface EIP1193WalletClient {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

interface AppRuntimeProps {
  installation: Installation
  walletClient?: EIP1193WalletClient
}

type BridgeState = 'idle' | 'loading' | 'ready' | 'error'

const ALLOWED_METHODS = new Set([
  'eth_accounts',
  'eth_chainId',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
  'personal_sign',
])

export function AppRuntime({ installation, walletClient }: AppRuntimeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [bridgeState, setBridgeState] = useState<BridgeState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const expectedOrigin = new URL(installation.app.iframe_url).origin

  async function sendContext() {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    setBridgeState('loading')
    setErrorMsg(null)
    try {
      const data = await getInstallationContext(installation.id)
      iframe.contentWindow.postMessage({ type: 'context', data }, expectedOrigin)
      setBridgeState('ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load context')
      setBridgeState('error')
    }
  }

  useEffect(() => {
    const hasSignScope = installation.granted_scopes.includes('wallet:sign')

    async function handleMessage(event: MessageEvent) {
      if (event.origin !== expectedOrigin) return

      if (event.data?.type === 'ready') {
        sendContext()
        return
      }

      if (event.data?.type === 'wallet_request') {
        const { requestId, method, params } = event.data
        const iframe = iframeRef.current

        if (!hasSignScope || !ALLOWED_METHODS.has(method) || !walletClient || !iframe?.contentWindow) {
          iframe?.contentWindow?.postMessage({
            type: 'wallet_response',
            requestId,
            error: { code: 4200, message: 'Method not supported or scope not granted' },
          }, expectedOrigin)
          return
        }

        try {
          const result = await walletClient.request({ method, params })
          iframe.contentWindow.postMessage({
            type: 'wallet_response',
            requestId,
            result,
          }, expectedOrigin)
        } catch (err: unknown) {
          const error = err && typeof err === 'object' && 'code' in err
            ? err as { code: number; message: string }
            : { code: -32603, message: err instanceof Error ? err.message : 'Internal error' }
          iframe.contentWindow.postMessage({
            type: 'wallet_response',
            requestId,
            error,
          }, expectedOrigin)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [installation.id, installation.granted_scopes, expectedOrigin, walletClient])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={installation.app.iframe_url}
        sandbox="allow-scripts allow-same-origin allow-forms"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={installation.app.name}
      />
      {bridgeState === 'loading' && (
        <div
          data-testid="loading-overlay"
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.8)',
          }}
        >
          Loading context…
        </div>
      )}
      {bridgeState === 'error' && (
        <div
          data-testid="error-message"
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.9)',
          }}
        >
          <p>{errorMsg}</p>
          <button onClick={sendContext}>Retry</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/web
npm test
```

Expected: all tests PASS including new wallet proxy tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/chengfeng.fan/WORK/mini-app/web
git add src/components/AppRuntime.tsx src/components/AppRuntime.test.tsx
git commit -m "feat: add wallet signing proxy to AppRuntime"
```
