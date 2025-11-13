# Create new Rollup
Script to call `createNewRollup` function.
-  This script needs of a genesis as input only if we are trying to deploy a sovereign chain. The genesis will only be updated in case of trying to deploy a sovereign chain. In this case, this new sovereign genesis will be appended at the output file

## Setup
- install packages
```
npm i
```

- Set env variables
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `ETHERSCAN_API_KEY`

-   Copy configuration files:
```
cp ./tools/createNewRollup/create_new_rollup.json.example ./tools/createNewRollup/create_new_rollup.json
```

-  Set your parameters -> create_new_rollup.json
    - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
    -   `trustedSequencerURL`: Sequencer URL of the new created rollup
    -   `networkName`: Network name of the new created rollup
    -   `trustedSequencer`: Sequencer address of the new created rollup
    -   `chainID`: ChainID of the rollup, must be a new one, can not have more than 32 bits
    -   `rollupAdminAddress`: Admin address of the new created rollup
    -   `consensusContractName`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"]`. This is the name of the consensus of the rollupType of the rollup to be created
    -   `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
    -   `deployerPvtKey`: Not mandatory, used to deploy from specific wallet
    -   `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
    -   `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
    -   `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
    - `timelockDelay(optional)`: timelock delay, only required on timelock type
    - `timelockSalt(optional)`: timelock salt, only required on timelock type
    -   `rollupManagerAddress`: Address of deployed rollupManager contract
    -   `rollupTypeId`: The id of the rollup type of the rollup to deploy. WARNING: the type must match with the `consensusContractName`. Example: if the type is validium, the contract name has to be `PolygonValidiumEtrog`
    -   `proxiedTokensManager`:  Address of proxiedTokensManager role
    -   `isVanillaClient`: Flag for vanilla/sovereign clients handling
    -   `sovereignParams`:
        -   `bridgeManager`: bridge manager address
        -   `sovereignWETHAddress`: sovereign WETH address
        -   `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
        -   `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
        -   `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
        -   `emergencyBridgePauser`: Address of emergencyBridgePauser role
        -   `emergencyBridgeUnpauser`: Address of emergencyBridgeUnpauser role
    - `aggchainParams`:
        -   `aggchainManager`: Address that manages all the functionalities related to the aggchain

-  Set your parameters -> genesis.json
  - Is the genesis used to create the rollupType
  - It is only necessary in case you want to create a sovereign/vanilla chain because it will be updated

-  Run tool:
```
npx hardhat run ./tools/createNewRollup/createNewRollup.ts --network <network>
```

### More Info
- All commands are done from root repository
- The output files will be saved at `./tools/createNewRollup/create_new_rollup_output_{type}_{date}.json`
- In case is a sovereign chain, the updated genesis is saved inside the output file, the original `genesis.json` is not modified
- If the script fails, check the logs, most of the errors are handled and are auto explanatory