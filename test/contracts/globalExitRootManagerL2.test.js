const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root L2', () => {
    let PolygonZkEVMBridge;
    let polygonZkEVMGlobalExitRoot;
    const PolygonZkEVMAddress = ethers.constants.AddressZero;

    beforeEach('Deploy contracts', async () => {
        const networkIDRollup = 1;

        // load signers
        const deployer = (await ethers.getSigners())[0];

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        PolygonZkEVMBridge = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });
        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootL2Mock', deployer);
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(PolygonZkEVMBridge.address);

        await PolygonZkEVMBridge.initialize(networkIDRollup, polygonZkEVMGlobalExitRoot.address, PolygonZkEVMAddress);
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZkEVMBridge.address);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check the storage position matches', async () => {
        // Check global exit root
        const newRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const blockNumber = 1;
        await polygonZkEVMGlobalExitRoot.setLastGlobalExitRoot(newRoot, blockNumber);
        expect(await polygonZkEVMGlobalExitRoot.globalExitRootMap(newRoot)).to.be.equal(blockNumber);
        const mapStoragePosition = 0;
        const key = newRoot;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [key, mapStoragePosition]);
        const storageValue = await ethers.provider.getStorageAt(polygonZkEVMGlobalExitRoot.address, storagePosition);
        expect(blockNumber).to.be.equal(ethers.BigNumber.from(storageValue).toNumber());

        // Check rollup exit root
        const newRootRollupExitRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await polygonZkEVMGlobalExitRoot.setExitRoot(newRootRollupExitRoot);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(newRootRollupExitRoot);

        const storagePositionExitRoot = 1;
        const storageValueExitRoot = await ethers.provider.getStorageAt(polygonZkEVMGlobalExitRoot.address, storagePositionExitRoot);
        expect(newRootRollupExitRoot, storageValueExitRoot);
    });
});
