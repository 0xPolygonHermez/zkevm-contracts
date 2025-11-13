# Change minDelay PolygonZkEVMTimelock
Script to change `minDelay` from `PolygonZkEVMTimelock`

## Install
```
npm i
```

## Setup
- Config file `change_delay_timelock.json`:
  - `timelockContractAddress`: timelock contract address
  - `newMinDelay`: new `minDelay`
  - `timeLockDelay`: timelockDelay (by defalult `timeLockDelay` == current `minDelay`)
  - `timelockSalt(optional)`: timelock salt
  - `predecessor(optional)`: timelock predecessor 
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
> All paths are from root repository

## Usage
> All commands are done from root repository.

- Copy configuration file:
```
cp ./tools/changeDelayTimelock/change_delay_timelock.json.example ./tools/changeDelayTimelock/change_delay_timelock.json
```
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/changeDelayTimelock/changeDelayTimelock.ts --network localhost
```


