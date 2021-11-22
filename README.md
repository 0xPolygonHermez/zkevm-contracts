# contracts-zkEVM

Smart contract implementation which will be used by the zkEVM


## Requirements

- node version: 14.x
- npm version: 7.x

## Repository structure
- `contracts`: zkEVM contracts
- `docs`: specs and useful links
- `js`: complementary code in javascript
- `test`: test all repository code

## Install

```
git config --local core.hooksPath .githooks/
```

## Activate github hook

```
npm run i
```

## Run tests

```
npm run test
```

## Run Linter

See errors:

```
npm run lint
```

Autofix errors:

```
npm run lintFix
```

## Deploy on hardhat

```
npm run deploy:PoE:hardhat
```

## License

`hermeznetwork/hez-matic-merge` is part of the Hermez project copyright 2020 HermezDAO and published with GPL-3 license. Please check the LICENSE file for more details.
