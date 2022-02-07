/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
const { buildPoseidon } = require('circomlibjs');
const { Scalar } = require('ffjavascript');

const ethers = require('ethers');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const MemDB = require('../../../src/zk-EVM/zkproverjs/memdb');
const SMT = require('../../../src/zk-EVM/zkproverjs/smt');
const stateUtils = require('../../../src/zk-EVM/helpers/state-utils');
const Constants = require('../../../src/zk-EVM/constants');
const { getValue } = require('../../../src/zk-EVM/helpers/db-key-value-utils');

const ZkEVMDB = require('../../../src/zk-EVM/zkevm-db');
const { setGenesisBlock } = require('./helpers/test-helpers');
const { rawTxToCustomRawTx, toHexStringRlp } = require('../../../src/zk-EVM/helpers/processor-utils');

describe('zkEVM-db Test', () => {
    let poseidon;
    let F;

    let testVectors;

    before(async () => {
        poseidon = await buildPoseidon();
        F = poseidon.F;
        testVectors = JSON.parse(fs.readFileSync(path.join(__dirname, './helpers/test-vector-data/state-transition.json')));
    });

    it('Check zkEVMDB basic functions', async () => {
        const arity = 4;
        const chainIdSequencer = 100;
        const sequencerAddress = '0x0000000000000000000000000000000000000000';
        const genesisRoot = F.e('0x0000000000000000000000000000000000000000000000000000000000000000');
        const localExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const globalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        const db = new MemDB(F);

        // create a zkEVMDB and build a batch
        const zkEVMDB = await ZkEVMDB.newZkEVM(
            db,
            chainIdSequencer,
            arity,
            poseidon,
            sequencerAddress,
            genesisRoot,
            localExitRoot,
            globalExitRoot,
        );
        // check intiialize parameters
        const chainIDDB = await getValue(Constants.DB_SeqChainID, db);
        const arityDB = await getValue(Constants.DB_Arity, db);

        expect(Scalar.toNumber(chainIDDB)).to.be.equal(chainIdSequencer);
        expect(Scalar.toNumber(arityDB)).to.be.equal(arity);

        // build an empty batch
        const batch = await zkEVMDB.buildBatch();
        await batch.executeTxs();
        const newRoot = batch.currentRoot;
        expect(newRoot).to.be.equal(genesisRoot);

        // checks DB state previous consolidate zkEVMDB
        try {
            await getValue(Constants.DB_LastBatch, db);
            throw new Error('DB should be empty');
        } catch (error) {
            expect(error.toString().includes("Cannot read property 'length' of undefined")).to.be.equal(true);
        }

        const numBatch = Scalar.e(0);
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch);

        // consoldate state
        await zkEVMDB.consolidate(batch);

        // checks after consolidate zkEVMDB
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(Scalar.add(numBatch, 1));
        expect(zkEVMDB.getCurrentStateRoot()).to.be.equal(genesisRoot);

        // check agains DB
        const lastBatchDB = await getValue(Constants.DB_LastBatch, db, F);
        const stateRootDB = await getValue(Scalar.add(Constants.DB_StateRoot, lastBatchDB), db, F);
        expect(lastBatchDB).to.be.equal(Scalar.add(numBatch, 1));
        expect(F.e(stateRootDB)).to.be.deep.equal(zkEVMDB.getCurrentStateRoot());

        // Try to import the DB
        const zkEVMDBImported = await ZkEVMDB.newZkEVM(
            db,
            null,
            null,
            poseidon,
            sequencerAddress,
            null,
            null,
            null,
        );

        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(zkEVMDBImported.getCurrentNumBatch());
        expect(zkEVMDB.getCurrentStateRoot()).to.be.deep.equal(zkEVMDBImported.stateRoot);
        expect(zkEVMDB.arity).to.be.equal(zkEVMDBImported.arity);
        expect(zkEVMDB.chainID).to.be.equal(zkEVMDBImported.chainID);
    });

    it('Check zkEVMDB when consolidate a batch', async () => {
        const {
            arity,
            genesis,
            expectedOldRoot,
            txs,
            expectedNewRoot,
            chainIdSequencer,
            sequencerAddress,
            localExitRoot,
            globalExitRoot,
        } = testVectors[0];

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

        // set genesis block
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
                expect(txData.customRawTx).to.equal(undefined);
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

        // checks previous consolidate zkEVMDB
        try {
            await getValue(Constants.DB_LastBatch, db, F);
            throw new Error('DB should be empty');
        } catch (error) {
            expect(error.toString().includes("Cannot read property 'length' of undefined")).to.be.equal(true);
        }

        const numBatch = Scalar.e(0);
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(numBatch);
        expect(F.toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(expectedOldRoot);

        // consoldate state
        await zkEVMDB.consolidate(batch);

        // checks after consolidate zkEVMDB
        expect(zkEVMDB.getCurrentNumBatch()).to.be.equal(Scalar.add(numBatch, 1));
        expect(F.toString(zkEVMDB.getCurrentStateRoot())).to.be.equal(expectedNewRoot);
        expect(zkEVMDB.getCurrentLocalExitRoot()).to.be.deep.equal(F.e(localExitRoot));
        expect(zkEVMDB.getCurrentGlobalExitRoot()).to.be.deep.equal(F.e(globalExitRoot));

        const lastBatchDB = await getValue(Constants.DB_LastBatch, db, F);

        expect(lastBatchDB).to.be.equal(Scalar.add(numBatch, 1));

        const stateRootDB = await getValue(Scalar.add(Constants.DB_StateRoot, lastBatchDB), db, F);
        expect(F.e(stateRootDB)).to.be.deep.equal(zkEVMDB.getCurrentStateRoot());

        const localExitRootDB = await getValue(Scalar.add(Constants.DB_LocalExitRoot, lastBatchDB), db, F);
        expect(F.e(localExitRootDB)).to.be.deep.equal(zkEVMDB.getCurrentLocalExitRoot());

        const globalExitRootDB = await getValue(Scalar.add(Constants.DB_GlobalExitRoot, lastBatchDB), db, F);
        expect(F.e(globalExitRootDB)).to.be.deep.equal(zkEVMDB.getCurrentGlobalExitRoot());
    });
});
