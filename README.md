# contracts-zkEVM

Smart contract implementation which will be used by the zkEVM

## Requirements

- node version: 14.x
- npm version: 7.x

## Repository structure

- `contracts`: zkEVM contracts
- `docs`: specs and useful links
- `src`: js code to interact with the zkEVM, executor, zkEVMDB, sequencer and aggregator.
- `test`: test of all repository

## Activate github hook

```
git config --local core.hooksPath .githooks/
```

## Install

```
npm i
```

## Run tests

```
npm run test
```

## Run Linter

See errors:

```
npm run lint
```

Autofix errors:

```
npm run lint:fix
```

## Deploy on hardhat

```
npm run deploy:PoE:hardhat
```

## Build dockers

```
npm run docker:contracts
```

A new docker `hermez-geth1.3:latest` will be created
This docker will contain a geth node with the deployed contracts
The deployment output can be found in: `docker/deploymentOutput/deploy_output.json`
To run the docker you can use: `docker run -p 8545:8545 hermez-geth1.3:latest`

## License

`hermeznetwork/hez-matic-merge` is part of the Hermez project copyright 2020 HermezDAO and published with GPL-3 license. Please check the LICENSE file for more details.
