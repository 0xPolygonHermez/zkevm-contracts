/* eslint-disable no-await-in-loop, no-loop-func, no-continue */
const hre = require('hardhat'); // eslint-disable-line
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

const testVectors = require('../../test/src/zk-EVM/helpers/test-vector-data/state-transition.json');

async function main() {
    // deploy proof of efficiency
    const receiptVectorTest = [];

    for (let i = 0; i < testVectors.length; i++) {
        const {
            txs,
        } = testVectors[i];

        const blockHash = '0x0000000000000000000000000000000000000000000000000000000000000123';
        const blockNumber = 0;

        const gasUsed = 21000;

        for (let j = 0; j < txs.length; j++) {
            const tx = txs[j];
            if (tx.encodeInvalidData === true || tx.rawTx === undefined) {
                continue;
            }

            const receipt = {
                transactionHash: ethers.utils.keccak256(tx.rawTx),
                transactionIndex: receiptVectorTest.length,
                blockHash,
                blockNumber,
                from: tx.from,
                to: tx.to,
                cumulativeGasUsed: gasUsed * (receiptVectorTest.length + 1),
                gasUsed,
                contractAddress: null,
                logs: 0,
                logsBloom: 0,
                status: 1,
            };

            delete txs[j].id;

            receiptVectorTest.push({
                txs: txs[j],
                receipt,
            });
        }
    }
    const dir = path.join(__dirname, './receipt-vector.json');
    await fs.writeFileSync(dir, JSON.stringify(receiptVectorTest, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
