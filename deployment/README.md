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

Fill created `deploy_parameters.json` with appropiate parameters.
See below for more information about the `deploy_parameters.json`

The first step is deploying and verifying the `CDKValidiumDeployer`, this will be the factory for deterministic contracts, the address of the contracts will depend on the `salt` and the `initialCDKValidiumDeployerOwner`

This contrat is deployed using a keyless deployment, therefore the gasPrice is hardcoded.
The value is on `100 gweis`, if it's necessary to update it go to `helpers/deployment-helpers.js` and update the `gasPriceKeylessDeployment` constant.
Note that this operation will change all the deterministic address deployed.

```
npm run deploy:deployer:CDKValidium:sepolia
npm run verify:deployer:CDKValidium:sepolia
```

To deploy on testnet is necessary a token MATIC contract, therefore, there's another script that previously to the actual deployment, deploys a matic contracts and adds it automatically to the `deploy_parameters.json`

To deploy on testnet use:`deploy:testnet:CDKValidium:${network}`

In other cases use fullfill `maticTokenAddress` in the `deploy_parameters.json` and run `deploy:CDKValidium:${network}`

```
npm run deploy:testnet:CDKValidium:sepolia

```

To verify contracts use `npm run verify:CDKValidium:${network}`

```
npm run verify:CDKValidium:sepolia
```

A new folder will be created witth the following name `deployments/${network}_$(date +%s)` with all the output information and the OZ proxy information.

## deploy-parameters.json

- `realVerifier`: bool, Indicates whether deploy a real verifier or not
- `trustedSequencerURL`: string, trustedSequencer URL
- `networkName`: string, networkName
- `version`:string, will just be emitted at initialization of the contract, usefull just for synchronizer
- `trustedSequencer`: address, trusted sequencer addresss
- `chainID`: uint64, chainID of the CDKValidium
- `trustedAggregator`:address, Trusted aggregator address
- `trustedAggregatorTimeout`: uint64, If a sequence is not verified in this timeout everyone can verify it
- `pendingStateTimeout`: uint64, Once a pending state exceeds this timeout it can be consolidated
- `forkID`: uint64, Fork ID of the CDKValidium, indicates the prover (zkROM/executor) version
- `admin`:address, Admin address, can adjust CDKValidium parameters or stop the emergency state
- `cdkValidiumOwner`: address, Able to put the CDKValidium into emergency state (kill switch)
- `timelockAddress`: address, Timelock owner address, able to send start an upgradability process via timelock
- `minDelayTimelock`: number, Minimum timelock delay,
- `salt`: bytes32, Salt used in `CDKValidiumDeployer` to deploy deterministic contracts, such as the PolygonZkEVMBridge
- `initialCDKValidiumDeployerOwner`: address, Initial owner of the `CDKValidiumDeployer`
- `maticTokenAddress`: address, Matic token address, only if deploy on testnet can be left blank and will fullfilled by the scripts.
- `cdkValidium2DeployerAddress`: address, Address of the `CDKValidiumDeployer`. Can be left blank, will be fullfilled automatically with the `deploy:deployer:CDKValidium:sepolia` script.

### Optional Parameters

- `deployerPvtKey`: string, pvtKey of the deployer, overrides the address in `MNEMONIC` of `.env` if exist
- `maxFeePerGas`:string, Set `maxFeePerGas`, must define aswell `maxPriorityFeePerGas` to use it
- `maxPriorityFeePerGas`:string, Set `maxPriorityFeePerGas`, must define aswell `maxFeePerGas` to use it
- `multiplierGas`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect

## Notes

- Since there are deterministic address you cannot deploy twice on the same network using the same `salt` and `initialCDKValidiumDeployerOwner`. Changing one of them is enough to make a new deployment.
- It's mandatory to delete the `.openzeppelin` upgradebility information in order to make a new deployment
- `genesis.json` has been generated using the tool: `1_createGenesis`, this script depends on the `deploy_parameters` aswell.
