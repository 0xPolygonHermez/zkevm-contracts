# Upgrade pre etrog genesis
Script to migrate a non-LxLY genesis (previous genesis) to an LxLY genesis (etrog fork).

## Install
```
npm i
```

## Setup
- Config file `upgrade_pre_etrog_genesis.json`:
    -   `test`: bool, Indicate if it's a test deployment, which will fund the deployer address with pre minted ether and will give more powers to the deployer address to make easier the flow.
    -   `timelockAdminAddress`: address, Timelock owner address, able to send start an upgradeability process via timelock
    -   `minDelayTimelock`: number, Minimum timelock delay,
    -   `initialZkEVMDeployerOwner`: address, Initial owner of the `PolygonZkEVMDeployer`
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`

## Usage

- Copy configuration file:
```
cp ./tools/upgradePreEtrogGenesis/upgrade_pre_etrog_genesis.json.example ./tools/upgradePreEtrogGenesis/upgrade_pre_etrog_genesis.json
```
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/upgradePreEtrogGenesis/upgradePreEtrogGenesis.ts
```

- Output: `new_genesis.json`