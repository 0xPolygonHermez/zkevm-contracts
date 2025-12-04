#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e

# Detect which docker compose command is available. Depending on the version it may be:
# - docker-compose
# - docker compose
# With this single script both are supported
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    echo "Error: Neither 'docker-compose' nor 'docker compose' is available"
    exit 1
fi

# Define cleanup function
cleanup() {
    sudo DEV_PERIOD=1 $DOCKER_COMPOSE_CMD -f docker/docker-compose.yml down
}
# Configure "trap" in case there's an error
trap cleanup ERR

sudo rm -rf docker/gethData/geth_data
sudo DEV_PERIOD=1 $DOCKER_COMPOSE_CMD -f docker/docker-compose.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.ts
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
npm run deploy:testnet:v2:localhost
sudo rm -rf docker/deploymentOutput
mkdir docker/deploymentOutput
sudo mv deployment/v2/deploy_output.json docker/deploymentOutput
sudo mv deployment/v2/genesis.json docker/deploymentOutput
[ -f deployment/v2/genesis_sovereign.json ] && sudo mv deployment/v2/genesis_sovereign.json docker/deploymentOutput
sudo mv deployment/v2/create_rollup_output_* docker/deploymentOutput/create_rollup_output.json
sudo DEV_PERIOD=1 $DOCKER_COMPOSE_CMD -f docker/docker-compose.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData
