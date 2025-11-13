/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    SP1VerifierPlonk,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2Mock,
    PolygonZkEVMBridgeV2,
    PolygonPessimisticConsensus,
} from '../../../typechain-types';

import { VerifierType, computeInputPessimisticBytes, computeConsensusHashEcdsa } from '../../../src/pessimistic-utils';
import inputProof from './test-inputs/input.json';
import { encodeInitializeBytesLegacy } from '../../../src/utils-common-aggchain';

describe('Polygon Rollup Manager with Polygon Pessimistic Consensus', () => {
    let deployer: any;
    let timelock: any;
    let emergencyCouncil: any;
    let trustedAggregator: any;
    let trustedSequencer: any;
    let admin: any;

    let verifierContract: SP1VerifierPlonk;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2Mock;
    let rollupManagerContract: PolygonRollupManagerMock;
    let PolygonPPConsensusContract: PolygonPessimisticConsensus;

    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    // BRidge constants
    const networkIDMainnet = 0;

    let firstDeployment = true;

    // roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const ADD_ROLLUP_TYPE_ROLE = ethers.id('ADD_ROLLUP_TYPE_ROLE');
    const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.id('OBSOLETE_ROLLUP_TYPE_ROLE');
    const CREATE_ROLLUP_ROLE = ethers.id('CREATE_ROLLUP_ROLE');
    const ADD_EXISTING_ROLLUP_ROLE = ethers.id('ADD_EXISTING_ROLLUP_ROLE');
    const UPDATE_ROLLUP_ROLE = ethers.id('UPDATE_ROLLUP_ROLE');
    const TRUSTED_AGGREGATOR_ROLE = ethers.id('TRUSTED_AGGREGATOR_ROLE');
    const TRUSTED_AGGREGATOR_ROLE_ADMIN = ethers.id('TRUSTED_AGGREGATOR_ROLE_ADMIN');
    const TWEAK_PARAMETERS_ROLE = ethers.id('TWEAK_PARAMETERS_ROLE');
    const SET_FEE_ROLE = ethers.id('SET_FEE_ROLE');
    const STOP_EMERGENCY_ROLE = ethers.id('STOP_EMERGENCY_ROLE');
    const EMERGENCY_COUNCIL_ROLE = ethers.id('EMERGENCY_COUNCIL_ROLE');
    const EMERGENCY_COUNCIL_ADMIN = ethers.id('EMERGENCY_COUNCIL_ADMIN');

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, admin, timelock, emergencyCouncil] = await ethers.getSigners();
        trustedSequencer = inputProof.signer;
        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory('SP1VerifierPlonk');
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance,
        );

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();

        if ((await upgrades.admin.getInstance()).target !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }

        // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        const aggLayerGatewayContract = await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });

        const nonceProxyBridge =
            Number(await ethers.provider.getTransactionCount(deployer.address)) + (firstDeployment ? 3 : 2);

        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes,

        const precalculateBridgeAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyBridge,
        });
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: nonceProxyZkevm,
        });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2Mock');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // deploy polygon rollup manager mock
        const PolygonRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManagerMock');

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        })) as unknown as PolygonRollupManagerMock;

        await rollupManagerContract.waitForDeployment();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.target);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            '0x',
        );

        // Initialize Mock
        await expect(
            rollupManagerContract.initializeMock(
                trustedAggregator.address,
                admin.address,
                timelock.address,
                emergencyCouncil.address,
            ),
        ).to.emit(rollupManagerContract, 'UpdateRollupManagerVersion');

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer, ethers.parseEther('1000'));
    });

    it('should check the initalized parameters', async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.target);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.target);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.target);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther('10'));
        expect(await rollupManagerContract.calculateRewardPerBatch()).to.be.equal(0);

        // Check roles
        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_EXISTING_ROLLUP_ROLE, timelock.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true,
        );

        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE_ADMIN, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);

        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(
            true,
        );
    });

    it('should verify pessimistic proof: pessimistic type, with a real verifier (not mock)', async () => {
        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        PolygonPPConsensusContract = await ppConsensusFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
        );
        await PolygonPPConsensusContract.waitForDeployment();

        // Try to add a new rollup type
        const forkID = 11; // just metadata for pessimistic consensus
        const genesis = ethers.ZeroHash;
        const description = 'new pessimistic consensus';
        const programVKey = inputProof.vkey;
        const rollupTypeID = 1;

        // correct add new rollup via timelock
        await rollupManagerContract
            .connect(timelock)
            .addNewRollupType(
                PolygonPPConsensusContract.target,
                verifierContract.target,
                forkID,
                VerifierType.Pessimistic,
                genesis,
                description,
                programVKey,
            );

        // create new pessimistic: only admin
        const chainID = 1;
        const gasTokenAddress = ethers.ZeroAddress;
        const urlSequencer = 'https://pessimistic:8545';
        const networkName = 'testPessimistic';
        const pessimisticRollupID = inputProof['pp-inputs']['origin-network'];
        const initializeBytesAggchain = encodeInitializeBytesLegacy(
            admin.address,
            trustedSequencer,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );
        // create new pessimistic
        const newZKEVMAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: 1,
        });

        await rollupManagerContract.connect(admin).attachAggchainToAL(rollupTypeID, chainID, initializeBytesAggchain);

        // select not existent global exit root
        const l1InfoTreeLeafCount = 2;
        const newLER = inputProof['pp-inputs']['new-local-exit-root'];
        const newPPRoot = inputProof['pp-inputs']['new-pessimistic-root'];
        const proofPP = inputProof.proof;

        // not trusted aggregator
        await expect(
            rollupManagerContract.verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'AddressDoNotHaveRequiredRole');

        // global exit root does not exist
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        ).to.be.revertedWithCustomError(rollupManagerContract, 'L1InfoTreeLeafCountInvalid');

        const l1InfoRoot = inputProof['pp-inputs']['l1-info-root'];
        // check JS function computeInputPessimisticBytes
        const inputPessimisticBytes = await rollupManagerContract.getInputPessimisticBytes(
            pessimisticRollupID,
            l1InfoRoot,
            inputProof['pp-inputs']['new-local-exit-root'],
            inputProof['pp-inputs']['new-pessimistic-root'],
            '0x', // aggchainData
        );

        const infoRollup = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        const consensusHash = computeConsensusHashEcdsa(trustedSequencer);

        const expectedInputPessimisticBytes = computeInputPessimisticBytes(
            infoRollup[4],
            infoRollup[10],
            l1InfoRoot,
            pessimisticRollupID,
            consensusHash,
            newLER,
            newPPRoot,
        );

        expect(inputPessimisticBytes).to.be.equal(expectedInputPessimisticBytes);
        // Mock selected GER
        await polygonZkEVMGlobalExitRoot.injectGER(l1InfoRoot, l1InfoTreeLeafCount);

        // verify pessimistic
        await expect(
            rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                pessimisticRollupID,
                l1InfoTreeLeafCount,
                newLER,
                newPPRoot,
                proofPP,
                '0x', // aggchainData
            ),
        )
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(pessimisticRollupID, 0, ethers.ZeroHash, newLER, trustedAggregator.address);

        // assert rollup data
        const resRollupData = await rollupManagerContract.rollupIDToRollupDataV2(pessimisticRollupID);

        const expectedRollupData = [
            newZKEVMAddress,
            chainID,
            verifierContract.target,
            forkID,
            newLER,
            0,
            0,
            0,
            rollupTypeID,
            VerifierType.Pessimistic,
            newPPRoot,
            programVKey,
        ];

        expect(expectedRollupData).to.be.deep.equal(resRollupData);
    });
});
