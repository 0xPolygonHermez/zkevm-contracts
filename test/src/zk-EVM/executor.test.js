/* eslint-disable no-await-in-loop */
const { buildPoseidon } = require('circomlibjs');
const { Scalar } = require('ffjavascript');

const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const MemDB = require('../../../src/zk-EVM/zkproverjs/memdb');
const SMT = require('../../../src/zk-EVM/zkproverjs/smt');
const stateUtils = require('../../../src/zk-EVM/helpers/state-utils');

const ZkEVMDB = require('../../../src/zk-EVM/zkevm-db');
const { setGenesisBlock } = require('./helpers/test-helpers');

describe('Executor Test', () => {
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await buildPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(path.join(__dirname, './helpers/test-vector-data/state-transition.json')));
    });

    it('Check test vectors', async () => {
        for (let i = 0; i < testVectors.length; i++) {
            const {
                id,
                arity,
                genesis,
                expectedOldRoot,
                txs,
                expectedNewRoot,
                chainIdSequencer,
                sequencerAddress,
                expectedNewLeafs,
                batchL2Data,
                localExitRoot,
                globalExitRoot,
                batchHashData,
                inputHash,
            } = testVectors[i];

            const db = new MemDB(F);
            const smt = new SMT(db, arity, poseidon, poseidon.F);

            const walletMap = {};
            const addressArray = [];
            const amountArray = [];
            const nonceArray = [];

            // create genesis block
            for (let j = 0; j < genesis.length; j++) {
                const {
                    address, pvtKey, balance, nonce,
                } = genesis[j];

                const newWallet = new ethers.Wallet(pvtKey);
                expect(address).to.be.equal(newWallet.address);

                walletMap[address] = newWallet;
                addressArray.push(address);
                amountArray.push(Scalar.e(balance));
                nonceArray.push(Scalar.e(nonce));
            }

            const genesisRoot = await setGenesisBlock(addressArray, amountArray, nonceArray, smt);
            for (let j = 0; j < addressArray.length; j++) {
                const currentState = await stateUtils.getState(addressArray[j], smt, genesisRoot);

                expect(currentState.balance).to.be.equal(amountArray[j]);
                expect(currentState.nonce).to.be.equal(nonceArray[j]);
            }

            expect(F.toString(genesisRoot)).to.be.equal(expectedOldRoot);

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

            // create a zkEVMDB and build a batch
            const zkEVMDB = await ZkEVMDB.newZkEVM(
                db,
                chainIdSequencer,
                arity,
                poseidon,
                sequencerAddress,
                genesisRoot,
                F.e(Scalar.e(localExitRoot)),
                F.e(Scalar.e(globalExitRoot)),
            );
            const batch = await zkEVMDB.buildBatch();
            for (let j = 0; j < rawTxs.length; j++) {
                batch.addRawTx(rawTxs[j]);
            }

            // execute the transactions added to the batch
            await batch.executeTxs();

            const newRoot = batch.currentRoot;
            expect(F.toString(newRoot)).to.be.equal(expectedNewRoot);

            // consoldate state
            await zkEVMDB.consolidate(batch);

            // Check balances and nonces
            for (const [address, leaf] of Object.entries(expectedNewLeafs)) { // eslint-disable-line
                const newLeaf = await zkEVMDB.getCurrentAccountState(address);
                expect(newLeaf.balance.toString()).to.equal(leaf.balance);
                expect(newLeaf.nonce.toString()).to.equal(leaf.nonce);
            }

            // Check errors on decode transactions
            const decodedTx = await batch.getDecodedTxs();

            for (let j = 0; j < decodedTx.length; j++) {
                const currentTx = decodedTx[j];
                const expectedTx = txProcessed[j];
                try {
                    expect(currentTx.reason).to.be.equal(expectedTx.reason);
                } catch (error) {
                    console.log({ currentTx }, { expectedTx }); // eslint-disable-line no-console
                    throw new Error(`Batch Id : ${id} TxId:${expectedTx.id} ${error}`);
                }
            }

            // Check the circuit input
            const circuitInput = await batch.getCircuitInput();

            // Check the encode transaction match with the vector test
            expect(batchL2Data).to.be.equal(batch.getBatchL2Data());

            // Check the batchHashData and the input hash
            expect(batchHashData).to.be.equal(Scalar.e(circuitInput.batchHashData).toString());
            expect(inputHash).to.be.equal(Scalar.e(circuitInput.inputHash).toString());

            /*
             *  // Save outuput in file
             *  const dir = path.join(__dirname, './helpers/inputs-executor/');
             *  if (!fs.existsSync(dir)) {
             *      fs.mkdirSync(dir);
             *  }
             *  await fs.writeFileSync(`${dir}input_${id}.json`, JSON.stringify(circuitInput, null, 2));
             */
            const expectedInput = require(`./helpers/inputs-executor/input_${id}.json`); // eslint-disable-line
            expect(circuitInput).to.be.deep.equal(expectedInput);
        }
    });
});
