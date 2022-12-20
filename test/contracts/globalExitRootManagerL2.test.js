const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root L2', () => {
    let bridge;
    let globalExitRootManager;
    const PolygonZKEVMAddress = ethers.constants.AddressZero;

    beforeEach('Deploy contracts', async () => {
        const networkIDRollup = 1;

        // load signers
        const deployer = (await ethers.getSigners())[0];

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge');
        bridge = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });
        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManagerL2Mock', deployer);
        globalExitRootManager = await globalExitRootManagerFactory.deploy(bridge.address);

        await bridge.initialize(networkIDRollup, globalExitRootManager.address, PolygonZKEVMAddress);
    });

    it('should check the constructor parameters', async () => {
        expect(await globalExitRootManager.bridgeAddress()).to.be.equal(bridge.address);
        expect(await globalExitRootManager.lastRollupExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check the storage position matches', async () => {
        // Check global exit root
        const newRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const blockNumber = 1;
        await globalExitRootManager.setLastGlobalExitRoot(newRoot, blockNumber);
        expect(await globalExitRootManager.globalExitRootMap(newRoot)).to.be.equal(blockNumber);
        const mapStoragePosition = 0;
        const key = newRoot;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [key, mapStoragePosition]);
        const storageValue = await ethers.provider.getStorageAt(globalExitRootManager.address, storagePosition);
        expect(blockNumber).to.be.equal(ethers.BigNumber.from(storageValue).toNumber());

        // Check rollup exit root
        const newRootRollupExitRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await globalExitRootManager.setExitRoot(newRootRollupExitRoot);
        expect(await globalExitRootManager.lastRollupExitRoot()).to.be.equal(newRootRollupExitRoot);

        const storagePositionExitRoot = 1;
        const storageValueExitRoot = await ethers.provider.getStorageAt(globalExitRootManager.address, storagePositionExitRoot);
        expect(newRootRollupExitRoot, storageValueExitRoot);
    });
});
