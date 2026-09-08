# Upgrade Sovereign Bridge From v1.2.0

Prepare a checked `AgglayerBridgeL2 v1.2.0 -> v1.3.0` upgrade without changing the proxy address or its ABI.

The directory suffix identifies the **source** version. The new modular implementation returns `v1.3.0`.

The deployed L1 `AgglayerBridge` does not need an upgrade. Its shared-storage refactor preserves the existing layout; L1 source and local compatibility tests are retained solely to verify that invariant. Only L2 operational upgrade tooling is provided for this change.

## Modular Bridge

The bridge keeps every existing function, parameter name, return type, mutability, event, and error in its compiled ABI. Explicit forwarding functions delegate L2 management and recovery operations to `AgglayerBridgeL2Module`; ordinary bridging, claims, initialization, and getters remain on the implementation. Etherscan Read/Write as Proxy therefore uses the same complete ABI after verification and proxy implementation detection.

The implementation constructor deploys the module and embeds its address as an immutable. There is no selector registry, fallback-only interface, storage migration, new proxy storage slot, or separately upgradeable module. Module changes require a normal timelocked bridge implementation upgrade. Direct calls to module mutators revert. Delegatecall preserves the proxy storage, original caller, and event emitter; it adds gas overhead to delegated operations.

Shared `AgglayerBridgeStorage` and `AgglayerBridgeL2Storage` declarations preserve the original field order, packing, and reserved gaps. The frozen baseline is `../previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json`: it contains the original Solidity sources and transitive imports, Solidity standard JSON input and compiler version, ABI, deployment/runtime bytecode, immutable references, and storage layout. Existing historical Solidity files are not modified. The baseline must never be regenerated from the new implementation.

Hardhat 0.8.28, Shanghai, optimizer runs 9:

| Component              | Runtime Bytes | Initcode Bytes |
| ---------------------- | ------------: | -------------: |
| Archived v1.2.0 bridge |        24,441 |         37,494 |
| Modular v1.3.0 bridge  |        19,150 |         44,210 |
| Module                 |        11,597 |         11,934 |

The bridge gains 5,291 runtime bytes, leaving 5,426 bytes below EIP-170. Constructor-deploying the module still counts toward EIP-3860: the bridge has 4,942 bytes of initcode headroom. Both limits are checked; modularization does not remove EVM limits. A future larger split may require separately deployed module addresses as deployment parameters.

Run local checks before preparing an upgrade:

```bash
npx hardhat run tools/bridgeCompatibility/checkBridge.ts --network hardhat
npx hardhat test test/contractsv2/AgglayerBridgeL2Compatibility.test.ts test/contractsv2/BridgeUpgradeTooling.test.ts
```

Tests compare the exact ABI, OpenZeppelin-compatible layout, and identical bridge/module storage. They compile the preserved Solidity files, deploy those previous implementations, populate proxy state, upgrade without initialization, check fixed slots and populated mappings, test permissions and events, and roll back. Production-bytecode tests run outside coverage because coverage deliberately instruments bytecode.

### Saved L1 and L2 Versions

Both original contracts and all their dependencies are explicitly preserved under `upgrade/previousVersions/bridge/`:

- `contracts/AgglayerBridge.sol`: the complete original L1 `v1.1.0` Solidity implementation.
- `contracts/sovereignChains/AgglayerBridgeL2.sol`: the complete original L2 `v1.2.0` Solidity implementation, inheriting the preserved L1 source, not the current contract.
- All original `contracts/` and `@openzeppelin/` imports are stored beside those files with their original paths.
- `snapshots/AgglayerBridge.v1.1.0.json` and `snapshots/AgglayerBridgeL2.v1.2.0.json`: compiler input, ABI, bytecode, immutable references, and storage-layout baselines. L1 uses optimizer runs 100; L2 uses runs 9. Both use Solidity 0.8.28 and Shanghai.

`tools/bridgeCompatibility/previousVersions.ts` reads these `.sol` files from disk and compiles them with Hardhat's Solidity compiler tasks. Tests use the resulting factories and layouts. The JSON bytecodes are only reproducibility assertions: both creation and runtime bytecode must match exactly. The frozen sources are outside the current production source directory to avoid duplicate contract names and changing their original import paths.

`tools/bridgeCompatibility/archivePreviousBridge.ts` can verify or recreate the saved source tree from the immutable archive. It refuses to overwrite differing files. Do not replace a previous-version contract with an alias inheriting current code.

Run all targeted unit and local upgrade tests together:

```bash
npm run test:bridge-upgrade
```

- `BridgeStorageCompatibility.test.ts` verifies both original ABIs and physical layouts, plus the L1 storage prefix in L2 and its module. Negative tests reject shifted slots, changed packed offsets, mapping value changes, nested struct offsets, dynamic-byte type changes, and invalid gap shrinkage for each bridge.
- `AgglayerBridgeCompatibility.test.ts` deploys the compiled previous L1 Solidity behind a local transparent proxy. Ether and custom-gas cases compare all fixed slots, reserved gaps, dynamic metadata words, claimed bitmap entries, wrapper mappings, balances, roles, emergency state, and roots across the upgrade. Existing wrapped tokens remain usable after upgrading and rolling back. L1's `version()` remains `v1.1.0` because its behavior is unchanged; the implementation address is checked to prove the upgrade actually occurred.
- `AgglayerBridgeL2Compatibility.test.ts` exercises the archived L2 proxy upgrade and rollback with populated LBT, token mappings, claim hash chains, nullifiers, roles, and emergency state.
- `BridgeUpgradeTooling.test.ts` validates read-only preflight and the local timelock schedule/execute workflow.

These tests use the local in-process Hardhat chain, require no external RPC or credentials, and are also selected by the normal contract coverage command. Production-bytecode checks are intentionally skipped only during coverage instrumentation.

`npm run test:bridge-fork` runs the additional `test/upgrade/BridgeForkUpgrade.test.ts` suite. It starts an isolated local RPC, deploys the preserved L2 Solidity implementation, forks that RPC, and executes the L2 fork runner. It verifies that the source RPC receives no writes and that unsafe networks, wrong chain IDs, unpinned blocks, and missing governance roles are rejected. No external RPC or private key is needed for this integration test.

### Test Inventory

New files added for this change:

| File                                                     | Cases | Purpose                                                                                      |
| -------------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------- |
| `test/contractsv2/BridgeStorageCompatibility.test.ts`    |    19 | Original source compilation, exact ABI/layout, shared storage, incompatible-layout rejection |
| `test/contractsv2/AgglayerBridgeCompatibility.test.ts`   |     2 | L1 populated upgrade and rollback with Ether/custom gas                                      |
| `test/contractsv2/AgglayerBridgeL2Compatibility.test.ts` |     6 | L2 upgrade, rollback, ABI/layout, module isolation, bytecode budgets                         |
| `test/contractsv2/BridgeUpgradeTooling.test.ts`          |     4 | L2 preflight and timelock execution                                                          |
| `test/upgrade/BridgeForkUpgrade.test.ts`                 |     5 | L2 RPC-fork rehearsal and safety guards                                                      |

Existing tests modified:

- `test/contractsv2/BridgeL2SovereignChain.test.ts`: expected L2 version changed to `v1.3.0`; existing behavior assertions remain.
- `test/contractsv2/AgglayerBridgeL2FromEtrogUpgrade.test.ts`: expected target L2 version changed to `v1.3.0`.
- `upgrade/upgradeSovereignBridge/test/shadowForkUpgrade.test.ts`: moved to this versioned directory and strengthened with source-chain, implementation/module bytecode, timelock, and full fixed-storage checks. It still validates a previously prepared live deployment output.

## Files

- `upgradeSovereignBridge.ts`: Main upgrade script that deploys implementations and creates timelock operations
- `upgrade_parameters.json`: Configuration parameters for the upgrade
- `upgrade_parameters.json.example`: Example configuration file
- `upgrade_output.json`: Generated output after running the upgrade script (created after execution)
- `test/shadowForkUpgrade.test.ts`: Fork test to validate the upgrade on a forked network before mainnet execution
- `bridgeUpgrade.ts`: Shared read-only preflight, bytecode/layout checks, and timelock encoding
- `verifyBridge.ts`: Hardhat explorer verification of the implementation and immutable module
- `forkAndUpgrade.ts`: Fork a pinned source block, deploy the new implementation locally, execute the timelock upgrade, and compare state without any prior live deployment

## Prerequisites

Hardhat `>=2.28.4` within major version 2 is required. Version 2.28.4 fixes the upstream `hardhat_reset` local-to-fork bug; the package lock records this patch. Solidity compiler versions and optimizer settings are unchanged.

### Environment Setup

1. **Install packages**

```bash
npm i
```

2. **Set environment variables**

```bash
cp .env.example .env
```

Fill `.env` with your credentials:

- `DEPLOYER_PRIVATE_KEY` - Private key for deployment account
- `CUSTOM_PROVIDER` - L2 `rpc-url` for upgrade (if using custom network)

3. **Copy configuration files**

```bash
cp ./upgrade/upgradeSovereignBridge-v1.2.0/upgrade_parameters.json.example ./upgrade/upgradeSovereignBridge-v1.2.0/upgrade_parameters.json
```

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "bridgeL2Address": "0x..",
    "expectedChainId": "REPLACE_WITH_L2_CHAIN_ID",
    "expectedBridgeVersion": "v1.2.0",
    "deployImplementation": false
}
```

### Parameters Description

#### Mandatory Parameters

- `bridgeL2Address`: Address of the bridge proxy on L2
- `expectedChainId`: Expected L2 chain ID, checked against the provider before any deployment

#### Optional Parameters

- `expectedBridgeVersion`: Expected current version (defaults to `v1.2.0`)
- `deployImplementation`: Explicit deployment opt-in (default: false, read-only preflight)
- `timelockSalt`: bytes32 operation salt (defaults to a hash of chain, proxy, old implementation, and target version)
- `timelockDelay`: Timelock delay in seconds (defaults to minimum timelock delay)
- `forceImport`: Obsolete; no proxy manifest is needed because deployed bytecode is matched against the archived baseline and its layout is validated directly
- `maxFeePerGas`: Maximum fee per gas unit (optional, for EIP-1559 transactions)
- `maxPriorityFeePerGas`: Maximum priority fee per gas (optional, for EIP-1559 transactions)
- `multiplierGas`: Gas multiplier with 3 decimals (e.g., "1500" for 1.5x)
- `unsafeMode`: Boolean flag to disable critical tooling checks (default: false, ⚠️ only for development/testing)

## Version Check

The direct modular upgrade accepts only `version() == "v1.2.0"` and runtime bytecode matching the frozen Hardhat baseline, masking only compiler-declared immutable address locations. Unknown versions, already-upgraded `v1.3.0`, and different builds with the same version string are rejected. There is no catch-all fallback to a legacy version getter.

Older `v1.0.0`, `v1.1.0`, `v10.1.2`, and Etrog deployments need their separately validated migration path or a separately archived and tested source baseline. They are not automatically considered compatible with this upgrade. Git `unsafeMode` never bypasses ABI, storage, chain ID, or bytecode checks.

The script reads the EIP-1967 admin from the target proxy and verifies the admin controls that proxy and is owned by a timelock. It supports the existing OZ v4 `ProxyAdmin.upgrade(address,address)` path, not direct EOA admins or OZ v5 `upgradeAndCall`-only admins. An upgrade uses no reinitializer and changes no bridge storage.

## Usage

### Fork and Upgrade Locally

Configure `bridgeL2Address`, `expectedChainId`, and `forkParams.rpc`, `forkParams.blockNumber`, and `forkParams.timelockAdminAddress` in the parameters file. `blockNumber` must be a positive JSON integer. Keep `deployImplementation: false` for the live preparation tool; the fork runner always deploys only locally.

```bash
npm run fork:upgrade-l2-bridge
```

This command checks the source chain ID and pinned block, forks onto the in-process Hardhat network, creates a local block for custom-chain reads, checks the original bytecode and layout, deploys the new implementation/module on the fork, impersonates the proposer/executor locally, schedules and executes after the timelock delay, then compares state. It checks all fixed storage slots, gas metadata storage words, selected mapping slots, roots, balances, and the proxy admin.

The result is `fork_upgrade_output.json` with `simulationOnly: true`. Those addresses exist only on the disposable fork and must not be used in live timelock transactions. No source-chain signer or funds are required. The runner rejects `--network mainnet`, `custom`, and other live networks. It does not need `upgrade_output.json`.

### 1. Preflight and Deploy

Run with `deployImplementation: false` first. This performs only local validation and on-chain reads; it does not need a funded signer:

```bash
npx hardhat run ./upgrade/upgradeSovereignBridge-v1.2.0/upgradeSovereignBridge.ts --network <network>
```

> Note that the network must change depending on which network the upgrade is being performed on
> Example network: polygonZKEVMTestnet, custom, etc.

After reviewing the target network and preflight report, set `deployImplementation: true` and rerun to deploy the implementation and its module. This step sends a deployment transaction, but never schedules or executes the bridge upgrade. Leave `unsafeMode: false` for production release checks.

The output records source/target versions, chain ID, old/new implementation addresses and code hashes, immutable module address/code hash, proxy admin, timelock, delay, salt, operation ID, deployment block, and schedule/execute calldata. An existing output file is never overwritten; archive it first. No private keys or RPC credentials are written to output.

Verify the new contracts on the target explorer before scheduling:

```bash
npx hardhat run upgrade/upgradeSovereignBridge-v1.2.0/verifyBridge.ts --network <network>
```

After execution, let the explorer refresh the proxy implementation or use its Verify Proxy flow. The verified implementation contains all existing named entrypoints; no separate module ABI is needed for user interaction. Explorer API credentials and network support must be configured independently.

### 2. Execute Upgrade After Fork Validation

After running the deployment script:

1. **Schedule the upgrade:**

    ```bash
    # Use the scheduleData from upgrade_output.json
    # Send transaction to timelock contract
    ```

2. **Wait for timelock delay:**

    ```bash
    # Wait for the configured timelockDelay period
    # Monitor the timelock contract for readiness
    ```

3. **Execute the upgrade:**
    ```bash
    # Use the executeData from upgrade_output.json
    # Send transaction to timelock contract
    ```

### 3. Validate Upgrade (Fork Test)

Before executing on mainnet, you can validate the upgrade using a shadow fork test. This simulates the full upgrade process on a forked network.

#### Fork Test Configuration

Add `forkParams` to your `upgrade_parameters.json`:

```json
{
    "bridgeL2Address": "0x..",
    "expectedChainId": "REPLACE_WITH_L2_CHAIN_ID",
    "expectedBridgeVersion": "v1.2.0",
    "deployImplementation": false,
    "unsafeMode": false,
    "forkParams": {
        "rpc": "https://your-l2-rpc-endpoint.com",
        "blockNumber": 123456,
        "timelockAdminAddress": "0x...",
        "storageSlots": []
    }
}
```

**Fork Parameters:**

- `rpc`: RPC endpoint of the network to fork
- `blockNumber`: Pinned source block for `forkAndUpgrade.ts`; replace the example with a real block where the old proxy exists. The prepared-output shadow test instead uses the saved deployment block.
- `timelockAdminAddress`: Address with `PROPOSER_ROLE` and `EXECUTOR_ROLE` on the timelock contract
- `storageSlots`: Optional additional mapping/dynamic storage slots to compare, encoded as hex. Fixed slots, all reserved gaps, tree root, gas-token metadata, and bridge ETH balance are always compared. Enumerating every historical mapping entry requires chain-specific keys.

#### Running the Fork Test

```bash
npx hardhat run ./upgrade/upgradeSovereignBridge-v1.2.0/test/shadowForkUpgrade.test.ts
```

#### What the Fork Test Does

1. Checks the source chain and forks at the implementation deployment block; a failed fork aborts immediately
2. Verifies the timelock configuration and roles
3. Impersonates the timelock admin account
4. Sends the schedule transaction
5. Fast-forwards time to bypass the timelock delay
6. Sends the execute transaction
7. Validates the bridge version upgraded correctly
8. Verifies all fixed bridge storage slots and selected mapping slots, tree root, dynamic metadata, and ETH balance are preserved

This script must run with the default local `hardhat` network, never `--network custom`. It impersonates governance only on the local fork. A target RPC and governance address are required; local tests are not a substitute for this chain-specific fork or independent security review.

#### Expected Output

```
Shadow forking https://your-l2-rpc-endpoint.com
Shadow forked block number: <block_number>
✓ Proxy admin owner matches timelock address from upgrade output
✓ Proposer/executor timelock role address: 0x...
✓ Funded proposer account 0x...
Bridge version before upgrade: <current_version>
✓ Retrieved storage values before upgrade
✓ Sent schedule transaction
✓ Increased time by <delay> seconds to bypass timelock delay
✓ Sent execute transaction
  Transaction hash: 0x...
  Block number: <block_number>
✓ Bridge version after upgrade: <new_version>
============================================================
Shadow fork upgrade test completed successfully!
============================================================
```
