const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Polygon ZK-EVM', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;

    let verifierContract;
    let polygonZkEVMBridgeContract;
    let polygonZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;

    const maticTokenName = 'Matic Token';
    const maticTokenSymbol = 'MATIC';
    const maticTokenInitialBalance = ethers.utils.parseEther('20000000');

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const allowForcebatches = true;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const pendingStateTimeoutDefault = 10;
    const trustedAggregatorTimeoutDefault = 10;

    beforeEach('Deploy contract', async () => {
        // load signers
        [deployer, trustedAggregator, trustedSequencer, admin] = await ethers.getSigners();

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

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], { initializer: false });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PoE
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], { initializer: false });

        await polygonZkEVMGlobalExitRoot.initialize(polygonZkEVMContract.address, polygonZkEVMBridgeContract.address);
        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, polygonZkEVMContract.address);
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

    it('Should upgrade brdige correctly', async () => {
        // Upgrade the contract
        const polygonZkEVMBridgeFactoryV2 = await ethers.getContractFactory('PolygonZkEVMBridgeMock');
        const polygonZkEVMBridgeContractV2 = polygonZkEVMBridgeFactoryV2.attach(polygonZkEVMBridgeContract.address);

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        // Upgrade the contract
        await upgrades.upgradeProxy(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2);

        await expect(await polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.equal(0);
    });

    it('Should upgrade brdige correctly', async () => {
        // Upgrade the contract
        const polygonZkEVMBridgeFactoryV2 = await ethers.getContractFactory('PolygonZkEVMBridgeMock');
        const polygonZkEVMBridgeContractV2 = polygonZkEVMBridgeFactoryV2.attach(polygonZkEVMBridgeContract.address);

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        // Upgrade the contract
        await upgrades.upgradeProxy(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2);
    });
});
