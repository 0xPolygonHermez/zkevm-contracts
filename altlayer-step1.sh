#!/bin/bash

# docker run --rm zkevm-contracts:latest ./altlayer-step1.sh | tee wallets.txt

set -x
node wallets.js
set +x
