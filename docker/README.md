# Docker deployment

By default the following mnemonic will be used to deploy the smart contracts `MNEMONIC="test test test test test test test test test test test junk"`.
Also the first 20 accounts of this mnemonic will be funded with ether.
The first account of the mnemonic will be the deployer of the smart contracts and therefore the holder of all the MATIC test tokens, which are necessary to pay the `sendBatch` transactions.
You can change the deployment `mnemonic` creating a `.env` file in the project root with the following variable:
`MNEMONIC=<YOUR_MENMONIC>`

## Requirements

- node version: 14.x
- npm version: 7.x
- docker
- docker-compose

## Config files

- Complete config `/docker/scripts/v2/create_rollup_parameters_docker.json`

## deploy_parameters.json

- `test`: Flag to point if is a testing environment, in such case, an account with balance will be created at the rollup and no timelock addresses will be used
- `timelockAdminAddress`: address, Timelock owner address, able to send start an upgradeability process via timelock
- `minDelayTimelock`: number, Minimum timelock delay,
- `salt`: bytes32, Salt used in `PolygonZkEVMDeployer` to deploy deterministic contracts, such as the PolygonZkEVMBridge
- `initialZkEVMDeployerOwner`: address, Initial owner of the `PolygonZkEVMDeployer`
- `admin`: address, Admin address, can adjust RollupManager parameters or stop the emergency state
- `trustedAggregator`: address, Trusted aggregator address
- `trustedAggregatorTimeout`: uint64, If a sequence is not verified in this timeout everyone can verify it
- `pendingStateTimeout`: uint64, Once a pending state exceeds this timeout it can be consolidated by everyone
- `emergencyCouncilAddress`: address, Emergency council address
- `polTokenAddress`: address, POL token address, only if deploy on testnet can be left blank and will fulfilled by the scripts.
- `zkEVMDeployerAddress`: address, Address of the `PolygonZkEVMDeployer`. Can be left blank, will be fulfilled automatically with the `deploy:v2:sepolia` script
- `ppVKey`: pessimistic program verification key (AgglayerGateway)
- `ppVKeySelector`: The 4 bytes selector to add to the pessimistic verification keys (AgglayerGateway)
- `multisigRoleAddress`: address, The address that can manage multisig signers and threshold (AgglayerGateway)
- `signersToAdd`: array, Array of signer objects with addr and url properties (AgglayerGateway) - optional, defaults to []
- `newThreshold`: uint256, Threshold for multisig operations (AgglayerGateway) - optional, defaults to 0
- `deployerPvtKey`: string, pvtKey of the deployer, overrides the address in `MNEMONIC` of `.env` if exist
- `maxFeePerGas`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
- `maxPriorityFeePerGas`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
- `multiplierGas`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect

## create_rollup_parameters.json

- `realVerifier`: bool, Indicates whether deploy a real verifier or not for the new created
- `trustedSequencerURL`: string, trustedSequencer URL
- `networkName`: string, networkName
- `description`: string, Description of the new rollup type
- `trustedSequencer`: address, trusted sequencer address
- `chainID`: uint64, chainID of the new rollup
- `adminZkEVM`: address, Admin address, can adjust Rollup parameters
- `forkID`: uint64, Fork ID of the new rollup, indicates the prover (zkROM/executor) version
- `consensusContract`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus", "AggchainECDSA", "AggchainFEP"]`. This is the name of the consensus of the rollupType of the rollup to be created
- `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
- `deployerPvtKey`: Not mandatory, used to deploy from specific wallet
- `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
- `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
- `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
- `programVKey`: program key for pessimistic consensus
- `isVanillaClient`: Flag for vanilla/sovereign clients handling
- `aggchainParams`: Only mandatory if consensusContract is AggchainECDSA or AggchainFEP
    - `initParams`: Only mandatory if consensusContract is AggchainFEP
        - `l2BlockTime`: The time between L2 blocks in seconds
        - `rollupConfigHash`: The hash of the chain's rollup configuration
        - `startingOutputRoot`: Init output root
        - `startingBlockNumber`: The number of the first L2 block
        - `startingTimestamp`: The timestamp of the first L2 block
        - `submissionInterval`: The minimum interval in L2 blocks at which checkpoints must be submitted
        - `aggchainManager`: Address that manages all the functionalities related to the aggchain
        - `optimisticModeManager`: Address that can trigger the optimistic mode
        - `aggregationVkey`: The verification key of the aggregation SP1 program.
        - `rangeVkeyCommitment`: The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program.
    - `useDefaultVkeys`: bool, flag to use default verification keys from AgglayerGateway
    - `useDefaultSigners`: bool, flag to use default signers from AgglayerGateway
    - `ownedAggchainVKey`: bytes32, Initial owned aggchain verification key
    - `aggchainVKeySelector`: bytes2, Initial aggchain selector
    - `vKeyManager`: address, Initial vKeyManager

## Run script

In project root execute:

```
npm i
npm run docker:contracts
```

or

```
npm i
npm run dockerv2:contracts
```

A new docker `geth-zkevm-contracts:latest` will be created
This docker will contain a geth node with the deployed contracts
The deployment output can be found in:

- `docker/deploymentOutput/create_rollup_output.json`
- `docker/deploymentOutput/deploy_output.json`
- `docker/deploymentOutput/genesis.json`
- `docker/deploymentOutput/genesis_sovereign.json`

To run the docker you can use: `docker run -p 8545:8545 geth-zkevm-contracts:latest`

or

```
npm i
npm run dockerv2:contracts:all
```

It's the same docker as before but deploying `AggchainECDSA` & `PolygonPessimisticConsensus`.

To create other rollup:

- copy template from `./docker/scripts/v2/create_rollup_parameters_docker-xxxx.json` to `deployment/v2/create_rollup_parameters.json`
- copy `genesis.json`, `genesis_sovereign.json` and `deploy_ouput.json` (from `docker/deploymentOutput`) to `deployment/v2/`
- run `npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost`
- If you want, you can copy the file that has been generated here (`deployment/v2/create_rollup_output_*.json`) to deployment output folder (`docker/deploymentOutput`)
