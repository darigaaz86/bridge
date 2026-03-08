# QoreBridge

**Cross-chain stablecoin bridge** that finds the best rates for USDC and USDT across multiple chains and bridge providers. Built for [Qore3](https://www.qore3.com).

---

## Features

- **Multi-provider quotes** — Compares [Circle CCTP](https://www.circle.com/en/cross-chain-transfer-protocol), [USDT0 (LayerZero)](https://layerzero.network/), and [NEAR Intents](https://near.org/) in one place and sorts by best output.
- **CCTP V2** — Fast (~30s) and Standard (~15 min) transfer options with correct fee handling and forwarding.
- **8+ chains** — Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, Linea.
- **Configurable settings** — Platform fee, slippage, quote refresh and status poll intervals, CCTP default speed (via in-app settings popout).
- **Bridge history** — Local transaction history with status polling, completion detection, and refund/claim guidance for failed transfers.
- **Wallet support** — Connect via [RainbowKit](https://www.rainbowkit.com/) (WalletConnect, injected, etc.); allowance check to skip redundant approvals.
- **Static export** — Builds to a static `out/` folder for deployment on Cloudflare Pages or any static host.

---

## Supported Chains & Tokens

| Chains | Tokens |
|--------|--------|
| Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, Linea | USDC, USDT, USDT0 |

Route and token support depend on each bridge provider (CCTP for USDC, USDT0 for USDT0, etc.).

---

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **UI:** React 19, [Tailwind CSS 4](https://tailwindcss.com/)
- **Wallet & chains:** [Wagmi](https://wagmi.sh/) + [RainbowKit](https://www.rainbowkit.com/) + [viem](https://viem.sh/)
- **Data:** [TanStack Query](https://tanstack.com/query/latest) (React Query)
- **Language:** TypeScript

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**, **yarn**, or **pnpm**

---

## Installation

```bash
git clone <your-repo-url>
cd qore3-bridge-test
npm install
```

---

## Environment Variables

Create a `.env.local` in the project root (see `.env.example` if present). Optional:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (e.g. `https://qorebridge.com`). Used for sitemap, robots, and metadata. Default: `https://qorebridge.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com/) project ID for RainbowKit. Required for WalletConnect. |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server at [http://localhost:3000](http://localhost:3000) |
| `npm run build` | Production build and **static export** → outputs to `out/` |
| `npm run export` | Alias for `npm run build` (same static export) |
| `npm run start` | Serve the app (only relevant if not using static export) |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout, metadata, JSON-LD
│   ├── page.tsx            # Home (bridge UI)
│   ├── history/            # Bridge history page
│   ├── settings/           # Settings page (also in-app popout)
│   ├── sitemap.ts          # Static sitemap
│   └── robots.ts           # Static robots.txt
├── components/             # React components
│   ├── BridgeCard.tsx      # Main bridge form, quotes, actions
│   ├── BridgeSettingsPopout.tsx
│   ├── BridgeHistoryItem.tsx
│   ├── ChainSelector.tsx, TokenSelector.tsx, AmountInput.tsx
│   ├── RouteDisplay.tsx, FeeBreakdown.tsx
│   └── Header.tsx, etc.
├── config/                 # Chains, tokens, wagmi, constants, contracts
├── contexts/               # BridgeSettingsContext
├── hooks/                  # useBridgeQuote, useBridgeTransaction, useBridgeHistory, etc.
├── lib/                    # bridgeHistory, bridgeSettings, fees, utils
├── services/               # Bridge adapters & router
│   ├── router.ts           # getQuotes(), getAdapter()
│   ├── cctp.ts             # Circle CCTP (incl. V2 fast/standard)
│   ├── usdt0.ts            # USDT0 (LayerZero)
│   └── nearIntents.ts      # NEAR Intents (quote-only for now)
└── abi/                    # Contract ABIs (CCTP, OFT, ERC20)
```

---

## Deployment

The app is built as a **static export** (`output: 'export'` in `next.config.ts`). No Node server is required.

### Cloudflare Pages

1. **Build:** Set build command to `npm run build` and output directory to **`out`**.
2. **Env:** Add `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in the Cloudflare project.
3. Deploy; the contents of `out/` are served as a static site.

### Other static hosts

Run `npm run build`, then upload the **`out`** folder to Netlify, Vercel (static), GitHub Pages, or any static host. Ensure the host supports client-side routing (e.g. redirects for `/*` to `/index.html` for SPA-style routes).

---

## Configuration

- **In-app settings (gear icon):** Platform fee (bps), slippage, quote refresh interval, transaction and history status poll intervals, CCTP default speed (Fast vs Standard). Stored in `localStorage` and applied across the app.
- **Constants:** Defaults live in `src/config/constants.ts`; defaults for settings are in `src/lib/bridgeSettings.ts`.

---

## SEO & Metadata

- Root and page-level metadata (title, description, Open Graph, Twitter) in `app/layout.tsx` and route layouts.
- Static `sitemap.xml` and `robots.txt` (see `app/sitemap.ts`, `app/robots.ts`).
- JSON-LD `WebApplication` schema in the root layout.
- See **SEO_AUDIT.md** for a full audit and checklist.

---

## License

Private. Part of the Qore3 ecosystem.

---

## Links

- [Qore3](https://www.qore3.com)
- [Circle CCTP](https://www.circle.com/en/cross-chain-transfer-protocol)
- [LayerZero](https://layerzero.network/)
- [NEAR](https://near.org/)
