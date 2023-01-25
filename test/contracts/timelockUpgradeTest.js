const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

// OZ test functions
function genOperation(target, value, data, predecessor, salt) {
    const id = ethers.utils.solidityKeccak256([
        'address',
        'uint256',
        'bytes',
        'uint256',
        'bytes32',
    ], [
        target,
        value,
        data,
        predecessor,
        salt,
    ]);
    return {
        id, target, value, data, predecessor, salt,
    };
}

describe('Polygon ZK-EVM', () => {
    let deployer;
    let trustedAggregator;
    let trustedSequencer;
    let admin;

    let timelockContract;
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

    const minDelay = 60 * 60; // 1 hout
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

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVMMock');
        polygonZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], { initializer: false });

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            polygonZkEVMContract.address,
            polygonZkEVMBridgeContract.address,
        );

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

        const proposers = [deployer.address];
        const executors = [deployer.address];
        const adminAddress = deployer.address;

        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        timelockContract = await timelockContractFactory.deploy(minDelay, proposers, executors, adminAddress, polygonZkEVMContract.address);
        await timelockContract.deployed();
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

    it('Should transferOwnership of the proxyAdmin to the timelock', async () => {
        // Upgrade the contract
        const polygonZkEVMBridgeFactoryV2 = await ethers.getContractFactory('PolygonZkEVMBridgeMock');
        const polygonZkEVMBridgeContractV2 = polygonZkEVMBridgeFactoryV2.attach(polygonZkEVMBridgeContract.address);

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        // Transfer ownership to timelock
        await upgrades.admin.transferProxyAdminOwnership(timelockContract.address);

        // Can't upgrade the contract since it does not have the ownership
        await expect(upgrades.upgradeProxy(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2))
            .to.be.reverted;

        const implBridgeV2Address = await upgrades.prepareUpgrade(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2);
        const proxyAdmin = await upgrades.admin.getInstance();

        // Use timelock
        const operation = genOperation(
            proxyAdmin.address,
            0,
            proxyAdmin.interface.encodeFunctionData(
                'upgrade',
                [polygonZkEVMBridgeContract.address,
                    implBridgeV2Address],
            ),
            ethers.constants.HashZero,
            ethers.constants.HashZero,
        );

        // Schedule operation
        await timelockContract.schedule(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            minDelay,
        );

        // Can't upgrade because the timeout didint expire yet
        await expect(timelockContract.execute(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        )).to.be.revertedWith('TimelockController: operation is not ready');

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        await ethers.provider.send('evm_increaseTime', [minDelay]);
        await timelockContract.execute(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        );

        await expect(await polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.equal(0);
    });

    it('Should check thet in emergency state the minDelay is 0', async () => {
        // Upgrade the contract
        const polygonZkEVMBridgeFactoryV2 = await ethers.getContractFactory('PolygonZkEVMBridgeMock');
        const polygonZkEVMBridgeContractV2 = polygonZkEVMBridgeFactoryV2.attach(polygonZkEVMBridgeContract.address);

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        // Transfer ownership to timelock

        // Can't upgrade the contract since it does not have the ownership
        await expect(upgrades.upgradeProxy(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2))
            .to.be.reverted;

        const implBridgeV2Address = await upgrades.prepareUpgrade(polygonZkEVMBridgeContract.address, polygonZkEVMBridgeFactoryV2);
        const proxyAdmin = await upgrades.admin.getInstance();

        // Use timelock
        const operation = genOperation(
            proxyAdmin.address,
            0,
            proxyAdmin.interface.encodeFunctionData(
                'upgrade',
                [polygonZkEVMBridgeContract.address,
                    implBridgeV2Address],
            ),
            ethers.constants.HashZero,
            ethers.constants.HashZero,
        );

        // Check current delay
        expect(await timelockContract.getMinDelay()).to.be.equal(minDelay);

        // Put zkevmcontract on emergency mode
        await polygonZkEVMContract.activateEmergencyState(0);

        // Check delay is 0
        expect(await timelockContract.getMinDelay()).to.be.equal(0);

        // Schedule operation
        await timelockContract.schedule(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            0,
        );

        // Check that is the v0 contract
        await expect(polygonZkEVMBridgeContractV2.maxEtherBridge()).to.be.reverted;

        // Transaction cna be executed, delay is reduced to 0, but fails bc this timelock is not owner
        await expect(timelockContract.execute(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        )).to.be.revertedWith('TimelockController: underlying transaction reverted');
    });
});
