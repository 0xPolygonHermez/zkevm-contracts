/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';
import { Address, AggchainPayments } from '../../typechain-types';
import * as utilsPayments from '../../src/utils-aggchain-payments';
import * as utilsAggchain from '../../src/utils-common-aggchain';

describe('AggchainPayments', () => {
    let trustedSequencer: any;
    let admin: any;
    let rollupManagerSigner: any;
    let aggchainManager: any;

    let aggchainPaymentsContract: AggchainPayments;

    // Default values initialization
    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;
    const agglayerGatewayAddress = '0xE00000000000000000000000000000000000000E' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'paychain';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggchain variables
    // owned vkey (useDefaultVkeys=false). Selector = 0x1000 (version) || 0x0001 (AGGCHAIN_TYPE)
    const aggchainVKeySelector = '0x10000001';
    const newAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // Deterministic fixture used by the getAggchainHash vector (consumed by C2)
    const startingBlockNumber = 100;
    const startingStateRoot = '0x11112222333344445555666677778888999900001111222233334444aaaabbbb';
    const paymentSigner = '0x1111111111111111111111111111111111111111';
    const paymentSignerURL = 'http://aggsender:8080';
    const threshold = 1;

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [, trustedSequencer, admin, aggchainManager] = await ethers.getSigners();

        // deploy aggchainPayments implementation behind a proxy
        const aggchainPaymentsFactory = await ethers.getContractFactory('AggchainPayments');
        aggchainPaymentsContract = await upgrades.deployProxy(aggchainPaymentsFactory, [], {
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

        await aggchainPaymentsContract.waitForDeployment();

        // rollupSigner
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
    });

    async function initializeContract(
        signers = [{ addr: paymentSigner, url: paymentSignerURL }],
        newThreshold = threshold,
    ) {
        // set the aggchainManager (only rollup manager)
        await aggchainPaymentsContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // initialize (only aggchainManager)
        await aggchainPaymentsContract
            .connect(aggchainManager)
            .initialize(
                startingBlockNumber,
                startingStateRoot,
                signers,
                newThreshold,
                newAggchainVKey,
                aggchainVKeySelector,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            );
    }

    it('should check the initialized parameters', async () => {
        // initAggchainManager only by rollup manager
        await expect(
            aggchainPaymentsContract.initAggchainManager(aggchainManager.address),
        ).to.be.revertedWithCustomError(aggchainPaymentsContract, 'OnlyRollupManager');

        await initializeContract();

        // constants and getters
        expect(await aggchainPaymentsContract.AGGCHAIN_TYPE()).to.be.equal('0x0001');
        expect(await aggchainPaymentsContract.CONSENSUS_TYPE()).to.be.equal(1);
        expect(await aggchainPaymentsContract.optimisticMode()).to.be.equal(false);
        expect(await aggchainPaymentsContract.version()).to.be.equal('v1.0.0');

        // payments-specific state
        expect(await aggchainPaymentsContract.startingBlockNumber()).to.be.equal(startingBlockNumber);
        expect(await aggchainPaymentsContract.latestBlockNumber()).to.be.equal(startingBlockNumber);
        expect(await aggchainPaymentsContract.lastStateRoot()).to.be.equal(startingStateRoot);

        // owned vkey plumbing
        expect(await aggchainPaymentsContract.useDefaultVkeys()).to.be.equal(false);
        expect(await aggchainPaymentsContract.useDefaultSigners()).to.be.equal(false);
        expect(await aggchainPaymentsContract.ownedAggchainVKeys(aggchainVKeySelector)).to.be.equal(newAggchainVKey);
        expect(await aggchainPaymentsContract.getAggchainVKey(aggchainVKeySelector)).to.be.equal(newAggchainVKey);

        // multisig getters
        expect(await aggchainPaymentsContract.getThreshold()).to.be.equal(threshold);
        expect(await aggchainPaymentsContract.getAggchainSigners()).to.be.deep.equal([paymentSigner]);
        expect(await aggchainPaymentsContract.getAggchainMultisigHash()).to.be.equal(
            utilsAggchain.computeSignersHash(threshold, [paymentSigner]),
        );

        // cannot initialize twice
        await expect(
            aggchainPaymentsContract
                .connect(aggchainManager)
                .initialize(
                    startingBlockNumber,
                    startingStateRoot,
                    [{ addr: paymentSigner, url: paymentSignerURL }],
                    threshold,
                    newAggchainVKey,
                    aggchainVKeySelector,
                    admin.address,
                    trustedSequencer.address,
                    gasTokenAddress,
                    urlSequencer,
                    networkName,
                    { gasPrice: 0 },
                ),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should reject an invalid aggchain vkey selector at initialization', async () => {
        await aggchainPaymentsContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // wrong aggchain type embedded in selector (0x0000 instead of 0x0001)
        await expect(
            aggchainPaymentsContract.connect(aggchainManager).initialize(
                startingBlockNumber,
                startingStateRoot,
                [{ addr: paymentSigner, url: paymentSignerURL }],
                threshold,
                newAggchainVKey,
                '0x10000000', // invalid type
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                { gasPrice: 0 },
            ),
        ).to.be.revertedWithCustomError(aggchainPaymentsContract, 'InvalidAggchainType');
    });

    it('should check getVKeyAndAggchainParams validations', async () => {
        await initializeContract();

        const newStateRoot = ethers.id('newStateRoot');
        const endBlock = 200;

        // InvalidAggchainDataLength
        await expect(aggchainPaymentsContract.getAggchainHash('0x')).to.be.revertedWithCustomError(
            aggchainPaymentsContract,
            'InvalidAggchainDataLength',
        );

        // InvalidAggchainType (selector encodes 0x0000)
        let badData = utilsPayments.encodeAggchainDataPayments('0x10000000', newStateRoot, endBlock);
        await expect(aggchainPaymentsContract.getAggchainHash(badData)).to.be.revertedWithCustomError(
            aggchainPaymentsContract,
            'InvalidAggchainType',
        );

        // StateRootCannotBeZero
        badData = utilsPayments.encodeAggchainDataPayments(aggchainVKeySelector, ethers.ZeroHash, endBlock);
        await expect(aggchainPaymentsContract.getAggchainHash(badData)).to.be.revertedWithCustomError(
            aggchainPaymentsContract,
            'StateRootCannotBeZero',
        );

        // EndBlockNotGreaterThanLatest (endBlock == latestBlockNumber == startingBlockNumber)
        badData = utilsPayments.encodeAggchainDataPayments(aggchainVKeySelector, newStateRoot, startingBlockNumber);
        await expect(aggchainPaymentsContract.getAggchainHash(badData)).to.be.revertedWithCustomError(
            aggchainPaymentsContract,
            'EndBlockNotGreaterThanLatest',
        );
    });

    it('should check getAggchainHash and write the byte-compat vector (test-vectors/aggchain-hash.json)', async () => {
        await initializeContract();

        const lastStateRoot = startingStateRoot; // stored root before any verification
        const newStateRoot = '0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999';
        const endBlock = 200;

        const aggchainData = utilsPayments.encodeAggchainDataPayments(aggchainVKeySelector, newStateRoot, endBlock);

        // ---- On-chain value ----
        const aggchainHashSC = await aggchainPaymentsContract.getAggchainHash(aggchainData);
        const [vkeySC, paramsSC] = await aggchainPaymentsContract.getVKeyAndAggchainParams(aggchainData);

        // ---- JS-computed value ----
        const aggchainParamsJS = utilsPayments.computeHashAggchainParamsPayments(lastStateRoot, newStateRoot, endBlock);
        const multisigHashJS = utilsAggchain.computeSignersHash(threshold, [paymentSigner]);
        const consensusTypeSC = await aggchainPaymentsContract.CONSENSUS_TYPE();
        const aggchainHashJS = utilsAggchain.computeAggchainHash(
            consensusTypeSC,
            newAggchainVKey,
            aggchainParamsJS,
            multisigHashJS,
        );

        // ---- Assertions: contract <-> JS equality ----
        expect(vkeySC).to.be.equal(newAggchainVKey);
        expect(paramsSC).to.be.equal(aggchainParamsJS);
        expect(aggchainHashSC).to.be.equal(aggchainHashJS);

        // ---- Write the vector consumed by C2 (SP1 guest) for bit-for-bit equality ----
        const vector = {
            description:
                'AggchainPayments.getAggchainHash byte-composition vector. ' +
                'aggchain_params = keccak256(abi.encodePacked(bytes32 lastStateRoot, bytes32 newStateRoot, uint256 endBlock)). ' +
                'aggchain_hash = keccak256(abi.encodePacked(uint32 CONSENSUS_TYPE, bytes32 aggchainVKey, bytes32 aggchain_params, bytes32 multisigHash)). ' +
                'multisigHash = keccak256(abi.encodePacked(uint256 threshold, address[] signers)).',
            aggchainType: '0x0001',
            consensusType: 1,
            aggchainVKeySelector,
            inputs: {
                lastStateRoot,
                startingBlockNumber,
                newStateRoot,
                endBlock,
                aggchainVKey: newAggchainVKey,
                threshold,
                signers: [paymentSigner],
                aggchainData,
            },
            paramsComposition: {
                encoding: 'abi.encodePacked(bytes32 lastStateRoot, bytes32 newStateRoot, uint256 endBlock)',
                fields: ['bytes32 lastStateRoot', 'bytes32 newStateRoot', 'uint256 endBlock'],
                preimageBytes: 96,
                hash: 'keccak256',
            },
            hashComposition: {
                encoding:
                    'abi.encodePacked(uint32 CONSENSUS_TYPE, bytes32 aggchainVKey, bytes32 aggchain_params, bytes32 multisigHash)',
                fields: [
                    'uint32 CONSENSUS_TYPE (=1, 4 bytes big-endian)',
                    'bytes32 aggchainVKey',
                    'bytes32 aggchain_params',
                    'bytes32 multisigHash',
                ],
                preimageBytes: 100,
                hash: 'keccak256',
            },
            intermediate: {
                aggchainParams: aggchainParamsJS,
                multisigHash: multisigHashJS,
            },
            expected: {
                aggchainVKey: vkeySC,
                aggchainParams: paramsSC,
                aggchainHash: aggchainHashSC,
            },
        };

        const outDir = path.join(__dirname, '../../test-vectors');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(path.join(outDir, 'aggchain-hash.json'), `${JSON.stringify(vector, null, 4)}\n`);
    });

    it('should check onVerifyPessimistic updates state and emits event', async () => {
        await initializeContract();

        const newStateRoot = ethers.id('verifiedStateRoot');
        const endBlock = 300;
        const aggchainData = utilsPayments.encodeAggchainDataPayments(aggchainVKeySelector, newStateRoot, endBlock);

        // only rollup manager
        await expect(aggchainPaymentsContract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainPaymentsContract,
            'OnlyRollupManager',
        );

        // invalid data length
        await expect(
            aggchainPaymentsContract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainPaymentsContract, 'InvalidAggchainDataLength');

        // success
        await expect(
            aggchainPaymentsContract.connect(rollupManagerSigner).onVerifyPessimistic(aggchainData, { gasPrice: 0 }),
        )
            .to.emit(aggchainPaymentsContract, 'PaymentsStateUpdated')
            .withArgs(newStateRoot, endBlock);

        // state updated
        expect(await aggchainPaymentsContract.lastStateRoot()).to.be.equal(newStateRoot);
        expect(await aggchainPaymentsContract.latestBlockNumber()).to.be.equal(endBlock);

        // next getAggchainHash uses the updated lastStateRoot
        const nextStateRoot = ethers.id('nextStateRoot');
        const nextEndBlock = 400;
        const nextData = utilsPayments.encodeAggchainDataPayments(aggchainVKeySelector, nextStateRoot, nextEndBlock);
        const [, paramsSC] = await aggchainPaymentsContract.getVKeyAndAggchainParams(nextData);
        expect(paramsSC).to.be.equal(
            utilsPayments.computeHashAggchainParamsPayments(newStateRoot, nextStateRoot, nextEndBlock),
        );
    });
});
