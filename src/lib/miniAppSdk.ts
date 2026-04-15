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
  private parentOrigin: string | null = null
  private cachedProvider: EIP1193Provider | null = null

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
        this.parentOrigin = event.origin
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
    if (this.cachedProvider) return this.cachedProvider

    const targetOrigin = this.parentOrigin ?? '*'

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

    this.cachedProvider = {
      request: ({ method, params = [] }: EIP1193RequestArguments): Promise<unknown> => {
        return new Promise((resolve, reject) => {
          const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
          if (pendingRequests.size === 0) window.addEventListener('message', responseHandler)
          const timer = setTimeout(() => {
            pendingRequests.delete(requestId)
            if (pendingRequests.size === 0) window.removeEventListener('message', responseHandler)
            reject({ code: -32603, message: 'Request timed out' })
          }, 60000)
          pendingRequests.set(requestId, { resolve, reject, timer })
          parent.postMessage({ type: 'wallet_request', requestId, method, params }, targetOrigin)
        })
      },
    }

    return this.cachedProvider
  }
}

// Singleton — one SDK instance per page
export const miniAppSdk = new MiniAppSDK({ timeout: 3000 })
