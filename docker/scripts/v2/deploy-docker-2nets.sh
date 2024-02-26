#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js

# Unified part + NET1
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
mkdir docker/deploymentOutput
mv deployment/v2/deploy_output.json docker/deploymentOutput/deploy_output-1.json
mv deployment/v2/genesis.json docker/deploymentOutput/genesis-1.json
mv deployment/v2/create_rollup_output.json docker/deploymentOutput/create_rollup_output-1.json

# NET2
cp docker/scripts/v2/create_rollup_parameters_docker-2.json deployment/v2/create_rollup_parameters.json
npm run attach-net:localhost
mv deployment/v2/genesis.json docker/deploymentOutput/genesis-2.json
mv deployment/v2/create_rollup_output.json docker/deploymentOutput/create_rollup_output-2.json

DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml down
docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData
