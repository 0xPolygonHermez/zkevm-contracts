#!/bin/bash
sudo rm -rf docker/gethData/geth_data
DEV_PERIOD=0 docker-compose -f docker/docker-compose.geth.yml up -d geth
sleep 5
node docker/scripts/fundAccounts.js 
npx hardhat run deployment/testnet/deployPoETestnet.js --network localhost
cp deployment/testnet/deploy_output.json docker/deploymentOutput
docker-compose -f docker/docker-compose.geth.yml down
sudo docker build -t hermez-geth1.3 -f docker/Dockerfile.geth .
