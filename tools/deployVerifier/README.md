# Deploy verifier
Script to deploy `verifier` smart contract

## Install
```
npm i
```

## Setup
- Config file `deploy_verifier_parameters.json`:
  - `realVerifier`: select between a real or a mock verifer
  - `forkID`: Select fork to verifier to be deployed (if a real verfifier is selected)
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
> All paths are from root repository

## Usage
> All commands are done from root repository.

- Copy configuration file:
```
cp ./tools/deployVerifier/deploy_verifier_parameters.json.example ./tools/deployVerifier/deploy_verifier_parameters.json
```
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/deployVerifier/deployVerifier.ts --network <network>
```
- Output:
  - `deploy_verifier_output.json`:
  ```
  {
    "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "verifier": "FflonkVerifier_12",
    "verifierContract": "0x1613beB3B2C4f22Ee086B2b38C1476A3cE7f78E8"
  }
  ```
  - logs:
  ```
  --> Deploying with:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  --> Deploying verifier: FflonkVerifier_12
  
  #######################
  Verifier deployed to: 0xa82fF9aFd8f496c3d6ac40E2a0F282E47488CFc9
  #######################
  
  #######################
  you can verify the new verifierContract address with the following command:
  npx hardhat verify 0xa82fF9aFd8f496c3d6ac40E2a0F282E47488CFc9 --network localhost
  #######################
  ```