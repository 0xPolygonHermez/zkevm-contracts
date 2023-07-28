const { expect } = require('chai');
const { ethers } = require('hardhat');

const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Global Exit Root L2', () => {
    let PolygonZkEVMBridge;
    let PolygonZkEVMGlobalExitRoot;
    let deployer;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, PolygonZkEVMBridge] = await ethers.getSigners();

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootL2Mock', deployer);
        PolygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(PolygonZkEVMBridge.address);
    });

    it('should check the constructor parameters', async () => {
        expect(await PolygonZkEVMGlobalExitRoot.bridgeAddress()).to.be.equal(PolygonZkEVMBridge.address);
        expect(await PolygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(zero32bytes);
    });

    it('should update root and check global exit root', async () => {
        const newRootRollup = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await expect(PolygonZkEVMGlobalExitRoot.updateExitRoot(newRootRollup))
            .to.be.revertedWith('OnlyAllowedContracts');

        // Update root from the rollup
        await PolygonZkEVMGlobalExitRoot.connect(PolygonZkEVMBridge).updateExitRoot(newRootRollup);

        expect(await PolygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(newRootRollup);
    });

    it('should update root and check the storage position matches', async () => {
        // Check global exit root
        const newRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        const blockNumber = 1;
        await PolygonZkEVMGlobalExitRoot.setLastGlobalExitRoot(newRoot, blockNumber);
        expect(await PolygonZkEVMGlobalExitRoot.globalExitRootMap(newRoot)).to.be.equal(blockNumber);
        const mapStoragePosition = 0;
        const key = newRoot;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [key, mapStoragePosition]);
        const storageValue = await ethers.provider.getStorageAt(PolygonZkEVMGlobalExitRoot.address, storagePosition);
        expect(blockNumber).to.be.equal(ethers.BigNumber.from(storageValue).toNumber());

        // Check rollup exit root
        const newRootRollupExitRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await PolygonZkEVMGlobalExitRoot.setExitRoot(newRootRollupExitRoot);
        expect(await PolygonZkEVMGlobalExitRoot.lastRollupExitRoot()).to.be.equal(newRootRollupExitRoot);

        const storagePositionExitRoot = 1;
        const storageValueExitRoot = await ethers.provider.getStorageAt(PolygonZkEVMGlobalExitRoot.address, storagePositionExitRoot);
        expect(newRootRollupExitRoot, storageValueExitRoot);
    });
});
