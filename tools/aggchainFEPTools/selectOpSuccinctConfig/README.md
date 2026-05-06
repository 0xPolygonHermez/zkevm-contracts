# Select OP Succinct Config (AggchainFEP)
Script to call `selectOpSuccinctConfig` function (`AggchainFEP` contract).

## Setup
- install packages
```
npm i
```

- Set env variables (not mandatory for network = localhost)
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID`, `MNEMONIC` or and `DEPLOYER_PRIVATE_KEY`.

-   Copy configuration files:
```
cp ./tools/aggchainFEPTools/selectOpSuccinctConfig/parameters.json.example ./tools/aggchainFEPTools/selectOpSuccinctConfig/parameters.json
```

-  Set your parameters -> parameters.json
    - `type`: Specify the type of caller, only available:
        - `EOA`: If calling from a wallet, the script will execute the transaction on the specified network
        - `Multisig`: If calling from a multisig, the script will output the calldata of the transaction to execute
        - `Timelock`: If calling through a timelock, the script will output the schedule and execute data to send to the timelock contract
    - `rollupAddress`: Address of the AggchainFEP contract
    - `configName`: bytes32 identifier of an existing OP Succinct config to make active
    - `timelockDelay(optional)`: timelock delay (required when `type=Timelock`)
    - `timelockSalt(optional)`: timelock salt
    - `predecessor(optional)`: timelock predecessor

-  Run tool:
```
npx hardhat run tools/aggchainFEPTools/selectOpSuccinctConfig/selectOpSuccinctConfig.ts --network <network>
```

### More Info
- All commands are done from root repository
- The output files will be saved at `./tools/aggchainFEPTools/selectOpSuccinctConfig/select_op_succinct_config_output_{type}_{date}.json`
- If the script fails, check the logs, most of the errors are handled and are auto explanatory
- The `selectOpSuccinctConfig` function is gated by `onlyAggchainManager` -- the EOA/Multisig/Timelock used must currently hold the aggchain manager role on the target `AggchainFEP` contract
- The config identified by `configName` must already exist (added via `addOpSuccinctConfig`); otherwise the call reverts with `ConfigDoesNotExist`
