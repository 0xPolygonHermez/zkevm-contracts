const { expect } = require('chai');
const { ethers } = require('hardhat');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root', () => {
    let rollup;
    let PolygonZkEVMBridge;

    let polygonZkEVMGlobalExitRoot;
    beforeEach('Deploy contracts', async () => {
        // load signers
        [, rollup, PolygonZkEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');

        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollup.address,
            PolygonZkEVMBridge.address,
        );
        await polygonZkEVMGlobalExitRoot.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZkEVMGlobalExitRoot.rollupAddress()).to.be.equal(rollup.address);
        expect(await polygonZkEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZkEVMBridge.address);
        expect(await polygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.hexlify(ethers.randomBytes(32));

        await expect(polygonZkEVMGlobalExitRoot.updateExitRoot(newRootRollup))
            .to.be.revertedWith('OnlyAllowedContracts');

        // Update root from the rollup
        await expect(polygonZkEVMGlobalExitRoot.connect(rollup).updateExitRoot(newRootRollup))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(zero32bytes, newRootRollup);

        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(zero32bytes, newRootRollup));

        // Update root from the PolygonZkEVMBridge
        const newRootBridge = ethers.hexlify(ethers.randomBytes(32));
        await expect(polygonZkEVMGlobalExitRoot.connect(PolygonZkEVMBridge).updateExitRoot(newRootBridge))
            .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
            .withArgs(newRootBridge, newRootRollup);

        expect(await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot()).to.be.equal(newRootBridge);
        expect(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot())
            .to.be.equal(calculateGlobalExitRoot(newRootBridge, newRootRollup));
    });
});
