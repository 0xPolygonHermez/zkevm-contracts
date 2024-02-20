# Verify Deployment mainnet

This document ins a guide in order to verify the mainnet smart contract deploymet of the zkEVM

## Basic OS preparation

You should have a version of node: >16 (e.g. 18.14.0 )
If not you can execute the following commands:

```bash
curl -sL https://deb.nodesource.com/setup_18.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node -v
```

## Download zkevm contracts repository

DOwnload and install the zkevm-contracts repository and go to the specific commit

```bash
git clone https://github.com/0xPolygonHermez/zkevm-contracts
npm i
git checkout 7a8d0c1950cf267fb7b10be8a47506754399cd4a
```

## Verify deployment

In order to verify the deployment, we will compare the deployed bytecode with the compiled locally. Some of the contracts use [`immutables`](https://docs.soliditylang.org/en/v0.8.19/contracts.html#immutable), in that case it's not enough to just compile the code and compare with the deployed bytecode.
The easiest way is to verify this contracts is to deploy them on a local environment and then compare the bytecodes of this contracts and the mainnet ones.

In order to launch the script, you need a mainnet provider.
In root of the project create a `.env` file you Infura api key information:

```
mkdir .env
```

`.env` file should contain something like:

```
INFURA_PROJECT_ID="<Your Infura project ID>s"
```

Now you can compile the contracts and run the script:

```bash
npx hardhat compile
node verifyMainnetDeployment/verifyMainnetDeployment.js
```

This script verifies the deployed bytecode of the address provided in `deploymentMainnet.json`

## Verify genesis root

At the end of the previous script we also verify that the genesis provided in the`deploymentMainnet.json` matches the one in the `polygonZkEVM`

In order to verify the genesis, you can the script to generate it. The script in a very similar behaviour of the last script, deploy locally the contracts and then copy the deployed btyecode into the corresponding address.

```bash=
node deployment/1_createGenesis.js --input ../verifyMainnetDeployment/mainnetDeployParameters.json --out ../verifyMainnetDeployment/genesis.json
```

Now a new file will be created in `verifyMainnetDeployment/genesis.json`
Here you can check all the genesis information, and you can assert that the `root` generated matches the one on `mainnetDeployment.json`
