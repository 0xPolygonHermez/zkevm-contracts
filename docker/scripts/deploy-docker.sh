#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=1 docker-compose -f docker/docker-compose.geth.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
npx hardhat run deployment/deployment_v2-0/deployPoE_v2-0.js --network localhost
mkdir docker/deploymentOutput
mv deployment/deployment_v2-0/deploy_output.json docker/deploymentOutput
docker-compose -f docker/docker-compose.geth.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile.geth .
# Let it readable for the multiplatform build coming later!
sudo chmod -R go+rxw docker/gethData
