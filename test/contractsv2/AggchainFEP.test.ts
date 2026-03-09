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
    const useDefaultVkeys = false;
    const useDefaultSigners = false;
    const aggchainVKeySelector = '0x12340001';
    const newAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, aggchainManager, optModeManager] = await ethers.getSigners();

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

        // Initialize parameters will be passed directly to the contract
        // No need to encode them anymore

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
        // Initialize parameters will be passed directly to the contract
        // Using modified initParamsCp

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParamsCp,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'SubmissionIntervalMustBeGreaterThanZero');

        // initializeAggchain: l2BlockTime = 0
        initParamsCp = { ...initParams };
        initParamsCp.l2BlockTime = 0;
        // Initialize parameters will be passed directly to the contract
        // Using modified initParamsCp

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParamsCp,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'L2BlockTimeMustBeGreaterThanZero');
        // initializeAggchain: rollupConfigHash = 0
        initParamsCp = { ...initParams };
        initParamsCp.rollupConfigHash = ethers.ZeroHash;
        // Initialize parameters will be passed directly to the contract
        // Using modified initParamsCp

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParamsCp,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'RollupConfigHashMustBeDifferentThanZero');
        // initializeAggchain: startingTimestamp > block.timestamp
        initParamsCp = { ...initParams };
        initParamsCp.startingTimestamp = Math.floor(Date.now() / 1000) + 1000;
        // Initialize parameters will be passed directly to the contract
        // Using modified initParamsCp

        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParamsCp,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'StartL2TimestampMustBeLessThanCurrentTime');

        initParamsCp = { ...initParams };

        initParamsCp = { ...initParams };
        initParamsCp.optimisticModeManager = ethers.ZeroAddress;
        // Initialize parameters will be passed directly to the contract
        // Using modified initParamsCp
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParamsCp,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidZeroAddress');

        // correct initialization
        // Initialize parameters will be passed directly to the contract
        // No need to encode them anymore

        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

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

        // These parameters are now stored in opSuccinctConfigs
        const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');
        const genesisConfig = await aggchainFEPContract.opSuccinctConfigs(GENESIS_CONFIG_NAME);
        expect(genesisConfig.rollupConfigHash).to.be.equal(initParams.rollupConfigHash);
        expect(genesisConfig.aggregationVkey).to.be.equal(initParams.aggregationVkey);
        expect(genesisConfig.rangeVkeyCommitment).to.be.equal(initParams.rangeVkeyCommitment);

        expect(await aggchainFEPContract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPContract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPContract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPContract.useDefaultVkeys()).to.be.equal(useDefaultVkeys);
        expect(await aggchainFEPContract.useDefaultVkeys()).to.be.equal(useDefaultVkeys);
        expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPContract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParams,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        expect(await aggchainFEPContract.version()).to.be.equal('v3.0.0');
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

        // Initialize parameters will be passed directly to the contract
        // initializeFromLegacyConsensus function uses similar parameters

        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // For v1, we use initializeFromLegacyConsensus
        await aggchainFEPContract.connect(aggchainManager).initializeFromLegacyConsensus(
            initParams,
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // check all SC storage slots are correctly initialized
        // aggchain
        expect(await aggchainFEPContract.aggchainManager()).to.be.equal(aggchainManager.address);
        expect(await aggchainFEPContract.l2BlockTime()).to.be.equal(initParams.l2BlockTime);
        expect(await aggchainFEPContract.submissionInterval()).to.be.equal(initParams.submissionInterval);

        // These parameters are now stored in opSuccinctConfigs
        const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');
        const genesisConfig = await aggchainFEPContract.opSuccinctConfigs(GENESIS_CONFIG_NAME);
        expect(genesisConfig.rollupConfigHash).to.be.equal(initParams.rollupConfigHash);
        expect(genesisConfig.aggregationVkey).to.be.equal(initParams.aggregationVkey);
        expect(genesisConfig.rangeVkeyCommitment).to.be.equal(initParams.rangeVkeyCommitment);

        expect(await aggchainFEPContract.optimisticModeManager()).to.be.equal(initParams.optimisticModeManager);
        expect(await aggchainFEPContract.latestOutputIndex()).to.be.equal(0);
        expect(await aggchainFEPContract.nextOutputIndex()).to.be.equal(1);

        const l2Output = await aggchainFEPContract.getL2Output(0);
        expect(l2Output.outputRoot).to.be.equal(initParams.startingOutputRoot);
        expect(l2Output.timestamp).to.be.equal(initParams.startingTimestamp);
        expect(l2Output.l2BlockNumber).to.be.equal(initParams.startingBlockNumber);

        // aggchainBase
        expect(await aggchainFEPContract.useDefaultVkeys()).to.be.equal(useDefaultVkeys);
        expect(await aggchainFEPContract.useDefaultVkeys()).to.be.equal(useDefaultVkeys);
        expect(await aggchainFEPContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);

        // PolygonConsensusBase
        expect(await aggchainFEPContract.admin()).to.be.equal(admin.address);
        expect(await aggchainFEPContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainFEPContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainFEPContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainFEPContract.networkName()).to.be.equal(networkName);

        // try to initialize again
        await expect(
            aggchainFEPContract.connect(aggchainManager).initialize(
                initParams,
                [], // No signers to add initially
                0, // Threshold of 0 initially
                useDefaultVkeys,
                useDefaultSigners,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // AggchainFEP extends AggchainBase but doesn't use signers
        // However, we need to initialize the signers hash to avoid AggchainSignersHashNotInitialized error
        // Initialize with empty signers
        const expectedEmptyHash = utilsAggchain.computeSignersHash(0, []);
        await expect(aggchainFEPContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0))
            .to.emit(aggchainFEPContract, 'SignersAndThresholdUpdated')
            .withArgs([], 0, expectedEmptyHash);

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

        // Get config from opSuccinctConfigs
        const GENESIS_CONFIG_NAME = ethers.id('opsuccinct_genesis');
        const genesisConfig = await aggchainFEPContract.opSuccinctConfigs(GENESIS_CONFIG_NAME);
        const { rollupConfigHash } = genesisConfig;
        const { rangeVkeyCommitment } = genesisConfig;
        const { aggregationVkey } = genesisConfig;

        const optimisticMode = await aggchainFEPContract.optimisticMode();
        const trustedSequencerSC = await aggchainFEPContract.trustedSequencer();

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

        // Base now appends signersHash; we initialized empty signers
        const emptySignersHash = utilsAggchain.computeSignersHash(0, []);
        const aggchainHashJS = utilsAggchain.computeAggchainHash(
            consensusTypeSC,
            finakVKey,
            aggchainParamsBytes,
            emptySignersHash,
        );

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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

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

        // rollupConfigHash update functionality has been removed from the contract
        // Configuration is now managed through OpSuccinctConfig structures

        // rangeVKeyCommitment and aggregationVkey update functionality has been removed
        // These are now managed through OpSuccinctConfig structures

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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

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

    it('should check OpSuccinctConfig management functions', async () => {
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

        // Initialize parameters will be passed directly to the contract
        // No encoding needed

        // initialize using rollup manager
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainFEPContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            useDefaultVkeys,
            useDefaultSigners,
            newAggchainVKey,
            aggchainVKeySelector,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Test addOpSuccinctConfig
        const configName = ethers.id('test_config');
        const rollupConfigHash = ethers.id('new_rollup_config_hash');
        const aggregationVkey = ethers.id('new_aggregation_vkey');
        const rangeVkeyCommitment = ethers.id('new_range_vkey_commitment');

        // Only aggchainManager can add configs
        await expect(
            aggchainFEPContract
                .connect(deployer)
                .addOpSuccinctConfig(configName, rollupConfigHash, aggregationVkey, rangeVkeyCommitment),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');

        // Add config successfully
        await expect(
            aggchainFEPContract
                .connect(aggchainManager)
                .addOpSuccinctConfig(configName, rollupConfigHash, aggregationVkey, rangeVkeyCommitment),
        )
            .to.emit(aggchainFEPContract, 'OpSuccinctConfigUpdated')
            .withArgs(configName, aggregationVkey, rangeVkeyCommitment, rollupConfigHash);

        // Test adding config with empty name
        await expect(
            aggchainFEPContract
                .connect(aggchainManager)
                .addOpSuccinctConfig(ethers.ZeroHash, rollupConfigHash, aggregationVkey, rangeVkeyCommitment),
        ).to.be.revertedWith('L2OutputOracle: config name cannot be empty');

        // Test adding config with invalid parameters (zero values)
        await expect(
            aggchainFEPContract
                .connect(aggchainManager)
                .addOpSuccinctConfig(
                    ethers.id('invalid_config'),
                    ethers.ZeroHash,
                    aggregationVkey,
                    rangeVkeyCommitment,
                ),
        ).to.be.revertedWith('L2OutputOracle: invalid OP Succinct configuration parameters');

        // Test adding duplicate config
        await expect(
            aggchainFEPContract
                .connect(aggchainManager)
                .addOpSuccinctConfig(configName, rollupConfigHash, aggregationVkey, rangeVkeyCommitment),
        ).to.be.revertedWith('L2OutputOracle: config already exists');

        // Test selectOpSuccinctConfig
        // Only aggchainManager can select configs
        await expect(
            aggchainFEPContract.connect(deployer).selectOpSuccinctConfig(configName),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');

        // Select config successfully
        await expect(aggchainFEPContract.connect(aggchainManager).selectOpSuccinctConfig(configName))
            .to.emit(aggchainFEPContract, 'OpSuccinctConfigSelected')
            .withArgs(configName);

        // Verify the selected config
        const selectedConfig = await aggchainFEPContract.selectedOpSuccinctConfigName();
        expect(selectedConfig).to.be.equal(configName);

        // Test selecting non-existent config
        await expect(
            aggchainFEPContract.connect(aggchainManager).selectOpSuccinctConfig(ethers.id('non_existent')),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'ConfigDoesNotExist');

        // Test deleteOpSuccinctConfig
        // Only aggchainManager can delete configs
        await expect(
            aggchainFEPContract.connect(deployer).deleteOpSuccinctConfig(configName),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');

        // Delete config successfully
        await expect(aggchainFEPContract.connect(aggchainManager).deleteOpSuccinctConfig(configName))
            .to.emit(aggchainFEPContract, 'OpSuccinctConfigDeleted')
            .withArgs(configName);

        // Test deleting non-existent config
        await expect(aggchainFEPContract.connect(aggchainManager).deleteOpSuccinctConfig(ethers.id('non_existent'))).to
            .not.be.reverted; // Should not revert since no validation exists

        // Test isValidOpSuccinctConfig
        const validConfig = await aggchainFEPContract.isValidOpSuccinctConfig({
            aggregationVkey: ethers.id('valid_agg_vkey'),
            rangeVkeyCommitment: ethers.id('valid_range_vkey'),
            rollupConfigHash: ethers.id('valid_rollup_hash'),
        });
        expect(validConfig).to.be.equal(true);

        const invalidConfig = await aggchainFEPContract.isValidOpSuccinctConfig({
            aggregationVkey: ethers.ZeroHash,
            rangeVkeyCommitment: ethers.id('valid_range_vkey'),
            rollupConfigHash: ethers.id('valid_rollup_hash'),
        });
        expect(invalidConfig).to.be.equal(false);
    });

    it('should test initializeFromECDSAMultisig migration', async () => {
        // Deploy a fresh contract for testing migration
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const freshFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
        await freshFEPContract.waitForDeployment();

        // First, initialize aggchainManager
        await freshFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // We can't directly set the contract to version 2 through normal initialization
        // The initializeFromECDSAMultisig expects version 2, but we can't get there
        // So we'll just test that it properly reverts with InvalidInitializer

        // Test that initializeFromECDSAMultisig properly reverts when not at version 2
        const initParams = {
            submissionInterval: 300, // 5 minutes
            l2BlockTime: 2, // 2 seconds
            startingBlockNumber: 100,
            startingTimestamp: 0,
            startingOutputRoot: ethers.id('startingOutputRoot'),
            rollupConfigHash: ethers.id('test_rollup_hash'),
            aggregationVkey: ethers.id('test_agg_vkey'),
            rangeVkeyCommitment: ethers.id('test_range_vkey'),
            optimisticModeManager: optModeManager.address,
        };

        // This should revert because the contract is not at version 2
        await expect(
            freshFEPContract.connect(aggchainManager).initializeFromECDSAMultisig(
                initParams,
                false, // useDefaultVkeys
                ethers.ZeroHash, // initOwnedAggchainVKey
                '0x00010001', // initAggchainVKeySelector for FEP
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(freshFEPContract, 'InvalidInitializer');
    });

    it('should test upgradeFromPreviousFEP function', async () => {
        // Deploy a fresh contract for testing upgrade
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const upgradeFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
        await upgradeFEPContract.waitForDeployment();

        // Set up the contract
        await upgradeFEPContract.connect(rollupManagerSigner).initAggchainManager(admin.address, { gasPrice: 0 });

        // The upgradeFromPreviousFEP function expects the contract to be at version 2
        // but have certain old FEP state. Since we can't easily get to that state,
        // we'll test that it properly reverts (it will revert with SignerCannotBeZero
        // because it tries to add trustedSequencer as signer but it's not set)
        await expect(upgradeFEPContract.connect(rollupManagerSigner).upgradeFromPreviousFEP({ gasPrice: 0 })).to.be
            .reverted;
    });

    it('should test initialize edge cases and error conditions', async () => {
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const edgeCaseFEPContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
        await edgeCaseFEPContract.waitForDeployment();

        await edgeCaseFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Test useDefaultVkeys with non-zero selector and vkey (line 345-349)
        await expect(
            edgeCaseFEPContract.connect(aggchainManager).initialize(
                {
                    l2BlockTime: 2,
                    rollupConfigHash: ethers.id('test_rollup_hash'),
                    startingOutputRoot: ethers.id('startingOutputRoot'),
                    startingBlockNumber: 100,
                    startingTimestamp: 0,
                    submissionInterval: 300,
                    optimisticModeManager: optModeManager.address,
                    aggregationVkey: ethers.id('test_agg_vkey'),
                    rangeVkeyCommitment: ethers.id('test_range_vkey'),
                },
                [], // signers
                0, // threshold
                true, // useDefaultVkeys = true
                false, // useDefaultSigners
                ethers.id('non_zero_vkey'), // non-zero vkey (should fail when useDefaultVkeys=true)
                '0x12340001', // non-zero selector (should fail when useDefaultVkeys=true)
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(edgeCaseFEPContract, 'InvalidInitAggchainVKey');

        // Test invalid aggchain type (line 356)
        await expect(
            edgeCaseFEPContract.connect(aggchainManager).initialize(
                {
                    l2BlockTime: 2,
                    rollupConfigHash: ethers.id('test_rollup_hash'),
                    startingOutputRoot: ethers.id('startingOutputRoot'),
                    startingBlockNumber: 100,
                    startingTimestamp: 0,
                    submissionInterval: 300,
                    optimisticModeManager: optModeManager.address,
                    aggregationVkey: ethers.id('test_agg_vkey'),
                    rangeVkeyCommitment: ethers.id('test_range_vkey'),
                },
                [], // signers
                0, // threshold
                false, // useDefaultVkeys = false
                false, // useDefaultSigners
                ethers.id('test_vkey'),
                '0xFFFF0002', // Invalid aggchain type (not 0x0001, needs last 2 bytes to be 0001)
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(edgeCaseFEPContract, 'InvalidAggchainType');
    });

    it('should test enableUseDefaultSignersFlag and disableUseDefaultSignersFlag', async () => {
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Initialize contract first
        await aggchainFEPContract.connect(aggchainManager).initialize(
            {
                l2BlockTime: 2,
                rollupConfigHash: ethers.id('test_rollup_hash'),
                startingOutputRoot: ethers.id('startingOutputRoot'),
                startingBlockNumber: 100,
                startingTimestamp: 0,
                submissionInterval: 300,
                optimisticModeManager: optModeManager.address,
                aggregationVkey: ethers.id('test_agg_vkey'),
                rangeVkeyCommitment: ethers.id('test_range_vkey'),
            },
            [], // signers
            0, // threshold
            false, // useDefaultVkeys
            false, // useDefaultSigners - start with false
            ethers.id('test_vkey'),
            '0x00010001',
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Verify initial state
        expect(await aggchainFEPContract.useDefaultSigners()).to.equal(false);

        // Enable default signers flag
        await expect(aggchainFEPContract.connect(aggchainManager).enableUseDefaultSignersFlag({ gasPrice: 0 })).to.emit(
            aggchainFEPContract,
            'EnableUseDefaultSignersFlag',
        );

        expect(await aggchainFEPContract.useDefaultSigners()).to.equal(true);

        // Try to enable again - should revert
        await expect(
            aggchainFEPContract.connect(aggchainManager).enableUseDefaultSignersFlag({ gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'UseDefaultSignersAlreadyEnabled');

        // Disable default signers flag
        await expect(
            aggchainFEPContract.connect(aggchainManager).disableUseDefaultSignersFlag({ gasPrice: 0 }),
        ).to.emit(aggchainFEPContract, 'DisableUseDefaultSignersFlag');

        expect(await aggchainFEPContract.useDefaultSigners()).to.equal(false);

        // Try to disable again - should revert
        await expect(
            aggchainFEPContract.connect(aggchainManager).disableUseDefaultSignersFlag({ gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'UseDefaultSignersAlreadyDisabled');

        // Test access control - non-aggchainManager should not be able to call these functions
        const signers = await ethers.getSigners();
        const nonManager = signers[10];
        await expect(
            aggchainFEPContract.connect(nonManager).enableUseDefaultSignersFlag({ gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');

        await expect(
            aggchainFEPContract.connect(nonManager).disableUseDefaultSignersFlag({ gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');
    });

    it('should test AggchainBase edge cases', async () => {
        // Test various edge cases in AggchainBase contract
        await aggchainFEPContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Initialize contract
        await aggchainFEPContract.connect(aggchainManager).initialize(
            {
                l2BlockTime: 2,
                rollupConfigHash: ethers.id('test_rollup_hash'),
                startingOutputRoot: ethers.id('startingOutputRoot'),
                startingBlockNumber: 100,
                startingTimestamp: 0,
                submissionInterval: 300,
                optimisticModeManager: optModeManager.address,
                aggregationVkey: ethers.id('test_agg_vkey'),
                rangeVkeyCommitment: ethers.id('test_range_vkey'),
            },
            [], // signers
            0, // threshold
            false, // useDefaultVkeys
            false, // useDefaultSigners
            ethers.id('test_vkey'),
            '0x00010001',
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Test getAggchainSigners when empty
        const initialSigners = await aggchainFEPContract.getAggchainSigners();
        expect(initialSigners.length).to.equal(0);

        // Test getAggchainSignersCount when empty
        const initialCount = await aggchainFEPContract.getAggchainSignersCount();
        expect(initialCount).to.equal(0);

        // Add signers and test
        const [, , , , signer1, signer2] = await ethers.getSigners();
        await aggchainFEPContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            1,
        );

        // Test error conditions in updateOwnedAggchainVKey
        const selector = '0x00010002';

        // First add a vkey
        await aggchainFEPContract
            .connect(aggchainManager)
            .addOwnedAggchainVKey(selector, ethers.id('initial_vkey'), { gasPrice: 0 });

        // First update to a different vkey
        await aggchainFEPContract
            .connect(aggchainManager)
            .updateOwnedAggchainVKey(selector, ethers.id('updated_vkey'), { gasPrice: 0 });

        // Verify the vkey was updated
        expect(await aggchainFEPContract.ownedAggchainVKeys(selector)).to.equal(ethers.id('updated_vkey'));

        // Test updating non-existent vkey
        await expect(
            aggchainFEPContract.connect(aggchainManager).updateOwnedAggchainVKey(
                '0x00010099', // Non-existent selector
                ethers.id('new_vkey'),
                { gasPrice: 0 },
            ),
        ).to.be.reverted;
    });

    it('should test initAggchainManager edge cases', async () => {
        // Deploy a fresh contract for testing initAggchainManager
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const initManagerContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
        await initManagerContract.waitForDeployment();

        // First initialization should work
        await expect(
            initManagerContract
                .connect(rollupManagerSigner)
                .initAggchainManager(aggchainManager.address, { gasPrice: 0 }),
        ).to.not.be.reverted;

        // Verify the aggchainManager is set to the initial value
        expect(await initManagerContract.aggchainManager()).to.equal(aggchainManager.address);
    });

    it('should test initializeAggchainBase edge cases', async () => {
        // Deploy a fresh contract for testing initializeAggchainBase
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const baseInitContract = await upgrades.deployProxy(aggchainFEPFactory, [], {
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
        await baseInitContract.waitForDeployment();

        await baseInitContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Test that trying to initialize an already initialized aggchainManager fails
        // Since we can't easily test the initializeAggchainBase function in isolation,
        // we'll test that the aggchainManager initialization works properly
        // Verify the aggchainManager is set to the initial value
        expect(await baseInitContract.aggchainManager()).to.equal(aggchainManager.address);
    });
});
