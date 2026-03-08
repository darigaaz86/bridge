import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "wagmi";
import {
  mainnet,
  arbitrum,
  base,
  optimism,
  polygon,
  avalanche,
  bsc,
  linea,
} from "wagmi/chains";
import { SUPPORTED_CHAINS } from "./chains";
import { WALLETCONNECT_PROJECT_ID } from "./constants";

/**
 * Fallback RPC transports per chain. When one endpoint fails (rate limit, 4xx, etc.),
 * the next is tried. No ranking – we use the first URL until it fails to avoid
 * hundreds of probe requests across all endpoints.
 */
const transports = {
  [mainnet.id]: fallback([
    http("https://rpc.ankr.com/eth"),
    http("https://ethereum.publicnode.com"),
    http("https://1rpc.io/eth"),
    http("https://eth.merkle.io"),
    http("https://eth.llamarpc.com"),
  ]),
  [arbitrum.id]: fallback([
    http("https://arb1.arbitrum.io/rpc"),
    http("https://rpc.ankr.com/arbitrum"),
    http("https://arbitrum.publicnode.com"),
  ]),
  [base.id]: fallback([
    http("https://mainnet.base.org"),
    http("https://rpc.ankr.com/base"),
    http("https://base.llamarpc.com"),
  ]),
  [optimism.id]: fallback([
    http("https://mainnet.optimism.io"),
    http("https://rpc.ankr.com/optimism"),
    http("https://optimism.publicnode.com"),
  ]),
  [polygon.id]: fallback([
    http("https://rpc.ankr.com/polygon"),
    http("https://polygon-bor.publicnode.com"),
    http("https://polygon-rpc.com"),
  ]),
  [avalanche.id]: fallback([
    http("https://api.avax.network/ext/bc/C/rpc"),
    http("https://rpc.ankr.com/avalanche"),
  ]),
  [bsc.id]: fallback([
    http("https://bsc-dataseed.binance.org"),
    http("https://rpc.ankr.com/bsc"),
  ]),
  [linea.id]: fallback([
    http("https://rpc.linea.build"),
    http("https://rpc.ankr.com/linea"),
  ]),
};

export const wagmiConfig = getDefaultConfig({
  appName: "QoreBridge",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: SUPPORTED_CHAINS as unknown as readonly [
    (typeof SUPPORTED_CHAINS)[0],
    ...typeof SUPPORTED_CHAINS,
  ],
  ssr: true,
  transports,
});
