#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Run docker tests
# Run container
docker run -p 8545:8545 -d --name docker_test hermeznetwork/geth-zkevm-contracts
# Run docker tests
npx hardhat test docker/docker-tests.test.ts --network localhost
# stop container
docker stop docker_test
# remove container
docker container rm docker_test