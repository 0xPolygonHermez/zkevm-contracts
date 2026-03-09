## Requirements

- node version: 14.x
- npm version: 7.x

## Deployment

In project root execute:

```
npm i
cp .env.example .env
```

Fill `.env` with your `MNEMONIC` and `INFURA_PROJECT_ID`
If you want to verify the contracts also fill the `ETHERSCAN_API_KEY`

```
cd deployment
cp deploy_parameters.json.example deploy_parameters.json
```

Fill created `deploy_parameters.json` with appropriate parameters.
See below for more information about the `deploy_parameters.json`

The first step is deploying and verifying the `PolygonZkEVMDeployer`, this will be the factory for deterministic contracts, the address of the contracts will depend on the `salt` and the `initialZkEVMDeployerOwner`

This contract is deployed using a keyless deployment, therefore the gasPrice is hardcoded.
The value is on `100 gweis`, if it's necessary to update it go to `helpers/deployment-helpers.js` and update the `gasPriceKeylessDeployment` constant.
Note that this operation will change all the deterministic address deployed.

```
npm run deploy:v2:sepolia
npm run verify:v2:sepolia
```

To deploy on testnet is necessary a token MATIC contract, therefore, there's another script that previously to the actual deployment, deploys a matic contracts and adds it automatically to the `deploy_parameters.json`

To deploy on testnet use:`deploy:testnet:ZkEVM:${network}`

In other cases use fulfill `maticTokenAddress` in the `deploy_parameters.json` and run `deploy:ZkEVM:${network}`

```
npm run deploy:testnet:v2:sepolia

```

To verify contracts use `npm run verify:ZkEVM:${network}`

```
npm run verify:upgradeV2:sepolia
```

A new folder will be created with the following name `deployments/${network}_$(date +%s)` with all the output information and the OZ proxy information.

## deploy-parameters.json

- `test`: bool, Indicate if it's a test deployment, which will fund the deployer address with pre minted ether and will give more powers to the deployer address to make easier the flow.
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
- `zkEVMDeployerAddress`: address, Address of the `PolygonZkEVMDeployer`. Can be left blank, will be fulfilled automatically with the `deploy:v2:sepolia` script.
- `ppVKey`: pessimistic program verification key (AgglayerGateway)
- `ppVKeySelector`: The 4 bytes selector to add to the pessimistic verification keys (AgglayerGateway)
- `realVerifier`: bool, Indicates whether deploy a real verifier or not (AgglayerGateway)
- `multisigRoleAddress`: address, The address that can manage multisig signers and threshold (AgglayerGateway) - optional, defaults to admin
- `signersToAdd`: array, Array of signer objects with addr and url properties (AgglayerGateway) - optional, defaults to []
- `newThreshold`: uint256, Threshold for multisig operations (AgglayerGateway) - optional, defaults to 0

## create_rollup_parameters.json

- `realVerifier`: bool, Indicates whether deploy a real verifier or not for the new created
- `trustedSequencerURL`: string, trustedSequencer URL
- `networkName`: string, networkName
- `description`: string, Description of the new rollup type
- `trustedSequencer`: address, trusted sequencer address
- `chainID`: uint64, chainID of the new rollup
- `adminZkEVM`: address, Admin address, can adjust Rollup parameters
- `forkID`: uint64, Fork ID of the new rollup, indicates the prover (zkROM/executor) version
- `consensusContract`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus", "AggchainECDSA", "AggchainFEP"]`.
- `gasTokenAddress`: address, Gas token address, empty or address(0) for ether
- `programVKey`: program key for pessimistic consensus. if consensus != pessimistic, programVKey === bytes32(0).
- `isVanillaClient`: Flag for vanilla/sovereign clients handling
- `sovereignParams`: Only mandatory if isVanillaClient = true
    - `bridgeManager`: bridge manager address
    - `sovereignWETHAddress`: sovereign WETH address
    - `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
    - `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
    - `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
    - `emergencyBridgePauser`: emergency bridge pauser address, can stop the bridge, recommended to be a multisig
    - `emergencyBridgeUnpauser`: emergency bridge unpauser address, can unpause the bridge, recommended to be a multisig
- `aggchainParams`: Only mandatory if consensusContract is AggchainECDSA or AggchainFEP
    - `aggchainManager`: Address that manages all the functionalities related to the aggchain
    - `aggchainManagerPvtKey`: (Optional) Private key for the aggchainManager account. If provided, will be used to sign transactions. If empty, will use deployer.
    - `initParams`: Only mandatory if consensusContract is AggchainFEP
        - `l2BlockTime`: The time between L2 blocks in seconds
        - `rollupConfigHash`: The hash of the chain's rollup configuration
        - `startingOutputRoot`: Init output root
    - `useDefaultVkeys`: Whether to use default verification keys from AgglayerGateway
    - `useDefaultSigners`: Whether to use default signers from AgglayerGateway
        - `startingBlockNumber`: The number of the first L2 block
        - `startingTimestamp`: The timestamp of the first L2 block
        - `submissionInterval`: The minimum interval in L2 blocks at which checkpoints must be submitted
        - `aggchainManager`: Address that manages all the functionalities related to the aggchain
        - `optimisticModeManager`: Address that can trigger the optimistic mode
        - `aggregationVkey`: The verification key of the aggregation SP1 program.
        - `rangeVkeyCommitment`: The 32 byte commitment to the BabyBear representation of the verification key of the range SP1 program.
    - `useDefaultGateway`: bool, flag to setup initial values for the owned gateway
    - `ownedAggchainVKey`: bytes32, Initial owned aggchain verification key
    - `initAggchainVKeySelector`: bytes4, Initial aggchain verification key selector
    - `vKeyManager`: address, Initial vKeyManager

### Optional Parameters on both parameters

- `deployerPvtKey`: string, pvtKey of the deployer, overrides the address in `MNEMONIC` of `.env` if exist
- `maxFeePerGas`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
- `maxPriorityFeePerGas`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
- `multiplierGas`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
- `dataAvailabilityProtocol`: string, Data availability protocol, only mandatory/used when consensus contract is a Validium, currently the only supported value is: `PolygonDataCommittee`

## Notes

- Since there are deterministic address you cannot deploy twice on the same network using the same `salt` and `initialZkEVMDeployerOwner`. Changing one of them is enough to make a new deployment.
- It's mandatory to delete the `.openzeppelin` upgradeability information in order to make a new deployment
- `genesis.json` has been generated using the tool: `1_createGenesis`, this script depends on the `deploy_parameters` as well.
