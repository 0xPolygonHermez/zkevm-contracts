# Update rollup
Script to deploy call `updateRollup` function in the `PolygonRollupManager.sol` smart contract.

## Install
```
npm i
```

## Setup
### updateRollup
- Config file
  - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
  - `polygonRollupManagerAddress`: `PolygonRollupManager.sol` SC address
  - `timelockDelay (optional)`: at least it should be the minimum delay of the timelock smart contract
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
- A network should be selected when running the script
  - examples: `-- sepolia` or `--mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
  - `rollups`, array where for each rollup:
    - `rollupAddress`: rollup address of the rollup that is going to be updated
    - `newRollupTypeID`: select which is the `rollupTypeID` to upgrade
    - `upgradeData`: data necessary to perform the upgrade (default to `0x`)
> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'updateRollup'
- Copy configuration file:
```
cp ./tools/updateRollup/updateRollup.json.example ./tools/updateRollup/updateRollup.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/updateRollup/updateRollup.ts --network <network>
```

### 'updateRollup'  from an EOA

Running the tool, the updateRollup transaction will be sent directly

### 'updateRollup'  Multisig

- Output: Transaction to update the rollup

### Generate 'updateRollup' data to the Timelock SC
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/updateRollup/updateRollup.ts --network <network>
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait `timelockDelay` and then send `executeData` to timelock address
