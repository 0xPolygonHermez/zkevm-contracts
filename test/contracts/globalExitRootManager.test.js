const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
const one32bytes = '0x0000000000000000000000000000000000000000000000000000000000000001';
const two32bytes = '0x0000000000000000000000000000000000000000000000000000000000000002';

describe('Global Exit Root', () => {
    let rollup;
    let PolygonZkEVMBridge;

    let polygonZkEVMGlobalExitRoot;
    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollup, PolygonZkEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootWrapper');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], { initializer: false });

        await polygonZkEVMGlobalExitRoot.initialize(rollup.address, PolygonZkEVMBridge.address, one32bytes, two32bytes);
        await polygonZkEVMGlobalExitRoot.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollup.address);
        expect(await polygonZkEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZkEVMBridge.address);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(two32bytes);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(one32bytes);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(newRootRollup))
            .to.be.revertedWith('OnlyAllowedContracts');

        // Update root from the rollup
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(newRootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(one32bytes, newRootRollup);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(one32bytes, newRootRollup));

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRoot.connect(PolygonZkEVMBridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(newRootBridge, newRootRollup);

        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(newRootBridge, newRootRollup));
    });
});
