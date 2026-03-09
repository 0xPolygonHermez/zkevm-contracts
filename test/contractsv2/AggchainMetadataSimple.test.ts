/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Aggchain Metadata Simple Tests', () => {
    let aggchainFEP: any;
    let rollupManagerContract: any;
    let aggchainManager: any;
    let metadataManager: any;
    let otherAccount: any;
    let deployer: any;

    beforeEach('Deploy contracts', async () => {
        // Get signers
        [deployer, aggchainManager, metadataManager, otherAccount] = await ethers.getSigners();

        // Deploy minimal dependencies
        const pol = await ethers.deployContract('ERC20PermitMock', [
            'POL',
            'POL',
            deployer.address,
            ethers.parseEther('1000'),
        ]);

        // Deploy global exit root manager
        const globalExitRootManager = await ethers.deployContract('AgglayerGER', [deployer.address, deployer.address]);

        // Deploy bridge mock
        const mockBridge = '0x0000000000000000000000000000000000000002';

        // Deploy AgglayerGateway
        const aggLayerGateway = await ethers.deployContract('AgglayerGateway', []);

        // Deploy AgglayerManagerMock
        const rollupManagerFactory = await ethers.getContractFactory('AgglayerManagerMock');
        rollupManagerContract = await rollupManagerFactory.deploy(
            globalExitRootManager.target,
            pol.target,
            mockBridge,
            aggLayerGateway.target,
        );

        // Deploy AggchainFEP
        const AggchainFEP = await ethers.getContractFactory('AggchainFEP');
        aggchainFEP = await AggchainFEP.deploy(
            globalExitRootManager.target,
            pol.target,
            mockBridge,
            rollupManagerContract.target,
            aggLayerGateway.target,
        );

        // Initialize aggchain manager from rollup manager
        // Impersonate rollup manager to call initAggchainManager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerContract.target]);
        await ethers.provider.send('hardhat_setBalance', [
            rollupManagerContract.target,
            ethers.toQuantity(ethers.parseEther('10')),
        ]);

        const rollupManagerSigner = await ethers.getSigner(rollupManagerContract.target);

        // Initialize the aggchain manager
        await aggchainFEP.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address);

        await ethers.provider.send('hardhat_stopImpersonatingAccount', [rollupManagerContract.target]);

        // Now set the metadata manager from aggchain manager
        await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(metadataManager.address);
    });

    describe('Metadata Management', () => {
        it('should set and get metadata', async () => {
            const key = 'version';
            const value = '1.0.0';

            // Set metadata
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key, value);

            // Get metadata
            expect(await aggchainFEP.aggchainMetadata(key)).to.equal(value);
        });

        it('should update metadata', async () => {
            const key = 'version';
            const value1 = '1.0.0';
            const value2 = '2.0.0';

            // Set initial value
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key, value1);
            expect(await aggchainFEP.aggchainMetadata(key)).to.equal(value1);

            // Update value
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key, value2);
            expect(await aggchainFEP.aggchainMetadata(key)).to.equal(value2);
        });

        it('should batch set metadata', async () => {
            const keys = ['version', 'chainId', 'name'];
            const values = ['1.0.0', '1337', 'TestChain'];

            // Batch set
            await aggchainFEP.connect(metadataManager).batchSetAggchainMetadata(keys, values);

            // Verify all set
            for (let i = 0; i < keys.length; i++) {
                expect(await aggchainFEP.aggchainMetadata(keys[i])).to.equal(values[i]);
            }
        });

        it('should emit events', async () => {
            const key = 'version';
            const value = '1.0.0';

            await expect(aggchainFEP.connect(metadataManager).setAggchainMetadata(key, value))
                .to.emit(aggchainFEP, 'AggchainMetadataSet')
                .withArgs(key, value);
        });

        it('should emit events for batch set', async () => {
            const keys = ['key1', 'key2'];
            const values = ['value1', 'value2'];

            const tx = await aggchainFEP.connect(metadataManager).batchSetAggchainMetadata(keys, values);

            await expect(tx).to.emit(aggchainFEP, 'AggchainMetadataSet').withArgs(keys[0], values[0]);

            await expect(tx).to.emit(aggchainFEP, 'AggchainMetadataSet').withArgs(keys[1], values[1]);
        });

        it('should clear metadata with empty string', async () => {
            const key = 'version';

            // Set value
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key, '1.0.0');
            expect(await aggchainFEP.aggchainMetadata(key)).to.equal('1.0.0');

            // Clear with empty string
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key, '');
            expect(await aggchainFEP.aggchainMetadata(key)).to.equal('');
        });

        it('should revert if not metadata manager', async () => {
            await expect(
                aggchainFEP.connect(otherAccount).setAggchainMetadata('key', 'value'),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainMetadataManager');

            await expect(
                aggchainFEP.connect(aggchainManager).setAggchainMetadata('key', 'value'),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainMetadataManager');
        });

        it('should revert batch with mismatched arrays', async () => {
            const keys = ['key1', 'key2'];
            const values = ['value1']; // Too short

            await expect(
                aggchainFEP.connect(metadataManager).batchSetAggchainMetadata(keys, values),
            ).to.be.revertedWithCustomError(aggchainFEP, 'MetadataArrayLengthMismatch');
        });

        it('should handle empty batch', async () => {
            // Empty arrays should work without issues
            await aggchainFEP.connect(metadataManager).batchSetAggchainMetadata([], []);
        });

        it('should store multiple independent metadata entries', async () => {
            const entries = [
                { key: 'version', value: '1.0.0' },
                { key: 'chainId', value: '1337' },
                { key: 'name', value: 'TestChain' },
                { key: 'consensus', value: 'FEP' },
            ];

            // Set all entries
            await Promise.all(
                entries.map((entry) =>
                    aggchainFEP.connect(metadataManager).setAggchainMetadata(entry.key, entry.value),
                ),
            );

            // Verify all entries
            await Promise.all(
                entries.map(async (entry) => {
                    expect(await aggchainFEP.aggchainMetadata(entry.key)).to.equal(entry.value);
                }),
            );

            // Update one entry
            await aggchainFEP.connect(metadataManager).setAggchainMetadata('version', '2.0.0');

            // Check only that entry changed
            expect(await aggchainFEP.aggchainMetadata('version')).to.equal('2.0.0');
            expect(await aggchainFEP.aggchainMetadata('chainId')).to.equal('1337');
            expect(await aggchainFEP.aggchainMetadata('name')).to.equal('TestChain');
        });
    });

    describe('Metadata Manager Management', () => {
        it('should change metadata manager', async () => {
            // Change metadata manager
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(otherAccount.address);

            // Verify new manager
            expect(await aggchainFEP.aggchainMetadataManager()).to.equal(otherAccount.address);

            // Old manager cannot set metadata
            await expect(
                aggchainFEP.connect(metadataManager).setAggchainMetadata('key', 'value'),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainMetadataManager');

            // New manager can set metadata
            await aggchainFEP.connect(otherAccount).setAggchainMetadata('key', 'value');
            expect(await aggchainFEP.aggchainMetadata('key')).to.equal('value');
        });

        it('should allow setting metadata manager to zero address', async () => {
            // Since the user removed the zero address check, this should work
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(ethers.ZeroAddress);
            expect(await aggchainFEP.aggchainMetadataManager()).to.equal(ethers.ZeroAddress);

            // No one can set metadata when manager is zero
            await expect(
                aggchainFEP.connect(metadataManager).setAggchainMetadata('key', 'value'),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainMetadataManager');
        });

        it('should emit event when changing metadata manager', async () => {
            await expect(aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(otherAccount.address))
                .to.emit(aggchainFEP, 'SetAggchainMetadataManager')
                .withArgs(metadataManager.address, otherAccount.address);
        });

        it('should revert if not aggchain manager', async () => {
            await expect(
                aggchainFEP.connect(otherAccount).setAggchainMetadataManager(otherAccount.address),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainManager');

            await expect(
                aggchainFEP.connect(metadataManager).setAggchainMetadataManager(otherAccount.address),
            ).to.be.revertedWithCustomError(aggchainFEP, 'OnlyAggchainManager');
        });

        it('should allow multiple metadata manager changes', async () => {
            const newManager1 = otherAccount.address;
            const newManager2 = deployer.address;

            // First change
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(newManager1);
            expect(await aggchainFEP.aggchainMetadataManager()).to.equal(newManager1);

            // Second change
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(newManager2);
            expect(await aggchainFEP.aggchainMetadataManager()).to.equal(newManager2);

            // Third change back to original
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(metadataManager.address);
            expect(await aggchainFEP.aggchainMetadataManager()).to.equal(metadataManager.address);
        });
    });

    describe('Integration Tests', () => {
        it('should properly use internal function for both single and batch operations', async () => {
            const key1 = 'version';
            const value1 = '1.0.0';
            const key2 = 'chainId';
            const value2 = '1337';

            // Set using single function
            await aggchainFEP.connect(metadataManager).setAggchainMetadata(key1, value1);

            // Set using batch function with single item
            await aggchainFEP.connect(metadataManager).batchSetAggchainMetadata([key2], [value2]);

            // Both should be set correctly
            expect(await aggchainFEP.aggchainMetadata(key1)).to.equal(value1);
            expect(await aggchainFEP.aggchainMetadata(key2)).to.equal(value2);
        });

        it('should maintain metadata after manager change', async () => {
            // Set metadata with initial manager
            await aggchainFEP.connect(metadataManager).setAggchainMetadata('key1', 'value1');
            await aggchainFEP.connect(metadataManager).setAggchainMetadata('key2', 'value2');

            // Change manager
            await aggchainFEP.connect(aggchainManager).setAggchainMetadataManager(otherAccount.address);

            // Old metadata should still exist
            expect(await aggchainFEP.aggchainMetadata('key1')).to.equal('value1');
            expect(await aggchainFEP.aggchainMetadata('key2')).to.equal('value2');

            // New manager can update existing metadata
            await aggchainFEP.connect(otherAccount).setAggchainMetadata('key1', 'newValue1');
            expect(await aggchainFEP.aggchainMetadata('key1')).to.equal('newValue1');
            expect(await aggchainFEP.aggchainMetadata('key2')).to.equal('value2');
        });
    });
});
