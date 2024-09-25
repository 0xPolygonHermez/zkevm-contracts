#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
sudo rm -rf docker/gethData/geth_data
sudo DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
mkdir docker/deploymentOutput
sudo mv deployment/v2/deploy_output.json docker/deploymentOutput
sudo mv deployment/v2/genesis.json docker/deploymentOutput
sudo mv deployment/v2/create_rollup_output.json docker/deploymentOutput
sudo DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData
# Run container
sudo docker run -p 8545:8545 -d --name docker_test hermeznetwork/geth-zkevm-contracts
# Run docker tests
npm run docker:tests
# stop container
sudo docker stop docker_test
# remove container
sudo docker container rm docker_test