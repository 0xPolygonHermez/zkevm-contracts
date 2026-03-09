# Upgrade Sovereign Bridge

Script to create schedule and execute transaction for upgrading bridge L2 to sovereign version.

- `BridgeL2SovereignChain` (or previous version) --> `AgglayerBridgeL2`

## Files

- `upgradeSovereignBridge.ts`: Main upgrade script that deploys implementations and creates timelock operations
- `upgrade_parameters.json`: Configuration parameters for the upgrade
- `upgrade_parameters.json.example`: Example configuration file
- `upgrade_output.json`: Generated output after running the upgrade script (created after execution)
- `test/shadowForkUpgrade.test.ts`: Fork test to validate the upgrade on a forked network before mainnet execution

## Prerequisites

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
cp ./upgrade/upgradeSovereignBridge/upgrade_parameters.json.example ./upgrade/upgradeSovereignBridge/upgrade_parameters.json
```

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "bridgeL2Address": "0x.."
}
```

### Parameters Description

#### Mandatory Parameters

- `bridgeL2Address`: Address of the bridge proxy on L2

#### Optional Parameters

- `timelockSalt`: Unique salt for timelock operations (defaults to ethers.ZeroHash)
- `timelockDelay`: Timelock delay in seconds (defaults to minimum timelock delay)
- `forceImport`: Boolean flag to force import the hardhat manifest for contracts deployed in L2 genesis (default: false)
- `maxFeePerGas`: Maximum fee per gas unit (optional, for EIP-1559 transactions)
- `maxPriorityFeePerGas`: Maximum priority fee per gas (optional, for EIP-1559 transactions)
- `multiplierGas`: Gas multiplier with 3 decimals (e.g., "1500" for 1.5x)
- `unsafeMode`: Boolean flag to disable critical tooling checks (default: false, ⚠️ only for development/testing)

## Version Check

The upgrade script performs a version check before proceeding to ensure compatibility. The script will only run if the current bridge contract is on one of the following versions:

- `v1.0.0`
- `v1.1.0`
- `v1.2.0`

Alternatively, if the contract uses the legacy `BRIDGE_SOVEREIGN_VERSION()` method instead of `version()`, it must return `v10.1.2`.

> ⚠️ If your bridge contract is not on one of these versions, the script will fail with an error. Make sure your contract is on a compatible version before running the upgrade.

## Usage

### 1. Deploy Implementations

Run the upgrade script to deploy new implementations and generate timelock operations:

```bash
npx hardhat run ./upgrade/upgradeSovereignBridge/upgradeSovereignBridge.ts --network <network>
```

> Note that the network must change depending on which network the upgrade is being performed on
> Example network: polygonZKEVMTestnet, custom, etc.

- `upgrade_output.json` with all deployment addresses and transaction data

### 2. Execute Upgrade

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
    "forceImport": false,
    "unsafeMode": true,
    "forkParams": {
        "rpc": "https://your-l2-rpc-endpoint.com",
        "timelockAdminAddress": "0x..."
    }
}
```

**Fork Parameters:**

- `rpc`: RPC endpoint of the network to fork
- `timelockAdminAddress`: Address with `PROPOSER_ROLE` and `EXECUTOR_ROLE` on the timelock contract

#### Running the Fork Test

```bash
npx hardhat run ./upgrade/upgradeSovereignBridge/test/shadowForkUpgrade.test.ts
```

#### What the Fork Test Does

1. Forks the network at the block where the implementation was deployed
2. Verifies the timelock configuration and roles
3. Impersonates the timelock admin account
4. Sends the schedule transaction
5. Fast-forwards time to bypass the timelock delay
6. Sends the execute transaction
7. Validates the bridge version upgraded correctly
8. Verifies storage values are preserved after upgrade

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
