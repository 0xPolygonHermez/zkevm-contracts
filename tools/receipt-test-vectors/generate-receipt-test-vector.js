/* eslint-disable no-await-in-loop, no-loop-func, no-continue */
const hre = require('hardhat'); // eslint-disable-line
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

const testVectors = require('../../test/src/zk-EVM/helpers/test-vector-data/state-transition.json');

function calculateBlockHash(
    parentHash,
    coinbase,
    root,
    txHash,
    receiptHash,
    number,
    gasLimit,
    gasUsed,
    time = 0,
    extra = 0,
    mixDigest = 0,
    nonce = 0,
    uncleHash = 0,
    bloom = 0,
    difficulty = 0,
) {
    const rlpEncodedBlock = ethers.utils.RLP.encode(
        parentHash,
        uncleHash,
        coinbase,
        root,
        txHash,
        receiptHash,
        bloom,
        difficulty,
        number,
        gasLimit,
        gasUsed,
        time,
        extra,
        mixDigest,
        nonce,
    );
    return ethers.utils.keccak256(rlpEncodedBlock);
}

// Constants

async function main() {
    // deploy proof of efficiency

    for (let i = 0; i < testVectors.length; i++) {
        const {
            txs,
            expectedNewRoot,
            sequencerAddress,
        } = testVectors[i];

        const currentTestVector = testVectors[i];
        const blockNumber = 0;
        const gasUsedForTx = 21000;
        const blockGasLimit = 30000000;
        const parentHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        // TODO
        const txHashRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const receiptRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        const receiptArray = [];

        for (let j = 0; j < txs.length; j++) {
            const tx = txs[j];
            if (tx.encodeInvalidData === true || tx.rawTx === undefined || tx.reason !== '') {
                continue;
            }

            const receipt = {
                transactionHash: ethers.utils.keccak256(tx.rawTx),
                transactionIndex: receiptArray.length,
                blockNumber,
                from: tx.from,
                to: tx.to,
                cumulativeGasUsed: gasUsedForTx * (receiptArray.length + 1),
                gasUsedForTx,
                contractAddress: null,
                logs: 0,
                logsBloom: 0,
                status: 1,
            };

            receiptArray.push({
                txId: tx.id,
                receipt,
            });
        }
        currentTestVector.receipts = receiptArray;
        currentTestVector.blockInfo = {
            blockNumber,
            gasUsedForTx,
            blockGasLimit,
            parentHash,
            txHashRoot,
            receiptRoot,
        };

        const gasUsed = gasUsedForTx * (receiptArray.length);
        const blockHash = calculateBlockHash(
            parentHash,
            sequencerAddress,
            expectedNewRoot,
            txHashRoot,
            receiptRoot,
            blockNumber,
            blockGasLimit,
            gasUsed,
        );
        for (let j = 0; j < receiptArray.length; j++) {
            receiptArray[j].receipt.blockHash = blockHash;
        }
    }
    const dir = path.join(__dirname, './receipt-vector.json');
    await fs.writeFileSync(dir, JSON.stringify(testVectors, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
