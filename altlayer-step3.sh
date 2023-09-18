#!/bin/bash

# mkdir outputs-step3 && \
# docker run --rm \
#  --env GAS_PRICE_KEYLESS_DEPLOYMENT=100 \
#  -v $(pwd)/.env:/app/.env \
#  -v $(pwd)/deploy_parameters.json:/app/deployment/deploy_parameters.json \
#  -v $(pwd)/outputs-step3:/app/outputs \
#  zkevm-contracts:latest ./altlayer-step3.sh

set -a
source .env
set +a

set -x
npm run deploy:deployer:ZkEVM:goerli
npm run verify:deployer:ZkEVM:goerli
npm run deploy:testnet:ZkEVM:goerli
npm run verify:ZkEVM:goerli
OUTPUT_FOLDER=$(ls deployments/)
mv $OUTPUT_FOLDER/* outputs/
set +x
