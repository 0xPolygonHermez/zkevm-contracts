const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root', () => {
    let rollup;
    let PolygonZKEVMBridge;

    let globalExitRootManager;
    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollup, PolygonZKEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [rollup.address, PolygonZKEVMBridge.address]);
        await globalExitRootManager.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await globalExitRootManager.rollupAddress()).to.be.equal(rollup.address);
        expect(await globalExitRootManager.bridgeAddress()).to.be.equal(PolygonZKEVMBridge.address);
        expect(await globalExitRootManager.lastRollupExitRoot()).to.be.equal(zero32bytes);
        expect(await globalExitRootManager.lastMainnetExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await expect(globalExitRootManager.updateExitRoot(newRootRollup))
            .to.be.revertedWith('GlobalExitRootManager::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // Update root from the rollup
        await expect(globalExitRootManager.connect(rollup).updateExitRoot(newRootRollup))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(zero32bytes, newRootRollup);

        expect(await globalExitRootManager.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(zero32bytes, newRootRollup));

        // Update root from the PolygonZKEVMBridge
        const newRootBridge = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await expect(globalExitRootManager.connect(PolygonZKEVMBridge).updateExitRoot(newRootBridge))
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(newRootBridge, newRootRollup);

        expect(await globalExitRootManager.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        expect(await globalExitRootManager.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(newRootBridge, newRootRollup));
    });
});
