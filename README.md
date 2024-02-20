# zkevm-contracts

Smart contract implementation which will be used by the polygon zkevm

[![Main CI](https://github.com/0xPolygonHermez/zkevm-contracts/actions/workflows/main.yml/badge.svg)](https://github.com/0xPolygonHermez/zkevm-contracts/actions/workflows/main.yml)

## Mainnet Contracts:

| Contract Name                | Address                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| PolygonRollupManager         | [0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2](https://etherscan.io/address/0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2) |
| PolygonZkEVMBridgeV2         | [0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe](https://etherscan.io/address/0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe) |
| PolygonZkEVMGlobalExitRootV2 | [0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb](https://etherscan.io/address/0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb) |
| FflonkVerifier               | [0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9](https://etherscan.io/address/0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9) |
| PolygonZkEVMDeployer         | [0xCB19eDdE626906eB1EE52357a27F62dd519608C2](https://etherscan.io/address/0xCB19eDdE626906eB1EE52357a27F62dd519608C2) |
| PolygonZkEVMTimelock         | [0xEf1462451C30Ea7aD8555386226059Fe837CA4EF](https://etherscan.io/address/0xEf1462451C30Ea7aD8555386226059Fe837CA4EF) |

## zkEVM Contracts:

| Contract Name        | Address                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PolygonZkEVMBridgeV2 | [0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe](https://zkevm.polygonscan.com/address/0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe) |
| PolygonZkEVMTimelock | [0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13](https://zkevm.polygonscan.com/address/0xBBa0935Fa93Eb23de7990b47F0D96a8f75766d13) |

## Requirements

-   node version: 16.x
-   npm version: 7.x

## Install repo

```
npm i
```

## Run tests

```
npm run test
```

## Deploy on hardhat

```
npm run deploy:ZkEVM:hardhat
```

## Build dockers

```
npm run docker:contracts
```

Or if using new docker-compose version

```
npm run dockerv2:contracts
```

A new docker `hermeznetwork/geth-zkevm-contracts` will be created
This docker will contain a geth node with the deployed contracts
The deployment output can be found in: `docker/deploymentOutput/deploy_output.json`
To run the docker you can use: `docker run -p 8545:8545 hermeznetwork/geth-zkevm-contracts`

## Note

In order to test, the following private keys are being used. These keys are not meant to be used in any production environment:

-   private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
    -   address:`0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
-   private key: `0xdfd01798f92667dbf91df722434e8fbe96af0211d4d1b82bbbbc8f1def7a814f`
    -   address:`0xc949254d682d8c9ad5682521675b8f43b102aec4`

# Verify Deployed Smart Contracts

To verify that the smartcontracts of this repository are the same deployed on mainnet, you could follow the instructions described [document](verifyMainnetDeployment/verifyDeployment.md)

The smartcontract used to verify a proof, it's a generated contract from zkEVM Rom and Pil (constraints). To verify the deployment of this smartcontract you could follow the instructions described in this [document](verifyMainnetDeployment/verifyMainnetProofVerifier.md)

## Activate github hook

```
git config --local core.hooksPath .githooks/
```
