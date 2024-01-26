## Requirements

- node version: 14.x
- npm version: 7.x

## Upgrade

```
npm i
cp .env.example .env
```

Fill `.env` with your `MNEMONIC` and `INFURA_PROJECT_ID`

In order to upgrade the contracts we will need the information on `deployments/${network}_$(date +%s)`

In project root, copy the `${network}.json` of the deployment that you want to upgrade and copy it on the `./.openzeppelin`
e.g. `cp deployments/${network}_$(date +%s)/${network}.json ./.openzeppelin`

Then fill the upgrade parameters:

```
cd deployment
cp upgrade_parameters.json.example upgrade_parameters.json
```

Fill created `upgrade_parameters.json` with appropiate parameters.
You should fullfill the upgrades array, with all the updates that you intend to do ( more information in `upgrade-parameters.json` section)

if the deployment was deployed without a timelock you can use the `simpleUpgradeScript.js`:

- Run the script

Otherwise, in case of timelock use `timeLockUpgrade.js`

- Run the script
- Now the necessary transactions to interact with the timelock are printed in the screen `schedule` and `execute`, also will be saved in
  `./upgrade_output_${new Date().getTime() / 1000}.json` file
- With the owner of the timelock (multisig or account), send the data printed by `schedule` to the `Timelock` contract.
- Once the necessary `timelockMinDelay` has expired, with the same account you can now send the data printed by `execute` to the `Timelock` contract and the contracts will be upgraded.

## upgrade-parameters.json

- `timelockMinDelay`: number, timelock delay between the schedule and execution, must be bigger than current min delay
- `upgrades`: Object, Indicates which address and to which implementation must upgrade
  - address: address of the current proxy
  - contractName: string, contract name that the proxy will be updated to
  - constructorArgs: Array, optional, constructor arguments of the new implementation deployed

### Optional Parameters

- `multiplierGas`: number, Gas multiplier. If maxFeePerGas and maxPriorityFeePerGas are set, will not take effect
- `deployerPvtKey`: string, deployerPvtKey of the deployer
- `timelockSalt`: string, Optional salt for the timelock
