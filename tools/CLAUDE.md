# tools/

Operational tools for managing Agglayer contracts. Each subdirectory is a standalone tool.

Tools will be documented as they are used. If you use a tool, update this file with what it does.

## Key Tools

| Tool | Purpose |
|---|---|
| `createNewRollup/` | Create and register a new rollup/chain. Main tool for chain onboarding. |
| `addRollupType/` | Add a new rollup type to AgglayerManager |
| `updateRollup/` | Update/upgrade an existing rollup |
| `safeMultisig/` | Safe multisig operations |
| `safeMultisigGrantRole/` | Grant roles via Safe multisig |
| `safeTools/` | Safe contract interaction tools |
| `manageRoles/` | Manage contract roles |
| `ledgerGrantRoles/` | Grant roles via Ledger hardware wallet |
| `deployTimelock/` | Deploy a timelock contract |
| `deployVerifier/` | Deploy a verifier contract |
| `deployAggLayerGateway/` | Deploy AgglayerGateway |
| `deployClaimCompressor/` | Deploy ClaimCompressor |
| `deployOutpostChain/` | Deploy an outpost chain |
| `deployPolygonDataCommittee/` | Deploy data committee for validium |
| `deploySovereignTest/` | Deploy sovereign chain for testing |
| `deployAggOracleCommittee/` | Deploy oracle committee |
| `checkRollupVersions/` | Check rollup version info |
| `getRollupData/` | Get rollup data from contracts |
| `getBridgeEvents/` | Get bridge events |
| `getLBT/` | Get LBT info |
| `initializeRollup/` | Initialize a rollup |
| `initMigration/` | Initialize migration |
| `obsoleteRollupType/` | Mark a rollup type as obsolete |
| `verify-etherscan/` | Verify contracts on Etherscan |
| `aggchainFEPTools/` | AggchainFEP-specific operations |
| `aggLayerGatewayTools/` | AgglayerGateway operations |
| `createSovereignGenesis/` | Create sovereign chain genesis |
| `createSovereignGenesisWithHardhat/` | Create sovereign genesis using Hardhat |
| `compareGenesis/` | Compare genesis files |
| `upgradePreEtrogGenesis/` | Upgrade pre-Etrog genesis |
| `changeDelayTimelock/` | Change timelock delay |
| `batchL2DataCreatedRollup/` | Batch L2 data operations |
| `importOZInfoFromTag/` | Import OpenZeppelin proxy info from git tag |
| `checkScripts/` | Script validation |

## Shared Utilities

- `utils.ts` -- Common utility functions used across tools
