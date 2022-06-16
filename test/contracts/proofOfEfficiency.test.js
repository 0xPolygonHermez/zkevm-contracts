const { expect } = require('chai');
const { ethers } = require('hardhat');

/*
 * const { contractUtils } = require('@polygon-hermez/zkevm-commonjs');
 *  const { calculateSnarkInput, calculateBatchHashData } = contractUtils;
 */

describe('Proof of efficiency', () => {
    let deployer;
    let aggregator;
    let trustedSequencer;

    let verifierContract;
    let bridgeContract;
    let proofOfEfficiencyContract;
    let maticTokenContract;
    let globalExitRootManager;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = ethers.constants.HashZero;

    const networkIDMainnet = 0;
    const allowForcebatches = true;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, aggregator, trustedSequencer] = await ethers.getSigners();

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

        const precalculatBridgeAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );

        const precalculatePoEAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 2 },
        );

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await globalExitRootManagerFactory.deploy(precalculatePoEAddress, precalculatBridgeAddress);
        await globalExitRootManager.deployed();

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridgeContract = await bridgeFactory.deploy(networkIDMainnet, globalExitRootManager.address);
        await bridgeContract.deployed();

        // deploy proof of efficiency
        const ProofOfEfficiencyFactory = await ethers.getContractFactory('ProofOfEfficiencyMock');
        proofOfEfficiencyContract = await ProofOfEfficiencyFactory.deploy(
            globalExitRootManager.address,
            maticTokenContract.address,
            verifierContract.address,
            genesisRoot,
            trustedSequencer.address,
            allowForcebatches,
        );
        await proofOfEfficiencyContract.deployed();

        expect(proofOfEfficiencyContract.address).to.be.equal(precalculatePoEAddress);
        expect(bridgeContract.address).to.be.equal(precalculatBridgeAddress);

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('100'));
    });

    it('should check the constructor parameters', async () => {
        expect(await proofOfEfficiencyContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await proofOfEfficiencyContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await proofOfEfficiencyContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await proofOfEfficiencyContract.currentStateRoot()).to.be.equal(genesisRoot);
        expect(await proofOfEfficiencyContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await proofOfEfficiencyContract.forceBatchAllowed()).to.be.equal(allowForcebatches);
    });

    it('should sequence a batch as super sequencer', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            forceBatchesTimestamp: [],
        };

        // revert because sender is not super sequencer
        await expect(proofOfEfficiencyContract.sequenceBatches([sequence]))
            .to.be.revertedWith('ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer');

        // revert because tokens were not approved
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Sequence
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('sequenceBatches should check the timestamp correctly', async () => {
        const l2txData = '0x';
        const maticAmount = await proofOfEfficiencyContract.TRUSTED_SEQUENCER_FEE();

        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            forceBatchesTimestamp: [],
        };

        const sequence2 = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: 0,
            forceBatchesTimestamp: [],
        };

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount.mul(2)),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

        // Mess with timestamp
        let currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]); // evm_setNextBlockTimestamp

        sequence.timestamp = currentTimestamp + 2; // bigger than current one

        // revert because sender is not super sequencer
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp;
        sequence2.timestamp = currentTimestamp - 1; // can't be smaller than the last one

        // revert because sender is not super sequencer
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.be.revertedWith('ProofOfEfficiency::sequenceBatches: Timestamp must be inside range');

        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        await ethers.provider.send('evm_increaseTime', [1]);

        sequence.timestamp = currentTimestamp + 1;
        sequence.timestamp = currentTimestamp + 1;

        // Sequence
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence, sequence2]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await trustedSequencer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should force a batch of transactions', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        expect(maticAmount.toString()).to.be.equal((await proofOfEfficiencyContract.calculateForceProverFee()).toString());

        // revert because the maxMatic amount is less than the necessary to pay
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount.sub(1)))
            .to.be.revertedWith('ProofOfEfficiency::forceBatch: not enough matic');

        // revert because tokens were not approved
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.be.revertedWith('ERC20: insufficient allowance');

        const initialOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );
        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastForceBatch();

        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastBatchSequenced + 1, lastGlobalExitRoot, deployer.address, '0x');

        const finalOwnerBalance = await maticTokenContract.balanceOf(
            await deployer.getAddress(),
        );
        expect(finalOwnerBalance).to.equal(
            ethers.BigNumber.from(initialOwnerBalance).sub(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should sequence force batches using sequenceForceBatches', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;

        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const initialTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).timestamp;

        // Check storage variables before call
        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(0);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(0);

        // revert because the tiemout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch + 1))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Force batch invalid');

        // revert because the tiemout is not expired
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.be.revertedWith('ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period');

        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [(initialTimestamp.add(forceBatchTimeout)).toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        expect(await proofOfEfficiencyContract.lastForceBatchSequenced()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastForceBatch()).to.be.equal(1);
        expect(await proofOfEfficiencyContract.lastBatchSequenced()).to.be.equal(1);
    });

    it('should verify a sequenced batch', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.SUPER_SEQUENCER_FEE();
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const sequence = {
            globalExitRoot: ethers.constants.HashZero,
            timestamp: ethers.BigNumber.from(currentTimestamp),
            forceBatchesNum: ethers.BigNumber.from(0),
            transactions: l2txData,
        };

        // Approve tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();
        // Sequence
        await expect(proofOfEfficiencyContract.connect(trustedSequencer).sequenceBatches([sequence]))
            .to.emit(proofOfEfficiencyContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced + 1);

        // aggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

        const initialAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(
                newLocalExitRoot,
                newStateRoot,
                numBatch - 1,
                proofA,
                proofB,
                proofC,
            ),
        ).to.be.revertedWith('ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH');

        await expect(
            proofOfEfficiencyContract.connect(aggregator).verifyBatch(newLocalExitRoot, newStateRoot, numBatch, proofA, proofB, proofC),
        ).to.emit(proofOfEfficiencyContract, 'VerifyBatch')
            .withArgs(numBatch, aggregator.address);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );
        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    it('should verify forced sequenced batch', async () => {
        const l2txData = '0x123456';
        const maticAmount = await proofOfEfficiencyContract.calculateForceProverFee();
        const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();

        await expect(
            maticTokenContract.approve(proofOfEfficiencyContract.address, maticAmount),
        ).to.emit(maticTokenContract, 'Approval');

        const lastForcedBatch = (await proofOfEfficiencyContract.lastForceBatch()) + 1;
        await expect(proofOfEfficiencyContract.forceBatch(l2txData, maticAmount))
            .to.emit(proofOfEfficiencyContract, 'ForceBatch')
            .withArgs(lastForcedBatch, lastGlobalExitRoot, deployer.address, '0x');

        const initialTimestamp = (await proofOfEfficiencyContract.forcedBatches(lastForcedBatch)).timestamp;
        // Increment timestamp
        const forceBatchTimeout = await proofOfEfficiencyContract.FORCE_BATCH_TIMEOUT();
        await ethers.provider.send('evm_setNextBlockTimestamp', [(initialTimestamp.add(forceBatchTimeout)).toNumber()]);

        // sequence force batch
        await expect(proofOfEfficiencyContract.sequenceForceBatches(lastForcedBatch))
            .to.emit(proofOfEfficiencyContract, 'SequenceForceBatches')
            .withArgs(lastForcedBatch);

        // aggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;
        const proofA = ['0', '0'];
        const proofB = [
            ['0', '0'],
            ['0', '0'],
        ];
        const proofC = ['0', '0'];

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
            .withArgs(numBatch, aggregator.address)
            .to.emit(maticTokenContract, 'Transfer')
            .withArgs(proofOfEfficiencyContract.address, aggregator.address, maticAmount);

        const finalAggregatorMatic = await maticTokenContract.balanceOf(
            await aggregator.getAddress(),
        );

        expect(finalAggregatorMatic).to.equal(
            ethers.BigNumber.from(initialAggregatorMatic).add(ethers.BigNumber.from(maticAmount)),
        );
    });

    /*
     * it('Should match the computed SC input with the Js input', async () => {
     *     const l2txData = '0x0123456789';
     *     const maticAmount = ethers.utils.parseEther('1');
     *     const sequencerAddress = trustedSequencer.address;
     *     const defaultChainId = Number(await proofOfEfficiencyContract.DEFAULT_CHAIN_ID());
     *     const lastGlobalExitRoot = await globalExitRootManager.getLastGlobalExitRoot();
     */

    /*
     *     // sequencer send the batch
     *     await expect(
     *         maticTokenContract.connect(sequencer).approve(proofOfEfficiencyContract.address, maticAmount),
     *     ).to.emit(maticTokenContract, 'Approval');
     */

    //     let lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();

    /*
     *     await expect(proofOfEfficiencyContract.connect(sequencer).sequenceBatches(l2txData, maticAmount))
     *         .to.emit(proofOfEfficiencyContract, 'SendBatch')
     *         .withArgs(lastBatchSequenced + 1, sequencerAddress, defaultChainId, lastGlobalExitRoot);
     */

    //     /*
    //      * calculate all the input parameters
    //      * calculate l2HashData
    //      */
    //     const { timestamp } = await ethers.provider.getBlock();
    //     lastBatchSequenced = await proofOfEfficiencyContract.lastBatchSequenced();
    //     const sentBatch = await proofOfEfficiencyContract.sentBatches(lastBatchSequenced);

    /*
     *     const batchHashData = calculateBatchHashData(
     *         l2txData,
     *         lastGlobalExitRoot,
     *         timestamp,
     *         sequencerAddress,
     *         defaultChainId,
     *         lastBatchSequenced,
     *     );
     *     expect(sentBatch.batchHashData).to.be.equal(batchHashData);
     */

    /*
     *     // Compute circuit input with the SC function
     *     const currentStateRoot = await proofOfEfficiencyContract.currentStateRoot();
     *     const currentLocalExitRoot = await proofOfEfficiencyContract.currentLocalExitRoot();
     *     const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000001234';
     *     const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000456';
     *     const numBatch = (await proofOfEfficiencyContract.lastVerifiedBatch()) + 1;
     */

    /*
     *     const circuitInputSC = await proofOfEfficiencyContract.calculateCircuitInput(
     *         currentStateRoot,
     *         currentLocalExitRoot,
     *         newStateRoot,
     *         newLocalExitRoot,
     *         batchHashData,
     *     );
     */

    /*
     *     // Compute Js input
     *     const circuitInputJS = calculateSnarkInput(
     *         currentStateRoot,
     *         currentLocalExitRoot,
     *         newStateRoot,
     *         newLocalExitRoot,
     *         batchHashData,
     *     );
     */

    //     expect(circuitInputSC).to.be.equal(circuitInputJS);

    /*
     *     // Check the input parameters are correct
     *     const circuitNextInputSC = await proofOfEfficiencyContract.getNextCircuitInput(
     *         newLocalExitRoot,
     *         newStateRoot,
     *         numBatch,
     *     );
     *     expect(circuitNextInputSC).to.be.equal(circuitInputSC);
     * });
     */
});
