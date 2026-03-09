# Deploy Outpost Chain - Simplified Deployment

This script deploys all necessary contracts for an outpost chain using **standard deployments**. CREATE3 has been removed to simplify the deployment process.

## Overview

The script deploys the following contracts using standard OpenZeppelin Upgrades:

1. **ProxyAdmin** - Admin contract for managing proxy contracts
2. **TimelockController** - OpenZeppelin's standard timelock contract that owns the ProxyAdmin
3. **AggOracleCommittee** - _(Optional)_ Oracle committee for managing global exit root updates
4. **AgglayerBridgeL2** - Bridge contract for outpost chain (with proxy)
5. **AgglayerGERL2** - Global exit root manager (with proxy)

### Bridge Internal Contracts

The Bridge deployment involves 4 internal contracts that are automatically deployed:

**During Bridge Implementation Constructor (AgglayerBridge):**

- **WrappedTokenBytecodeStorer** - Stores the bytecode for wrapped token deployments (reduces bridge contract size)
- **WrappedTokenBridgeImplementation** - Implementation contract used as template for all wrapped tokens deployed via proxy pattern
- **BridgeLib** - Library contract containing bridge-related functions (reduces bridge contract size)

**During Bridge Initialization:**

- **WETH Token** - Wrapped ETH token specific to this outpost chain (deployed via `_deployWrappedToken()` if no `sovereignWETHAddress` is provided)


## Features

- ✅ **Standard Deployments**: Simple, straightforward contract deployments
- ✅ **Proxy Patterns**: Bridge, GER Manager, and AggOracleCommittee use transparent proxy pattern
- ✅ **Optional Oracle Committee**: Deploy AggOracleCommittee for decentralized global exit root management
- ✅ **Proper Governance**: Timelock contract owns the ProxyAdmin for secure upgrades
- ✅ **Automated Parameter Calculation**: Gas token address, network, and proxy manager auto-derived
- ✅ **Simplified Configuration**: Fewer manual parameters required for outpost setup
- ✅ **Comprehensive Validation**: Basic verification tests for all deployments
- ✅ **Structured Output**: Complete deployment information saved to JSON file
- ✅ **Logger Integration**: Detailed logging throughout the deployment process

## Deployment Strategy

### Standard OpenZeppelin Upgrades

All contracts are deployed using OpenZeppelin's upgrades framework:

- ✅ **TimelockController**: Deployed first as the governance timelock
- ✅ **ProxyAdmin**: Deployed with TimelockController as initial owner
- ✅ **AggOracleCommittee**: _(Optional)_ Deployed if `useAggOracleCommittee` is true
- ✅ **AgglayerBridgeL2**: Deployed with manual proxy deployment and separate initialization
- ✅ **AgglayerGERL2**: Deployed with atomic proxy initialization

### AggOracleCommittee Integration

When `useAggOracleCommittee` is enabled:

1. **AggOracleCommittee** is deployed with the pre-calculated GER Manager address
2. **AggOracleCommittee address** becomes the `globalExitRootUpdater` for the GER Manager
3. **Oracle members** can propose global exit roots that are consolidated when quorum is reached
4. **Ownership** of the AggOracleCommittee is set to the specified `aggOracleOwner`

**Without AggOracleCommittee:**

- `globalExitRootUpdater` from configuration is used directly

**With AggOracleCommittee:**

- `globalExitRootUpdater` from configuration **must not be set**
- AggOracleCommittee address automatically becomes the `globalExitRootUpdater`

### Circular Dependency Handling

Since Bridge and GER Manager reference each other, we use deterministic address pre-calculation:

1. **Pre-calculate Bridge address** using `ethers.getCreateAddress()` based on deployer address and nonce
2. **Deploy GER Manager** with the pre-calculated Bridge address
3. **Deploy Bridge** with the actual GER Manager address
4. **Verify addresses match** - confirms the pre-calculation was correct

**Technical Details:**

- Uses `deployer.getNonce()` to get current nonce
- Bridge proxy deploys at calculated nonce position
- Address verification ensures deterministic deployment worked correctly

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env
```

Fill `.env` with your `INFURA_PROJECT_ID`, `ETHERSCAN_API_KEY`, and other required variables.

3. Configure deployment parameters:

```bash
cp ./tools/deployOutpostChain/deploy_parameters.json.example ./tools/deployOutpostChain/deploy_parameters.json
```

## Configuration

The `deploy_parameters.json` file contains all deployment configuration grouped by category:

### Network Configuration

```json
{
    "network": {
        "chainID": 1001, // Unique chain identifier
        "rollupID": 1001, // Rollup identifier for gas token derivation
        "networkName": "OutpostChain",
        "tokenName": "Wrapped Ether",
        "tokenSymbol": "WETH",
        "tokenDecimals": 18
    }
}
```

**Automated Parameters:**

- 🤖 `gasTokenAddress`: **Auto-calculated** from `rollupID` by repeating it 5× to create a 160-bit address
- 🤖 `gasTokenNetwork`: **Auto-set** to the `chainID` value
- 🤖 `proxiedTokensManager`: **Auto-set** to the Timelock contract address (proxy owner)

**Note**: The `tokenName`, `tokenSymbol`, and `tokenDecimals` fields are automatically encoded into `gasTokenMetadata` using `abi.encode()` during deployment.

**Example Gas Token Address Derivation:**

```
rollupID: 1001 → hex: 0x000003e9 → repeated 5×: 0x000003e9000003e9000003e9000003e9000003e9
```

### Timelock Configuration

```json
{
    "timelock": {
        "timelockDelay": 3600,
        "timelockAdminAddress": "0x..."
    }
}
```

### Bridge Configuration

```json
{
    "bridge": {
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x..."
    }
}
```

**Note**: `proxiedTokensManager` is automatically set to the **Timelock contract address** during deployment to ensure proper governance control over proxy upgrades.

### Global Exit Root Configuration

```json
{
    "globalExitRoot": {
        "globalExitRootUpdater": "0x...", // Required ONLY if not using AggOracleCommittee
        "globalExitRootRemover": "0x..."
    }
}
```

### AggOracleCommittee Configuration _(Optional)_

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true, // Set to true to deploy AggOracleCommittee
        "aggOracleOwner": "0x...", // Owner of the AggOracleCommittee (usually timelock)
        "aggOracleMembers": [
            "0x...", // Oracle member 1
            "0x...", // Oracle member 2
            "0x..." // Oracle member N
        ],
        "quorum": 2 // Minimum number of oracle members needed to consolidate a GER
    }
}
```

**AggOracleCommittee Parameters:**

- **`useAggOracleCommittee`**: Boolean flag to enable/disable AggOracleCommittee deployment
- **`aggOracleOwner`**: Address that will own the AggOracleCommittee contract (can add/remove members, change quorum)
- **`aggOracleMembers`**: Array of addresses that can propose global exit roots
- **`quorum`**: Minimum number of oracle members that must vote for a GER to be consolidated

**Important Constraints:**

- ✅ `quorum` must be ≥ 1 and ≤ number of `aggOracleMembers`
- ✅ All `aggOracleMembers` addresses must be unique and valid
- ✅ When `useAggOracleCommittee` is `true`, **do not set** `globalExitRootUpdater`
- ✅ When `useAggOracleCommittee` is `false`, `globalExitRootUpdater` **is required**

## Usage

### Deploy contracts

```bash
npx hardhat run tools/deployOutpostChain/deployOutpostChain.ts --network <your_network>
```

### Expected Output

**Console Logs:**

```bash
🚀 Starting Outpost Chain deployment...
✅ All mandatory parameters validated

Deploying with address: 0x1234567890123456789012345678901234567890
Network: OutpostChain (Chain ID: 1001)
Rollup ID: 1001
🤖 Auto-calculated gas token address: 0x000003e9000003e9000003e9000003e9000003e9
🤖 Auto-calculated gas token network: 1001 (using chainID)
🤖 Auto-calculated proxied tokens manager: timelock address (set during deployment)

=== Step 1: Deploying TimelockController (OpenZeppelin) ===
✅ TimelockController (OpenZeppelin) deployed: 0xTimelockAddress123...

=== Step 2: Deploying ProxyAdmin with Timelock as owner ===
✅ ProxyAdmin deployed with Timelock as owner: 0xProxyAdminAddress...

=== Step 2.5: Deploying AggOracleCommittee ===
✅ AggOracleCommittee implementation deployed: 0xAggOracleImplementation...
✅ AggOracleCommittee proxy deployed and initialized: 0xAggOracleAddress789...
✅ Using AggOracleCommittee as globalExitRootUpdater: 0xAggOracleAddress789...

=== Step 3: Pre-calculating Bridge proxy address ===
📍 Pre-calculated Bridge proxy address: 0xPreCalculatedAddress...

=== Step 4: Deploying AgglayerGERL2 ===
✅ AgglayerGERL2 proxy (initialized): 0xGERManagerAddress...

=== Step 5: Deploying AgglayerBridgeL2 ===
🧮 Derived gas token address from rollupID 1001: 0x000003e9000003e9000003e9000003e9000003e9
✅ AgglayerBridgeL2 proxy (initialized): 0xPreCalculatedAddress...

=== Step 5.1: Verifying address prediction ===
✅ Address prediction successful! Bridge deployed at expected address: 0xPreCalculatedAddress...

🎉 Deployment completed successfully!
```

**The script will:**

1. ✅ Validate all deployment parameters (including AggOracleCommittee if enabled)
2. ✅ Deploy TimelockController contract
3. ✅ Deploy ProxyAdmin contract with Timelock as owner
4. ✅ Deploy AggOracleCommittee _(if enabled)_ and use it as globalExitRootUpdater
5. ✅ Pre-calculate Bridge proxy address using nonce prediction
6. ✅ Deploy AgglayerGERL2 with appropriate globalExitRootUpdater
7. ✅ Deploy AgglayerBridgeL2 with actual GER Manager address
8. ✅ Verify actual Bridge address matches pre-calculated address
9. ✅ Run verification tests (including AggOracleCommittee if deployed)
10. ✅ Generate deployment output JSON

### Output File

A JSON file `deploy_output_YYYY-MM-DD_HH-MM-SS.json` will be created with all deployment information:

**Without AggOracleCommittee:**

```json
{
    "deploymentDate": "2024-01-01 14:30:25",
    "network": {
        "chainID": 1001,
        "rollupID": 1001,
        "networkName": "OutpostChain",
        "gasTokenAddress": "0x000003e9000003e9000003e9000003e9000003e9",
        "gasTokenNetwork": 1001
    },
    "contracts": {
        "proxyAdminAddress": "0x...",
        "timelockAddress": "0x...",
        "bridgeL2SovereignChainAddress": "0x...",
        "bridgeL2SovereignChainImplementation": "0x...",
        "globalExitRootManagerL2SovereignChainAddress": "0x...",
        "globalExitRootManagerL2SovereignChainImplementation": "0x...",
        "wrappedTokenBytecodeStorer": "0x...",
        "wrappedTokenBridgeImplementation": "0x...",
        "WETH": "0x..."
    },
    "configuration": {
        "timelockDelay": 3600,
        "timelockAdmin": "0x...",
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x...",
        "globalExitRootUpdater": "0x...", // From configuration
        "globalExitRootRemover": "0x..."
    }
}
```

**With AggOracleCommittee:**

```json
{
    "deploymentDate": "2024-01-01 14:30:25",
    "network": {
        "chainID": 1001,
        "rollupID": 1001,
        "networkName": "OutpostChain",
        "gasTokenAddress": "0x000003e9000003e9000003e9000003e9000003e9",
        "gasTokenNetwork": 1001
    },
    "contracts": {
        "proxyAdminAddress": "0x...",
        "timelockAddress": "0x...",
        "aggOracleCommitteeAddress": "0x...", // Added when AggOracleCommittee is deployed
        "aggOracleCommitteeImplementation": "0x...", // Added when AggOracleCommittee is deployed
        "bridgeL2SovereignChainAddress": "0x...",
        "bridgeL2SovereignChainImplementation": "0x...",
        "globalExitRootManagerL2SovereignChainAddress": "0x...",
        "globalExitRootManagerL2SovereignChainImplementation": "0x...",
        "wrappedTokenBytecodeStorer": "0x...",
        "wrappedTokenBridgeImplementation": "0x...",
        "WETH": "0x..."
    },
    "configuration": {
        "timelockDelay": 3600,
        "timelockAdmin": "0x...",
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x...",
        "globalExitRootUpdater": "0x...", // AggOracleCommittee address (automatically used)
        "globalExitRootRemover": "0x...",
        "aggOracleCommittee": {
            // Added when AggOracleCommittee is deployed
            "useAggOracleCommittee": true,
            "aggOracleOwner": "0x...",
            "aggOracleMembers": ["0x...", "0x..."],
            "quorum": 2
        }
    }
}
```

## AggOracleCommittee Usage

### When to Use AggOracleCommittee

Use AggOracleCommittee when you want:

- **Decentralized GER Management**: Multiple oracle members can propose global exit roots
- **Consensus-Based Updates**: Require quorum of oracle members to consolidate GERs
- **Governance Control**: Owner can add/remove oracle members and adjust quorum
- **Security**: Prevents single point of failure for global exit root updates

### How AggOracleCommittee Works

1. **Oracle Members** call `proposeGlobalExitRoot(bytes32 ger)` to vote for a GER
2. **Quorum Reached**: When enough members vote for the same GER, it's automatically consolidated
3. **GER Consolidation**: The GER is sent to the AgglayerGERL2
4. **Owner Management**: Contract owner can add/remove members and change quorum

### Configuration Examples

**Simple 1-of-1 Oracle:**

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true,
        "aggOracleOwner": "0xTimelock...",
        "aggOracleMembers": ["0xOracle1..."],
        "quorum": 1
    }
}
```

**Multi-signature 2-of-3 Oracle:**

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true,
        "aggOracleOwner": "0xTimelock...",
        "aggOracleMembers": ["0xOracle1...", "0xOracle2...", "0xOracle3..."],
        "quorum": 2
    }
}
```

For additional support, check the deployment logs and output JSON file for detailed information about each deployed contract.
