/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Polygon ZK-EVM TestnetV2', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let polTokenContract;
    let polygonZkEVMGlobalExitRoot;
    let rollupManagerContract;

    const polTokenName = 'POL Token';
    const polTokenSymbol = 'POL';
    const polTokenInitialBalance = ethers.parseEther('20000000');

    const networkIDMainnet = 0;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const version = '0.0.1';
    const forkID = 0;

    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeout = 100;

    let firstDeployment = true;

    //roles
    const DEFAULT_ADMIN_ROLE = ethers.HashZero;
    const ADD_ROLLUP_TYPE_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("ADD_ROLLUP_TYPE_ROLE")]);
    const OBSOLETE_ROLLUP_TYPE_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("OBSOLETE_ROLLUP_TYPE_ROLE")]);
    const CREATE_ROLLUP_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("CREATE_ROLLUP_ROLE")]);
    const ADD_EXISTING_ROLLUP_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("ADD_EXISTING_ROLLUP_ROLE")]);
    const UPDATE_ROLLUP_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("UPDATE_ROLLUP_ROLE")]);
    const TRUSTED_AGGREGATOR_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("TRUSTED_AGGREGATOR_ROLE")]);
    const TWEAK_PARAMETERS_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("TWEAK_PARAMETERS_ROLE")]);
    const SET_FEE_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("SET_FEE_ROLE")]);
    const STOP_EMERGENCY_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("STOP_EMERGENCY_ROLE")]);
    const EMERGENCY_COUNCIL_ROLE = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("EMERGENCY_COUNCIL_ROLE")]);
    const EMERGENCY_COUNCIL_ADMIN = ethers.solidityPackedKeccak256(["bytes"], [ethers.toUtf8Bytes("EMERGENCY_COUNCIL_ADMIN")]);


    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin, timelock, emergencyCouncil] = await ethers.getSigners();


        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy pol
        const polTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await polTokenFactory.deploy(
            polTokenName,
            polTokenSymbol,
            deployer.address,
            polTokenInitialBalance,
        );
        await polTokenContract.deployed();

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
        const precalculateRollupManagerAddress = ethers.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
        firstDeployment = false;

        // deploy globalExitRoot
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateRollupManagerAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy mock verifier
        const PolygonRollupManagerFactory = await ethers.getContractFactory(
            'PolygonRollupManagerMock',
        );

        rollupManagerContract = await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [polygonZkEVMGlobalExitRoot.address,
            polTokenContract.address,
            polygonZkEVMBridgeContract.address],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        await rollupManagerContract.deployed();

        // check precalculated address
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, rollupManagerContract.address);

        // Initialize Mock
        await rollupManagerContract.initializeMock(trustedAggregator.address,
            pendingStateTimeoutDefault,
            trustedAggregatorTimeout,
            admin.address,
            timelock.address,
            emergencyCouncil.address);


        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther('1000'));
    });

    it('should check the initalized parameters', async () => {
        expect(await rollupManagerContract.globalExitRootManager()).to.be.equal(polygonZkEVMGlobalExitRoot.address);
        expect(await rollupManagerContract.pol()).to.be.equal(polTokenContract.address);
        expect(await rollupManagerContract.bridgeAddress()).to.be.equal(polygonZkEVMBridgeContract.address);

        expect(await rollupManagerContract.pendingStateTimeout()).to.be.equal(pendingStateTimeoutDefault);
        expect(await rollupManagerContract.trustedAggregator()).to.be.equal(trustedAggregator.address);
        expect(await rollupManagerContract.trustedAggregatorTimeout()).to.be.equal(trustedAggregatorTimeout);

        expect(await rollupManagerContract.getBatchFee()).to.be.equal(ethers.parseEther('0.1'));
        expect(await rollupManagerContract.getForcedBatchFee()).to.be.equal(ethers.parseEther('10'));

        // Check roles

        expect(await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(ADD_ROLLUP_TYPE_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(UPDATE_ROLLUP_ROLE, timelock.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(OBSOLETE_ROLLUP_TYPE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(TWEAK_PARAMETERS_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(SET_FEE_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(STOP_EMERGENCY_ROLE, admin.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ROLE, emergencyCouncil.address)).to.be.equal(true);
        expect(await rollupManagerContract.hasRole(EMERGENCY_COUNCIL_ADMIN, emergencyCouncil.address)).to.be.equal(true);
    });

    it('should add a new rollup type', async () => {


    });
});


