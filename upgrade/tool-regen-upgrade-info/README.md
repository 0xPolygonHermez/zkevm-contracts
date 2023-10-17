# Regenerate upgrade info

## pre-requisites
- move to the commit where the last upgrade has been done
- delete folder `artifacts` and `cache` folder

## set project root environment variables
- `cp .env.example .env` in root folder and set your own variables

## input variables
- copy input.example.json into your input file and fill in with your parameters:
  - `cp upgrade/tool-regen-upgrade-info/input.example.json upgrade/tool-regen-upgrade-info/input.json`

- input parameters:
```
{
  "proxyAddress": "0x012345",
  "implementationName": "PolygonZkEVMUpgraded",
  "constructorArgs": [
      "0x6407cf296a27B38fd29c401518504D388F1DFB3d",
      "0xF1b13757bcF3EF902a7847f409A6068BA43a89D4",
      "0xeDB618947F59FC5caA8bc9c24283807FDdAf6E2c",
      "0xcFA773Cc48FBde3CA4D24eeCb19D224d697026b2",
      1440,
      3
  ]
}
```

## run the script
- Run the following commands from the root repository:
  - command: `npx hardhat run regenerate-upgrade-info.js --network {networkName}`
  - output: create `.openzeppelin` folder with `${networkName}.json`
