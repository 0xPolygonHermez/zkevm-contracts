# Deploy PolygonDataCommittee
Script to deploy `PolygonDataCommittee.sol`

## Install
```
npm i
```

## Setup
- Config file `deploy_dataCommittee_parameters.json`:
    - `admin`
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
> All commands are done from root repository.

- Copy configuration file:
```
cp ./tools/deployPolygonDataCommittee/deploy_dataCommittee_parameters.json.example ./tools/deployPolygonDataCommittee/deploy_dataCommittee_parameters.json
```

- Run tool:
```
npx hardhat run ./tools/deployPolygonDataCommittee/deployPolygonDataCommittee.ts --network <network>
```

- Output:
    - `deploy_dataCommittee_output.json`:
    ```
    {
      "polygonDataCommitteeAddress": "0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690",
      "proxyAdmin": "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E"
    }
    ```
    - logs:
    ```
    deploying with:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    
    #######################
    
    PolygonDataCommittee deployed to: 0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690
    #######################
    
    polygonDataCommittee deployed to: 0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690
    you can verify the new polygonDataCommittee address with:
    npx hardhat verify 0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690 --network localhost
    ```
