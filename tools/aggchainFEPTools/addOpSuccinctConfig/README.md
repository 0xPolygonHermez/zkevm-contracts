# Add OP Succinct Config (AggchainFEP)
Script to call `addOpSuccinctConfig` function (`AggchainFEP` contract).

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
cp ./tools/aggchainFEPTools/addOpSuccinctConfig/parameters.json.example ./tools/aggchainFEPTools/addOpSuccinctConfig/parameters.json
```

-  Set your parameters -> parameters.json
    - `type`: Specify the type of caller, only available:
        - `EOA`: If calling from a wallet, the script will execute the transaction on the specified network
        - `Multisig`: If calling from a multisig, the script will output the calldata of the transaction to execute
        - `Timelock`: If calling through a timelock, the script will output the schedule and execute data to send to the timelock contract
    - `rollupAddress`: Address of the AggchainFEP contract
    - `configName`: bytes32 identifier for the new config (must be non-zero, must not already exist on-chain)
    - `rollupConfigHash`: bytes32 rollup config hash (must be non-zero)
    - `aggregationVkey`: bytes32 aggregation verification key (must be non-zero)
    - `rangeVkeyCommitment`: bytes32 range verification key commitment (must be non-zero)
    - `timelockDelay(optional)`: timelock delay (required when `type=Timelock`)
    - `timelockSalt(optional)`: timelock salt
    - `predecessor(optional)`: timelock predecessor

-  Run tool:
```
npx hardhat run tools/aggchainFEPTools/addOpSuccinctConfig/addOpSuccinctConfig.ts --network <network>
```

### More Info
- All commands are done from root repository
- The output files will be saved at `./tools/aggchainFEPTools/addOpSuccinctConfig/add_op_succinct_config_output_{type}_{date}.json`
- If the script fails, check the logs, most of the errors are handled and are auto explanatory
- The `addOpSuccinctConfig` function is gated by `onlyAggchainManager` -- the EOA/Multisig/Timelock used must currently hold the aggchain manager role on the target `AggchainFEP` contract
- After adding a config, use `selectOpSuccinctConfig` to make it the active one
