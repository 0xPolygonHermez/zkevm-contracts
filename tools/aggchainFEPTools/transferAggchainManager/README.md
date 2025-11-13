# Change aggchain manager role (AggchainFEP)
Script to call `transferAggchainManagerRole`/`acceptAggchainManagerRole` functions (`AggchainFEP` contract).

## Setup
- install packages
```
npm i
```

- Set env variables (not mandatory for network = localhost)
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `MNEMONIC`

-   Copy configuration files:
```
cp ./tools/aggchainFEPTools/transferAggchainManager/parameters.json.example ./tools/aggchainFEPTools/transferAggchainManager/parameters.json
```

-  Set your parameters -> parameters.json
    - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
    - `aggchainManagerPvk`: Not mandatory, used to send tx
    - `newAggchainManagerPvk`: Not mandatory, used to send tx
    - `rollupAddress`: Address AggchainFEP contract
    - `timelockDelay(optional)`: timelock delay
    - `timelockSalt(optional)`: timelock salt
    - `predecessor(optional)`: timelock predecessor

-  Run tool:
```
npx hardhat run tools/aggchainFEPTools/transferAggchainManager/transferAggchainManager.ts --network <network>
```

### More Info
- All commands are done from root repository
- The output files will be saved at `../tools/aggchainFEPTools/transferAggchainManager/transfer_aggchain_manager_role_output_{type}_{date}.json`
- If the script fails, check the logs, most of the errors are handled and are auto explanatory