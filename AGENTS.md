# AGENTS.md

Single source of truth for agents working in this repo. `CLAUDE.md` imports this file via
`@AGENTS.md`, so Claude Code, Codex, and any other agent that reads `AGENTS.md` share the same
instructions.

---

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. (Adapted from Andrej Karpathy's
[CLAUDE.md](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md).)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables YOUR changes made unused; leave pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."

For multi-step tasks, state a brief plan with a verify step for each item.

---

## Third-Party Library Docs

For **any third-party library** (OpenZeppelin v4/v5/v5.2, Hardhat, Foundry, ethers v6, TypeChain,
solidity-coverage), use the **context7** MCP to fetch up-to-date documentation rather than relying on
training data, which lags real library APIs. This matters here because multiple OpenZeppelin versions
coexist with breaking differences. If the context7 MCP server is not available, set it up:
https://context7.com/install

---

## Project Overview

Smart contracts for the Agglayer / Polygon ecosystem. Manages rollup registration, cross-chain
bridging, global exit root tracking, proof verification, and governance via timelock. Settlement
happens on Ethereum L1.

Package: `@0xpolygonhermez/zkevm-contracts` v3.0.0 · License: AGPL-3.0.

## Repository Structure

- `contracts/` — Solidity contracts (0.8.28 primary): `consensus/`, `aggchains/`,
  `sovereignChains/` (L2 contracts), `interfaces/`, `lib/`, `mocks/`, `verifiers/`,
  `previousVersions/`, `periphery/`, `deployment/`.
- `deployment/` — deployment scripts (`v2/` is the main 4-step sequence).
- `upgrade/` — upgrade scripts; current ones are `upgradeEtrogSovereign/` and `upgradeSovereignBridge/`.
- `test/` — Hardhat suite (`contractsv2/`) + Foundry (`forge/`) + test vectors.
- `tools/` — operational tools (rollup management, deployment, roles).
- `src/` — TS utility scripts (genesis, permits, pessimistic utils).
- `docs/` — auto-generated docs, selectors, storage layouts, CHANGELOG.
- `docker/` — geth node with deployed contracts.
- `verifyMainnetDeployment/` — scripts to verify deployed bytecode matches source.

## Tech Stack

- **Solidity** 0.8.28 primary (also 0.8.20 / 0.8.17 / 0.6.11 / 0.5.16 / 0.5.12), optimizer 999999
  runs, EVM target `cancun`.
- **Hardhat** (production builds/deploys) + **Foundry** (testing/dev only).
- **TypeScript** tooling (deployment, tools, tests) via ts-node, TypeChain (ethers-v6).
- **npm** — Node 22.x, npm 10.x.

## Build & Run

```bash
npm i                 # install deps (runs patch-package via prepare hook)
npx hardhat compile   # compile — required before Foundry tests too
npm run test          # run Hardhat tests
npm run lint          # ESLint on all TS
```

Foundry (testing only, never for production artifacts): `just install`, `just build`, `just test`.

**Environment:** copy `.env.example` to `.env` and set `MNEMONIC`, `INFURA_PROJECT_ID`,
`ETHERSCAN_API_KEY` (and optionally `LEDGER_ACCOUNT`).

## Testing

See **[TESTING.md](./TESTING.md)** for testing conventions, unit vs. integration boundaries, and
execution commands.

## Documentation

Project documentation lives in the **`/docs`** folder (auto-generated via the pre-commit hook:
forge doc output, `selectors.txt`, `storage_layout.txt`, `CHANGELOG.md`). Add new docs there.
Detailed protocol docs live in the external `agglayer/protocol-team-docs` repo.

## Conventions

- Commit messages and PR titles follow [Conventional Commits](https://www.conventionalcommits.org).
- **Always use Agglayer names, never legacy Polygon names** (`AgglayerManager` not
  `PolygonRollupManager`, `AgglayerBridge` not `PolygonZkEVMBridgeV2`, `AgglayerGER`,
  `AgglayerTimelock` not `PolygonZkEVMTimelock`).
- **Preserve public getters and storage layout on upgradeable contracts.** Changing a `public`
  state variable/constant to `internal` (or deleting a getter) is a breaking change that breaks
  upgrade scripts, tools, and indexers — re-introduce a compatibility accessor or update all call
  sites before landing.
- **Don't change the optimizer `runs` setting casually.** If you do, update the accompanying
  rationale comment (e.g. "should have same runs than AgglayerBridge").
- **Emit events only after verification succeeds.** Emitting a claim/detailed event before the
  nullifier is set or verification passes misleads indexers.
- **Use `bigint` / `BigNumberish` for uint256 values in TS, never JS `number`.** Casting wei
  amounts (e.g. 1e18) to `number` loses precision and can sign/execute a different amount.
- All production deployments and upgrades **MUST** use Hardhat-compiled artifacts — Foundry
  produces different bytecode and is for testing/dev only (also affects Etherscan verification).
- Solidity: Prettier print width 80, 4-space tabs, double quotes. TS: Prettier print width 120,
  single quotes, semicolons, max line length 140.
- Do NOT modify deprecated code: `FflonkVerifier*`, `PolygonZkEVMDeployer`, `PolygonZkEVMEtrog`,
  `PolygonPessimisticConsensus`, `contracts/previousVersions/`.
- New chains are registered via `tools/createNewRollup/`. Active chain types: `AggchainFEP`,
  `AggchainECDSA`.

## CI/CD

Defined in `.github/workflows/`:
- `compile.yml` — enforces `npm run lint`, `npm run prettier:contracts`, and `npm run compile` on
  push/PR (real gates).
- `main.yml` — runs `npm run test`.
- `build-docker*.yml` / `build-push-docker*.yml` — build/push Docker images; `release-published.yml`.

Branch from `main` → write code → run full coverage → PR with a descriptive Conventional-Commits
title → lint/CI must pass. Coverage target: 100% ideally.

## Common Pitfalls

- Run `npx hardhat compile` before Foundry tests — Foundry needs Hardhat artifacts to resolve
  version mismatches.
- Cannot deploy twice on the same network with the same `salt` + `initialZkEVMDeployerOwner`; delete
  `.openzeppelin/` files for a fresh deployment.
- Three OpenZeppelin versions coexist (`contracts4` v4.8.2, `contracts5` v5.0.0, `contracts52`
  v5.2.0). Use the matching version for the contract you're editing; there is no migration plan.
- Upgradeable contracts must preserve storage layout (`LegacyZKEVMStateVariables`,
  `LegacyAgglayerGERBaseStorage`). Check with `forge inspect <Contract> storage` / `storage-layout.sh`.

## Maintenance Matrix

| When this changes… | Also update… |
| :-----------------------------------: | :--------------------------------------------------: |
| `package.json` deps / scripts | `AGENTS.md` Tech Stack, `.github/workflows`, `TESTING.md` |
| Test commands or structure | `TESTING.md`, `.github/workflows/main.yml`, PR template |
| Top-level repo structure | `AGENTS.md` Repository Structure, `README.md` |
| Mainnet/testnet contract addresses | `README.md`, `CLAUDE.md`/`AGENTS.md` context |
| A new contract is added | `.githooks/pre-commit`, `compiled-contracts/`, `docs/` |
| Coding conventions / lint config | `AGENTS.md` Conventions, `.claude/rules/` |

---

## Reference

### Mainnet contracts

| Contract | Address | Role |
| :-------------: | :------------------------------------------: | :-------------------------------------------------: |
| AgglayerManager | `0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2` | Rollup types, rollup registration, batch verification |
| AgglayerBridge | `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe` | Cross-chain token bridging and message passing |
| AgglayerGER | `0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb` | Global Exit Root manager, L1 info tree |
| AgglayerGateway | `0x046Bb8bb98Db4ceCbB2929542686B74b516274b3` | PP verification keys, aggchain multisig |
| AgglayerTimelock | `0xEf1462451C30Ea7aD8555386226059Fe837CA4EF` | Governance timelock (0 delay during emergency) |

Originally deployed under different names (e.g. `PolygonRollupManager`, `PolygonZkEVMBridgeV2`);
Etherscan shows the originals. Always use the Agglayer names in code and docs.

### Cardona (testnet, on Sepolia) contracts

| Contract | Address |
| :-------------: | :------------------------------------------: |
| AgglayerManager | `0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff` |
| AgglayerBridge | `0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582` |
| AgglayerGER | `0xAd1490c248c5d3CbAE399Fd529b79B42984277DF` |
| AgglayerGateway | `0xaA8103640A6C92af48A97D720168011E9f3Ec697` |

### Deployment

Sequence in `deployment/v2/`: `1_createGenesis.ts` → `2_deployPolygonZKEVMDeployer.ts` (CREATE2
keyless factory) → `3_deployContracts.ts` → `4_createRollup.ts`. Config via `deploy_parameters.json`
and `create_rollup_parameters.json` (see `.example` files). Outputs saved to
`deployments/{network}_{timestamp}/`.

```bash
npm run deploy:v2:localhost        # full local deployment
npm run deploy:v2:sepolia          # Sepolia testnet
npm run deploy:testnet:v2:sepolia  # testnet (auto-deploys test POL token)
```

### Chain types

- **Active:** `AggchainFEP` (OP-Succinct + Pessimistic Proof, SP1 vkeys) and `AggchainECDSA`
  (Pessimistic Proof only; PP + ECDSA multisig authorize inputs). Both inherit `AggchainBase` →
  `PolygonConsensusBase`.
- **Legacy (deprecated, still deployed):** `PolygonValidiumEtrog`, `PolygonZkEVMEtrog`,
  `PolygonPessimisticConsensus` (use `PolygonRollupBaseEtrog`).
- **Outposts (non-Polygon chains):** purely PP → `AggchainECDSA`; bridge-proof → custom contract.

All chain contracts are deployed by AgglayerManager as `PolygonTransparentProxy` (modified OZ
transparent proxy); upgrades via `AgglayerManager.updateRollup()`.

### Proxy architecture

AgglayerManager, AgglayerBridge, AgglayerGER, AgglayerGateway are behind upgradeable proxies.
AgglayerTimelock is NOT upgradeable (constructor-based `TimelockController`).

### AgglayerGateway

Stores shared info for all chains: default program VKeys (OP-Succinct key for AggchainFEP; none for
AggchainECDSA), shared multisig signer config, and all pessimistic-proof VKey routes.

### Key libraries

`PolygonAccessControlUpgradeable`, `EmergencyManager`, `PolygonConsensusBase` /
`PolygonRollupBaseEtrog`, `DepositContractV2`, `GlobalExitRootLib`, `BridgeLib` (bytecode-optimized,
separate deployment), `LegacyZKEVMStateVariables`, `LegacyAgglayerGERBaseStorage`.

### Sovereign chains

`contracts/sovereignChains/` holds **L2 contracts** (AgglayerBridgeL2, AgglayerGERL2,
AggOracleCommittee) deployed on the sovereign chain, not L1. Active upgrade scripts:
`upgrade/upgradeEtrogSovereign/`, `upgrade/upgradeSovereignBridge/`.

### Git hooks

Activate: `git config --local core.hooksPath .githooks/`. The pre-commit hook runs lint,
force-compiles with Hardhat, copies ABIs to `compiled-contracts/`, regenerates `docs/selectors.txt`,
`docs/contracts/`, and `docs/storage_layout.txt`, then stages `docs/` and `compiled-contracts/`.
Requires Foundry nightly (`foundryup --install nightly`) for transient storage support.

### Mainnet verification

See `verifyMainnetDeployment/verifyDeployment.md` to verify deployed bytecode matches source (local
deployment comparison, due to immutable variables).
