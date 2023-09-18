#!/bin/bash

# docker run --rm --env ETHERSCAN_API_KEY="" zkevm-contracts:latest ./altlayer-step2.sh

ETH_GASPRICE_RESULT=$(curl -s "https://api-goerli.etherscan.io/api?module=proxy&action=eth_gasPrice&apikey=$ETHERSCAN_API_KEY")
echo "eth_gasPrice = $ETH_GASPRICE_RESULT"

RESULT_IN_DECIMAL=$(printf "%d\\n" $(echo $ETH_GASPRICE_RESULT | jq -r .result))
echo "in decimal   = $RESULT_IN_DECIMAL"

RESULT_IN_GWEI=$(($RESULT_IN_DECIMAL/1000000000))
echo "in Gwei      = $RESULT_IN_GWEI"

echo "Add 50 to result and use this as GAS_PRICE_KEYLESS_DEPLOYMENT in step 3"
