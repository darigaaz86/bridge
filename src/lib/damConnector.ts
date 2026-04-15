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
    type: "dam-wallet" as const,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async connect(_parameters?: any) {
      const chainId = await this.getChainId()
      // wagmi's connect return type uses an unresolvable conditional generic;
      // cast to satisfy it at the call site.
      return { accounts: [config.address] as readonly `0x${string}`[], chainId } as any
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
