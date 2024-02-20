#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=1 docker compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
cp docker/scripts/testV1ToV2/deploy_parameters_docker.json deployment/testV1ToV2/deploy_parameters.json
npm run deploy:testnet:testV1ToV2:localhost
mkdir docker/deploymentOutput
mv deployment/testV1ToV2/deploy_output.json docker/deploymentOutput
mv deployment/testV1ToV2/genesis.json docker/deploymentOutput
DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData