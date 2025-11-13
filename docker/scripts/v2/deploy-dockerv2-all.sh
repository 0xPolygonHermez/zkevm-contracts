#!/bin/bash
# Set the -e option to stop the script if any command fails
set -e
# Define cleanup function
cleanup() {
    sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
}
# Configure "trap" in case there's an error
trap cleanup ERR
# remove old data
sudo rm -rf docker/gethData/geth_data
[ -f deployment/v2/create_rollup_output_* ] && rm ./deployment/v2/create_rollup_output_*
# start geth
sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml up -d geth
sleep 5
# fund accounts
node docker/scripts/fund-accounts.ts
# copy necessary parameters to deploy contracts and create rollup FEP
cp docker/scripts/v2/deploy_parameters_docker.json deployment/v2/deploy_parameters.json
cp docker/scripts/v2/create_rollup_parameters_docker.json deployment/v2/create_rollup_parameters.json
# deploy contracts & create rollup FEP
npm run deploy:testnet:v2:localhost
# remove old data
sudo rm -rf docker/deploymentOutput
# create new folder for deployment output
mkdir docker/deploymentOutput
# move rollup output to output folder
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output.json
# copy new create rollup parameters (v0.2.0) to docker scripts to create new rollup v0.2.0
cp ./docker/scripts/v2/create_rollup_parameters_docker-v0.2.0.json ./deployment/v2/create_rollup_parameters.json
# create new rollup v0.2.0
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
# move rollup output to output folder
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_v0.2.0.json
# copy new create rollup parameters (ECDSA) to docker scripts to create new rollup ECDSA
cp ./docker/scripts/v2/create_rollup_parameters_docker-v0.3.0-ecdsa.json ./deployment/v2/create_rollup_parameters.json
# create new rollup ECDSA
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
# move rollup output to output folder
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_v0.3.0-ecdsa.json
# copy new create rollup parameters (PolygonZkEVMEtrog) to docker scripts to create new rollup PolygonZkEVMEtrog
cp ./docker/scripts/v2/create_rollup_parameters_docker-fork12.json ./deployment/v2/create_rollup_parameters.json
# create new rollup PolygonZkEVMEtrog
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
# move rollup output to output folder
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_fork12.json
# copy new create rollup parameters (PolygonValidiumEtrog) to docker scripts to create new rollup PolygonValidiumEtrog
cp ./docker/scripts/v2/create_rollup_parameters_docker-validium.json ./deployment/v2/create_rollup_parameters.json
# create new rollup PolygonValidiumEtrog
npx hardhat run ./deployment/v2/4_createRollup.ts --network localhost
# move rollup output to output folder
mv ./deployment/v2/create_rollup_output_*.json ./docker/deploymentOutput/create_rollup_output_validium.json
# move deployment output to output folder
sudo mv deployment/v2/deploy_output.json docker/deploymentOutput
sudo mv deployment/v2/genesis.json docker/deploymentOutput
[ -f deployment/v2/genesis_sovereign.json ] && sudo mv deployment/v2/genesis_sovereign.json docker/deploymentOutput
sudo DEV_PERIOD=1 docker compose -f docker/docker-compose.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData