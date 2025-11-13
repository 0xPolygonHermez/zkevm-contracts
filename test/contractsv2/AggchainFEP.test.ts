/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainFEP } from '../../typechain-types';
import * as utilsFEP from '../../src/utils-aggchain-FEP';
import * as utilsAggchain from '../../src/utils-common-aggchain';

describe('AggchainFEP', () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let vKeyManager: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let optModeManager: any;

    let aggchainFEPContract: AggchainFEP;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const agglayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    const useDefaultGateway = false;
    const aggchainVKeySelector = '0x12340001';
    const newAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, vKeyManager, aggchainManager, optModeManager] = await ethers.getSigners();

        // deploy aggchain
        // create aggchainFEP implementation
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        aggchainFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await aggchainFEPContract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    it('should check the v0 initialized parameters', async () => {
        let initParamsCp;
        let initializeBytesAggchain;

        // Define the struct values
        const initParams = {
            l2BlockTime: 10,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: 0,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // should set the aggchainManager: error "OnlyRollupManager"
        await expect(aggchainFEPContract.initAggchainManager(aggchainManager.address)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyRollupManager',
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // use rollup manager from now on
        // initializeAggchain: submission interval = 0
        initParamsCp = { ...initParams };
        initParamsCp.submissionInterval = 0;
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'SubmissionIntervalMustBeGreaterThanZero');

        // initializeAggchain: l2BlockTime = 0
        initParamsCp = { ...initParams };
        initParamsCp.l2BlockTime = 0;
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'L2BlockTimeMustBeGreaterThanZero');
        // initializeAggchain: rollupConfigHash = 0
        initParamsCp = { ...initParams };
        initParamsCp.rollupConfigHash = ethers.ZeroHash;
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'RollupConfigHashMustBeDifferentThanZero');
        // initializeAggchain: startingTimestamp > block.timestamp
        initParamsCp = { ...initParams };
        initParamsCp.startingTimestamp = Math.floor(Date.now() / 1000) + 1000;
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'StartL2TimestampMustBeLessThanCurrentTime');

        initParamsCp = { ...initParams };

        initParamsCp = { ...initParams };
        initParamsCp.optimisticModeManager = ethers.ZeroAddress;
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParamsCp,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidZeroAddress');

        // correct initialization
        initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // Check initialized selector
        expect(
            await aggchainFEPContract.getAggchainVKeySelector(
                aggchainVKeySelector.slice(0, 6),
                `0x${aggchainVKeySelector.slice(6)}`,
            ),
        ).to.equal(aggchainVKeySelector);
        expect(await aggchainFEPContract.getAggchainVKeyVersionFromSelector(aggchainVKeySelector)).to.equal(
            aggchainVKeySelector.slice(0, 6),
        );

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPContract.aggchainManager()).to.be.equal(aggchainManager.address);

        expect(await aggchainFEPContract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPContract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPContract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPContract.aggregationVkey()).to.be.equal(initParams.aggregationVkey);
        expect(await aggchainFEPContract.rangeVkeyCommitment()).to.be.equal(initParams.rangeVkeyCommitment);
        expect(await aggchainFEPContract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPContract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPContract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPContract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPContract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPContract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check the v1 initialized parameters', async () => {
        const networkID = 1;

        // Deploy previous ECDSA pessimistic contract
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const PolygonPPConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await PolygonPPConsensusContract.waitForDeployment();

        // initialize pessimistic consensus (ECDSA v0.2.0)
        await PolygonPPConsensusContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Upgrade proxy to FEP implementation
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        await upgrades.upgradeProxy(PolygonPPConsensusContract.target, aggchainFEPFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        // New interface according to the new implemention
        aggchainFEPContract = aggchainFEPFactory.attach(PolygonPPConsensusContract.target) as unknown as AggchainFEP;

        // Define the struct values
        const initParams = {
            l2BlockTime: 10,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: 0,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv1(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
        );

        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainFEPContract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPContract.submissionInterval()).to.be.equal(initParams.submissionInterval);
        expect(await aggchainFEPContract.rollupConfigHash()).to.be.equal(initParams.rollupConfigHash);
        expect(await aggchainFEPContract.aggregationVkey()).to.be.equal(initParams.aggregationVkey);
        expect(await aggchainFEPContract.rangeVkeyCommitment()).to.be.equal(initParams.rangeVkeyCommitment);
        expect(await aggchainFEPContract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPContract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPContract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPContract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPContract.useDefaultGateway()).to.be.equal(useDefaultGateway);
        expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPContract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check getAggchainHash', async () => {
        const blockData = await ethers.provider.getBlock('latest');
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // calculate aggchainHash
        let newStateRoot = ethers.id('newStateRoot');
        let newl2BlockNumber = 104;
        let bytesAggchainData;

        // getAggchainHash: L2BlockNumberLessThanNextBlockNumber error
        bytesAggchainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPContract.getAggchainHash(bytesAggchainData)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'L2BlockNumberLessThanNextBlockNumber',
        );

        await expect(aggchainFEPContract.getAggchainHash('0x')).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'InvalidAggchainDataLength',
        );

        // getAggchainHash: CannotProposeFutureL2Output error
        newl2BlockNumber = 1200;
        bytesAggchainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPContract.getAggchainHash(bytesAggchainData)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'CannotProposeFutureL2Output',
        );

        // getAggchainHash: L2OutputRootCannotBeZero error
        newStateRoot = ethers.ZeroHash;
        newl2BlockNumber = 105;
        bytesAggchainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);

        await expect(aggchainFEPContract.getAggchainHash(bytesAggchainData)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'L2OutputRootCannotBeZero',
        );

        // getAggchainHash: correct aggchainHash
        newStateRoot = ethers.id('newStateRoot');
        newl2BlockNumber = 105;
        bytesAggchainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);
        const aggchainHashSC = await aggchainFEPContract.getAggchainHash(bytesAggchainData);

        // calculate aggchainHash JS
        const finakVKey = await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector);

        const oldL2Output = await aggchainFEPContract.getL2Output(0);
        const rollupConfigHash = await aggchainFEPContract.rollupConfigHash();
        const optimisticMode = await aggchainFEPContract.optimisticMode();
        const trustedSequencerSC = await aggchainFEPContract.trustedSequencer();
        const rangeVkeyCommitment = await aggchainFEPContract.rangeVkeyCommitment();
        const aggregationVkey = await aggchainFEPContract.aggregationVkey();

        const aggchainParamsBytes = utilsFEP.computeHashAggchainParamsFEP(
            oldL2Output.outputRoot,
            newStateRoot,
            newl2BlockNumber,
            rollupConfigHash,
            optimisticMode,
            trustedSequencerSC,
            rangeVkeyCommitment,
            aggregationVkey,
        );

        const consensusTypeSC = await aggchainFEPContract.CONSENSUS_TYPE();

        const aggchainHashJS = utilsAggchain.computeAggchainHash(consensusTypeSC, finakVKey, aggchainParamsBytes);

        expect(aggchainHashSC).to.be.equal(aggchainHashJS);
    });

    it('should check generic getters', async () => {
        const blockData = await ethers.provider.getBlock('latest');
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // SUBMISSION_INTERVAL
        expect(await aggchainFEPContract.SUBMISSION_INTERVAL()).to.be.equal(initParams.submissionInterval);

        // L2_BLOCK_TIME
        expect(await aggchainFEPContract.L2_BLOCK_TIME()).to.be.equal(initParams.l2BlockTime);

        // getL2Output
        const l2Output = await aggchainFEPContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // latestOutputIndex
        expect(await aggchainFEPContract.latestOutputIndex()).to.be.equal(0);

        // nextOutputIndex
        expect(await aggchainFEPContract.nextOutputIndex()).to.be.equal(1);

        // latestBlockNumber
        expect(await aggchainFEPContract.latestBlockNumber()).to.be.equal(initParams.startingBlockNumber);

        // nextBlockNumber
        expect(await aggchainFEPContract.nextBlockNumber()).to.be.equal(
            initParams.startingBlockNumber + initParams.submissionInterval,
        );

        // computeL2Timestamp
        const newBlockNumber = 105;
        const l2TimestampJS =
            initParams.startingTimestamp + (newBlockNumber - initParams.startingBlockNumber) * initParams.l2BlockTime;
        const l2TimestampSC = await aggchainFEPContract.computeL2Timestamp(newBlockNumber);
        expect(l2TimestampJS).to.be.equal(l2TimestampSC);
    });

    it('should check onVerifyPessimistic', async () => {
        let blockData = await ethers.provider.getBlock('latest');
        let blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        const newStateRoot = ethers.id('newStateRoot');
        const newl2BlockNumber = 104;
        const bytesAggchainData = utilsFEP.encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);

        // get nextOutputIndex for the event
        const nextOutputIndex = await aggchainFEPContract.nextOutputIndex();

        // onVerifyPessimistic: not rollup Manager
        await expect(aggchainFEPContract.onVerifyPessimistic(bytesAggchainData)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyRollupManager',
        );

        await expect(
            aggchainFEPContract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidAggchainDataLength');

        // onVerifyPessimistic: not rollup Manager
        const onVerifyPessimisticTx = await aggchainFEPContract
            .connect(rollupManagerSigner)
            .onVerifyPessimistic(bytesAggchainData, { gasPrice: 0 });

        // get timestamp
        blockData = await ethers.provider.getBlock('latest');
        blockDataTimestamp = blockData?.timestamp;

        await expect(onVerifyPessimisticTx)
            .to.emit(aggchainFEPContract, 'OutputProposed')
            .withArgs(newStateRoot, nextOutputIndex, newl2BlockNumber, blockDataTimestamp);

        // verify correct new state
        const newL2Output = await aggchainFEPContract.getL2Output(1);
        expect(newL2Output.outputRoot).to.be.equal(newStateRoot);
        expect(newL2Output.l2BlockNumber).to.be.equal(newl2BlockNumber);
        expect(newL2Output.timestamp).to.be.equal(blockDataTimestamp);
    });

    it('should check aggchainManager role', async () => {
        const blockData = await ethers.provider.getBlock('latest');
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // aggchainManager: functions
        // submission interval
        const oldSubmissionInterval = await aggchainFEPContract.SUBMISSION_INTERVAL();
        const newSubmissionInterval = 42;

        await expect(aggchainFEPContract.updateSubmissionInterval(newSubmissionInterval)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyAggchainManager',
        );
        await expect(
            aggchainFEPContract.connect(aggchainManager).updateSubmissionInterval(0),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'SubmissionIntervalMustBeGreaterThanZero');
        await expect(aggchainFEPContract.connect(aggchainManager).updateSubmissionInterval(newSubmissionInterval))
            .to.emit(aggchainFEPContract, 'SubmissionIntervalUpdated')
            .withArgs(oldSubmissionInterval, newSubmissionInterval);

        const newSubmissionIntervalSC = await aggchainFEPContract.SUBMISSION_INTERVAL();
        expect(newSubmissionIntervalSC).to.be.equal(newSubmissionInterval);

        // rollupConfigHash
        const oldRollupConfigHash = await aggchainFEPContract.rollupConfigHash();
        const newRollupConfigHash = ethers.id('newRollupConfigHash');

        await expect(aggchainFEPContract.updateRollupConfigHash(newRollupConfigHash)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyAggchainManager',
        );
        await expect(
            aggchainFEPContract.connect(aggchainManager).updateRollupConfigHash(ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'RollupConfigHashMustBeDifferentThanZero');
        await expect(aggchainFEPContract.connect(aggchainManager).updateRollupConfigHash(newRollupConfigHash))
            .to.emit(aggchainFEPContract, 'RollupConfigHashUpdated')
            .withArgs(oldRollupConfigHash, newRollupConfigHash);

        const newRollupConfigHashSC = await aggchainFEPContract.rollupConfigHash();
        expect(newRollupConfigHashSC).to.be.equal(newRollupConfigHash);

        // rangeVKeyCommitment
        const oldRangeVKeyCommitment = await aggchainFEPContract.rangeVkeyCommitment();
        const newRangeVKeyCommitment = ethers.id('newRangeVKeyCommitment');

        await expect(
            aggchainFEPContract.updateRangeVkeyCommitment(newRangeVKeyCommitment),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');
        await expect(
            aggchainFEPContract.connect(aggchainManager).updateRangeVkeyCommitment(ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'RangeVkeyCommitmentMustBeDifferentThanZero');
        await expect(aggchainFEPContract.connect(aggchainManager).updateRangeVkeyCommitment(newRangeVKeyCommitment))
            .to.emit(aggchainFEPContract, 'RangeVkeyCommitmentUpdated')
            .withArgs(oldRangeVKeyCommitment, newRangeVKeyCommitment);

        const newRangeVKeyCommitmentSC = await aggchainFEPContract.rangeVkeyCommitment();
        expect(newRangeVKeyCommitmentSC).to.be.equal(newRangeVKeyCommitment);

        // rangeVKeyCommitment
        const oldAggregationVkey = await aggchainFEPContract.aggregationVkey();
        const newAggregationVkey = ethers.id('newAggregationVkey');

        await expect(aggchainFEPContract.updateAggregationVkey(newRangeVKeyCommitment)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyAggchainManager',
        );
        await expect(aggchainFEPContract.connect(aggchainManager).updateAggregationVkey(newAggregationVkey))
            .to.emit(aggchainFEPContract, 'AggregationVkeyUpdated')
            .withArgs(oldAggregationVkey, newAggregationVkey);

        const newAggregationVkeySC = await aggchainFEPContract.aggregationVkey();
        expect(newAggregationVkeySC).to.be.equal(newAggregationVkey);

        // aggchainManager: managing role
        await expect(aggchainFEPContract.transferAggchainManagerRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyAggchainManager',
        );
        await expect(
            aggchainFEPContract.connect(aggchainManager).transferAggchainManagerRole(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidZeroAddress');

        await expect(aggchainFEPContract.connect(aggchainManager).transferAggchainManagerRole(deployer.address))
            .to.emit(aggchainFEPContract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager, deployer.address);

        const pendingAggchainManager = await aggchainFEPContract.pendingAggchainManager();
        expect(pendingAggchainManager).to.be.equal(deployer.address);

        await expect(
            aggchainFEPContract.connect(aggchainManager).acceptAggchainManagerRole(),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyPendingAggchainManager');

        await expect(aggchainFEPContract.acceptAggchainManagerRole())
            .to.emit(aggchainFEPContract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager, deployer.address);

        const finalAggchainManager = await aggchainFEPContract.aggchainManager();
        expect(finalAggchainManager).to.be.equal(deployer.address);
    });

    it('should check optimisticModeManager role', async () => {
        const blockData = await ethers.provider.getBlock('latest');
        const blockDataTimestamp = blockData?.timestamp;

        // Define the struct values
        const initParams = {
            l2BlockTime: 1,
            rollupConfigHash: ethers.id('rollupConfigHash'),
            startingOutputRoot: ethers.id('startingOutputRoot'),
            startingBlockNumber: 100,
            startingTimestamp: blockDataTimestamp - 20,
            submissionInterval: 5,
            optimisticModeManager: optModeManager.address,
            aggregationVkey: ethers.id('aggregationVkey'),
            rangeVkeyCommitment: ethers.id('rangeVkeyCommitment'),
        };

        const initializeBytesAggchain = utilsFEP.encodeInitializeBytesAggchainFEPv0(
            initParams,
            useDefaultGateway,
            newAggchainVKey,
            aggchainVKeySelector,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // optimisticModeManager: functions
        // enable optimistic mode
        await expect(aggchainFEPContract.enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyOptimisticModeManager',
        );

        await expect(aggchainFEPContract.connect(optModeManager).disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OptimisticModeNotEnabled',
        );

        await expect(aggchainFEPContract.connect(optModeManager).enableOptimisticMode()).to.emit(
            aggchainFEPContract,
            'EnableOptimisticMode',
        );

        // disable optimistic mode
        await expect(aggchainFEPContract.disableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OnlyOptimisticModeManager',
        );

        await expect(aggchainFEPContract.connect(optModeManager).enableOptimisticMode()).to.be.revertedWithCustomError(
            aggchainFEPContract,
            'OptimisticModeEnabled',
        );

        await expect(aggchainFEPContract.connect(optModeManager).disableOptimisticMode()).to.emit(
            aggchainFEPContract,
            'DisableOptimisticMode',
        );

        // optModeManager role functions
        await expect(
            aggchainFEPContract.transferOptimisticModeManagerRole(deployer.address),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyOptimisticModeManager');
        await expect(
            aggchainFEPContract.connect(optModeManager).transferOptimisticModeManagerRole(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidZeroAddress');

        await expect(aggchainFEPContract.connect(optModeManager).transferOptimisticModeManagerRole(deployer.address))
            .to.emit(aggchainFEPContract, 'TransferOptimisticModeManagerRole')
            .withArgs(optModeManager, deployer.address);

        const pendingOptimisticModeManager = await aggchainFEPContract.pendingOptimisticModeManager();
        expect(pendingOptimisticModeManager).to.be.equal(deployer.address);

        await expect(
            aggchainFEPContract.connect(optModeManager).acceptOptimisticModeManagerRole(),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyPendingOptimisticModeManager');

        await expect(aggchainFEPContract.acceptOptimisticModeManagerRole())
            .to.emit(aggchainFEPContract, 'AcceptOptimisticModeManagerRole')
            .withArgs(optModeManager, deployer.address);

        const finalOptimisticModeManager = await aggchainFEPContract.optimisticModeManager();
        expect(finalOptimisticModeManager).to.be.equal(deployer.address);
    });
});
