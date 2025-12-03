#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Define cleanup function
cleanup() {
    DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml down
}
# Configure "trap" in case there's an error
trap cleanup ERR

rm -rf docker/gethData/geth_data

# Set UID/GID so container runs as current user, not root
export DOCKER_UID=$(id -u)
export DOCKER_GID=$(id -g)

DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.ts
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
rm -rf docker/deploymentOutput
mkdir docker/deploymentOutput
mv deployment/v2/deploy_output.json docker/deploymentOutput
mv deployment/v2/genesis.json docker/deploymentOutput
[ -f deployment/v2/genesis_sovereign.json ] && mv deployment/v2/genesis_sovereign.json docker/deploymentOutput
mv deployment/v2/create_rollup_output_* docker/deploymentOutput/create_rollup_output.json
DEV_PERIOD=1 docker-compose -f docker/docker-compose.yml down
docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
