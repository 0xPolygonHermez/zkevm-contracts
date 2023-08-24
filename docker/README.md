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

## Build dockers

In project root execute:

```
npm i
npm run docker:contracts
```

A new docker `hermeznetwork/geth-cdk-validium-contracts:latest` will be created
This docker will contain a geth node with the deployed contracts
The deployment output can be found in: `docker/deploymentOutput/deploy_output.json`
To run the docker you can use: `docker run -p 8545:8545 hermeznetwork/geth-cdk-validium-contracts:latest`
