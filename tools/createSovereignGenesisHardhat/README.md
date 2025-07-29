# Create sovereign genesis
Script to generate the genesis file for a rollup with `SovereignContracts`. This genesis is aimed to be used for chains that are run with vanilla clients.
This script should be run after the rollup is created, so its `rollupID` and the bridge initialization parameters are known.
The script does the following:
- read base genesis file
- deploy sovereign contracts
- initialize them

## Setup
- install packages
```
npm i
```

- Set env variables
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `ETHERSCAN_API_KEY`

- Copy configuration files:
```
cp ./tools/createSovereignGenesis/create-genesis-sovereign-params.json.example ./tools/createSovereignGenesis/create-genesis-sovereign-params.json
```

- Copy genesis base file:
```
cp ./tools/createSovereignGenesis/genesis-base.json.example ./tools/createSovereignGenesis/genesis-base.json
```

-  Set your parameters
  - `rollupManagerAddress`: `polygonRollupManager` smart contract address
  - `rollupID`: Rollup identifier. Assigned to a rollup when it is created in the contracts
  - `chainID`: ChainID of the rollup
  - `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
  - `bridgeManager`: bridge manager address
  - `sovereignWETHAddress`: sovereign WETH address
  - `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
  - `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
  - `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
  - `emergencyBridgePauser`: emergency bridge pauser address, can stop the bridge, recommended to be a multisig
  - `emergencyBridgeUnpauser`: emergency bridge unpauser address, can unpause the bridge, recommended to be a multisig
  - `setPreMintAccount`: indicates if a preMint accounts going to be added
    - `preMintAccount.address`: ethereum address to receive an initial balance
    - `preMintAccount.balance`: balance credited to the preminted address
  - `setTimelockParameters`: indicates if the timelock parameters are going to be changed
    - `timelockParameters.adminAddress`: address that will have all timelocks roles (ADMIN, PROPOSER, CANCELLER, EXECUTOR)
    - `timelockParameters.minDelay`: minimum delay set in the timelock smart contract
- Optional parameters
  - `format`: choose genesis output format. Supported ones: `geth`

-  Run tool:
```
npx hardhat run ./tools/createSovereignGenesis/create-sovereign-genesis.ts --network sepolia
```

### More Info
- All commands are done from root repository
- The output files are:
  - `genesis-rollupID-${rollupID}__${timestamp}`: genesis file
  - `output-rollupID-${rollupID}__${timestamp}`: input parameters, gastokenAddress information and network used
- outputs are saved in the tool folder: `./tools/createSovereignGenesis`