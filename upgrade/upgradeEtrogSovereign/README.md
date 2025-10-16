# Upgrade from Etrog to Sovereign

Script to create schedule and execute transaction for upgrading bridge L2 and GER L2 from etrog version to sovereign.

- `PolygonZkEVMBridgeV2` (Etrog) --> `AgglayerBridgeL2`
- `PolygonZkEVMGlobalExitRootL2` (Etrog) --> `AgglayerGERL2`

## Files

- `upgrade-etrog-to-sovereign.sh`: Bash script that runs prepare-manifest script + upgrade script 
- `upgradeEtrogToSovereign.ts`: Main upgrade script that deploys implementations and creates timelock operations
- `prepare-manifest.sh`: Bash script to get manifest for upgrade
- `force-import-old-contracts.th`: Used inside prepare-manifest 
- `test/shadowForkUpgrade.test.ts`: Shadow fork test validating all contract upgrades
- `upgrade_parameters.json`: Configuration parameters for the upgrade
- `upgrade_parameters.json.example`: Example configuration file
- `upgrade_output.json`: Generated output after running the upgrade script (created after execution)

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
- `CUSTOM_PROVIDER` - L2 `rpc-url` for upgrade

3. **Copy configuration files**

```bash
cp ./upgrade/upgradeEtrogSovereign/upgrade_parameters.json.example ./upgrade/upgradeEtrogSovereign/upgrade_parameters.json
```

4. **Local Balance Tree file**
You’ll need the path to a .json file containing the local balance tree in order to run the script and perform the upgrade.
This JSON file must include three arrays with the LBT information, structured as follows:
```
{
    "originNetwork": [ ... ],
    "originTokenAddress": [ ... ],
    "totalSupply": [ ... ]
}
```

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "bridgeL2": "0x..",
    "gerL2": "0x..",
    "pathJsonInitLBT": "path/init.json",
    "bridge_initiaizationParameters": {
        "bridgeManager": "0x..",
        "proxiedTokensManagerAddress": "0x..",
        "emergencyBridgePauserAddress": "0x..",
        "emergencyBridgeUnpauserAddress": "0x.."
    },
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
- `pathJsonInitLBT`: Path to JSON file with the local balance tree (to initialize the bridge)
- `bridge_initiaizationParameters`:
    - `bridgeManager`: Address of the bridge manager role
    - `proxiedTokensManagerAddress`: Address of the proxied tokens manager role
    - `emergencyBridgePauserAddress`: Address of the emergency bridge pauser role
    - `emergencyBridgeUnpauserAddress`: Address of the emergency bridge unpauser role
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

### All in a single command

> Important: Run this command from the project’s root directory.

Running the following command will:
```
./upgrade/upgradeEtrogSovereign/upgrade-etrog-to-sovereign.sh --old-tag v4.0.0-fork.7
```

- Generate the required manifest using the tag `v4.0.0-fork.7` (you can replace this with any tag you need) to prepare the upgrade.
- Create the manifest inside the folder: `upgrades/upgradeEtrogSovereign/manifest-from-*`.
- Copy that manifest automatically into the `./openzeppelin` folder in your project root.
- Execute the upgrade script, which will deploy the new implementations and output the timelock transactions needed for the upgrade.
- Afterwards, you can proceed to step 3 of the next section using that data.

### The steps separately
### 1. Prepare manifest
This command will generate the manifest in the `upgrades/upgradeEtrogSovereign/manifest-from-*` folder:

```bash
./upgrade/upgradeEtrogSovereign/prepare-manifest.sh --tag $TAG
```
You’ll need to copy this file into the ./openzeppelin folder at your project root.

### 2. Deploy Implementations

Once the manifest is correct, run the upgrade script to deploy new implementations and generate timelock operations:

```bash
npx hardhat run ./upgrade/upgradeEtrogSovereign/upgradeEtrogSovereign.ts --network custom
```

> Note that the network must change depending on which network the upgrade is being performed on

- `upgrade_output.json` with all deployment addresses and transaction data

### 3. Execute Upgrade

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

### 4. Validate Upgrade

Run the shadow fork test:

```bash
npx hardhat run ./upgrade/upgradeEtrogSovereign/test/shallowForkUpgrade.test.ts
```