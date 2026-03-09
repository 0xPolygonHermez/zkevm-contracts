/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainECDSAMultisig } from '../../typechain-types';
import * as utilsAggchain from '../../src/utils-common-aggchain';
// Helper function for encoding aggchain data for ECDSA Multisig
function encodeAggchainDataECDSAMultisig(aggchainVKeySelector: string) {
    return ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], [aggchainVKeySelector]);
}

describe('AggchainECDSAMultisig', () => {
    let trustedSequencer: any;
    let admin: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;
    let signer1: any;
    let signer2: any;
    let signer3: any;
    let signer4: any;
    let nonSigner: any;

    let aggchainECDSAMultisigContract: AggchainECDSAMultisig;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const agglayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    const aggchainVKeySelector = '0x12340002';

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [, trustedSequencer, admin, aggchainManager, signer1, signer2, signer3, signer4, nonSigner] =
            await ethers.getSigners();

        // deploy aggchain
        // create aggchainECDSAMultisig implementation
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        aggchainECDSAMultisigContract = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await aggchainECDSAMultisigContract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    it('should check the v0 initialized parameters', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Initialize with new signature (explicit parameters)
        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Re-initialize should revert because already initialized
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                false, // useDefaultSigners
                [], // No signers to add initially
                0, // Threshold of 0 initially
                { gasPrice: 0 },
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        // Note: Signers and threshold are no longer set during initialization
        // They must be configured via updateSignersAndThreshold after initialization

        // After base init, signer set/threshold must be configured via batch update
        // We already initialized aggchainECDSAMultisigContract above
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);

        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(initialSigners.length);
        const signersAfter = await aggchainECDSAMultisigContract.getAggchainSigners();
        expect(signersAfter).to.deep.equal(initialSigners);
        for (let i = 0; i < initialSigners.length; i++) {
            expect(await aggchainECDSAMultisigContract.isSigner(initialSigners[i])).to.be.equal(true);
        }

        // Check aggchainBase parameters
        // Note: useDefaultVkeys is set to false by default in initialize
        expect(await aggchainECDSAMultisigContract.useDefaultVkeys()).to.be.equal(false);
        // Note: ownedAggchainVKeys is not set in the new initialize function
        expect(await aggchainECDSAMultisigContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(
            ethers.ZeroHash,
        );

        // Check PolygonConsensusBase parameters
        expect(await aggchainECDSAMultisigContract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAMultisigContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAMultisigContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAMultisigContract.networkName()).to.be.equal(networkName);

        // Try to initialize again
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                false, // useDefaultSigners
                [], // No signers to add initially
                0, // Threshold of 0 initially
                { gasPrice: 0 },
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check migration from PessimisticConsensus', async () => {
        const networkID = 1;

        // Deploy previous ECDSA pessimistic contract
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        const PolygonPPConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await PolygonPPConsensusContract.waitForDeployment();

        // initialize pessimistic consensus (ECDSA v0.2.0)
        await PolygonPPConsensusContract.connect(rollupManagerSigner).initialize(
            admin.address,
            trustedSequencer.address,
            networkID,
            gasTokenAddress,
            urlSequencer,
            networkName,
            { gasPrice: 0 },
        );

        // Upgrade proxy to ECDSA Multisig implementation
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        await upgrades.upgradeProxy(PolygonPPConsensusContract.target, aggchainECDSAMultisigFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        // New interface according to the new implementation
        aggchainECDSAMultisigContract = aggchainECDSAMultisigFactory.attach(
            PolygonPPConsensusContract.target,
        ) as unknown as AggchainECDSAMultisig;

        // Migrate from PessimisticConsensus using the new migration function
        await aggchainECDSAMultisigContract.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 });

        // After migration:
        // - aggchainManager is set to admin
        // - trustedSequencer is added as a signer with threshold 1

        // Check storage after migration
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(1);
        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(1);
        expect(await aggchainECDSAMultisigContract.isSigner(trustedSequencer.address)).to.be.equal(true);

        // Check that PolygonConsensusBase parameters are preserved from v0
        expect(await aggchainECDSAMultisigContract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAMultisigContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAMultisigContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAMultisigContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAMultisigContract.networkName()).to.be.equal(networkName);
    });

    it('should check getAggchainHash with empty signers', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // For ECDSA Multisig, aggchainData should be empty
        const aggchainData = '0x'; // Empty data
        const aggchainHash = await aggchainECDSAMultisigContract.getAggchainHash(aggchainData);

        // Just verify that the hash is calculated (we don't need to verify the exact value)
        // The contract will use its internal signersHash and the getVKeyAndAggchainParams result
        expect(aggchainHash).to.not.be.equal(ethers.ZeroHash);
    });

    it('should check getAggchainHash', async () => {
        const threshold = 2;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        // Test invalid aggchain data length
        // For ECDSA Multisig, empty data is VALID. Non-empty data should revert
        const invalidAggchainData = encodeAggchainDataECDSAMultisig('0x12340001');
        await expect(aggchainECDSAMultisigContract.getAggchainHash(invalidAggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'InvalidAggchainDataLength',
        );

        // Test correct aggchain hash calculation with empty data
        const aggchainData = '0x'; // Empty data for ECDSA Multisig
        const aggchainHashSC = await aggchainECDSAMultisigContract.getAggchainHash(aggchainData);

        // Calculate expected hash in JS
        const signersHash = await aggchainECDSAMultisigContract.aggchainMultisigHash();

        // The aggchain hash is calculated as: keccak256(consensusType, aggchainVKey, aggchainParams, signersHash)
        // Since getVKeyAndAggchainParams returns (0, 0), both aggchainVKey and aggchainParams are zero
        const consensusType = await aggchainECDSAMultisigContract.CONSENSUS_TYPE();
        const expectedAggchainHash = ethers.solidityPackedKeccak256(
            ['uint32', 'bytes32', 'bytes32', 'bytes32'],
            [consensusType, ethers.ZeroHash, ethers.ZeroHash, signersHash],
        );

        expect(aggchainHashSC).to.be.equal(expectedAggchainHash);
    });

    it('should check view functions', async () => {
        const initialSigners = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
            { gasPrice: 0 },
        );

        // Test getSignersCount
        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(initialSigners.length);

        // Test getSigners
        const storedSigners = await aggchainECDSAMultisigContract.getAggchainSigners();
        expect(storedSigners).to.deep.equal(initialSigners);

        // Test isSigner
        for (let i = 0; i < initialSigners.length; i++) {
            expect(await aggchainECDSAMultisigContract.isSigner(initialSigners[i])).to.be.equal(true);
        }
        expect(await aggchainECDSAMultisigContract.isSigner(nonSigner.address)).to.be.equal(false);
        expect(await aggchainECDSAMultisigContract.isSigner(ethers.ZeroAddress)).to.be.equal(false);

        // Test threshold
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(threshold);

        // Test signersHash
        const expectedSignersHash = utilsAggchain.computeSignersHash(threshold, initialSigners);
        expect(await aggchainECDSAMultisigContract.aggchainMultisigHash()).to.be.equal(expectedSignersHash);
    });

    it('should check onVerifyPessimistic', async () => {
        const threshold = 1;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            threshold,
        );

        const aggchainData = '0x'; // Empty data for ECDSA Multisig

        // Test onVerifyPessimistic: not rollup manager
        await expect(aggchainECDSAMultisigContract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyRollupManager',
        );

        // Test invalid aggchain data length - non-empty data should revert
        const invalidData = encodeAggchainDataECDSAMultisig('0x12340001');
        await expect(
            aggchainECDSAMultisigContract
                .connect(rollupManagerSigner)
                .onVerifyPessimistic(invalidData, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidAggchainDataLength');

        // Test successful onVerifyPessimistic with empty data
        await expect(
            aggchainECDSAMultisigContract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.emit(aggchainECDSAMultisigContract, 'OnVerifyPessimisticECDSAMultisig');
    });

    it('should check signer management functions', async () => {
        const threshold = 2;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Initialize signers
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            threshold,
        );

        // Test updateSignersAndThreshold - not aggchain manager
        await expect(
            aggchainECDSAMultisigContract.updateSignersAndThreshold(
                [],
                [{ addr: signer3.address, url: 'u' }],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyAggchainManager');

        // Test add signer - zero address
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: ethers.ZeroAddress, url: 'url' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerCannotBeZero');

        // Test add signer - already exists
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer1.address, url: 'url' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test add signer - empty URL
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer3.address, url: '' }], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerURLCannotBeEmpty');

        // Test successful add signer
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer3.address, url: 'http://signer3' }], threshold),
        ).to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(true);

        // Test batch add with duplicate in same batch
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [],
                [
                    { addr: signer4.address, url: 'http://signer4' },
                    { addr: signer4.address, url: 'dup' },
                ],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerAlreadyExists');

        // Test successful batch add
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([], [{ addr: signer4.address, url: 'http://signer4' }], threshold),
        ).to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(4);

        // Test remove signer - indices not in descending order
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [
                    { addr: signer1.address, index: 0 },
                    { addr: signer2.address, index: 1 },
                ],
                [],
                threshold,
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'IndicesNotInDescendingOrder');

        // Test successful remove signer
        const signersBeforeRemove = await aggchainECDSAMultisigContract.getAggchainSigners();
        const signer4Index = signersBeforeRemove.indexOf(signer4.address);

        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer4.address, index: signer4Index }], [], threshold),
        ).to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer4.address)).to.be.equal(false);

        // Test remove signer - invalid index
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer1.address, index: 10 }], [], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test remove signer - index doesn't match address
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold([{ addr: signer1.address, index: 1 }], [], threshold),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'SignerDoesNotExist');

        // Test complex batch operation - remove and add in same transaction
        const signersBeforeBatch = await aggchainECDSAMultisigContract.getAggchainSigners();
        const signer3Index = signersBeforeBatch.indexOf(signer3.address);

        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateSignersAndThreshold(
                    [{ addr: signer3.address, index: signer3Index }],
                    [{ addr: signer4.address, url: 'http://signer4' }],
                    3,
                ),
        ).to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated');

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(3);
        expect(await aggchainECDSAMultisigContract.isSigner(signer3.address)).to.be.equal(false);
        expect(await aggchainECDSAMultisigContract.isSigner(signer4.address)).to.be.equal(true);
    });

    it('should check threshold management', async () => {
        const threshold = 2;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
                { addr: signer3.address, url: 'http://signer3' },
            ],
            threshold,
        );

        // Test updateThreshold - not aggchain manager
        await expect(aggchainECDSAMultisigContract.updateSignersAndThreshold([], [], 3)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyAggchainManager',
        );

        // Test updateThreshold - zero threshold is valid since we have signers
        // Zero threshold is actually not allowed, so this should revert
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Restore threshold
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], threshold);

        // Test updateThreshold - threshold greater than signers count
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 5),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Test successful updateThreshold
        const newThreshold = 3;

        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], newThreshold),
        ).to.emit(aggchainECDSAMultisigContract, 'SignersAndThresholdUpdated');

        expect(await aggchainECDSAMultisigContract.threshold()).to.be.equal(newThreshold);
    });

    it('should check constants and version', async () => {
        expect(await aggchainECDSAMultisigContract.AGGCHAIN_TYPE()).to.be.equal('0x0000');
        expect(await aggchainECDSAMultisigContract.AGGCHAIN_ECDSA_MULTISIG_VERSION()).to.be.equal('v1.0.0');
    });

    it('should check invalid initializer scenarios', async () => {
        // Deploy fresh contract for this test
        const aggchainECDSAMultisigFactory = await ethers.getContractFactory('AggchainECDSAMultisig');
        const freshContract = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await freshContract.waitForDeployment();

        await freshContract.connect(rollupManagerSigner).initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Test with invalid initializer version (this would be version 2 which should revert)
        // This is a bit tricky to test as we need to simulate the internal state
        // For now, let's test that initialize with aggchainManager not set first fails

        // should set the aggchainManager: error "OnlyRollupManager"
        const freshContract2 = await upgrades.deployProxy(aggchainECDSAMultisigFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await expect(freshContract2.initAggchainManager(aggchainManager.address)).to.be.revertedWithCustomError(
            freshContract2,
            'OnlyRollupManager',
        );
    });

    it('should test edge cases for signers array manipulation', async () => {
        // Test with single signer and threshold 1
        const threshold = 1;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Initialize with single signer
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([], [{ addr: signer1.address, url: 'http://signer1' }], threshold);

        // Try to remove the only signer when threshold would still be 1 (should fail)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
                [{ addr: signer1.address, index: 0 }],
                [],
                1, // threshold stays 1 but no signers left
            ),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');

        // Add another signer
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([], [{ addr: signer2.address, url: 'http://signer2' }], threshold);

        // Now we can remove one signer (since 2-1=1 >= threshold=1)
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .updateSignersAndThreshold([{ addr: signer2.address, index: 1 }], [], threshold);

        expect(await aggchainECDSAMultisigContract.getAggchainSignersCount()).to.be.equal(1);
        expect(await aggchainECDSAMultisigContract.isSigner(signer1.address)).to.be.equal(true);
        expect(await aggchainECDSAMultisigContract.isSigner(signer2.address)).to.be.equal(false);
    });

    it('should check vKeyManager functions revert with FunctionNotSupported', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Test addOwnedAggchainVKey - should revert with FunctionNotSupported (not used in ECDSA multisig)
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .addOwnedAggchainVKey('0x00010001', ethers.randomBytes(32)),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'FunctionNotSupported');

        // Test updateOwnedAggchainVKey - should revert with FunctionNotSupported
        await expect(
            aggchainECDSAMultisigContract
                .connect(aggchainManager)
                .updateOwnedAggchainVKey('0x99999999', ethers.randomBytes(32)),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'FunctionNotSupported');

        // Verify that ownedAggchainVKeys mapping is not used
        const testSelector = '0x00010001';
        expect(await aggchainECDSAMultisigContract.ownedAggchainVKeys(testSelector)).to.be.equal(ethers.ZeroHash);
    });

    it('should check vkeys flag functions revert with FunctionNotSupported', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Check initial useDefaultVkeys (should be false as set in initialize)
        expect(await aggchainECDSAMultisigContract.useDefaultVkeys()).to.be.equal(false);

        // Test enableUseDefaultVkeysFlag - should revert with FunctionNotSupported (not used in ECDSA multisig)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).enableUseDefaultVkeysFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'FunctionNotSupported');

        // Test disableUseDefaultVkeysFlag - should revert with FunctionNotSupported
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).disableUseDefaultVkeysFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'FunctionNotSupported');

        // Verify that useDefaultVkeys remains unchanged
        expect(await aggchainECDSAMultisigContract.useDefaultVkeys()).to.be.equal(false);
    });

    it('should test the maximum uint32 threshold edge case', async () => {
        // Test with maximum possible threshold in initialization validation
        const maxUint32 = 2 ** 32 - 1;

        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Initialize signers first
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            2,
        );

        // Try to set threshold to maximum uint32 (should fail because threshold > signers.length)
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], maxUint32),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidThreshold');
    });

    it('should test getAggchainVKey functions with vkey management disabled', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Since ECDSA Multisig doesn't use vkeys, getAggchainVKey should always return bytes32(0)
        // Test getAggchainVKey - should return zero for any selector
        const vKey = await aggchainECDSAMultisigContract.getAggchainVKey(aggchainVKeySelector);
        expect(vKey).to.be.equal(ethers.ZeroHash);

        // Test with another selector - should also return zero
        const vKey2 = await aggchainECDSAMultisigContract.getAggchainVKey('0x99999999');
        expect(vKey2).to.be.equal(ethers.ZeroHash);

        // Test getAggchainVKeySelector utility function (should still work)
        const selector = await aggchainECDSAMultisigContract.getAggchainVKeySelector('0x0001', '0x0002');
        expect(selector).to.be.equal('0x00010002');

        // Test getAggchainTypeFromSelector utility function (should still work)
        const aggchainType = await aggchainECDSAMultisigContract.getAggchainTypeFromSelector(aggchainVKeySelector);
        expect(aggchainType).to.be.equal('0x0002');

        // Test getAggchainVKeyVersionFromSelector utility function (should still work)
        const version = await aggchainECDSAMultisigContract.getAggchainVKeyVersionFromSelector(aggchainVKeySelector);
        expect(version).to.be.equal('0x1234');
    });

    it('should test signerToURLs and empty signers edge case', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Initialize with empty signers (should set aggchainMultisigHash)
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold([], [], 0);

        // Verify empty signers hash is set
        const emptySignersHash = await aggchainECDSAMultisigContract.aggchainMultisigHash();
        expect(emptySignersHash).to.not.equal(ethers.ZeroHash);

        // Now we can call getAggchainHash
        const aggchainData = '0x'; // Empty data for ECDSA Multisig
        const aggchainHash = await aggchainECDSAMultisigContract.getAggchainHash(aggchainData);
        expect(aggchainHash).to.not.equal(ethers.ZeroHash);

        // Add signers and check URLs
        await aggchainECDSAMultisigContract.connect(aggchainManager).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1-url' },
                { addr: signer2.address, url: 'http://signer2-url' },
            ],
            1,
        );

        expect(await aggchainECDSAMultisigContract.signerToURLs(signer1.address)).to.be.equal('http://signer1-url');
        expect(await aggchainECDSAMultisigContract.signerToURLs(signer2.address)).to.be.equal('http://signer2-url');
        expect(await aggchainECDSAMultisigContract.signerToURLs(nonSigner.address)).to.be.equal('');
    });

    it('should test aggchainManager role functions', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Check initial aggchainManager
        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(aggchainManager.address);

        // Test transfer aggchainManager role - not aggchainManager
        await expect(
            aggchainECDSAMultisigContract.transferAggchainManagerRole(nonSigner.address),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'OnlyAggchainManager');

        // Test transfer to zero address
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).transferAggchainManagerRole(ethers.ZeroAddress),
        ).to.be.revertedWithCustomError(aggchainECDSAMultisigContract, 'InvalidZeroAddress');

        // Test successful transfer
        await expect(
            aggchainECDSAMultisigContract.connect(aggchainManager).transferAggchainManagerRole(nonSigner.address),
        )
            .to.emit(aggchainECDSAMultisigContract, 'TransferAggchainManagerRole')
            .withArgs(aggchainManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.pendingAggchainManager()).to.be.equal(nonSigner.address);

        // Test accept role - not pending
        await expect(aggchainECDSAMultisigContract.acceptAggchainManagerRole()).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'OnlyPendingAggchainManager',
        );

        // Test successful accept
        await expect(aggchainECDSAMultisigContract.connect(nonSigner).acceptAggchainManagerRole())
            .to.emit(aggchainECDSAMultisigContract, 'AcceptAggchainManagerRole')
            .withArgs(aggchainManager.address, nonSigner.address);

        expect(await aggchainECDSAMultisigContract.aggchainManager()).to.be.equal(nonSigner.address);
        expect(await aggchainECDSAMultisigContract.pendingAggchainManager()).to.be.equal(ethers.ZeroAddress);
    });

    it('should test getVKeyAndAggchainParams', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        await aggchainECDSAMultisigContract.connect(aggchainManager).initialize(
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            false, // useDefaultSigners
            [], // No signers to add initially
            0, // Threshold of 0 initially
            { gasPrice: 0 },
        );

        // Test invalid data length - any non-empty data should revert
        await expect(aggchainECDSAMultisigContract.getVKeyAndAggchainParams('0x1234')).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'InvalidAggchainDataLength',
        );

        // For ECDSA Multisig, any non-empty data is invalid
        const invalidData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], ['0x12340001']);
        await expect(aggchainECDSAMultisigContract.getVKeyAndAggchainParams(invalidData)).to.be.revertedWithCustomError(
            aggchainECDSAMultisigContract,
            'InvalidAggchainDataLength',
        );

        // Test valid data - empty data for ECDSA Multisig
        const [vKey, params] = await aggchainECDSAMultisigContract.getVKeyAndAggchainParams('0x');

        // Should return zeros for both vKey and params in this implementation
        expect(vKey).to.equal(ethers.ZeroHash);
        expect(params).to.equal(ethers.ZeroHash);
    });

    it('should test invalid initializer version scenarios', async () => {
        // Test case for line 103: Trying to call initialize with wrong version
        // We need to test when _initializerVersion != 0

        // First, set up the contract in a state where it's already been initialized once
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Initialize once successfully
        await aggchainECDSAMultisigContract
            .connect(aggchainManager)
            .initialize(
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                false,
                [],
                0,
                { gasPrice: 0 },
            );

        // Deploy a second fresh contract for testing migrateFromLegacyConsensus
        const aggchainECDSAMultisigFactory2 = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainContract2 = await upgrades.deployProxy(aggchainECDSAMultisigFactory2, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });
        await aggchainContract2.waitForDeployment();

        // Properly initialize contract with version 1
        // We can't use initConsensusBase directly as it doesn't exist
        // Instead we'll test the InvalidInitializer case directly

        // Try to call migrateFromLegacyConsensus on fresh contract (version 0)
        // This should fail because the contract is at version 0, not version 1
        const aggchainFactory3 = await ethers.getContractFactory('AggchainECDSAMultisig');
        const aggchainContract3 = await upgrades.deployProxy(aggchainFactory3, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                agglayerGatewayAddress,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        // Try to call migrateFromLegacyConsensus on fresh contract (version 0)
        await expect(
            aggchainContract3.connect(rollupManagerSigner).migrateFromLegacyConsensus({ gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainContract3, 'InvalidInitializer');
    });

    it('should test version getter function', async () => {
        await aggchainECDSAMultisigContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // Test the version() function (covers line 210)
        const version = await aggchainECDSAMultisigContract.version();
        expect(version).to.equal('v1.0.0');
        expect(version).to.equal(await aggchainECDSAMultisigContract.AGGCHAIN_ECDSA_MULTISIG_VERSION());
    });
});
