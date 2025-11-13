# Get Rollup Data
Script to get rollup data.

## Install
```
npm i
```

## Setup
- Config file `rollupDataParams.json`:
  - `polygonRollupManagerAddress`: rollupManager address,
  - `rollupID`: rollup ID
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
> All paths are from root repository

## Usage
> All commands are done from root repository.

- Copy configuration file:
```
cp tools/getRollupData/rollupDataParams.json.example tools/getRollupData/rollupDataParams.json
```
- Set your parameters
- Run tool:
```
npx hardhat run tools/getRollupData/getRollupData.ts --network <network>
```
- Output:
  - `deploy_output.json`:
    ```
    {
        "polygonRollupManagerAddress": "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
        "polygonZkEVMBridgeAddress": "0x124fBB77374f2D2F0d716973C23Ab06AE49ACde5",
        "polygonZkEVMGlobalExitRootAddress": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
        "polTokenAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "deploymentRollupManagerBlockNumber": 43
    }
    ```

  - `create_rollup_output_X`:
    ```
    {
        "genesis": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "createRollupBlockNumber": 49,
        "rollupAddress": "0x1F708C24a0D3A740cD47cC0444E9480899f3dA7D",
        "consensusContract": "0.0.1",
        "rollupID": 1,
        "L2ChainID": 1001,
        "gasTokenAddress": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
    }
    ```
