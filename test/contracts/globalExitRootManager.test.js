const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root', () => {
    let rollup;
    let PolygonZKEVMBridge;

    let polygonZKEVMGlobalExitRoot;
    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollup, PolygonZKEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZKEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZKEVMGlobalExitRoot');
        polygonZKEVMGlobalExitRoot = await upgrades.deployProxy(
            PolygonZKEVMGlobalExitRootFactory,
            [rollup.address,
                PolygonZKEVMBridge.address],
        );
        await polygonZKEVMGlobalExitRoot.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZKEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollup.address);
        expect(await polygonZKEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZKEVMBridge.address);
        expect(await polygonZKEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
        expect(await polygonZKEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await expect(polygonZKEVMGlobalExitRoot.updateExitRoot(newRootRollup))
            .to.be.revertedWith('PolygonZKEVMGlobalExitRoot::updateExitRoot: ONLY_ALLOWED_CONTRACTS');

        // Update root from the rollup
        await expect(polygonZKEVMGlobalExitRoot.connect(rollup).updateExitRoot(newRootRollup))
            .to.emit(polygonZKEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(zero32bytes, newRootRollup);

        expect(await polygonZKEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(zero32bytes, newRootRollup));

        // Update root from the PolygonZKEVMBridge
        const newRootBridge = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await expect(polygonZKEVMGlobalExitRoot.connect(PolygonZKEVMBridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZKEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(newRootBridge, newRootRollup);

        expect(await polygonZKEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        expect(await polygonZKEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(newRootBridge, newRootRollup));
    });
});
