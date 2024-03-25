## Important note

This is just a test deployment to test the upgradability between previous and new systems from the node prespective

## Requirements

-   node version: 14.x
-   npm version: 7.x

## Usage

```
cd deployment
cp deploy_parameters.json.example deploy_parameters.json
```

Fill created `deploy_parameters.json` with appropiate parameters.
See below for more information about the `deploy_parameters.json`

```
deploy:testnet:v1ToV2:localhost
```

## deploy-parameters.json

-   `timelockAdminAddress`: address, Timelock owner address, able to send start an upgradability process via timelock
-   `minDelayTimelock`: number, Minimum timelock delay,
-   `salt`: bytes32, Salt used in `PolygonZkEVMDeployer` to deploy deterministic contracts, such as the PolygonZkEVMBridge
-   `initialZkEVMDeployerOwner`: address, Initial owner of the `PolygonZkEVMDeployer`
-   `admin`:address, Admin address, can adjust RollupManager parameters or stop the emergency state
-   `trustedAggregator`:address, Trusted aggregator address
-   `trustedAggregatorTimeout`: uint64, If a sequence is not verified in this timeout everyone can verify it
-   `pendingStateTimeout`: uint64, Once a pending state exceeds this timeout it can be consolidated by everyone
-   `emergencyCouncilAddress`:address, Emergency council addres
-   `polTokenAddress`: address, Matic token address, only if deploy on testnet can be left blank and will fullfilled by the scripts.
-   `zkEVMDeployerAddress`: address, Address of the `PolygonZkEVMDeployer`. Can be left blank, will be fullfilled automatically with the `deploy:deployer:ZkEVM:goerli` script.

-   `realVerifier`: bool, Indicates whether deploy a real verifier or not for the new created
-   `trustedSequencerURL`: string, trustedSequencer URL
-   `networkName`: string, networkName
-   `description`:string, Description of the new rollup type
-   `trustedSequencer`: address, trusted sequencer addresss
-   `chainID`: uint64, chainID of the new rollup
-   `adminZkEVM`:address, Admin address, can adjust Rollup parameters
-   `forkID`: uint64, Fork ID of the new rollup, indicates the prover (zkROM/executor) version
-   `consensusContract`: string, Consensus contract name of the new rollup deployed, current options are: "PolygonZkEVMEtrog","PolygonValidiumEtrog",
-   `gasTokenAddress`:address, Gas token address, empty or address(0) for ether

### Optional Parameters

-   `deployerPvtKey`: string, pvtKey of the deployer, overrides the address in `MNEMONIC` of `.env` if exist
-   `maxFeePerGas`:string, Set `maxFeePerGas`, must define aswell `maxPriorityFeePerGas` to use it
-   `maxPriorityFeePerGas`:string, Set `maxPriorityFeePerGas`, must define aswell `maxFeePerGas` to use it
-   `multiplierGas`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
