/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('PolygonZkEVMUpgraded', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;
    let aggregator1;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const version = '0.0.1';
    const forkID = 0;
    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeoutDefault = 10;
    let firstDeployment = true;
    const currentVersion = 0;

    // PolygonZkEVM Constants
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, aggregator1] = await ethers.getSigners();

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

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();
        if ((await upgrades.admin.getInstance()).address !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }
        const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + (firstDeployment ? 3 : 2);
        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateZkevmAddress = ethers.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
        firstDeployment = false;

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateZkevmAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMTestnet
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMUpgraded');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                polygonZkEVMBridgeContract.address,
                chainID,
                forkID,
                currentVersion,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
        expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMContract.address);
        await polygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMContract.version()).to.be.equal(0);
    });

    it('should check updateVersion', async () => {
        const newVersionString = '0.0.2';

        const lastVerifiedBatch = 0;
        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.emit(polygonZkEVMContract, 'UpdateZkEVMVersion').withArgs(lastVerifiedBatch, forkID, newVersionString);

        expect(await polygonZkEVMContract.version()).to.be.equal(1);

        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.be.revertedWith('VersionAlreadyUpdated');
    });

    it('should upgrade polygonKEVM', async () => {
        // deploy PolygonZkEVMTestnet
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM');
        const oldPolygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.address,
                maticTokenContract.address,
                verifierContract.address,
                polygonZkEVMBridgeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // initialize
        await oldPolygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );

        /*
         * Upgrade the contract
         */
        const PolygonZkEVMUpgradedFactory = await ethers.getContractFactory('PolygonZkEVMUpgraded');
        const polygonZkEVMUpgradedContract = PolygonZkEVMUpgradedFactory.attach(oldPolygonZkEVMContract.address);

        // Check that is the v0 contract
        await expect(polygonZkEVMUpgradedContract.version()).to.be.reverted;

        // Upgrade the contract
        const newVersionString = '0.0.2';

        await upgrades.upgradeProxy(
            polygonZkEVMContract.address,
            PolygonZkEVMUpgradedFactory,
            {
                constructorArgs: [
                    polygonZkEVMGlobalExitRoot.address,
                    maticTokenContract.address,
                    verifierContract.address,
                    polygonZkEVMBridgeContract.address,
                    chainID,
                    forkID,
                    currentVersion],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
                call: { fn: 'updateVersion', args: [newVersionString] },
            },
        );

        expect(await polygonZkEVMContract.version()).to.be.equal(1);
        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.be.revertedWith('VersionAlreadyUpdated');
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.address);
        expect(await polygonZkEVMContract.matic()).to.be.equal(maticTokenContract.address);
        expect(await polygonZkEVMContract.rollupVerifier()).to.be.equal(verifierContract.address);
        expect(await polygonZkEVMContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.address);

        expect(await polygonZkEVMContract.owner()).to.be.equal(deployer.address);
        expect(await polygonZkEVMContract.admin()).to.be.equal(admin.address);
        expect(await polygonZkEVMContract.chainID()).to.be.equal(chainID);
        expect(await polygonZkEVMContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await polygonZkEVMContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await polygonZkEVMContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await polygonZkEVMContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeoutDefault);

        expect(await polygonZkEVMContract.batchNumToStateRoot(0)).to.be.equal(genesisRoot);
        expect(await polygonZkEVMContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await polygonZkEVMContract.networkName()).to.be.equal(networkName);

        expect(await polygonZkEVMContract.batchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await polygonZkEVMContract.batchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await polygonZkEVMContract.getForcedBatchFee()).to.be.equal(ethers.parseEther('10'));

        expect(await polygonZkEVMContract.forceBatchTimeout()).to.be.equal(FORCE_BATCH_TIMEOUT);
        expect(await polygonZkEVMContract.isForcedBatchDisallowed()).to.be.equal(true);
    });

    it('Test overridePendingState properly', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const batchesForSequence = 5;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        const sequencesArray = Array(batchesForSequence).fill(sequence);
        // Array(5).fill("girl", 0);

        // Approve lots of tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address))
                .to.emit(polygonZkEVMContract, 'SequenceBatches');
        }
        await ethers.provider.send('evm_increaseTime', [60]);

        // Forge first sequence with verifyBAtches
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const zkProofFFlonk = new Array(24).fill(ethers.HashZero);

        let currentPendingState = 0;
        let currentNumBatch = 0;
        let newBatch = currentNumBatch + batchesForSequence;

        // Verify batch 2 batches
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const finalPendingState = 2;

        await expect(
            polygonZkEVMContract.connect(aggregator1).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OnlyTrustedAggregator');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                finalPendingState + 1,
                finalPendingState + 2,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('PendingStateDoesNotExist');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch + 1,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitNumBatchDoesNotMatchPendingState');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                0,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('OldStateRootDoesNotExist');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                finalPendingState,
                finalPendingState,
                currentNumBatch + 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalPendingStateNumInvalid');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                finalPendingState,
                finalPendingState + 2,
                currentNumBatch + 5,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalPendingStateNumInvalid');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch + 1,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('FinalNumBatchDoesNotMatchPendingState');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('StoredRootMustBeDifferentThanNewRoot');

        const newStateRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                currentPendingState,
                finalPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'OverridePendingState').withArgs(newBatch, newStateRoot2, trustedAggregator.address);

        // check pending state is clear
        currentPendingState = 0;
        expect(currentPendingState).to.be.equal(await polygonZkEVMContract.lastPendingState());
        expect(0).to.be.equal(await polygonZkEVMContract.lastPendingStateConsolidated());

        // check consolidated state
        const currentVerifiedBatch = newBatch;
        expect(currentVerifiedBatch).to.be.equal(await polygonZkEVMContract.lastVerifiedBatch());
        expect(newStateRoot2).to.be.equal(await polygonZkEVMContract.batchNumToStateRoot(currentVerifiedBatch));
    });

    it('Test overridePendingState fails cause was last forkID', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const batchesForSequence = 5;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        const sequencesArray = Array(batchesForSequence).fill(sequence);
        // Array(5).fill("girl", 0);

        // Approve lots of tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address))
                .to.emit(polygonZkEVMContract, 'SequenceBatches');
        }
        await ethers.provider.send('evm_increaseTime', [60]);

        // Forge first sequence with verifyBAtches
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const zkProofFFlonk = new Array(24).fill(ethers.HashZero);

        let currentPendingState = 0;
        let currentNumBatch = 0;
        let newBatch = currentNumBatch + batchesForSequence;

        // Verify batch 2 batches
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const finalPendingState = 2;

        const consolidatedBatch = batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).consolidatePendingState(
                1, // pending state num
            ),
        ).to.emit(polygonZkEVMContract, 'ConsolidatePendingState')
            .withArgs(consolidatedBatch, newStateRoot, 1);

        // Upgrade the contract
        const newVersionString = '0.0.3';
        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.emit(polygonZkEVMContract, 'UpdateZkEVMVersion').withArgs(consolidatedBatch, forkID, newVersionString);

        const newStateRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                0,
                finalPendingState,
                0,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitBatchMustMatchCurrentForkID');
    });

    it('Test overridePendingState fails cause was last forkID2', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;

        const batchesForSequence = 5;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        const sequencesArray = Array(batchesForSequence).fill(sequence);
        // Array(5).fill("girl", 0);

        // Approve lots of tokens
        await expect(
            maticTokenContract.connect(trustedSequencer).approve(polygonZkEVMContract.address, maticTokenInitialBalance),
        ).to.emit(maticTokenContract, 'Approval');

        // Make 20 sequences of 5 batches, with 1 minut timestamp difference
        for (let i = 0; i < 20; i++) {
            await expect(polygonZkEVMContract.connect(trustedSequencer).sequenceBatches(sequencesArray, trustedSequencer.address))
                .to.emit(polygonZkEVMContract, 'SequenceBatches');
        }
        await ethers.provider.send('evm_increaseTime', [60]);

        // Forge first sequence with verifyBAtches
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        const zkProofFFlonk = new Array(24).fill(ethers.HashZero);

        let currentPendingState = 0;
        let currentNumBatch = 0;
        let newBatch = currentNumBatch + batchesForSequence;

        // Verify batch 2 batches
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const finalPendingState = 2;

        const consolidatedBatch = batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).consolidatePendingState(
                1, // pending state num
            ),
        ).to.emit(polygonZkEVMContract, 'ConsolidatePendingState')
            .withArgs(consolidatedBatch, newStateRoot, 1);

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).consolidatePendingState(
                finalPendingState, // pending state num
            ),
        ).to.emit(polygonZkEVMContract, 'ConsolidatePendingState')
            .withArgs(newBatch, newStateRoot, finalPendingState);

        // Upgrade the contract
        const newVersionString = '0.0.3';
        const updatedBatch = newBatch;
        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.emit(polygonZkEVMContract, 'UpdateZkEVMVersion').withArgs(updatedBatch, forkID, newVersionString);

        // verify second sequence
        currentPendingState++;
        currentNumBatch = newBatch;
        newBatch += batchesForSequence;
        await expect(
            polygonZkEVMContract.connect(aggregator1).verifyBatches(
                currentPendingState,
                currentNumBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot,
                zkProofFFlonk,
            ),
        ).to.emit(polygonZkEVMContract, 'VerifyBatches')
            .withArgs(newBatch, newStateRoot, aggregator1.address);

        const newStateRoot2 = '0x0000000000000000000000000000000000000000000000000000000000000003';
        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                0,
                currentPendingState,
                consolidatedBatch,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitBatchMustMatchCurrentForkID');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).overridePendingState(
                0,
                currentPendingState,
                updatedBatch - 1,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitBatchMustMatchCurrentForkID');

        await expect(
            polygonZkEVMContract.connect(trustedAggregator).verifyBatchesTrustedAggregator(
                0,
                updatedBatch - 1,
                newBatch,
                newLocalExitRoot,
                newStateRoot2,
                zkProofFFlonk,
            ),
        ).to.be.revertedWith('InitBatchMustMatchCurrentForkID');
    });
});
