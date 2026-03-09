# Agglayer smart contracts

Agglayer smart contracts implementation

[![Main CI](https://github.com/agglayer/agglayer-contracts/actions/workflows/main.yml/badge.svg)](https://github.com/agglayer/agglayer-contracts/actions/workflows/main.yml)

## Mainnet Contracts

| Contract Name        | Address                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AgglayerManager      | [0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2](https://etherscan.io/address/0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2) |
| AgglayerBridge       | [0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe](https://etherscan.io/address/0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe) |
| AgglayerGER          | [0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb](https://etherscan.io/address/0x580bda1e7A0CFAe92Fa7F6c20A3794F169CE3CFb) |
| AgglayerGateway      | [0x046Bb8bb98Db4ceCbB2929542686B74b516274b3](https://etherscan.io/address/0x046Bb8bb98Db4ceCbB2929542686B74b516274b3) |
| AgglayerTimelock<sup>*</sup> | [0xEf1462451C30Ea7aD8555386226059Fe837CA4EF](https://etherscan.io/address/0xEf1462451C30Ea7aD8555386226059Fe837CA4EF) |

<sup>*</sup> Current SC name in the repository. Originally deployed as `PolygonZkEVMTimelock` as it is shown in etherscan

## Requirements

-  node version: 22.x
-  npm version: 10.x

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
npm run deploy:v2:localhost
```

## Docker images
Check [here](https://github.com/agglayer/agglayer-contracts/pkgs/container/agglayer-contracts) all available docker images.

See the following [README](docker/README.md) for more details about docker image generation.

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

# Foundry

A convenient justfile is provided to run common tasks using [Just](https://just.systems/man/en/introduction.html).

## Prerequisites

- Install [Foundry](https://getfoundry.sh/)
- Install Just (optional, but recommended) - see [here](https://just.systems/man/en/packages.html)
- Run Hardhat compiler to generate artifacts

```shell
npx hardhat compile
```

NOTE: Hardhat generated artifacts are required to resolve the version mismatch between contracts while running the tests, due to the stricter compiler version handling in Foundry.

 **⚠️ WARNING: Foundry Compilation Differences**

Smart contracts compiled with Foundry produce different bytecode than those compiled with Hardhat. This is due to differences in:

- Compiler version handling and optimization settings
- Metadata hash generation and inclusion
- Library linking and dependency resolution

 **CRITICAL: Foundry-compiled artifacts MUST NOT be used for:**

- ✗ Deploying contracts to production networks
- ✗ Upgrading any production smart contracts
- ✗ Generating deployment addresses or verification data

 **Foundry is intended ONLY for:**

- ✓ Enhanced testing and test development
- ✓ Non-critical scripting and prototyping
- ✓ Development workflows and local testing

 **For all production deployments and upgrades, use Hardhat-compiled artifacts exclusively.**

## Install dependencies

```shell
just install
```

## Compilation

```shell
just build
```

## Run Tests

```shell
just test
```

## Show coverage

```shell
just coverage
```

## Format code

Default configuration in the `justfile` only formats the contracts in the script and test folders to avoid formatting the main contracts folder which is managed by Hardhat.

```shell
just fmt
```
------
License: This codebase is licensed under the GNU Affero General Public License (AGPL).  See: [LICENSE](./LICENSE).
