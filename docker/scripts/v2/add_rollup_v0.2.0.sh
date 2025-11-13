#!/bin/bash

# docker run -p 8545:8545 -d --name docker_test hermeznetwork/geth-zkevm-contracts

cp ./docker/scripts/v2/create_rollup_parameters_docker-v0.2.0.json ./deployment/v2/create_rollup_parameters.json
cp ./docker/deploymentOutput/genesis.json ./deployment/v2/
cp ./docker/deploymentOutput/genesis_sovereign.json ./deployment/v2/
cp ./docker/deploymentOutput/deploy_output.json ./deployment/v2/
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/
rm ./deployment/v2/genesis.json ./deployment/v2/genesis_sovereign.json ./deployment/v2/deploy_output.json