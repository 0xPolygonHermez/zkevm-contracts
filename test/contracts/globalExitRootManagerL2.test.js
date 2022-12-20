const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root L2', () => {
    let PolygonZKEVMBridge;
    let polygonZKEVMGlobalExitRoot;
    const PolygonZKEVMAddress = ethers.constants.AddressZero;

    beforeEach('Deploy contracts', async () => {
        const networkIDRollup = 1;

        // load signers
        const deployer = (await ethers.getSigners())[0];

        // deploy PolygonZKEVMBridge
        const polygonZKEVMBridgeFactory = await ethers.getContractFactory('PolygonZKEVMBridge');
        PolygonZKEVMBridge = await upgrades.deployProxy(polygonZKEVMBridgeFactory, [], { initializer: false });
        // deploy global exit root manager
        const PolygonZKEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZKEVMGlobalExitRootL2Mock', deployer);
        polygonZKEVMGlobalExitRoot = await PolygonZKEVMGlobalExitRootFactory.deploy(PolygonZKEVMBridge.address);

        await PolygonZKEVMBridge.initialize(networkIDRollup, polygonZKEVMGlobalExitRoot.address, PolygonZKEVMAddress);
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZKEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZKEVMBridge.address);
        expect(await polygonZKEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check the storage position matches', async () => {
        // Check global exit root
        const newRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const blockNumber = 1;
        await polygonZKEVMGlobalExitRoot.setLastGlobalExitRoot(newRoot, blockNumber);
        expect(await polygonZKEVMGlobalExitRoot.globalExitRootMap(newRoot)).to.be.equal(blockNumber);
        const mapStoragePosition = 0;
        const key = newRoot;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [key, mapStoragePosition]);
        const storageValue = await ethers.provider.getStorageAt(polygonZKEVMGlobalExitRoot.address, storagePosition);
        expect(blockNumber).to.be.equal(ethers.BigNumber.from(storageValue).toNumber());

        // Check rollup exit root
        const newRootRollupExitRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await polygonZKEVMGlobalExitRoot.setExitRoot(newRootRollupExitRoot);
        expect(await polygonZKEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(newRootRollupExitRoot);

        const storagePositionExitRoot = 1;
        const storageValueExitRoot = await ethers.provider.getStorageAt(polygonZKEVMGlobalExitRoot.address, storagePositionExitRoot);
        expect(newRootRollupExitRoot, storageValueExitRoot);
    });
});
