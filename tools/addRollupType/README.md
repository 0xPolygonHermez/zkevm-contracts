# Add Rollup Type
Script to call `addNewRollupType` function with no timelock involved

## Install
```
npm i
```

## Setup
- Config file
  - `consensusContract`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"]`
  - `consensusContractAddress`: gets this address instead of deployong a new consensus implementation
  - `polygonRollupManagerAddress`: polygonRollupManager smart contract address
  - `verifierAddress`: verifier to be used
  - `description`: string to describe rollup type added. Example: "Type: Validium, Version: etrog, genesis: /ipfs/QmUXnRoPbUmZuEZCGyiHjEsoNcFVu3hLtSvhpnfBS2mAYU"
  - `forkID`: forkID to be used
  - `programVKey`: program key for pessimsitic consensus
  - `genesisRoot`: initial genesis root. Must match the `genesis.json` generated.
  - `timelockDelay`: timelock delay
  - `timelockSalt(optional)`: timelock salt
  - `predecessor(optional)`: timelock predecessor
  - `deployerPvtKey(optional)`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define aswell `maxPriorityFeePerGas` to use it
  - `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define aswell `maxFeePerGas` to use it
  - `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
- A network should be selected when running the script
  - examples: `-- sepolia` or `--mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'addNewRollupType' from an EOA

- Copy configuration files:
```
cp ./tools/addRollupType/add_rollup_type.json.example ./tools/addRollupType/add_rollup_type.json
```

```
cp ./tools/addRollupType/genesis.json.example ./tools/addRollupType/genesis.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/addRollupType/addRollupType.ts --network sepolia
```

### Generate 'addNewRollupType' to the Timelock SC

- Copy configuration file:
```
cp ./tools/addRollupType/add_rollup_type.json.example ./tools/addRollupType/add_rollup_type.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/addRollupType/addRollupType.ts --network sepolia
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait timelockDelay and then send `executeData` to timelock address