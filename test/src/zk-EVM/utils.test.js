/* eslint-disable no-await-in-loop */
const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('Encode and decode transactions in RLP', () => {
    let testVectors;

    before(async () => {
        testVectors = JSON.parse(fs.readFileSync(path.join(__dirname, './helpers/test-vector-data/state-transition.json')));
    });

    it('Check encode and decode transactions', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                genesis,
                txs,
                batchL2Data,
            } = testVectors[i];

            const walletMap = {};

            // load wallets
            for (let j = 0; j < genesis.length; j++) {
                const {
                    address, pvtKey,
                } = genesis[j];
                const newWallet = new ethers.Wallet(pvtKey);
                expect(address).to.be.equal(newWallet.address);
                walletMap[address] = newWallet;
            }

            // build, sign transaction and generate rawTxs
            // rawTxs would be the calldata inserted in the contract
            const txProcessed = [];
            const rawTxs = [];
            for (let j = 0; j < txs.length; j++) {
                const txData = txs[j];
                const tx = {
                    to: txData.to,
                    nonce: txData.nonce,
                    value: ethers.utils.parseEther(txData.value),
                    gasLimit: txData.gasLimit,
                    gasPrice: ethers.utils.parseUnits(txData.gasPrice, 'gwei'),
                    chainId: txData.chainId,
                };

                try {
                    let rawTx = await walletMap[txData.from].signTransaction(tx);
                    expect(rawTx).to.equal(txData.rawTx);

                    if (txData.encodeInvalidData) {
                        rawTx = rawTx.slice(0, -6);
                    }
                    rawTxs.push(rawTx);
                    txProcessed.push(txData);
                } catch (error) {
                    expect(txData.rawTx).to.equal(undefined);
                }
            }
            const encodedTransactions = ethers.utils.RLP.encode(rawTxs);
            const decoded = ethers.utils.RLP.decode(encodedTransactions);
            expect(decoded).to.be.deep.equal(rawTxs);
            expect(batchL2Data).to.be.equal(encodedTransactions);
        }
    });
});
