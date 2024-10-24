# Update rollup
Script to deploy call `updateRollup` function in the `PolygonRollupManager.sol` smart contract

## Install
```
npm i
```

## Setup
- Config file
  - `rollupAddress`: rollup address of the rollup that is going to be updated
  - `newRollupTypeID`: select which is the `rollupTypeID` to upgrade
  - `upgradeData`: data necessary to perform the upgrade (default to `0x`)
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
> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'addNewRollupType' from an EOA
- Copy configuration file:
```
cp ./tools/updateRollup/updateRollup.json.example ./tools/updateRollup/updateRollup.json
```

- Set your parameters
- Run tool:
- Standrad transaction:
```
npx hardhat run ./tools/updateRollup/updateRollup.ts --network sepolia
```

### Generate 'updateRollup' data to the Timelock SC

- Copy configuration file:
```
cp ./tools/updateRollup/updateRollup.json.example ./tools/updateRollup/updateRollup.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/updateRollup/updateRollupTimelock.ts --network sepolia
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait `timelockDelay` and then send `executeData` to timelock address
