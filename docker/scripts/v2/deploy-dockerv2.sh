#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=1 docker compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
mkdir docker/deploymentOutput
mv deployment/v2/deploy_output.json docker/deploymentOutput
mv deployment/v2/genesis.json docker/deploymentOutput
mv deployment/v2/create_rollup_output.json docker/deploymentOutput
DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData