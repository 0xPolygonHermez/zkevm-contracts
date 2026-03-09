# Agglayer Contracts

Smart contracts for the Agglayer / Polygon ecosystem. Manages rollup registration, cross-chain bridging, global exit root tracking, proof verification, and governance via timelock.

Package: `@0xpolygonhermez/zkevm-contracts` v3.0.0
License: AGPL-3.0

## Repo Structure

```
contracts/          Main Solidity contracts (0.8.28 primary)
  consensus/        Consensus implementations (zkEVM, validium, pessimistic)
  aggchains/        Aggchain implementations (AggchainECDSA, AggchainFEP)
  sovereignChains/  Sovereign chain L2 contracts (bridge, GER, oracle committee)
  interfaces/       29 interface files
  lib/              20 shared libraries and base contracts
  mocks/            16 mock contracts for testing
  verifiers/        Verifier contracts (FflonkVerifiers are DEPRECATED)
  previousVersions/ Legacy contract versions (kept for upgrade testing)
  periphery/        ClaimCompressor, BatchL2DataCreatedRollup
  deployment/       PolygonZkEVMDeployer (CREATE2 factory)
  newDeployments/   AgglayerManagerNotUpgraded
deployment/         Deployment scripts (v2 + testnet)
  v2/               Main deployment sequence (4 numbered scripts)
  helpers/          Deployment utilities
upgrade/            19 upgrade script directories for various versions
test/               Tests (Hardhat + Foundry)
  contractsv2/      Main Hardhat test suite (31+ test files)
  forge/            Foundry tests (fuzz, base, utils)
  src/              Additional TS test scripts
  test-vectors/     Test vector data for aggchains
tools/              36+ operational tools (rollup management, deployment, roles)
docker/             Docker setup: geth node with deployed contracts
src/                TS utility scripts (genesis, permits, pessimistic utils)
docs/               Auto-generated docs, storage layouts, selectors, changelog
compiled-contracts/ Pre-compiled contract JSON ABIs (updated by pre-commit hook)
verifyMainnetDeployment/  Scripts to verify mainnet deployment matches source
deployments/        Historical deployment output snapshots
```

## Mainnet Contracts

| Contract | Address | Role |
|---|---|---|
| AgglayerManager | `0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2` | Manages rollup types, rollup registration, batch verification |
| AgglayerBridge | `0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe` | Cross-chain token bridging and message passing |
| AgglayerGER | `0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb` | Global Exit Root manager, L1 info tree |
| AgglayerGateway | `0x046Bb8bb98Db4ceCbB2929542686B74b516274b3` | Pessimistic proof verification keys, aggchain multisig |
| AgglayerTimelock | `0xEf1462451C30Ea7aD8555386226059Fe837CA4EF` | Governance timelock (0 delay during emergency) |

Note: These were originally deployed under different names (e.g. `PolygonRollupManager`, `PolygonZkEVMBridgeV2`). Etherscan shows the original names. Always use the Agglayer names in code and docs.

## Cardona (Testnet) Contracts

Cardona is the Agglayer testnet (on Sepolia).

| Contract | Address | Role |
|---|---|---|
| AgglayerManager | `0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff` | Rollup management (testnet) |
| AgglayerBridge | `0x528e26b25a34a4A5d0dbDa1d57D318153d2ED582` | Cross-chain bridging (testnet) |
| AgglayerGER | `0xAd1490c248c5d3CbAE399Fd529b79B42984277DF` | Global Exit Root manager (testnet) |
| AgglayerGateway | `0xaA8103640A6C92af48A97D720168011E9f3Ec697` | PP verification keys, aggchain multisig (testnet) |

## Build & Test

**Requirements:** Node 22.x, npm 10.x

```bash
npm i                          # Install dependencies (runs patch-package via prepare hook)
npx hardhat compile            # Compile contracts (required before Foundry tests too)
npm run test                   # Run all Hardhat tests
npm run coverage               # Coverage report (test/contractsv2/*.ts only)
npm run lint                   # ESLint on all TS files
npm run lint:fix               # ESLint autofix
npm run prettier:contracts     # Check Solidity formatting
npm run prettier:contracts:fix # Fix Solidity formatting
```

**Foundry** (testing only -- NOT for production builds/deploys):
```bash
just install    # Install Foundry deps
just build      # Build with Foundry
just test       # Run Foundry tests
just coverage   # Foundry coverage
just fmt        # Format (test/script dirs only, not contracts/)
```

Foundry produces different bytecodes than Hardhat. All production deployments and upgrades MUST use Hardhat-compiled artifacts. The bytecode difference also affects Etherscan verification -- always verify using Hardhat artifacts.

**Environment:** Copy `.env.example` to `.env` and set:
- `MNEMONIC` -- deployer wallet mnemonic
- `INFURA_PROJECT_ID` -- Infura API key for mainnet/testnet RPC
- `ETHERSCAN_API_KEY` -- for contract verification
- `LEDGER_ACCOUNT` (optional) -- hardware wallet address

## Deployment

Deployment sequence (in `deployment/v2/`):
1. `1_createGenesis.ts` -- Generate genesis block
2. `2_deployPolygonZKEVMDeployer.ts` -- Deploy the CREATE2 factory (keyless deployment, hardcoded gas price)
3. `3_deployContracts.ts` -- Deploy all core contracts
4. `4_createRollup.ts` -- Create the first rollup

Config files: `deploy_parameters.json` and `create_rollup_parameters.json` (see `.example` files in `deployment/v2/`)

```bash
npm run deploy:v2:localhost    # Full local deployment
npm run deploy:v2:sepolia      # Sepolia testnet
npm run deploy:testnet:v2:sepolia  # Testnet (auto-deploys test POL token)
```

Outputs saved to `deployments/{network}_{timestamp}/`

Important: Cannot deploy twice on the same network with the same `salt` + `initialZkEVMDeployerOwner`. Must delete `.openzeppelin/` files for new deployments.

## Chain Types

**Current (active) aggchain types:**
- `AggchainFEP` -- OP-Succinct + Pessimistic Proof. Uses SP1 verification keys. Both PP and ECDSA multisig authorize inputs.
- `AggchainECDSA` (AggchainECDSAMultisig) -- Pessimistic Proof only. Both PP and ECDSA multisig authorize inputs (hence the name).

**Legacy consensus types (deprecated but still deployed):**
- `PolygonValidiumEtrog` -- Validium with off-chain DA. Still "living" for existing chains.
- `PolygonZkEVMEtrog` -- zkEVM rollup with full ZK proofs. Deprecated.
- `PolygonPessimisticConsensus` -- Pessimistic consensus. Deprecated.

**Outpost patterns (non-Polygon chains joining Agglayer):**
- Purely PP (pessimistic proof) -- use `AggchainECDSA`
- Bridge proof -- custom contract that reads the chain's state posting + a custom circuit to verify that state root against the L2 bridge using zkvm Succinct

Aggchain contracts inherit from `AggchainBase` -> `PolygonConsensusBase`. Legacy types use `PolygonRollupBaseEtrog`.

All chain contracts are deployed through AgglayerManager, which creates a `PolygonTransparentProxy` (slightly modified OZ transparent proxy). AgglayerManager manages upgrades via `updateRollup`.

## AgglayerGateway

Stores common info for all chains:
- **Default VKeys**: Per-chain program verification keys. For AggchainFEP this is the OP-Succinct key. For AggchainECDSA there is none.
- **Multisig configuration**: Shared multisig signer config for chains that want to be managed by Polygon.
- **PP VKeys**: All pessimistic proof verification key routes.

## Proxy Architecture

- AgglayerManager, AgglayerBridge, AgglayerGER, AgglayerGateway are behind proxies (upgradeable).
- AgglayerTimelock is NOT upgradeable (constructor-based TimelockController).
- All chain/aggchain contracts are deployed as `PolygonTransparentProxy` by AgglayerManager. Upgrades are managed via `AgglayerManager.updateRollup()`.

## Key Libraries

- `PolygonAccessControlUpgradeable` -- Role-based access control
- `EmergencyManager` -- Emergency state management
- `PolygonConsensusBase` / `PolygonRollupBaseEtrog` -- Base for consensus contracts
- `DepositContractV2` -- Merkle tree for bridge deposits
- `GlobalExitRootLib` -- Exit root computation
- `BridgeLib` -- Bridge helper logic (bytecode-optimized, separate deployment)
- `LegacyZKEVMStateVariables` -- Preserves AgglayerManager storage from previous contracts deployed at same address
- `LegacyAgglayerGERBaseStorage` -- Preserves GER storage from previous contracts

## Git Hooks

Activate: `git config --local core.hooksPath .githooks/`

The pre-commit hook:
1. Runs `npm run lint`
2. Force-compiles all contracts with Hardhat
3. Copies ABIs to `compiled-contracts/`
4. Generates `docs/selectors.txt` via `forge selectors ls`
5. Generates `docs/contracts/` via `forge doc`
6. Dumps storage layouts to `docs/storage_layout.txt` via `storage-layout.sh`
7. Stages `docs/` and `compiled-contracts/`

Requires Foundry nightly (`foundryup --install nightly`) for transient storage support.

## Compiler Settings

Hardhat primary: Solidity 0.8.28, optimizer 999999 runs, EVM target `cancun`
Additional compilers: 0.8.20 (timelock, some OZ deps), 0.8.17, 0.6.11, 0.5.16, 0.5.12
Foundry: optimizer 999999 runs, via-IR enabled

## OpenZeppelin Dependencies

Three OZ versions coexist for backwards compatibility (breaking changes between versions, no migration plan -- use new libs on new contracts):
- `@openzeppelin/contracts4` / `contracts-upgradeable4` -- v4.8.2 (legacy contracts)
- `@openzeppelin/contracts5` / `contracts-upgradeable5` -- v5.0.0 (newer contracts)
- `@openzeppelin/contracts52` -- v5.2.0 (used for `ReentrancyGuardTransient`)

## Sovereign Chains

The `contracts/sovereignChains/` directory contains **L2 contracts** for sovereign chains (AgglayerBridgeL2, AgglayerGERL2, AggOracleCommittee). These are deployed on the sovereign chain itself, not on L1. Current active upgrade scripts for sovereign chains: `upgrade/upgradeEtrogSovereign/` and `upgrade/upgradeSovereignBridge/`.

## Workflow

Branch from main -> write code -> run full coverage -> PR with descriptive title explaining what it does -> lint/CI checks pass.

CI/CD also pushes Docker images and sends Slack notifications.

Coverage target: 100% ideally.

Emergency state and incident response are handled by the emergency council -- out of scope for this repo.

## New Chain Onboarding

To register a new chain, use the `tools/createNewRollup/` tool.

## Deprecated / Ignore

- `contracts/verifiers/FflonkVerifier*` -- deprecated, do not modify
- `PolygonZkEVMDeployer` -- deprecated
- `PolygonZkEVMEtrog`, `PolygonPessimisticConsensus` consensus types -- deprecated
- `contracts/previousVersions/` -- old versions kept for testing only, unused
- Most `upgrade/` directories are historical; current ones are `upgradeEtrogSovereign/` and `upgradeSovereignBridge/`

## Mainnet Verification

See `verifyMainnetDeployment/verifyDeployment.md` for instructions to verify deployed bytecode matches source. Uses local deployment comparison approach (due to immutable variables).
