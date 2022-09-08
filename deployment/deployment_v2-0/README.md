## Requirements

- node version: 14.x
- npm version: 7.x

## Deployment

In project root execute:

```
npm i
cp .env.example .env
```

Fill `.env` with your `MNEMONIC` and `INFURA_PROJECT_ID`

```
cd deployment/deployment_v2-0
cp deploy_parameters.json.example deploy_parameters.json
```

Fill created `deploy_parameters.json` with appropiate parameters.

To deploy contracts run `npm run deploy:PoE2_0:${network}`, for example:

```
npm run deploy:PoE2_0:goerli
```

To verify contracts run `npm run verify:PoE2_0:${network}`, for example:

```
npm run verify:PoE2_0:goerli
```
