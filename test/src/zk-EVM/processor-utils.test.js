/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { Scalar } = require('ffjavascript');
const {
    toHexStringRlp, customRawTxToRawTx, rawTxToCustomRawTx, decodeCustomRawTxProverMethod,
} = require('../../../src/zk-EVM/helpers/processor-utils');

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

                        const reconstructedEthers = customRawTxToRawTx(customRawTx);
                        expect(rawTxEthers).to.equal(reconstructedEthers);
                    }
                    expect(customRawTx).to.equal(txData.rawTx);

                    // Test decode raw tx prover method
                    const { txDecoded, rlpSignData } = decodeCustomRawTxProverMethod(customRawTx);
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
                    expect(rlpSignData).to.equal(signData);

                    const txParams = Object.keys(txDecoded);
                    txParams.forEach((key) => {
                        if (txDecoded[key] === '0x' && key !== 'data') {
                            txDecoded[key] = '0x00';
                        }
                    });
                    expect(Number(txDecoded.nonce)).to.equal(tx.nonce);
                    expect(ethers.BigNumber.from(txDecoded.gasPrice)).to.equal(tx.gasPrice);
                    expect(ethers.BigNumber.from(txDecoded.gasLimit)).to.equal(tx.gasLimit);
                    expect(ethers.BigNumber.from(txDecoded.to)).to.equal(ethers.BigNumber.from(tx.to));
                    expect(ethers.BigNumber.from(txDecoded.value)).to.equal(tx.value);
                    expect(Number(txDecoded.chainID)).to.equal(tx.chainId);
                } catch (error) {
                    expect(txData.customRawTx).to.equal(undefined);
                }
            }
        }
    });
});
