import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { setCode } from '@nomicfoundation/hardhat-network-helpers';

import {
    AgglayerGateway,
    ERC20PermitMock,
    AgglayerManagerMock,
    AgglayerGER,
    AgglayerBridge,
    AggchainFEP,
    VerifierRollupHelperMock,
} from '../../typechain-types';

import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';

import {
    CONSENSUS_TYPE,
    encodeInitAggchainManager,
    computeAggchainHash,
    computeSignersHash,
} from '../../src/utils-common-aggchain';

import { encodeAggchainDataFEP, computeHashAggchainParamsFEP } from '../../src/utils-aggchain-FEP';

import { NO_ADDRESS, AGGCHAIN_DEFAULT_VKEY_ROLE, AL_ADD_PP_ROUTE_ROLE, AL_MULTISIG_ROLE } from '../../src/constants';

describe('Polygon rollup manager aggregation layer v3: FEP', () => {
    // SIGNERS
    let deployer: any;
    let trustedSequencer: any;
    let trustedAggregator: any;
    let admin: any;
    let timelock: any;
    let emergencyCouncil: any;
    let aggLayerAdmin: any;
    let tester: any;
    let aggchainManager: any;
    let optModeManager: any;

    // CONTRACTS
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;
    let aggLayerGatewayContract: AgglayerGateway;
    let aggchainFEPImplementationContract: AggchainFEP;
    let verifierContract: VerifierRollupHelperMock;
    /// CONSTANTS
    const POL_TOKEN_NAME = 'POL Token';
    const POL_TOKEN_SYMBOL = 'POL';
    const POL_INITIAL_BALANCE = ethers.parseEther('20000000');
    // BRIDGE CONSTANTS
    const NETWORK_ID_MAINNET = 0;
    // AGGLAYER CONSTANTS
    const PROOF_AGGREGATION_SELECTOR = '0x00000001';
    // calculate aggchainHash
    const newStateRoot = ethers.id('newStateRoot');
    const newl2BlockNumber = 1200;
    const aggchainVKeySelector = '0x12340001';
    const CUSTOM_DATA_FEP = encodeAggchainDataFEP(aggchainVKeySelector, newStateRoot, newl2BlockNumber);
    const proofAggregationVKey = '0x1000000000000000000000000000000000000000000000000000000000000000';
    let initParams;

    upgrades.silenceWarnings();

    async function createFEPRollup(rollupTypeIdFEP: number) {
        // Initialize parameters will be passed directly to the contract

        // initialize bytes aggchainManager
        const initBytesInitAggchainManager = encodeInitAggchainManager(aggchainManager.address);

        const rollupManagerNonce = await ethers.provider.getTransactionCount(rollupManagerContract.target);
        const rollupsCount = await rollupManagerContract.rollupCount();
        const precomputedAggchainFEPAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: rollupManagerNonce,
        });
        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(
                rollupTypeIdFEP, // rollupTypeID
                1001, // chainID
                initBytesInitAggchainManager,
            ),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(
                Number(rollupsCount) + 1, // rollupID
                rollupTypeIdFEP, // rollupType ID
                precomputedAggchainFEPAddress,
                1001, // chainID
                NO_ADDRESS, // gasTokenAddress
            );

        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainFEP');
        const aggchainECDSAContract = aggchainECDSAFactory.attach(precomputedAggchainFEPAddress as string);

        await aggchainECDSAContract.connect(aggchainManager).initialize(
            initParams,
            [], // No signers to add initially
            0, // Threshold of 0 initially
            true, // useDefaultVkeys
            true, // useDefaultSigners
            ethers.ZeroHash, // ownedAggchainVKeys
            '0x00000000', // aggchainVKeysSelectors
            admin.address,
            trustedSequencer.address,
            ethers.ZeroAddress, // gas token address
            '', // trusted sequencer url
            '', // network name
        );

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggchainECDSAContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        return [Number(rollupsCount) + 1, precomputedAggchainFEPAddress];
    }
    async function createFEPRollupType() {
        // Create rollup type for FEP
        const lastRollupTypeID = await rollupManagerContract.rollupTypeCount();
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        )
            .to.emit(rollupManagerContract, 'AddNewRollupType')
            .withArgs(
                Number(lastRollupTypeID) + 1 /* rollupTypeID */,
                aggchainFEPImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );

        return Number(lastRollupTypeID) + 1;
    }

    beforeEach('Deploy contract', async () => {
        // load signers
        [
            deployer,
            trustedSequencer,
            trustedAggregator,
            admin,
            timelock,
            emergencyCouncil,
            aggLayerAdmin,
            tester,
            aggchainManager,
            optModeManager,
        ] = await ethers.getSigners();

        // Define the struct values
        initParams = {
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

        // Deploy L1 contracts
        // deploy pol token contract
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            POL_TOKEN_NAME,
            POL_TOKEN_SYMBOL,
            deployer.address,
            POL_INITIAL_BALANCE,
        );

        // deploy AgglayerBridge, it's no initialized yet because rollupManager and globalExitRootManager addresses are not set yet (not deployed)
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('AgglayerBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // Deploy aggLayerGateway and initialize it
        const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        aggLayerGatewayContract = await upgrades.deployProxy(aggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer'],
        });

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory('VerifierRollupHelperMock');
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // Initialize aggLayerGateway
        await aggLayerGatewayContract.initialize(
            admin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            aggLayerAdmin.address,
            PROOF_AGGREGATION_SELECTOR,
            verifierContract.target,
            proofAggregationVKey,
            admin.address, // multisigRole
            [], // signersToAdd
            0, // newThreshold
        );

        // Grant AL_MULTISIG_ROLE to initialize signers
        await aggLayerGatewayContract.connect(admin).grantRole(AL_MULTISIG_ROLE, admin.address);

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggLayerGatewayContract.connect(admin).updateSignersAndThreshold([], [], 0);
        // check roles
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address)).to.be.equal(
            true,
        );
        // The rollupManager address need to be precalculated because it's used in the globalExitRoot constructor
        const currentDeployerNonce = await ethers.provider.getTransactionCount(deployer.address);
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: currentDeployerNonce + 3,
        });
        // deploy globalExitRootV2
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('AgglayerGER');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, polygonZkEVMBridgeContract.target],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy AgglayerManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerManagerMock;

        await rollupManagerContract.waitForDeployment();
        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            admin.address,
            timelock.address,
            emergencyCouncil.address,
        );

        // check precalculated address
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            NETWORK_ID_MAINNET,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            '0x',
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));

        // deploy aggchain
        // create aggchainFEP implementation
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        aggchainFEPImplementationContract = await aggchainFEPFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target,
        );
    });

    it('should check initializers and deploy parameters', async () => {
        await expect(
            aggLayerGatewayContract.initialize(
                timelock.address,
                aggLayerAdmin.address,
                aggLayerAdmin.address,
                aggLayerAdmin.address,
                PROOF_AGGREGATION_SELECTOR,
                verifierContract.target,
                proofAggregationVKey,
                admin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidInitialization');

        // Check non zero constructor parameters for rollupManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');
        await expect(
            PolygonRollupManagerFactory.deploy(
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                ethers.ZeroAddress, // zero for aggLayerGateway, invalid
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidConstructorInputs');
        await expect(
            PolygonRollupManagerFactory.deploy(
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                ethers.ZeroAddress, // zero for polygonZkEVMBridgeContract, invalid
                aggLayerGatewayContract.target,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidConstructorInputs');
        await expect(
            PolygonRollupManagerFactory.deploy(
                polygonZkEVMGlobalExitRoot.target,
                ethers.ZeroAddress, // zero for polTokenContract, invalid
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidConstructorInputs');
        await expect(
            PolygonRollupManagerFactory.deploy(
                ethers.ZeroAddress, // zero for polygonZkEVMGlobalExitRoot, invalid
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidConstructorInputs');

        // Should revert with error InvalidAgglayerGatewayAddress
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        await expect(
            aggchainFEPFactory.deploy(
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
                ethers.ZeroAddress, // invalid zero address fo aggLayerGateway
            ),
        ).to.be.revertedWithCustomError(aggchainFEPFactory, 'InvalidZeroAddress');
    });

    it('should create a FEP rollup type', async () => {
        // Create rollup type for FEP where verifier is not zero to trigger InvalidRollupType error
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPImplementationContract.target,
                trustedAggregator.address, // verifier wrong, must be zero
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPImplementationContract.target,
                ethers.ZeroAddress, // verifier
                1, // fork is not zero, invalid
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // forkID
                VerifierType.ALGateway,
                computeRandomBytes(32), // genesis should be zero, invalid
                '', // description
                ethers.ZeroHash, // programVKey
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainFEPImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // forkID
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                computeRandomBytes(32), // programVKey should be zero, invalid
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // Create rollup type for  FEP
        await createFEPRollupType();

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(1);

        const expectedRollupType = [
            aggchainFEPImplementationContract.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            false,
            ethers.ZeroHash,
            ethers.ZeroHash,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);
    });

    it('should create a rollup with rollup type FEP', async () => {
        const rollupTypeIdFEP = await createFEPRollupType();
        const [, rollupAddress] = await createFEPRollup(rollupTypeIdFEP);

        // Check created rollup
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const aggchainFEPContract = aggchainFEPFactory.attach(rollupAddress as string);
        expect(await aggchainFEPContract.aggLayerGateway()).to.be.equal(aggLayerGatewayContract.target);
        // Check override initialize function from aggchainBase
        await expect(
            aggchainFEPContract.initialize(ethers.ZeroAddress, ethers.ZeroAddress, 0, ethers.ZeroAddress, '', ''),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'InvalidInitializeFunction');
    });

    it('should perform a transfer of the vKeyManager role', async () => {
        // Create FEP rollup type and rollup
        const rollupTypeIdFEP = await createFEPRollupType();
        const [, rollupAddress] = await createFEPRollup(rollupTypeIdFEP);
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const aggchainFEPContract = aggchainFEPFactory.attach(rollupAddress as string);
        // Transfer aggchainManager role
        expect(await aggchainFEPContract.aggchainManager()).to.equal(aggchainManager.address);
        // Trigger onlyAggchainManager
        await expect(
            aggchainFEPContract.connect(admin).transferAggchainManagerRole(admin.address),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyAggchainManager');
        await expect(aggchainFEPContract.connect(aggchainManager).transferAggchainManagerRole(admin.address))
            .to.emit(aggchainFEPContract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager.address, admin.address);
        // Accept aggchainManager role
        // Trigger onlyPendingAggchainManager
        await expect(
            aggchainFEPContract.connect(aggchainManager).acceptAggchainManagerRole(),
        ).to.be.revertedWithCustomError(aggchainFEPContract, 'OnlyPendingAggchainManager');
        await expect(aggchainFEPContract.connect(admin).acceptAggchainManagerRole())
            .to.emit(aggchainFEPContract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager.address, admin.address);
    });

    it('should getAggchainHash using default gateway', async () => {
        // Add default aggchain verification key
        // Generate random aggchain verification key
        const aggchainVKey = computeRandomBytes(32);

        // Compose selector for generated aggchain verification key
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(aggchainVKeySelector, aggchainVKey);

        // Try to add same key with same selector for reverting
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Try to add same key with wrong role
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Check added vkey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(aggchainVKeySelector)).to.be.equal(aggchainVKey);

        // Create FEP aggchain
        const rollupTypeIdFEP = await createFEPRollupType();
        const [, aggchainFEPAddress] = await createFEPRollup(rollupTypeIdFEP);

        // Initialize signers hash with empty signers (required for getAggchainHash to work)
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const aggchainFEPContract = aggchainFEPFactory.attach(aggchainFEPAddress as string);
        await aggchainFEPContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        // Get aggchain hash
        const aggchainParamsBytes = computeHashAggchainParamsFEP(
            initParams.startingOutputRoot,
            newStateRoot,
            newl2BlockNumber,
            initParams.rollupConfigHash,
            false,
            trustedSequencer.address,
            initParams.rangeVkeyCommitment,
            initParams.aggregationVkey,
        );

        // Since getVKeyAndAggchainParams returns (0, 0) for AggchainFEP,
        // and we initialized empty signers, we need to compute the hash accordingly
        // The hash includes: consensusType, vKey, params, signersHash
        const emptySignersHash = computeSignersHash(0, []);
        const aggchainHashJS = computeAggchainHash(
            CONSENSUS_TYPE.GENERIC,
            aggchainVKey,
            aggchainParamsBytes,
            emptySignersHash,
        );

        expect(await aggchainFEPContract.getAggchainHash(CUSTOM_DATA_FEP)).to.be.equal(aggchainHashJS);
    });

    it('should verify an aggregated proof of a single FEP aggchain', async () => {
        // Create FEP aggchain
        const rollupTypeIdFEP = await createFEPRollupType();
        const [aggchainFEPId, aggchainFEPAddress] = await createFEPRollup(rollupTypeIdFEP);

        // Get the contract reference
        const aggchainFEPContract = (await ethers.getContractFactory('AggchainFEP')).attach(
            aggchainFEPAddress as string,
        );

        // Initialize signers hash with empty signers (required for getAggchainHash to work)
        await aggchainFEPContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        // Create a bridge to update the GER
        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(aggchainFEPId, tester.address, true, '0x', {
                value: ethers.parseEther('1'),
            }),
        )
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTree')
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateL1InfoTreeV2');

        expect(await polygonZkEVMBridgeContract.depositCount()).to.be.equal(1);

        const prevLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newLocalExitRoot = '0xa000000000000000000000000000000000000000000000000000000000000000';

        const prevPessimisticRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newPessimisticRoot = '0xb000000000000000000000000000000000000000000000000000000000000000';

        const verifierAddress = '0x1000000000000000000000000000000000000000';
        const l1InfoRoot = '0x1100000000000000000000000000000000000000000000000000000000000000';
        const newArer = '0x2200000000000000000000000000000000000000000000000000000000000000';

        const proof = `0x${''.padEnd(128 * 2, '0')}`;
        // append first 4 bytes to the proof to select the proof aggregation vkey
        const proofWithSelector = `${PROOF_AGGREGATION_SELECTOR}${proof.slice(2)}`;

        // Add default AggchainVKey
        const aggchainVKey = computeRandomBytes(32);
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(aggchainVKeySelector, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(aggchainVKeySelector, aggchainVKey);

        // Add default proof aggregation vkey route
        await aggLayerGatewayContract
            .connect(aggLayerAdmin)
            .addProofAggregationVKeyRoute(aggchainVKeySelector, verifierAddress, proofAggregationVKey);

        // verify an aggregated proof of a single FEP aggchain
        const rollupFEPData = await rollupManagerContract.rollupIDToRollupData(aggchainFEPId);
        const aggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const FEPRollupContract = await aggchainFEPFactory.attach(rollupFEPData[0]);

        // Check initial value of lastAgglayerRollupExitRoot (should be zero)
        expect(await rollupManagerContract.lastAgglayerRollupExitRoot()).to.be.equal(ethers.ZeroHash);

        const tx = await rollupManagerContract.connect(trustedAggregator).verifyAggregatedProofTrusted(
            [
                {
                    rollupID: aggchainFEPId,
                    newLocalExitRoot,
                    newPessimisticRoot,
                    aggchainData: CUSTOM_DATA_FEP,
                },
            ],
            l1InfoRoot,
            newArer,
            proofWithSelector,
        );

        const receipt = await tx.wait();
        
        // Assert that lastAgglayerRollupExitRoot is updated to newArer
        expect(await rollupManagerContract.lastAgglayerRollupExitRoot()).to.be.equal(newArer);
        
        // Assert that rollup's lastLocalExitRoot and lastPessimisticRoot are updated
        const rollupDataAfter = await rollupManagerContract.rollupIDToRollupDataV2(aggchainFEPId);
        expect(rollupDataAfter.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataAfter.lastPessimisticRoot).to.be.equal(newPessimisticRoot);
        
        const block = await ethers.provider.getBlock(receipt?.blockNumber || 0);
        const blockDataTimestamp = block?.timestamp;

        

        await expect(tx)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .to.emit(FEPRollupContract, 'OutputProposed')
            .withArgs(newStateRoot, 1, newl2BlockNumber, blockDataTimestamp)
            .to.emit(rollupManagerContract, 'VerifyAggregatedProof')
            .withArgs(ethers.ZeroHash, newArer)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                aggchainFEPId,
                prevPessimisticRoot,
                newPessimisticRoot,
                prevLocalExitRoot,
                newLocalExitRoot,
                l1InfoRoot,
                trustedAggregator.address,
            );
    });

    it('should add existing rollup to FEP', async () => {
        // add existing rollup
        const rollupAddress = '0xAa000000000000000000000000000000000000Bb';
        const forkID = 0;
        const chainID = 2;
        const initLER = '0xff000000000000000000000000000000000000000000000000000000000000ff';
        const programVKey = ethers.ZeroHash;
        const initPessimisticRoot = computeRandomBytes(32);
        // add existing rollup: pessimistic type
        const newCreatedRollupID = 1;
        // Add arbitrary bytecode to the implementation
        await setCode(rollupAddress, computeRandomBytes(32));
        // Should revert with InvalidInputsForRollupType
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                ethers.ZeroAddress, // Zero address verifier contract for aggchains
                forkID + 1, // Invalid
                chainID,
                initLER,
                VerifierType.ALGateway,
                programVKey,
                initPessimisticRoot,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidInputsForRollupType');
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                computeRandomBytes(20), // invalid non zero address at verifier param
                forkID,
                chainID,
                initLER,
                VerifierType.ALGateway,
                programVKey,
                initPessimisticRoot,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidInputsForRollupType');
        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                ethers.ZeroAddress,
                forkID,
                chainID,
                initLER,
                VerifierType.ALGateway,
                computeRandomBytes(32), // invalid programVKey, should be zero
                initPessimisticRoot,
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidInputsForRollupType');

        await expect(
            rollupManagerContract.connect(timelock).addExistingRollup(
                rollupAddress,
                ethers.ZeroAddress, // Zero address verifier contract for aggchains
                forkID,
                chainID,
                initLER,
                VerifierType.ALGateway,
                programVKey,
                initPessimisticRoot,
            ),
        )
            .to.emit(rollupManagerContract, 'AddExistingRollup')
            .withArgs(
                newCreatedRollupID,
                forkID,
                rollupAddress,
                chainID,
                VerifierType.ALGateway,
                0,
                programVKey,
                initPessimisticRoot,
            );
    });
});
