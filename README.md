# zkevm-contracts

Smart contract implementation which will be used by the polygon-hermez zkevm.

[![Main CI](https://github.com/0xPolygonHermez/zkevm-contracts/actions/workflows/main.yml/badge.svg)](https://github.com/0xPolygonHermez/zkevm-contracts/actions/workflows/main.yml)

> **WARNING**: All code here is in WIP.

## Note

Private keys and mnemonics contained in this repository are used for internal test exclusively. Do not use them in production environments.

## Requirements

- node version: 14.x
- npm version: 7.x

## Repository structure

- `contracts`: zkevm contracts
  - `Bridge.sol`: transfer assets between chains
    - `GlobalExitRootManager.sol`: manage global exit root in L1
    - `GlobalExitRootManagerL2.sol`: manage global exit root in L2
  - `ProofOfEfficiency.sol`: consensus algorithm used by polyhon hermez zkevm
- `docs`: specs and useful links
- `test`: contracts tests

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
npm run deploy:PoE2_0:hardhat
```

## Build dockers

```
npm run docker:contracts
```

A new docker `hermez-geth1.3:latest` will be created.
This docker will contain a geth node with the deployed contracts.
The deployment output can be found in: `docker/deploymentOutput/deploy_output.json`.
To run the docker you can use: `docker run -p 8545:8545 hermez-geth1.3:latest`.

## License

### Copyright

Polygon `zkevm-contracts` was developed by Polygon. While we plan to adopt an open source license, we haven’t selected one yet, so all rights are reserved for the time being. Please reach out to us if you have thoughts on licensing.

### Disclaimer

This code has not yet been audited, and should not be used in any production systems.
