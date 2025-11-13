#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Run docker tests
# Run container
docker run -p 8545:8545 -d --name docker_test hermeznetwork/geth-zkevm-contracts
# copy genesis.json (it is necessary because createNewRollup tooling uses it)
cp docker/deploymentOutput/genesis.json tools/createNewRollup/genesis.json
# Run docker tests
npx hardhat test docker/docker-tests.test.ts --network localhost
# Run tooling tests to docker
npx hardhat test docker/tools-docker-tests.test.ts --network localhost
# Run verify tests to docker
npx hardhat test docker/docker-verify.test.ts --network localhost
# If docker is deployed with npm run dockerv2:contracts:all you can check all rollups
# npx hardhat test check-all-rollups.ts --network localhost
# stop container
docker stop docker_test
# remove container
docker container rm docker_test