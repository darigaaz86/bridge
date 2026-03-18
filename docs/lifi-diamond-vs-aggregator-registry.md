# LI.FI Diamond Pattern vs QoreBridge Aggregator Registry Pattern

A detailed architectural comparison to inform our contract design decisions.

---

## 1. Architecture Overview

### LI.FI: EIP-2535 Diamond (Multi-Facet Proxy)

LI.FI uses a single Diamond proxy contract per chain. All user interactions go through this one address. The proxy uses `DELEGATECALL` to route function calls to facet contracts that contain the business logic. Each bridge/DEX integration is a separate facet (e.g., `StargateV2Facet`, `AcrossFacet`, `GasZipFacet`). At time of writing, LI.FI has ~46 facets across ~20 networks.

```
User → LI.FI Diamond Proxy
         ├── DELEGATECALL → StargateV2Facet
         ├── DELEGATECALL → AcrossFacet
         ├── DELEGATECALL → CelerIMFacet
         ├── DELEGATECALL → GenericSwapFacet
         └── ... (46 facets)
```

Key characteristics:
- Single proxy address, unlimited implementation contracts behind it
- All facets share the Diamond's storage (via Diamond Storage pattern with hashed slot positions)
- Facets are added/replaced/removed via `diamondCut()` — the standard EIP-2535 upgrade mechanism
- Helper contracts: `DiamondLoupeFacet` (introspection), `OwnershipFacet`, withdrawal helpers
- Each facet has its own function selectors; the proxy maps selector → facet address

### QoreBridge: Aggregator + Provider Registry

QoreBridge uses an Aggregator contract per chain with a single `bridge()` entry point. Bridge protocols are separate Provider contracts implementing `IBridgeProvider`. The Aggregator maintains a registry mapping `bytes32` provider IDs to provider contract addresses.

```
User → QoreBridgeAggregator
         ├── CALL → CctpProvider.executeBridge()
         ├── CALL → Usdt0Provider.executeBridge()
         └── CALL → NearIntentsProvider.executeBridge()
```

Key characteristics:
- Single entry point (`bridge()`), not per-facet function selectors
- Providers are standalone contracts with their own storage — no shared state
- Provider registry uses immutable ID→address mappings (can disable, never overwrite)
- Aggregator handles fee collection, event emission, pause; providers handle protocol-specific logic
- Tokens flow: user → aggregator (fee retained) → provider → protocol

---

## 2. Upgradeability

| Aspect | LI.FI Diamond | QoreBridge Registry |
|--------|--------------|-------------------|
| Add new protocol | Deploy facet, call `diamondCut()` to register selectors | Deploy provider, call `registerProvider()` |
| Replace protocol logic | Deploy new facet, `diamondCut()` replaces selectors in-place | Register new provider ID (e.g., `cctp-v2`), disable old one |
| Remove protocol | `diamondCut()` removes selectors | `disableProvider()` — address mapping preserved |
| Upgrade core logic | Replace any facet, including shared libraries | Redeploy aggregator (core logic is minimal) |
| Storage migration | Complex — must maintain Diamond Storage layout compatibility | N/A — providers have independent storage |
| Address stability | Same proxy address forever | Same aggregator address; provider addresses change on replacement |

The Diamond pattern gives LI.FI maximum flexibility: any function can be swapped at any time. QoreBridge trades that flexibility for simplicity — the aggregator core is small enough that it rarely needs upgrading, and provider replacement is explicit (new ID, old one disabled, never silently swapped).

---

## 3. Security Model

### LI.FI Diamond — Attack Surface

The Diamond pattern's power is also its risk. Because facets execute via `DELEGATECALL`, they run in the Diamond's storage context. A buggy facet can corrupt shared state or, worse, drain user-approved tokens.

This is not theoretical. LI.FI was exploited twice for the same root cause:

- **March 2022 ($600K)**: A swap facet allowed arbitrary calls to arbitrary contracts. Attacker called `transferFrom` on token contracts to drain wallets that had approved the LI.FI contract.
- **July 2024 ($11.6M)**: A newly deployed `GasZipFacet` used `LibSwap` directly instead of the validated `SwapperV2` helper, bypassing the contract/selector whitelists. Same attack vector — arbitrary call injection draining infinite approvals. 153 wallets affected on Ethereum and Arbitrum.

The July 2024 incident is particularly instructive: the facet was deployed 5 days before the exploit, was not externally audited, and the vulnerability was a developer importing the wrong library. The Diamond architecture made this possible because any new facet inherits full access to the proxy's token approvals.

Sources: [Quill Audits analysis](https://www.quillaudits.com/blog/hack-analysis/lifi-protocol-exploit), [Detailed exploit walkthrough](https://medium.com/@gr_gred/li-fi-exploits-explained-the-same-mistake-twice-b46b1b9b4610), [Beosin analysis](https://beosin.com/resources/beosin-trace-analyzes-the-10-million-loss-of-lifi-protocol)

### QoreBridge Registry — Attack Surface

The registry pattern has a narrower attack surface:

- Providers are called via `CALL`, not `DELEGATECALL` — they cannot access or corrupt the aggregator's storage
- Each provider only receives the post-fee token amount; it cannot access the aggregator's accumulated fees
- Provider IDs are immutable once registered — no silent address swaps
- The aggregator's `bridge()` function is the only entry point; there are no per-provider function selectors exposed on the aggregator
- A buggy provider can only mishandle the tokens explicitly transferred to it for that single transaction

The tradeoff: if the aggregator core itself has a bug, you need to redeploy (no in-place upgrade). But the core is ~200 lines of straightforward logic (fee math, registry lookup, transferFrom, event emission), making it easier to audit exhaustively.

### Comparison Table

| Risk | LI.FI Diamond | QoreBridge Registry |
|------|--------------|-------------------|
| Buggy integration drains user approvals | Yes — facet runs in proxy context with full approval access | No — provider only receives tokens for current tx |
| Shared storage corruption | Yes — all facets share Diamond Storage | No — providers have isolated storage |
| Silent provider replacement | Possible via `diamondCut()` | Impossible — IDs are immutable, replacement requires new ID |
| Arbitrary call injection | Historical risk (exploited twice) | Not applicable — `bridge()` only calls `executeBridge()` on registered providers |
| Core logic upgrade without redeploy | Yes | No |
| Single-facet bug takes down whole system | Possible (pause required) | No — disable one provider, others unaffected |

---

## 4. Gas Costs

| Operation | LI.FI Diamond | QoreBridge Registry |
|-----------|--------------|-------------------|
| User bridge call | `DELEGATECALL` to facet (~2,600 gas overhead per delegate) + facet logic | `CALL` to provider (~2,600 gas base) + `CALL` from provider to protocol. Extra `transfer` hop adds ~5-10K gas |
| Token flow | User → Diamond (delegatecall executes protocol call in Diamond context) | User → Aggregator → Provider → Protocol (two hops) |
| Approval target | Diamond proxy address | Aggregator address |
| Fee collection | Varies by facet implementation | Aggregator retains fee in-contract, swept later (saves ~35K gas/tx vs per-tx treasury transfer) |

The Diamond pattern is slightly more gas-efficient per bridge call because tokens go directly from the Diamond to the protocol in one hop (the facet executes in the Diamond's context). QoreBridge adds an extra token transfer from aggregator to provider, costing roughly 5-10K additional gas. For bridge transactions moving thousands of dollars, this difference is negligible (~$0.01-0.05 on L2s).

---

## 5. Complexity and Auditability

### LI.FI Diamond

- 46 facets × 20 networks = ~920 facet deployments to manage
- Each facet must correctly use Diamond Storage patterns (hashed storage slots)
- Contract/selector whitelists must be configured per facet per network — thousands of addresses
- Shared libraries (`LibSwap`, `SwapperV2`) create implicit dependencies; importing the wrong one caused the $11.6M exploit
- `diamondCut()` is a powerful admin function — a compromised owner key can replace any facet
- Auditing requires understanding the full Diamond Storage layout and all facet interactions

### QoreBridge Registry

- 3 providers × 6 networks = 18 provider deployments
- Each provider is a standalone contract with no shared storage dependencies
- The aggregator core is ~200 lines; each provider is 20-50 lines
- No Diamond Storage patterns, no selector mapping, no `DELEGATECALL` context risks
- `registerProvider()` is append-only; even a compromised owner cannot silently swap a provider address
- Auditing each component is independent — a provider audit doesn't need to consider aggregator internals

---

## 6. Operational Overhead

| Concern | LI.FI Diamond | QoreBridge Registry |
|---------|--------------|-------------------|
| Adding a new bridge | Deploy facet, configure whitelists, `diamondCut()` on each chain | Deploy provider, `registerProvider()` on each chain |
| Incident response | Pause entire Diamond or remove facet via `diamondCut()` | `disableProvider()` for affected provider only |
| Monitoring | Must watch all facet upgrades across all chains (attackers monitor proxy updates) | Simpler — fewer contracts, no `DELEGATECALL` risk |
| Configuration drift | High risk — whitelists per facet per chain | Low — providers are self-contained |
| Deployment tooling | Complex — Diamond deployment scripts, facet registration, whitelist config | Straightforward — Foundry deploy script, register providers |

---

## 7. When Each Pattern Makes Sense

### Diamond pattern is better when:
- You need dozens of integrations (DEXs, bridges, solvers) behind one address
- You want to hot-swap any integration without changing the user-facing address or ABI
- You need shared state across integrations (e.g., unified swap routing that chains multiple DEXs)
- You have a dedicated security team to audit every facet deployment and manage whitelists at scale
- Gas optimization on every call matters more than simplicity

### Registry pattern is better when:
- You have a bounded set of bridge protocols (3-10)
- You want provider isolation — a bug in one provider cannot drain the aggregator or other providers
- You want immutable provider mappings for trust/transparency (no silent swaps)
- Your team is small and you need the architecture to be auditable without deep Diamond expertise
- You prefer explicit, append-only changes over in-place upgrades

---

## 8. Relevance to QoreBridge

QoreBridge currently supports 3 bridge protocols (CCTP, USDT0 OFT, NEAR Intents) across 6-8 EVM chains. The registry pattern is the right fit because:

1. **Bounded scope**: 3 providers don't justify Diamond complexity. Even at 10 providers, the registry pattern scales fine.
2. **Provider isolation**: The July 2024 LI.FI exploit would not have been possible with our architecture — providers receive tokens via `CALL` and cannot access user approvals on the aggregator.
3. **Immutable registry**: Provider IDs can never be silently swapped. Users and integrators can verify on-chain that `keccak256("cctp")` always points to the same address.
4. **Audit simplicity**: The aggregator + 3 providers total ~350 lines of Solidity. A full audit is feasible and affordable.
5. **Operational simplicity**: No whitelist management, no Diamond Storage layout concerns, no facet selector conflicts.

The main thing we give up is in-place upgradeability of the aggregator core. If we ever need to change fee logic or the `bridge()` function signature, we'd redeploy. Given the core is intentionally minimal, this is an acceptable tradeoff.

---

## 9. Summary

| Dimension | LI.FI Diamond | QoreBridge Registry | Winner for QoreBridge |
|-----------|--------------|-------------------|---------------------|
| Flexibility | Unlimited facets, hot-swap anything | Append-only providers, disable/enable | Diamond |
| Security isolation | Shared context via DELEGATECALL | Isolated providers via CALL | Registry |
| Gas efficiency | Slightly better (one fewer token hop) | ~5-10K gas overhead per tx | Diamond (marginal) |
| Auditability | Complex (shared storage, 46 facets) | Simple (independent contracts) | Registry |
| Operational overhead | High (whitelists, facet management) | Low (deploy + register) | Registry |
| Incident blast radius | Entire Diamond at risk | Single provider at risk | Registry |
| Track record | Two exploits ($12.2M total) from facet bugs | N/A (not yet deployed) | Registry (by design) |

The registry pattern trades maximum flexibility for meaningful security and operational advantages. For a focused bridge aggregator with a small provider set, it's the stronger choice.

---

Sources:
- [LI.FI Smart Contract Architecture](https://docs.li.fi/smart-contracts/overview)
- [EIP-2535: Diamonds, Multi-Facet Proxy](https://eips.ethereum.org/EIPS/eip-2535)
- [LI.FI Exploits Explained (gr_gred)](https://medium.com/@gr_gred/li-fi-exploits-explained-the-same-mistake-twice-b46b1b9b4610) — Content was rephrased for compliance with licensing restrictions
- [Quill Audits: LI.FI Protocol Exploit Analysis](https://www.quillaudits.com/blog/hack-analysis/lifi-protocol-exploit)
- [Beosin: LI.FI Protocol Loss Analysis](https://beosin.com/resources/beosin-trace-analyzes-the-10-million-loss-of-lifi-protocol)
- [CertiK: Diamond Proxy Contracts Best Practices](https://www-cn.certik.com/blog/diamond-proxy-contracts-best-practices)
- [RareSkills: Diamond Proxy Pattern Explained](https://rareskills.io/post/diamond-proxy)
