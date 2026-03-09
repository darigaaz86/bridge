/** TronLink extension and TronWeb (injected by TronLink). */
declare global {
  interface Window {
    tronLink?: {
      request: (args: { method: string; params?: unknown }) => Promise<{ code: number; address?: string[] }>;
      ready?: boolean;
    };
    tronWeb?: {
      defaultAddress: { base58: string; hex: string };
      contract: (abi: unknown[], contractAddress?: string) =>
        | {
            at: (contractAddress: string) => {
              balanceOf: (address: string) => Promise<{ call: () => Promise<string> }>;
              transfer: (to: string, amount: string | number) => Promise<{ send: (options?: { from: string }) => Promise<{ transaction?: string; txid?: string }> }>;
            };
          }
        | {
            balanceOf?: (address: string) => Promise<{ call: () => Promise<string> }>;
            transfer?: (to: string, amount: string | number) => Promise<{ send: (options?: { from: string }) => Promise<{ transaction?: string; txid?: string }> }>;
            methods?: { transfer?: (to: string, amount: string) => { send: (options?: { from: string }) => Promise<unknown> } };
          };
      transactionBuilder?: {
        triggerSmartContract: (
          contractAddress: string,
          functionSelector: string,
          options: Record<string, unknown>,
          parameters: { type: string; value: string }[]
        ) => Promise<{ transaction?: unknown }>;
        triggerConstantContract?: (
          contractAddress: string,
          functionSelector: string,
          options: Record<string, unknown>,
          parameters: { type: string; value: string }[]
        ) => Promise<{ constant_result?: string[] }>;
      };
      trx?: {
        sign: (transaction: unknown) => Promise<unknown>;
        sendRawTransaction: (signedTransaction: unknown) => Promise<{ txid?: string; transaction?: string | { txID?: string } }>;
      };
      /** Convert base58 (T...) to hex (41...) for contract calls */
      address?: { toHex: (base58: string) => string };
      fullNode: { host: string };
      eventServer?: { host: string };
    };
  }
}

export {};
