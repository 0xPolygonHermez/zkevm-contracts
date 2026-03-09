# Solidity Coding Standards

## Compiler & Optimizer
- Primary Solidity version: 0.8.28
- Optimizer: enabled, 999999 runs
- EVM target: cancun (supports transient storage)
- Some legacy contracts use 0.8.20 (AgglayerTimelock, OZ v4 deps)

## Naming
- Always use Agglayer names, never legacy Polygon names
  - AgglayerManager (not PolygonRollupManager)
  - AgglayerBridge (not PolygonZkEVMBridgeV2)
  - AgglayerGER (not PolygonZkEVMGlobalExitRootV2)
  - AgglayerGateway
  - AgglayerTimelock (not PolygonZkEVMTimelock)

## Formatting (Prettier + Solidity plugin)
- Print width: 80 (Solidity)
- Tab width: 4
- Use tabs: false
- Single quotes: false (Solidity uses double quotes)
- Bracket spacing: false

## Linting (solhint)
- Extends: solhint:recommended
- func-visibility: warn (ignoring constructors)
- immutable-vars-naming: warn (not forced to UPPER_CASE)
- no-inline-assembly: off (inline assembly is allowed)
- compiler-version: off (multiple versions coexist)

## OpenZeppelin Versions
- Use `@openzeppelin/contracts4` / `contracts-upgradeable4` for contracts inheriting from legacy code
- Use `@openzeppelin/contracts5` / `contracts-upgradeable5` for newer contracts
- Use `@openzeppelin/contracts52` only for v5.2 features (e.g., ReentrancyGuardTransient)
- No migration plan -- use new libs on new contracts, keep old libs on existing contracts

## Storage Layout
- Upgradeable contracts MUST preserve storage layout from previous versions
- Legacy storage is preserved via `LegacyZKEVMStateVariables` and `LegacyAgglayerGERBaseStorage`
- Run `forge inspect <ContractName> storage` to check storage layout
- Full storage dump: `sh storage-layout.sh` -> `docs/storage_layout.txt`

## Deprecated -- Do NOT Modify
- FflonkVerifier contracts (deprecated)
- PolygonZkEVMDeployer (deprecated)
- PolygonZkEVMEtrog consensus (deprecated)
- PolygonPessimisticConsensus (deprecated)
- contracts/previousVersions/ (testing only)
