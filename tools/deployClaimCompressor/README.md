# Deploy ClaimCompressor
Script to deploy `ClaimCompressor.sol`

## Install
```
npm i
```

## Setup
- Config file `deploy_claimCompressor.json`:
  - `bridgeAddress`: polygonZkEVMBridgeAddress
  - `networkId`
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
## Usage

- Copy configuration file:
```
cp ./tools/deployClaimCompressor/deploy_claimCompressor.json.example ./tools/deployClaimCompressor/deploy_claimCompressor.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/deployClaimCompressor/deployClaimCompressor.ts --network <network>
```

- Output:
  - `deploy_claim_compressor_output.json`:
    ```
    {
      "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "ClaimCompressorContract": "0x851356ae760d987E095750cCeb3bC6014560891C"
    }
    ```
  - logs:
    ```
    deploying with:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    #######################

    Claim Compressor deployed to: 0xc5a5C42992dECbae36851359345FE25997F5C42d
    #######################

    you can verify the contract address with:
    npx hardhat verify --constructor-args upgrade/arguments.js 0xc5a5C42992dECbae36851359345FE25997F5C42d --network localhost

    Copy the following constructor arguments on: upgrade/arguments.js 
     [ '0x124fBB77374f2D2F0d716973C23Ab06AE49ACde5', 0 ]

    ```