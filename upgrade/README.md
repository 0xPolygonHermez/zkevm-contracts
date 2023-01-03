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

if the deployment was deployed without a timelock you can use the `simpleUpgradeScript.js`:

- Update the `proxyPolygonAddress` with the proxy address you want to update
- Update the `polygonZkEVMFactory` with the new implementation contract you want to upgrade
- Run the script

Otherwise, inc ase of timelock use `timeLockUpgrade.js`

- Update the `proxyPolygonAddress` with the proxy address you want to update
- Update the `polygonZkEVMFactory` with the new implementation contract you want to upgrade
- Update the `minDelay` with the delay that you want to use
- Run the script
- Now the necessary transactions to interact with the timelock are printed in the screen `schedule` and `execute`
- With the owner of the timelock ( multisig or account), send the data printed by `schedule` to the `Timelock` contract.
- Once the necessary timeout has pass, with the same account you can now send the data printed by `execute` to the `Timelock` contract and the contracts will be upgraded.
