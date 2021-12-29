#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=0 docker-compose -f docker/docker-compose.geth.yml up -d geth
sleep 5
node docker/scripts/fund-accounts.js
npx hardhat run deployment/testnet/deployPoETestnet.js --network localhost
mkdir docker/deploymentOutput
mv deployment/testnet/deploy_output.json docker/deploymentOutput
docker-compose -f docker/docker-compose.geth.yml down
sudo docker build -t hermeznetwork/geth-zkevm-contracts -f docker/Dockerfile.geth .
