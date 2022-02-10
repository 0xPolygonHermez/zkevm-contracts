/* eslint-disable no-await-in-loop, no-loop-func, no-continue */
const { buildPoseidon } = require('circomlibjs');
const { Scalar } = require('ffjavascript');

const { ethers } = require('hardhat');
const { expect } = require('chai');

const {
    MemDB, SMT, stateUtils, contractUtils, ZkEVMDB, processorUtils,
} = require('@polygon-hermez/zkevm-commonjs');

const { setGenesisBlock } = require('../src/zk-EVM/helpers/test-helpers');

const { rawTxToCustomRawTx, toHexStringRlp } = processorUtils;

const { calculateCircuitInput } = contractUtils;

const testVectors = require('../src/zk-EVM/helpers/test-vector-data/state-transition.json');

describe('Proof of efficiency test vectors', () => {
    let poseidon;
    let F;

    let deployer;
    let aggregator;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRootSC = '0x0000000000000000000000000000000000000000000000000000000000000000';

    beforeEach('Deploy contract', async () => {
        // build poseidon
        poseidon = await buildPoseidon();
        F = poseidon.F;

        // load signers
        [deployer, aggregator] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy MATIC
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        maticTokenContract = await maticTokenFactory.deploy(
            maticTokenName,
            maticTokenSymbol,
            deployer.address,
            maticTokenInitialBalance,
        );
        await maticTokenContract.deployed();

        // deploy bridge
        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );
        const BridgeFactory = await ethers.getContractFactory('BridgeMock');
        bridgeContract = await BridgeFactory.deploy(precalculatePoEAddress);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            bridgeContract.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRootSC,
        );
        await proofOfEfficiencyContract.deployed();
        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);
    });

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
        it(`Test vectors id: ${id}`, async () => {
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

            const newRoot = batch.currentStateRoot;
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
             * /// /////////////////////////////////////////////
             * // Check against the smart contracts
             * /// /////////////////////////////////////////////
             */
            const currentStateRoot = `0x${Scalar.e(expectedOldRoot).toString(16).padStart(64, '0')}`;
            const currentLocalExitRoot = `0x${Scalar.e(localExitRoot).toString(16).padStart(64, '0')}`;
            const newStateRoot = `0x${Scalar.e(expectedNewRoot).toString(16).padStart(64, '0')}`;
            const newLocalExitRoot = `0x${Scalar.e(localExitRoot).toString(16).padStart(64, '0')}`;
            const currentGlobalExitRoot = `0x${Scalar.e(globalExitRoot).toString(16).padStart(64, '0')}`;

            const walletSequencer = walletMap[sequencerAddress].connect(ethers.provider);
            const aggregatorAddress = aggregator.address;

            // fund sequencer address with Matic tokens and ether
            await maticTokenContract.transfer(sequencerAddress, ethers.utils.parseEther('100'));
            await deployer.sendTransaction({
                to: sequencerAddress,
                value: ethers.utils.parseEther('10.0'),
            });

            // set roots to the contract:
            await proofOfEfficiencyContract.setStateRoot(currentStateRoot);
            await proofOfEfficiencyContract.setExitRoot(currentLocalExitRoot);
            await bridgeContract.setLastGlobalExitRoot(currentGlobalExitRoot);

            // set sequencer
            await proofOfEfficiencyContract.setSequencer(sequencerAddress, 'URL', chainIdSequencer);

            // sequencer send the batch
            const lastBatchSent = await proofOfEfficiencyContract.lastBatchSent();
            const l2txData = batchL2Data;
            const maticAmount = ethers.utils.parseEther('1');

            await expect(
                maticTokenContract.connect(walletSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
            ).to.emit(maticTokenContract, 'Approval');

            await expect(proofOfEfficiencyContract.connect(walletSequencer).sendBatch(l2txData, maticAmount))
                .to.emit(proofOfEfficiencyContract, 'SendBatch')
                .withArgs(lastBatchSent + 1, sequencerAddress);

            // Check inputs mathces de smart contract
            const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;
            const proofA = ['0', '0'];
            const proofB = [
                ['0', '0'],
                ['0', '0'],
            ];
            const proofC = ['0', '0'];

            // check batch sent
            const sentBatch = await proofOfEfficiencyContract.sentBatches(lastBatchSent + 1);
            expect(sentBatch.batchHashData).to.be.equal(circuitInput.batchHashData);

            // calculate circuit input
            const circuitInputSC = await proofOfEfficiencyContract.calculateCircuitInput(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                sequencerAddress,
                circuitInput.batchHashData,
                chainIdSequencer,
                numBatch,
            );

            // Compute Js input
            const circuitInputJS = calculateCircuitInput(
                currentStateRoot,
                currentLocalExitRoot,
                newStateRoot,
                newLocalExitRoot,
                sequencerAddress,
                circuitInput.batchHashData,
                chainIdSequencer,
                numBatch,
            );
            expect(circuitInputSC).to.be.equal(circuitInputJS);
            expect(circuitInputSC).to.be.equal(`0x${Scalar.e(inputHash).toString(16)}`);

            // Check the input parameters are correct
            const circuitNextInputSC = await proofOfEfficiencyContract.getNextCircuitInput(
                newLocalExitRoot,
                newStateRoot,
                numBatch,
            );
            expect(circuitNextInputSC).to.be.equal(circuitInputSC);

            // Forge the batch
            const initialAggregatorMatic = await maticTokenContract.balanceOf(
                await aggregator.getAddress(),
            );

            await expect(
                proofOfEfficiencyContract.connect(aggregator).verifyBatch(
                    newLocalExitRoot,
                    newStateRoot,
                    numBatch,
                    proofA,
                    proofB,
                    proofC,
                ),
            ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
                .withArgs(numBatch, aggregatorAddress);

            const finalAggregatorMatic = await maticTokenContract.balanceOf(
                await aggregator.getAddress(),
            );
            expect(finalAggregatorMatic).to.equal(
                ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
            );
        });
    }
});
