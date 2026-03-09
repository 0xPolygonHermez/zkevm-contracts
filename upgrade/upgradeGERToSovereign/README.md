# Upgrade from Etrog to Sovereign

Script to create schedule and execute transaction for upgrading GER L2 from etrog version to sovereign.

- `PolygonZkEVMGlobalExitRootL2` (Etrog) --> `AgglayerGERL2`

## Files

- `upgradeGERToSovereign.ts`: Main upgrade script that deploys implementations and creates timelock operations
- `test/shadowForkUpgrade.test.ts` - Shadow fork test validating all contract upgrades
- `upgrade_parameters.json` - Configuration parameters for the upgrade
- `upgrade_parameters.json.example` - Example configuration file
- `upgrade_output.json` - Generated output after running the upgrade script (created after execution)

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

- `ETHERSCAN_API_KEY` - For contract verification
- `DEPLOYER_PRIVATE_KEY` - Private key for deployment account
- `INFURA_PROJECT_ID` - For network access (if using Infura)

If you're going to use an RPC that isn't in the `hardhat.config`, you can set the following variable for the RPC and run the Hardhat command with `--network custom`:
- `CUSTOM_PROVIDER` - L2 `rpc-url` for upgrade


3. **Copy configuration files**

```bash
cp ./upgrade/upgradeGERToSovereign/upgrade_parameters.json.example ./upgrade/upgradeGERToSovereign/upgrade_parameters.json
```

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "bridgeL2": "0x..",
    "gerL2": "0x..",
    "ger_initiaizationParameters": {
        "globalExitRootUpdater": "0x..",
        "globalExitRootRemover": "0x.."
    },
    "forkParams": {
        "rpc": "rpc url",
        "timelockAdminAddress": "0x.."
    }
}
```

### Parameters Description

#### Mandatory Parameters

- `bridgeL2`: Address of the bridge proxy on L2
- `gerL2`: Address of the ger proxy on L2
- `ger_initiaizationParameters`:
    - `globalExitRootUpdater`: Address of the GER updater role
    - `globalExitRootRemover`: Address of the GER remover role


#### Optional Parameters

- `timelockSalt`: Unique salt for timelock operations (defaults to ethers.ZeroHash)
- `maxFeePerGas`: Maximum fee per gas unit (optional, for EIP-1559 transactions)
- `maxPriorityFeePerGas`: Maximum priority fee per gas (optional, for EIP-1559 transactions)
- `multiplierGas`: Gas multiplier with 3 decimals (e.g., "1500" for 1.5x)
- `timelockAdminAddress`: Address with timelock admin privileges (auto-detected if not provided)
- `unsafeMode`: Boolean flag to disable critical tooling checks (default: false, ⚠️ only for development/testing)

#### Fork Parameters (for testing)

- `forkParams.rpc`: RPC URL for shadow fork testing
- `forkParams.timelockAdminAddress`: timelock administrator address (proposer and executor address, to send transactions)

## Usage

### 1. Deploy Implementations

Run the upgrade script to deploy new implementations and generate timelock operations:

```bash
npx hardhat run ./upgrade/upgradeGERToSovereign/upgradeGERToSovereign.ts --network <network>
```

> Note that the network must change depending on which network the upgrade is being performed on
> Example network: polygonZKEVMTestnet, custom, etc.

- `upgrade_output.json` with all deployment addresses and transaction data

### 2. Execute Upgrade

After running the deployment script:

1. **Schedule the batch upgrade:**

    ```bash
    # Use the scheduleData from upgrade_output.json
    # Send transaction to timelock contract
    ```

2. **Wait for timelock delay:**

    ```bash
    # Wait for the configured timelockDelay period
    # Monitor the timelock contract for readiness
    ```

3. **Execute the batch upgrade:**
    ```bash
    # Use the executeData from upgrade_output.json
    # Send transaction to timelock contract
    ```

### 3. Validate Upgrade

Run the shadow fork test:

```bash
npx hardhat run ./upgrade/upgradeGERToSovereign/test/shadowForkUpgrade.test.ts
```