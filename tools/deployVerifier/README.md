# Deploy verifier
Script to deploy `verifier` smart contract

## Install
```
npm i
```

## Setup
- Config file
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
cp ./tools/deployVerifier/deploy_verifier_parameters.example ./tools/deployVerifier/deploy_verifier_parameters.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/deployVerifier/deployVerifier.ts --network sepolia
```
