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

```
cd deployment
cp deploy_parameters.json.example deploy_parameters.json
```

Fill created `deploy_parameters.json` with appropiate parameters.

To deploy contracts run `npm run deploy:ZkEVM:${network}`, for example:

> set `runs` parameter from the compiler settings in `hardhat.config.js` (i.e. `runs: 100`)

```
npm run deploy:ZkEVM:goerli
```

To verify contracts run `npm run verify:ZkEVM:${network}`, for example:

```
npm run verify:ZkEVM:goerli
```

A new folder will be created witth the following name `deployments/${network}_$(date +%s)` with all the output information and the OZ proxy information.

## deploy-parameters.json

- `trustedSequencerURL`: string, trustedSequencer URL
- `trustedSequencerAddress`: address, trusted sequencer addresss
- `realVerifier`: boolean, deploy or not a real verifier
- `chainID`: uint64, chainID
- `networkName`: string, networkName

### Optional Parameters

- `deployerPvtKey`: string, deployerPvtKey of the deployer
- `maxFeePerGas`:string, maxFeePerGas of all txs
- `maxPriorityFeePerGas`:string, maxPriorityFeePerGas of all txs
- `multiplierGas`: number, Gas multiplier. If maxFeePerGas and maxPriorityFeePerGas are set, will not take effect
- `trustedSequencerPvtKey`: string, Trusted sequencer pvtKey in order to approve the matic tokens
- `PolygonZkEVMBridgeMock`:Boolean, Wheather the PolygonZkEVMBridge will be mock or not ( the mock version has a ether limitation on deposits)
- `admin`:address, Admin address
- `trustedAggregator`:address, Trusted aggregator address
- `minDelayTimelock`: number, minimum timelock delay,
- `timelockAddress`: address, Timelock owner address

## Notes

- `genesis.json` has been generated using the tool: `src/create-genesis.js` using as generator file: `genesis-gen.json`
