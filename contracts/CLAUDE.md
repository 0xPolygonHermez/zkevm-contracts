# contracts/

Solidity smart contracts for the Agglayer system. Primary compiler: Solidity 0.8.28, optimizer 999999 runs, EVM target `cancun`.

Always use Agglayer names (not legacy Polygon names).

## Core Contracts (L1)

| Contract | Description | Upgradeable |
|---|---|---|
| `AgglayerManager.sol` | Central rollup manager. Registers rollup types, creates rollups, verifies batches, manages chain upgrades via `updateRollup`. Deploys `PolygonTransparentProxy` for each chain. | Yes (proxy) |
| `AgglayerBridge.sol` | Cross-chain bridge deployed on L1 and all rollups. Manages deposits (Merkle tree), claims, wrapped token creation. | Yes (proxy) |
| `AgglayerGER.sol` | Global Exit Root manager. Maintains the L1 info tree combining mainnet exit root + rollup exit root. Immutables: `bridgeAddress`, `rollupManager`. | Yes (proxy) |
| `AgglayerGateway.sol` | Stores common info for all chains: default VKeys (program verification keys), shared multisig config, PP verification key routes. | Yes (proxy) |
| `AgglayerTimelock.sol` | Governance timelock (OZ `TimelockController`). Returns `minDelay=0` when AgglayerManager is in emergency state. Mainnet minDelay is 3 days. Compiled with 0.8.20. | No (immutable) |

## Aggchain Contracts (`aggchains/`) -- CURRENT

These are the active chain types. Both use PP (Pessimistic Proof) + ECDSA multisig to authorize inputs.

| Contract | Description |
|---|---|
| `AggchainFEP.sol` | OP-Succinct + Pessimistic Proof. Uses SP1 verification keys from AgglayerGateway. Multisig authorizes inputs. |
| `AggchainECDSAMultisig.sol` | Pessimistic Proof only (no program VKey). Multisig authorizes inputs. |

Both inherit from `lib/AggchainBase.sol` -> `PolygonConsensusBase`.

All aggchain contracts are deployed through AgglayerManager as `PolygonTransparentProxy` instances. Upgrades happen via `AgglayerManager.updateRollup()`.

## Legacy Consensus Contracts (`consensus/`) -- DEPRECATED

| Contract | Status |
|---|---|
| `consensus/validium/PolygonValidiumEtrog.sol` | Still "living" for existing chains |
| `consensus/validium/PolygonDataCommittee.sol` | Data availability committee (validium) |
| `consensus/zkEVM/PolygonZkEVMEtrog.sol` | DEPRECATED |
| `consensus/zkEVM/PolygonZkEVMExistentEtrog.sol` | DEPRECATED (migration helper) |
| `consensus/pessimistic/PolygonPessimisticConsensus.sol` | DEPRECATED |

## Sovereign Chain Contracts (`sovereignChains/`) -- L2 SIDE

These are deployed on the sovereign chain itself (L2), not on L1:

- `AgglayerBridgeL2.sol` -- L2 bridge implementation
- `AgglayerBridgeL2FromEtrog.sol` -- L2 bridge for chains migrated from Etrog
- `AgglayerGERL2.sol` -- L2 global exit root manager
- `AggOracleCommittee.sol` -- Oracle committee for sovereign chains

## Libraries (`lib/`)

| Library | Purpose |
|---|---|
| `PolygonAccessControlUpgradeable` | Custom role-based access control |
| `EmergencyManager` | Emergency state toggle |
| `PolygonConsensusBase` | Base for aggchain and pessimistic consensus |
| `PolygonRollupBaseEtrog` | Base for legacy zkEVM/validium consensus |
| `AggchainBase` | Base for current aggchain contracts |
| `DepositContractV2` / `DepositContractBase` | Merkle tree for bridge deposits |
| `GlobalExitRootLib` | Exit root hash computation |
| `BridgeLib` | Bridge logic + wrapped token bytecode (deployed separately for bytecode optimization) |
| `TokenWrappedBridgeUpgradeable` | Upgradeable wrapped token implementation |
| `PolygonTransparentProxy` | Slightly modified OZ transparent proxy used for all chain contracts |
| `LegacyZKEVMStateVariables` | Preserves storage slots from previous contracts at AgglayerManager address |
| `LegacyAgglayerGERBaseStorage` | Preserves storage slots from previous contracts at GER address |
| `PolygonConstantsBase` | Shared constants |
| `Hashes` | Hash utilities |

## Interfaces (`interfaces/`)

29 interface files. Key ones:
- `IAgglayerManager`, `IAgglayerBridge`, `IAgglayerGER`, `IAgglayerGateway` -- core contract interfaces
- `IAggchainBase`, `IAggchainSigners` -- aggchain interfaces
- `IPolygonRollupBase`, `IPolygonConsensusBase` -- consensus base interfaces
- `ISP1Verifier` -- SP1 proof verifier interface
- `IDataAvailabilityProtocol` -- DA protocol interface (for validium)
- `IEmergencyManager` -- emergency state interface

## Verifiers (`verifiers/`) -- DEPRECATED

FflonkVerifier contracts are **deprecated**. Do not modify or reference them.

The SP1VerifierPlonk in `v5.0.0/` is used by AggchainFEP via AgglayerGateway.

## Mocks (`mocks/`)

16 mock contracts for testing. Used in Hardhat tests to simulate contract behavior without real proofs.

## Previous Versions (`previousVersions/`)

Old contract versions. Kept for testing purposes only, unused in production.

## AgglayerGateway Roles

- `AGGCHAIN_DEFAULT_VKEY_ROLE` -- Can manage default aggchain verification keys
- `AL_ADD_PP_ROUTE_ROLE` -- Can add pessimistic proof verification key routes
- `AL_FREEZE_PP_ROUTE_ROLE` -- Can freeze PP verification key routes
- `AL_MULTISIG_ROLE` -- Can manage multisig signers and threshold
