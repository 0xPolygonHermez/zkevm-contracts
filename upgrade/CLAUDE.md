# upgrade/

Upgrade scripts for Agglayer contracts. Each subdirectory targets a specific version or component upgrade.

## Current (Active) Upgrade Scripts

| Directory                        | Target                                          |
| -------------------------------- | ----------------------------------------------- |
| `upgradeEtrogSovereign/`         | Etrog to Sovereign chain upgrade (L2 contracts) |
| `upgradeSovereignBridge-v1.2.0/` | Sovereign bridge v1.2.0 to modular v1.3.0 (L2)  |

Most other directories are historical and should be cleaned up.

## Upgrade Scripts (Historical)

These are kept for reference but are not actively used:

`upgradeToV2/`, `upgradeV3/`, `upgradeV12/`, `fullUpgradeV12/`, `upgradePessimistic/`, `upgradePessimisticV2/`, `upgradeSovereign/`, `upgradeSovereignV2/`, `upgradeGERToSovereign/`, `upgradeSbridge1011/`, `upgrade-sbridge-10.1.2/`, `upgrade-rollupManager-v0.3.1/`, `upgradeBanana/`, `importOZState/`, `tool-regen-upgrade-info/`

## Shared Files

- `utils.ts` -- Shared upgrade utilities
- `arguments.js` -- Upgrade constructor arguments
- `bridgeUpgradeUtils.ts`, `bridgeFork.ts` -- Checked proxy/timelock preparation and local fork execution
- `previousVersions/bridge/` -- Frozen Solidity sources and compiler snapshots used by bridge upgrade tests

## Proxy Pattern

Core contracts (AgglayerManager, AgglayerBridge, AgglayerGER, AgglayerGateway) use `PolygonTransparentProxy` (slightly modified OZ transparent proxy).

Chain/aggchain contracts are also deployed as `PolygonTransparentProxy` by AgglayerManager and upgraded via `AgglayerManager.updateRollup()`.

AgglayerTimelock is NOT upgradeable.

## Storage Layout Preservation

Upgradeable contracts inherit legacy storage base contracts to preserve slot positions from previous contracts deployed at the same addresses:

- `LegacyZKEVMStateVariables` -- for AgglayerManager
- `LegacyAgglayerGERBaseStorage` -- for AgglayerGER

Storage layouts can be inspected:

- `forge inspect <ContractName> storage`
- `sh storage-layout.sh` (output: `docs/storage_layout.txt`)

## Notes

- The bridge shared-storage refactor preserves the L1 layout; no L1 bridge upgrade is required
- L2 sovereign chain contract upgrades use the active scripts listed above
- Upgrades go through the AgglayerTimelock (3 days delay on mainnet, 0 during emergency)
