const { expect } = require('chai');
const { ethers } = require('hardhat');

const zero32bytes = '0x0000000000000000000000000000000000000000000000000000000000000000';

describe('Bridge Contract', () => {
    let bridge;
    let globalExitRootManager;
    beforeEach('Deploy contracts', async () => {
        const networkIDRollup = 1;
        const pvtKeyDeployment = '0xdfd01798f92667dbf91df722434e8fbe96af0211d4d1b82bbbbc8f1def7a814f';

        // load signers
        const deployer = new ethers.Wallet(pvtKeyDeployment, ethers.provider);

        const params = [{
            to: deployer.address.toString(),
            value: '0x3635C9ADC5DEA00000',
        }];
        await ethers.provider.send('eth_sendTransaction', params);

        // deploy bridge
        const precalculatBridgeAddress = await ethers.utils.getContractAddress(
            { from: deployer.address, nonce: (await ethers.provider.getTransactionCount(deployer.address)) + 1 },
        );

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManagerL2Mock', deployer);
        globalExitRootManager = await globalExitRootManagerFactory.deploy(precalculatBridgeAddress);
        await globalExitRootManager.deployed();

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('Bridge', deployer);
        bridge = await bridgeFactory.deploy(networkIDRollup, globalExitRootManager.address);
        await bridge.deployed();

        expect(bridge.address).to.be.equal(precalculatBridgeAddress);
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
        expect(await globalExitRootManager.globalExitRootMap(blockNumber)).to.be.equal(newRoot);
        const mapStoragePosition = 0;
        const key = blockNumber;
        const storagePosition = ethers.utils.solidityKeccak256(['uint256', 'uint256'], [key, mapStoragePosition]);
        const storageValue = await ethers.provider.getStorageAt(globalExitRootManager.address, storagePosition);
        expect(newRoot, storageValue);

        // Check rollup exit root
        const newRootRollupExitRoot = ethers.utils.hexlify(ethers.utils.randomBytes(32));
        await globalExitRootManager.setExitRoot(newRootRollupExitRoot);
        expect(await globalExitRootManager.lastRollupExitRoot()).to.be.equal(newRootRollupExitRoot);

        const storagePositionExitRoot = 1;
        const storageValueExitRoot = await ethers.provider.getStorageAt(globalExitRootManager.address, storagePositionExitRoot);
        expect(newRootRollupExitRoot, storageValueExitRoot);
    });
});
