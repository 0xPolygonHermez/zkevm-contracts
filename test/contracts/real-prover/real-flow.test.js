/* eslint-disable no-await-in-loop */

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { Scalar } = require('ffjavascript');

const { contractUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { generateSolidityInputs } = contractUtils;

const { calculateSnarkInput, calculateBatchHashData, calculateAccInputHash } = contractUtils;

const proofJson = require('./test-inputs/proof.json');
const publicJson = require('./test-inputs/public.json');
const inputJson = require('./test-inputs/input.json');

describe('Real flow test', () => {
    let verifierContract;
    let maticTokenContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let polygonZkEVMGlobalExitRoot;
    let deployer;
    let trustedSequencer;
    let trustedAggregator;
    let admin;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = inputJson.oldStateRoot;

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const { chainID } = inputJson;
    const networkName = 'zkevm';
    const pendingStateTimeoutDefault = 10;
    const trustedAggregatorTimeoutDefault = 10;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, trustedAggregator, admin] = await ethers.getSigners();

        // Could be different address teorically but for now it's fine
        const trustedSequencerAddress = inputJson.singleBatchData[0].sequencerAddr;
        await ethers.provider.send('hardhat_impersonateAccount', [trustedSequencerAddress]);
        trustedSequencer = await ethers.getSigner(trustedSequencerAddress);
        await deployer.sendTransaction({
            to: trustedSequencerAddress,
            value: ethers.utils.parseEther('4'),
        });

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'Verifier',
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

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], { initializer: false });

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootMock');

        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            polygonZkEVMContract.address,
            polygonZkEVMBridgeContract.address,
        );
        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            polygonZkEVMGlobalExitRoot.address,
            polygonZkEVMContract.address,
        );

        await polygonZkEVMContract.initialize(
            polygonZkEVMGlobalExitRoot.address,
            maticTokenContract.address,
            verifierContract.address,
            polygonZkEVMBridgeContract.address,
            {
                admin: admin.address,
                chainID,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                forceBatchAllowed: allowForcebatches,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('Test real prover', async () => {
        const batchesData = inputJson.singleBatchData;
        const batchesNum = batchesData.length;

        // Approve tokens
        const maticAmount = await polygonZkEVMContract.getCurrentBatchFee();
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount.mul(batchesNum)),
        ).to.emit(maticTokenContract, 'Approval');

        // prepare PolygonZkEVMMock
        await polygonZkEVMContract.setVerifiedBatch(inputJson.oldNumBatch);
        await polygonZkEVMContract.setSequencedBatch(inputJson.oldNumBatch);
        const lastTimestamp = batchesData[batchesNum - 1].timestamp;
        await ethers.provider.send('evm_setNextBlockTimestamp', [lastTimestamp]);

        for (let i = 0; i < batchesNum; i++) {
            // set timestamp for the sendBatch call
            const currentBatchData = batchesData[i];

            const currentSequence = {
                transactions: currentBatchData.batchL2Data,
                globalExitRoot: currentBatchData.globalExitRoot,
                timestamp: currentBatchData.timestamp,
                minForcedTimestamp: 0,
            };

            const batchAccInputHashJs = calculateAccInputHash(
                currentBatchData.oldAccInputHash,
                calculateBatchHashData(currentBatchData.batchL2Data),
                currentBatchData.globalExitRoot,
                currentBatchData.timestamp,
                currentBatchData.sequencerAddr, // fix
            );
            expect(batchAccInputHashJs).to.be.eq(currentBatchData.newAccInputHash);

            // prapare globalExitRoot
            const randomTimestamp = 1001;
            const { globalExitRoot } = batchesData[0];
            await polygonZkEVMGlobalExitRoot.setGlobalExitRoot(globalExitRoot, randomTimestamp);

            const lastBatchSequenced = await polygonZkEVMContract.lastBatchSequenced();

            // check trusted sequencer
            const trustedSequencerAddress = inputJson.singleBatchData[i].sequencerAddr;
            if (trustedSequencer.address !== trustedSequencerAddress) {
                await polygonZkEVMContract.connect(admin).setTrustedSequencer(trustedSequencerAddress);
                await ethers.provider.send('hardhat_impersonateAccount', [trustedSequencerAddress]);
                trustedSequencer = await ethers.getSigner(trustedSequencerAddress);
                await deployer.sendTransaction({
                    to: trustedSequencerAddress,
                    value: ethers.utils.parseEther('4'),
                });
                await expect(
                    maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticAmount.mul(batchesNum)),
                ).to.emit(maticTokenContract, 'Approval');
                await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
            }

            // Sequence Batches
            await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches([currentSequence]))
                .to.emit(polygonZkEVMContract, 'SequenceBatches')
                .withArgs(Number(lastBatchSequenced) + 1);
        }

        // Set state and exit root
        await polygonZkEVMContract.setStateRoot(inputJson.oldStateRoot, inputJson.oldNumBatch);

        const { aggregatorAddress } = inputJson;
        await ethers.provider.send('hardhat_impersonateAccount', [aggregatorAddress]);
        const aggregator = await ethers.getSigner(aggregatorAddress);
        await deployer.sendTransaction({
            to: aggregatorAddress,
            value: ethers.utils.parseEther('4'),
        });
        await polygonZkEVMContract.connect(admin).setTrustedAggregator(aggregatorAddress);

        const batchAccInputHash = (await polygonZkEVMContract.sequencedBatches(inputJson.newNumBatch)).accInputHash;
        expect(batchAccInputHash).to.be.equal(inputJson.newAccInputHash);

        const {
            proofA, proofB, proofC, input,
        } = generateSolidityInputs(proofJson, publicJson);

        // Verify snark input
        const circuitInputStarkJS = await calculateSnarkInput(
            inputJson.oldStateRoot,
            inputJson.newStateRoot,
            inputJson.newLocalExitRoot,
            inputJson.oldAccInputHash,
            inputJson.newAccInputHash,
            inputJson.oldNumBatch,
            inputJson.newNumBatch,
            inputJson.chainID,
            inputJson.aggregatorAddress,
        );

        expect(circuitInputStarkJS).to.be.eq(Scalar.e(input[0]));

        // aggregator forge the batch
        const { newLocalExitRoot } = inputJson;
        const { newStateRoot } = inputJson;
        const { oldNumBatch } = inputJson;
        const { newNumBatch } = inputJson;
        const pendingStateNum = 0;
        // Verify batch
        await expect(
            polygonZkEVMContract.connect(aggregator).trustedVerifyBatches(
                pendingStateNum,
                oldNumBatch,
                newNumBatch,
                newLocalExitRoot,
                newStateRoot,
                proofA,
                proofB,
                proofC,
            ),
        ).to.emit(polygonZkEVMContract, 'TrustedVerifyBatches')
            .withArgs(newNumBatch, newStateRoot, aggregator.address);
    });
});
