/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const { rawTxToCustomRawTx, toHexStringRlp } = require('../../../src/zk-EVM/helpers/executor-utils');

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

            /*
             * build, sign transaction and generate rawTxs
             * rawTxs would be the calldata inserted in the contract
             */
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
                    data: txData.data || '0x',
                };
                if (!ethers.utils.isAddress(tx.to) || !ethers.utils.isAddress(txData.from)) {
                    expect(txData.rawTx).to.equal(undefined);
                    continue;
                }

                try {
                    let customRawTx;

                    if (tx.chainId === 0) {
                        const signData = ethers.utils.RLP.encode([
                            toHexStringRlp(Scalar.e(tx.nonce)),
                            toHexStringRlp(tx.gasPrice),
                            toHexStringRlp(tx.gasLimit),
                            toHexStringRlp(tx.to),
                            toHexStringRlp(tx.value),
                            toHexStringRlp(tx.data),
                            toHexStringRlp(tx.chainId),
                            '0x',
                            '0x',
                        ]);
                        const digest = ethers.utils.keccak256(signData);
                        const signingKey = new ethers.utils.SigningKey(walletMap[txData.from].privateKey);
                        const signature = signingKey.signDigest(digest);
                        const r = signature.r.slice(2).padStart(64, '0'); // 32 bytes
                        const s = signature.s.slice(2).padStart(64, '0'); // 32 bytes
                        const v = (signature.v).toString(16).padStart(2, '0'); // 1 bytes
                        customRawTx = signData.concat(r).concat(s).concat(v);
                    } else {
                        const rawTxEthers = await walletMap[txData.from].signTransaction(tx);
                        customRawTx = rawTxToCustomRawTx(rawTxEthers);
                    }

                    expect(customRawTx).to.equal(txData.rawTx);

                    if (txData.encodeInvalidData) {
                        customRawTx = customRawTx.slice(0, -6);
                    }
                    rawTxs.push(customRawTx);
                    txProcessed.push(txData);
                } catch (error) {
                    expect(txData.rawTx).to.equal(undefined);
                }
            }

            const encodedTransactions = rawTxs.reduce((previousValue, currentValue) => previousValue + currentValue.slice(2), '0x');
            expect(batchL2Data).to.be.equal(encodedTransactions);


            const signatureBytes = 65;
            // from rawTxArray to reduced string
            const encodedTxBytes = ethers.utils.arrayify(encodedTransactions);

            let offset = 0;
            const decodedRawTx = [];

            while (offset < encodedTxBytes.length) {
                if (encodedTxBytes[offset] >= 0xf8) {
                    const lengthLength = encodedTxBytes[offset] - 0xf7;
                    if (offset + 1 + lengthLength > encodedTxBytes.length) {
                        throw new Error("encodedTxBytes short segment too short");
                    }

                    const length = unarrayifyInteger(encodedTxBytes, offset + 1, lengthLength);
                    if (offset + 1 + lengthLength + length > encodedTxBytes.length) {
                        throw new Error("encodedTxBytes long segment too short");
                    }

                    decodedRawTx.push(ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + 1 + lengthLength + length + signatureBytes)));
                    offset = offset + 1 + lengthLength + length + signatureBytes;

                } else if (encodedTxBytes[offset] >= 0xc0) {
                    const length = encodedTxBytes[offset] - 0xc0;
                    if (offset + 1 + length > encodedTxBytes.length) {
                        throw new Error("encodedTxBytes array too short");
                    }

                    decodedRawTx.push(ethers.utils.hexlify(encodedTxBytes.slice(offset, offset + 1 + length + signatureBytes)));
                    offset = offset + 1 + length + signatureBytes;
                } else {
                    throw new Error("Error");
                }
            }
            expect(rawTxs).to.be.deep.equal(decodedRawTx);
        }
    });
});


function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = (result * 256) + data[offset + i];
    }
    return result;
}