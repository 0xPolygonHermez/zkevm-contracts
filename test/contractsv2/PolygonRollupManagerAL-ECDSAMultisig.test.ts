/* eslint-disable @typescript-eslint/no-shadow */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { setCode } from '@nomicfoundation/hardhat-network-helpers';

import {
    AgglayerGateway,
    ERC20PermitMock,
    AgglayerManagerMock,
    AgglayerGER,
    AgglayerBridge,
    AggchainECDSAMultisig,
    VerifierRollupHelperMock,
} from '../../typechain-types';

import { VerifierType, computeRandomBytes } from '../../src/pessimistic-utils';
import {
    CONSENSUS_TYPE,
    encodeInitAggchainManager,
    computeAggchainHash,
    computeSignersHash,
} from '../../src/utils-common-aggchain';

import { NO_ADDRESS, AGGCHAIN_DEFAULT_VKEY_ROLE, AL_ADD_PP_ROUTE_ROLE, AL_MULTISIG_ROLE } from '../../src/constants';

describe('Polygon rollup manager aggregation layer v3: ECDSA Multisig', () => {
    // SIGNERS
    let deployer: any;
    let trustedSequencer: any;
    let trustedAggregator: any;
    let aggchainManager: any;
    let admin: any;
    let timelock: any;
    let emergencyCouncil: any;
    let aggLayerAdmin: any;
    let tester: any;
    let aggchainVKey: any;
    let addProofAggregationRoute: any;
    let freezeProofAggregationRoute: any;

    // CONTRACTS
    let polygonZkEVMBridgeContract: AgglayerBridge;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: AgglayerGER;
    let rollupManagerContract: AgglayerManagerMock;
    let aggLayerGatewayContract: AgglayerGateway;
    let aggchainECDSAMultisigImplementationContract: AggchainECDSAMultisig;
    let verifierContract: VerifierRollupHelperMock;
    /// CONSTANTS
    const POL_TOKEN_NAME = 'POL Token';
    const POL_TOKEN_SYMBOL = 'POL';
    const POL_INITIAL_BALANCE = ethers.parseEther('20000000');
    // BRIDGE CONSTANTS
    const NETWORK_ID_MAINNET = 0;
    // AGGLAYER CONSTANTS
    const PROOF_AGGREGATION_SELECTOR = '0x00000001';
    // AGGCHAIN CONSTANTS
    // bytes2(version)=0x0001 | bytes2(type)=0x0002 => selector 0x00010002
    const AGGCHAIN_VKEY_SELECTOR = '0x00010002';
    const CUSTOM_DATA_ECDSA = '0x'; // ECDSA Multisig expects empty aggchainData
    const proofAggregationVKey = '0x1000000000000000000000000000000000000000000000000000000000000000';

    upgrades.silenceWarnings();

    async function createECDSAMultisigRollupType() {
        // Create rollup type for  ECDSA
        const lastRollupTypeID = await rollupManagerContract.rollupTypeCount();
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAMultisigImplementationContract.target,
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
                aggchainECDSAMultisigImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                ethers.ZeroHash, // programVKey
            );

        return Number(lastRollupTypeID) + 1;
    }

    async function createECDSAMultisigRollup(rollupTypeIdECDSAMultisig: number) {
        // For RollupManager tests, we initialize directly with parameters
        // Note: The contract now uses direct parameters instead of encoded bytes

        // initialize bytes aggchainManager
        const initBytesInitAggchainManager = encodeInitAggchainManager(aggchainManager.address);

        const rollupManagerNonce = await ethers.provider.getTransactionCount(rollupManagerContract.target);
        const rollupsCount = await rollupManagerContract.rollupCount();
        const precomputedAggchainECDSAMultisigAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: rollupManagerNonce,
        });

        await expect(
            rollupManagerContract.connect(admin).attachAggchainToAL(
                rollupTypeIdECDSAMultisig, // rollupTypeID
                1001, // chainID
                initBytesInitAggchainManager,
            ),
        )
            .to.emit(rollupManagerContract, 'CreateNewRollup')
            .withArgs(
                Number(rollupsCount) + 1, // rollupID
                rollupTypeIdECDSAMultisig, // rollupType ID
                precomputedAggchainECDSAMultisigAddress,
                1001, // chainID
                NO_ADDRESS, // gasTokenAddress
            );

        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(
            precomputedAggchainECDSAMultisigAddress as string,
        );

        // Use explicit function selector to avoid ambiguity
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            ['initialize(address,address,address,string,string,bool,(address,string)[],uint256)'](
                admin.address,
                trustedSequencer.address,
                ethers.ZeroAddress, // gas token address
                '', // trusted sequencer url
                '', // network name
                false, // useDefaultSigners
                [], // No signers to add initially
                0, // Threshold of 0 initially
            );

        // Initialize empty signers to avoid AggchainSignersHashNotInitialized error
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        return [Number(rollupsCount) + 1, precomputedAggchainECDSAMultisigAddress];
    }

    beforeEach('Deploy contract', async () => {
        // load signers
        [
            deployer,
            trustedSequencer,
            trustedAggregator,
            admin,
            aggchainManager,
            timelock,
            emergencyCouncil,
            aggLayerAdmin,
            tester,
            aggchainVKey,
            addProofAggregationRoute,
            freezeProofAggregationRoute,
        ] = await ethers.getSigners();

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
            aggchainVKey.address,
            addProofAggregationRoute.address,
            freezeProofAggregationRoute.address,
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
        // Grant role to agglayer admin
        await aggLayerGatewayContract.connect(admin).grantRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address);
        // Add permission to add default aggchain verification key
        await aggLayerGatewayContract.connect(admin).grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address);
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

        // deploy ECDSA Multisig implementation contract
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainECDSAMultisigImplementationContract = await aggchainECDSAMultisigFactory.deploy(
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
                aggchainVKey.address,
                addProofAggregationRoute.address,
                freezeProofAggregationRoute.address,
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
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        await expect(
            aggchainECDSAMultisigFactory.deploy(
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                rollupManagerContract.target,
                ethers.ZeroAddress, // invalid zero address fo aggLayerGateway
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigFactory, 'InvalidZeroAddress');
    });

    it('should create a ECDSA rollup type', async () => {
        // Create rollup type for ECDSA where verifier is not zero to trigger InvalidRollupType error
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAMultisigImplementationContract.target,
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
                aggchainECDSAMultisigImplementationContract.target,
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
                aggchainECDSAMultisigImplementationContract.target,
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
                aggchainECDSAMultisigImplementationContract.target,
                ethers.ZeroAddress, // verifier
                0, // forkID
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                '', // description
                computeRandomBytes(32), // programVKey should be zero, invalid
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'InvalidRollupType');

        // Create rollup type for  ECDSA
        await createECDSAMultisigRollupType();

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(1);

        const expectedRollupType = [
            aggchainECDSAMultisigImplementationContract.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            false,
            ethers.ZeroHash,
            ethers.ZeroHash,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);
    });

    it('should create a rollup with rollup type ECDSA', async () => {
        const rollupTypeIdECDSAMultisig = await createECDSAMultisigRollupType();
        const [, rollupAddress] = await createECDSAMultisigRollup(rollupTypeIdECDSAMultisig);

        // Check created rollup
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(rollupAddress as string);
        expect(await aggchainECDSAMultisigContract.aggLayerGateway()).to.be.equal(aggLayerGatewayContract.target);
        // Check overrode initialize function from aggchainBase
        await expect(
            aggchainECDSAMultisigContract.initialize(
                ethers.ZeroAddress,
                ethers.ZeroAddress,
                0,
                ethers.ZeroAddress,
                '',
                '',
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidInitializeFunction');
    });

    it('should perform a transfer of the aggchainManager role', async () => {
        // Create ecdsa rollup type and rollup
        const rollupTypeIdECDSAMultisig = await createECDSAMultisigRollupType();
        const [, rollupAddress] = await createECDSAMultisigRollup(rollupTypeIdECDSAMultisig);
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(rollupAddress as string);
        // Transfer aggchainManager role
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.equal(aggchainManager.address);
        // Trigger onlyAggchainManager
        await expect(
            aggchainECDSAMultisigContract.connect(admin).transferAggchainManagerRole(admin.address),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyAggchainManager');
        await expect(aggchainECDSAMultisigContract.connect(aggchainManager).transferAggchainManagerRole(admin.address))
            .to.emit(aggchainECDSAMultisigContract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager.address, admin.address);
        // Accept aggchainManager role
        // Trigger onlyPendingAggchainManager
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).acceptAggchainManagerRole(),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyPendingAggchainManager');
        await expect(aggchainECDSAMultisigContract.connect(admin).acceptAggchainManagerRole())
            .to.emit(aggchainECDSAMultisigContract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager.address, admin.address);
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.equal(admin.address);
    });

    it('should getAggchainHash using default gateway', async () => {
        // Add default aggchain verification key
        // Generate random aggchain verification key
        const aggchainVKey = computeRandomBytes(32);

        // Compose selector for generated aggchain verification key
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(AGGCHAIN_VKEY_SELECTOR, aggchainVKey);

        // Try to add same key with same selector for reverting
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Try to add same key with wrong role
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR, aggchainVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');

        // Check added vkey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(AGGCHAIN_VKEY_SELECTOR)).to.be.equal(aggchainVKey);

        // Create ECDSA aggchain
        const rollupTypeIdECDSAMultisig = await createECDSAMultisigRollupType();
        const [, aggchainECDSAMultisigAddress] = await createECDSAMultisigRollup(rollupTypeIdECDSAMultisig);

        // Get aggchain hash
        // For ECDSA Multisig, getVKeyAndAggchainParams correctly returns (bytes32(0), bytes32(0))
        // because ECDSA Multisig uses only signersHash for consensus, not specific vKeys or params
        const actualAggchainVKey = ethers.ZeroHash; // Correctly zero for ECDSA Multisig
        const aggchainParams = ethers.ZeroHash; // Correctly zero for ECDSA Multisig
        const emptySignersHash = computeSignersHash(0, []);

        const precomputedAggchainHash = computeAggchainHash(
            CONSENSUS_TYPE.GENERIC,
            actualAggchainVKey,
            aggchainParams,
            emptySignersHash,
        );
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(
            aggchainECDSAMultisigAddress as string,
        );

        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        expect(await aggchainECDSAMultisigContract.getAggchainHash(CUSTOM_DATA_ECDSA)).to.be.equal(
            precomputedAggchainHash,
        );
    });

    it('should verify an aggregated proof of a single ECDSA aggchain', async () => {
        // Create ECDSA aggchain
        const rollupTypeIdECDSAMultisig = await createECDSAMultisigRollupType();
        const [aggchainECDSAMultisigId] = await createECDSAMultisigRollup(rollupTypeIdECDSAMultisig);

        // Create a bridge to update the GER
        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(aggchainECDSAMultisigId, tester.address, true, '0x', {
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
        
        const l1InfoTreeLeafCount = 1;
        const l1InfoRoot = await polygonZkEVMGlobalExitRoot.l1InfoRootMap(l1InfoTreeLeafCount);
        const newArer = '0x2200000000000000000000000000000000000000000000000000000000000000';

        const proof = `0x${''.padEnd(128 * 2, '0')}`;
        // append first 4 bytes to the proof to select the pessimistic vkey
        const proofWithSelector = `${PROOF_AGGREGATION_SELECTOR}${proof.slice(2)}`;

        // Add default proof aggregation vkey route
        await aggLayerGatewayContract
            .connect(addProofAggregationRoute)
            .addProofAggregationVKeyRoute(AGGCHAIN_VKEY_SELECTOR, verifierAddress, proofAggregationVKey);

        // verify an aggregated proof of a single ECDSA aggchain
        const rollupECDSAMultisigData = await rollupManagerContract.rollupIDToRollupData(aggchainECDSAMultisigId);
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const ECDSAMultisigRollupContract = await aggchainECDSAMultisigFactory.attach(rollupECDSAMultisigData[0]);

        // Check initial value of lastAgglayerRollupExitRoot (should be zero)
        expect(await rollupManagerContract.lastAgglayerRollupExitRoot()).to.be.equal(ethers.ZeroHash);

        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyAggregatedProofTrusted(
                [
                    {
                        rollupID: aggchainECDSAMultisigId,
                        newLocalExitRoot,
                        newPessimisticRoot,
                        aggchainData: CUSTOM_DATA_ECDSA,
                    },
                ],
                l1InfoTreeLeafCount,
                newArer,
                proofWithSelector,
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .to.emit(ECDSAMultisigRollupContract, 'OnVerifyPessimisticECDSAMultisig')
            .to.emit(rollupManagerContract, 'VerifyAggregatedProof')
            .withArgs(ethers.ZeroHash, newArer)
            .to.emit(rollupManagerContract, 'VerifyPessimisticStateTransition')
            .withArgs(
                aggchainECDSAMultisigId,
                prevPessimisticRoot,
                newPessimisticRoot,
                prevLocalExitRoot,
                newLocalExitRoot,
                l1InfoRoot,
                trustedAggregator.address,
            );

        // Assert that lastAgglayerRollupExitRoot is updated to newArer
        expect(await rollupManagerContract.lastAgglayerRollupExitRoot()).to.be.equal(newArer);
        
        // Assert that rollup's lastLocalExitRoot and lastPessimisticRoot are updated
        const rollupDataAfter = await rollupManagerContract.rollupIDToRollupDataV2(aggchainECDSAMultisigId);
        expect(rollupDataAfter.lastLocalExitRoot).to.be.equal(newLocalExitRoot);
        expect(rollupDataAfter.lastPessimisticRoot).to.be.equal(newPessimisticRoot);
    });

    it('should verify an aggregated proof for multiple ECDSA aggchains', async () => {
        // TODO: Implement this test
    });

    it('should add existing rollup to ECDSA', async () => {
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
