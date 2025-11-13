# Update RangeVkeyCommitment (AggchainFEP)
Script to call `updateRangeVkeyCommitment` function (`AggchainFEP` contract).

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
cp ./tools/aggchainFEPTools/updateRangeVkeyCommitment/parameters.json.example ./tools/aggchainFEPTools/updateRangeVkeyCommitment/parameters.json
```

-  Set your parameters -> parameters.json
    - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
    - `rangeVkeyCommitment`: new range verification key commitment
    - `rollupAddress`: Address AggchainFEP contract
    - `timelockDelay(optional)`: timelock delay
    - `timelockSalt(optional)`: timelock salt
    - `predecessor(optional)`: timelock predecessor

-  Run tool:
```
npx hardhat run tools/aggchainFEPTools/updateRangeVkeyCommitment/updateRangeVkeyCommitment.ts --network <network>
```

### More Info
- All commands are done from root repository
- The output files will be saved at `../tools/aggchainFEPTools/updateRangeVkeyCommitment/update_rangevkeycommitment_output_{type}_{date}.json`
- If the script fails, check the logs, most of the errors are handled and are auto explanatory