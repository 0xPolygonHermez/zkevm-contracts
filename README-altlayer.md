# Dockerized zkevm-contracts

## Build Steps
```
docker built -t zkevm-contracts:latest .
```

## Usage Steps
1. Execute the wallet creation step (described [here](https://wiki.polygon.technology/docs/zkevm/step3-fullzkevm#create-wallets))
   ```
   docker run --rm zkevm-contracts:latest ./altlayer-step1.sh | tee wallets.txt
   ```
2. Fill up the `.env` file (described [here](https://wiki.polygon.technology/docs/zkevm/step3-fullzkevm#prepare-deploy-configuration))
3. Execute the Goerli gas price checking step (described in same section)
   ```
   docker run --rm --env ETHERSCAN_API_KEY=<from .env file> zkevm-contracts:latest ./altlayer-step2.sh
   ```
4. Create `deploy_parameters.json` file (described in same section)
5. Execute the deployment step (described [here](https://wiki.polygon.technology/docs/zkevm/step3-fullzkevm#deploy-contracts))
   ```
   mkdir outputs-step3 && \
   docker run --rm \
    --env GAS_PRICE_KEYLESS_DEPLOYMENT=<from gas price check result> \
    -v $(pwd)/.env:/app/.env \
    -v $(pwd)/deploy_parameters.json:/app/deployment/deploy_parameters.json \
    -v $(pwd)/outputs-step3:/app/outputs \
    zkevm-contracts:latest ./altlayer-step3.sh
   ```
6. Outputs should be in `outputs-step3`
7. Execute the MATIC approval step (described [here](https://wiki.polygon.technology/docs/zkevm/step4-fullzkevm#approve-matic-token-for-sequencer))
   ```
   docker run --rm \
    --env WALLETS_TRUSTED_SEQUENCER_PRIVKEY=<from wallets.txt> \
    --env DEPLOY_OUTPUT_MATIC_TOKEN_ADDRESS=<from deploy_output.json> \
    --env DEPLOY_OUTPUT_POLYGON_ZKEVM_ADDRESS=<from deploy_output.json> \
    -v $(pwd)/.env:/app/.env \
    zkevm-contracts:latest ./altlayer-step4.sh 
   ```
