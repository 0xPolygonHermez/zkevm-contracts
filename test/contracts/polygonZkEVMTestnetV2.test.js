/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Polygon ZK-EVM TestnetV2', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;
    let gasTokenContract;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const gasTokenName = 'Fork Token';
    const gasTokenSymbol = 'FORK';
    const gasTokenInitialBalance = ethers.utils.parseEther('20000000');

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
    let doesNeedImplementationDeployment = true;
    const depositBranches = new Array(32).fill(ethers.constants.HashZero);

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin] = await ethers.getSigners();

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        // deploy gas token
        const gasTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        gasTokenContract = await gasTokenFactory.deploy(
            gasTokenName,
            gasTokenSymbol,
            deployer.address,
            gasTokenInitialBalance,
        );
        await gasTokenContract.deployed();

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
        const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + (firstDeployment ? 2 : 2);
        const nonceProxyZkevm = nonceProxyBridge + (doesNeedImplementationDeployment ? 2 : 1);

        const precalculateBridgeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateZkevmAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
        firstDeployment = false;
        doesNeedImplementationDeployment = false;
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootWrapper');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [],
        });

        await polygonZkEVMGlobalExitRoot.initialize(
            precalculateZkevmAddress,
            precalculateBridgeAddress,
            ethers.constants.HashZero,
            ethers.constants.HashZero,
        );
        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeWrapper');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMTestnet
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMTestnetV2');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });
        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
        expect(precalculateZkevmAddress).to.be.equal(polygonZkEVMContract.address);

        await polygonZkEVMBridgeContract.initialize(
            networkIDMainnet,
            polygonZkEVMGlobalExitRoot.address,
            polygonZkEVMContract.address,
            gasTokenContract.address,
            true,
            0,
            depositBranches,
        );
        await polygonZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
                chainID,
                forkID,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
            polygonZkEVMGlobalExitRoot.address,
            maticTokenContract.address,
            verifierContract.address,
            polygonZkEVMBridgeContract.address,

        );

        // fund sequencer address with Matic tokens
        await maticTokenContract.transfer(trustedSequencer.address, ethers.utils.parseEther('1000'));
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMContract.version()).to.be.equal(0);
    });

    it('should check updateVersion', async () => {
        const newVersionString = '0.0.2';

        /*
         * const lastVerifiedBatch = 0;
         * await expect(polygonZkEVMContract.updateVersion(newVersionString))
         *     .to.emit(polygonZkEVMContract, 'UpdateZkEVMVersion').withArgs(lastVerifiedBatch, forkID, newVersionString);
         */

        await expect(polygonZkEVMContract.updateVersion(newVersionString))
            .to.be.revertedWith('VersionAlreadyUpdated');

        // expect(await polygonZkEVMContract.version()).to.be.equal(1);
    });
});
