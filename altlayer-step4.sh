#!/bin/bash

# docker run --rm \
#  --env WALLETS_TRUSTED_SEQUENCER_PRIVKEY="" \
#  --env DEPLOY_OUTPUT_MATIC_TOKEN_ADDRESS="" \
#  --env DEPLOY_OUTPUT_POLYGON_ZKEVM_ADDRESS="" \
#  -v $(pwd)/.env:/app/.env \
#  zkevm-contracts:latest ./altlayer-step4.sh 

set -a
source .env
set +a

npx hardhat run approve.js --network goerli
