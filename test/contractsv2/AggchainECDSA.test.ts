/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Address, AggchainECDSA, AggLayerGateway } from '../../typechain-types';
import * as utilsECDSA from '../../src/utils-aggchain-ECDSA';
import * as utilsAggchain from '../../src/utils-common-aggchain';

describe('AggchainECDSA', () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let defaultAdminAgglayer: any;
    let aggchainManager: any;
    let vKeyManager: any;
    let aggchainVKey: any;
    let addPPRoute: any;
    let freezePPRoute: any;

    let aggchainECDSAcontract: AggchainECDSA;
    let aggLayerGatewayContract: AggLayerGateway;

    const gerManagerAddress = '0xA00000000000000000000000000000000000000A' as unknown as Address;
    const polTokenAddress = '0xB00000000000000000000000000000000000000B' as unknown as Address;
    const rollupManagerAddress = '0xC00000000000000000000000000000000000000C' as unknown as Address;
    const bridgeAddress = '0xD00000000000000000000000000000000000000D' as unknown as Address;

    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const networkName = 'zkevm';

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggLayerGateway variables
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id('AGGCHAIN_DEFAULT_VKEY_ROLE');
    const ppVKeySelector = '0x00000001';
    const ppVKey = '0xbbbbbb85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512';

    // aggchain variables
    let initializeBytesAggchain: string;
    const AGGCHAIN_TYPE = '0x0000';
    const CONSENSUS_TYPE = 1;
    const aggchainSelector = '0x22222222';
    const newAggchainVKey = '0x2222222222222222222222222222222222222222222222222222222222222222';
    const aggchainSelector2 = '0x11111111';
    const newAggchainVKey2 = '0x1111111111111111111111111111111111111111111111111111111111111111';
    const aggchainVkeyVersion = '0x1235';
    const newStateRoot = '0x1122334455667788990011223344556677889900112233445566778899001122';

    const useDefaultGateway = true;
    const aggchainSelector3 = utilsAggchain.getAggchainVKeySelector('0x1234', AGGCHAIN_TYPE);
    const ownedAggchainVKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [
            deployer,
            trustedSequencer,
            admin,
            defaultAdminAgglayer,
            aggchainManager,
            vKeyManager,
            aggchainVKey,
            addPPRoute,
            freezePPRoute,
        ] = await ethers.getSigners();

        initializeBytesAggchain = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainSelector3,
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        // deploy verifier contract
        const SP1VerifierPlonkFactory = await ethers.getContractFactory('SP1VerifierPlonk');
        const verifierContract = (await SP1VerifierPlonkFactory.deploy()) as SP1VerifierPlonk;

        // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        aggLayerGatewayContract = (await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        })) as unknown as AggLayerGateway;

        // initialize AggLayerGateway
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdminAgglayer.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                ppVKeySelector,
                verifierContract.target,
                ppVKey,
            ),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(DEFAULT_ADMIN_ROLE, defaultAdminAgglayer.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainVKey.address, deployer.address);

        // grantRole AGGCHAIN_DEFAULT_VKEY_ROLE --> defaultAdminAgglayer
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdminAgglayer)
                .grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, defaultAdminAgglayer.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AGGCHAIN_DEFAULT_VKEY_ROLE, defaultAdminAgglayer.address, defaultAdminAgglayer.address);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, defaultAdminAgglayer.address)).to.be
            .true;

        // AddDefaultAggchainVKey
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdminAgglayer)
                .addDefaultAggchainVKey(aggchainSelector, newAggchainVKey),
        )
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(aggchainSelector, newAggchainVKey);

        // deploy aggchain
        // create aggchainECDSA implementation
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
        aggchainECDSAcontract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
            initializer: false,
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable', 'missing-initializer-call'],
        });

        await aggchainECDSAcontract.waitForDeployment();
    });

    it('should check the initialized parameters', async () => {
        // should set the aggachainManager: error "OnlyRollupManager"
        await expect(aggchainECDSAcontract.initAggchainManager(aggchainManager.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyRollupManager',
        );

        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);

        // Check AggchainManagerCannotBeZero
        await expect(
            aggchainECDSAcontract.connect(rollupManagerSigner).initAggchainManager(ethers.ZeroAddress, { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'AggchainManagerCannotBeZero');

        await aggchainECDSAcontract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });

        // initialize zkEVM using non admin address
        await expect(aggchainECDSAcontract.initialize(initializeBytesAggchain)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyAggchainManager',
        );

        // initialize zkEVM using an invalid aggchain selector
        const initializeBytesAggchainFail = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
            useDefaultGateway,
            ownedAggchainVKey,
            utilsAggchain.getAggchainVKeySelector('0x1234', '0x0001'),
            vKeyManager.address,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
        );

        await expect(
            aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchainFail),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'InvalidAggchainType');

        // initialize using rollup manager
        await aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        expect(await aggchainECDSAcontract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAcontract.vKeyManager()).to.be.equal(vKeyManager.address);
        expect(await aggchainECDSAcontract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAcontract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAcontract.networkName()).to.be.equal(networkName);
        expect(await aggchainECDSAcontract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await aggchainECDSAcontract.ownedAggchainVKeys(aggchainSelector3)).to.be.equal(ownedAggchainVKey);

        // initialize again
        await expect(
            aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 }),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    // PolygonConsensusBase
    it('should check admin functions PolygonConsensusBase', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // setTrustedSequencer
        await expect(aggchainECDSAcontract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyAdmin',
        );

        await expect(aggchainECDSAcontract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(aggchainECDSAcontract, 'SetTrustedSequencer')
            .withArgs(deployer.address);

        // setTrustedSequencerURL
        await expect(aggchainECDSAcontract.setTrustedSequencerURL('0x1253')).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyAdmin',
        );
        await expect(aggchainECDSAcontract.connect(admin).setTrustedSequencerURL('0x1253'))
            .to.emit(aggchainECDSAcontract, 'SetTrustedSequencerURL')
            .withArgs('0x1253');

        // transferAdminRole & acceptAdminRole
        await expect(aggchainECDSAcontract.transferAdminRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyAdmin',
        );
        await expect(aggchainECDSAcontract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(aggchainECDSAcontract, 'TransferAdminRole')
            .withArgs(deployer.address);

        await expect(aggchainECDSAcontract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyPendingAdmin',
        );

        await expect(aggchainECDSAcontract.connect(deployer).acceptAdminRole())
            .to.emit(aggchainECDSAcontract, 'AcceptAdminRole')
            .withArgs(deployer.address);
    });

    it('should check vKeyManager functions AggchainBase', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // disableUseDefaultGatewayFlag
        await expect(aggchainECDSAcontract.disableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyVKeyManager',
        );

        await expect(aggchainECDSAcontract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAcontract,
            'DisableUseDefaultGatewayFlag',
        );

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).disableUseDefaultGatewayFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'UseDefaultGatewayAlreadyDisabled');

        // enableUseDefaultGatewayFlag
        await expect(aggchainECDSAcontract.enableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyVKeyManager',
        );

        await expect(aggchainECDSAcontract.connect(vKeyManager).enableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAcontract,
            'EnableUseDefaultGatewayFlag',
        );

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).enableUseDefaultGatewayFlag(),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'UseDefaultGatewayAlreadyEnabled');

        // addOwnedAggchainVKey
        await expect(
            aggchainECDSAcontract.addOwnedAggchainVKey(aggchainSelector, newAggchainVKey),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'OnlyVKeyManager');

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).addOwnedAggchainVKey(aggchainSelector, ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'ZeroValueAggchainVKey');

        await expect(aggchainECDSAcontract.connect(vKeyManager).addOwnedAggchainVKey(aggchainSelector, newAggchainVKey))
            .to.emit(aggchainECDSAcontract, 'AddAggchainVKey')
            .withArgs(aggchainSelector, newAggchainVKey);

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).addOwnedAggchainVKey(aggchainSelector, newAggchainVKey),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'OwnedAggchainVKeyAlreadyAdded');

        // updateOwnedAggchainVKey
        await expect(
            aggchainECDSAcontract.updateOwnedAggchainVKey(aggchainSelector2, newAggchainVKey2),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'OnlyVKeyManager');

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).updateOwnedAggchainVKey(aggchainSelector2, newAggchainVKey2),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'OwnedAggchainVKeyNotFound');

        await expect(
            aggchainECDSAcontract.connect(vKeyManager).updateOwnedAggchainVKey(aggchainSelector, newAggchainVKey2),
        )
            .to.emit(aggchainECDSAcontract, 'UpdateAggchainVKey')
            .withArgs(aggchainSelector, newAggchainVKey, newAggchainVKey2);

        // getAggchainVKey useDefaultGateway === true
        expect(await aggchainECDSAcontract.getAggchainVKey(aggchainSelector)).to.be.equal(newAggchainVKey);

        await expect(aggchainECDSAcontract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAcontract,
            'DisableUseDefaultGatewayFlag',
        );

        // getAggchainVKey useDefaultGateway === false
        expect(await aggchainECDSAcontract.getAggchainVKey(aggchainSelector)).to.be.equal(newAggchainVKey2);

        // transferVKeyManagerRole
        await expect(aggchainECDSAcontract.transferVKeyManagerRole(admin.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyVKeyManager',
        );

        await expect(aggchainECDSAcontract.connect(vKeyManager).transferVKeyManagerRole(admin.address))
            .to.emit(aggchainECDSAcontract, 'TransferVKeyManagerRole')
            .withArgs(vKeyManager, admin.address);

        // acceptVKeyManagerRole
        await expect(aggchainECDSAcontract.connect(vKeyManager).acceptVKeyManagerRole()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyPendingVKeyManager',
        );

        await expect(aggchainECDSAcontract.connect(admin).acceptVKeyManagerRole())
            .to.emit(aggchainECDSAcontract, 'AcceptVKeyManagerRole')
            .withArgs(vKeyManager.address, admin.address);

        // Check now pendingVKeyManager address is zero
        expect(await aggchainECDSAcontract.pendingVKeyManager()).to.be.equal(ethers.ZeroAddress);
    });

    it('should check getAggchainHash', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // calculate aggchainHash
        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVkeyVersion, AGGCHAIN_TYPE);
        const aggchainData = utilsECDSA.encodeAggchainDataECDSA(aggchainVKeySelector, newStateRoot);

        const aggchainParams = ethers.solidityPackedKeccak256(['address'], [trustedSequencer.address]);
        const aggchainHash = ethers.solidityPackedKeccak256(
            ['uint32', 'bytes32', 'bytes32'],
            [CONSENSUS_TYPE, newAggchainVKey, aggchainParams],
        );

        // new owned aggchain
        await expect(
            aggchainECDSAcontract.connect(vKeyManager).addOwnedAggchainVKey(aggchainVKeySelector, newAggchainVKey),
        )
            .to.emit(aggchainECDSAcontract, 'AddAggchainVKey')
            .withArgs(aggchainVKeySelector, newAggchainVKey);

        // disable default gateway flag
        await expect(aggchainECDSAcontract.connect(vKeyManager).disableUseDefaultGatewayFlag()).to.emit(
            aggchainECDSAcontract,
            'DisableUseDefaultGatewayFlag',
        );

        // getAggchainHash
        await expect(aggchainECDSAcontract.getAggchainHash('0x')).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'InvalidAggchainDataLength',
        );
        expect(await aggchainECDSAcontract.getAggchainHash(aggchainData)).to.be.equal(aggchainHash);
    });

    it('should check onVerifyPessimistic', async () => {
        // initialize using rollup manager
        await ethers.provider.send('hardhat_impersonateAccount', [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await aggchainECDSAcontract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        const aggchainVKeySelector = utilsAggchain.getAggchainVKeySelector(aggchainVkeyVersion, AGGCHAIN_TYPE);
        const aggchainData = utilsECDSA.encodeAggchainDataECDSA(aggchainVKeySelector, newStateRoot);

        // check onlyRollupManager
        await expect(aggchainECDSAcontract.onVerifyPessimistic(aggchainData)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            'OnlyRollupManager',
        );

        // check InvalidAggchainDataLength
        await expect(
            aggchainECDSAcontract.connect(rollupManagerSigner).onVerifyPessimistic('0x', { gasPrice: 0 }),
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, 'InvalidAggchainDataLength');

        // onVerifyPessimistic
        await expect(
            aggchainECDSAcontract.connect(rollupManagerSigner).onVerifyPessimistic(aggchainData, { gasPrice: 0 }),
        )
            .to.emit(aggchainECDSAcontract, 'OnVerifyPessimisticECDSA')
            .withArgs(newStateRoot);
    });

    it('should check reinitialize', async () => {
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        // deploy polygonPessimisticConsensus
        // create polygonPessimisticConsensus implementation
        const ppConsensusFactory = await ethers.getContractFactory('PolygonPessimisticConsensus');
        let ppConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });
        await ppConsensusContract.waitForDeployment();

        await ppConsensusContract
            .connect(rollupManagerSigner)
            .initialize(admin.address, trustedSequencer.address, 0, gasTokenAddress, urlSequencer, networkName, {
                gasPrice: 0,
            });

        // upgrade to aggchainECDSA (reinitialize)
        const aggchainECDSAFactory = await ethers.getContractFactory('AggchainECDSA');
        ppConsensusContract = await upgrades.upgradeProxy(ppConsensusContract.target, aggchainECDSAFactory, {
            constructorArgs: [
                gerManagerAddress,
                polTokenAddress,
                bridgeAddress,
                rollupManagerAddress,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: [
                'constructor',
                'state-variable-immutable',
                'enum-definition',
                'struct-definition',
                'missing-initializer',
                'missing-initializer-call',
            ],
        });

        initializeBytesAggchain = utilsECDSA.encodeInitializeBytesAggchainECDSAv1(
            useDefaultGateway,
            ownedAggchainVKey,
            aggchainSelector3,
            vKeyManager.address,
        );

        await ppConsensusContract
            .connect(rollupManagerSigner)
            .initAggchainManager(aggchainManager.address, { gasPrice: 0 });
        await ppConsensusContract.connect(aggchainManager).initialize(initializeBytesAggchain, { gasPrice: 0 });

        // check initializeBytesAggchain
        expect(await ppConsensusContract.admin()).to.be.equal(admin.address);
        expect(await ppConsensusContract.vKeyManager()).to.be.equal(vKeyManager.address);
        expect(await ppConsensusContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await ppConsensusContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await ppConsensusContract.networkName()).to.be.equal(networkName);
        expect(await ppConsensusContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
        expect(await ppConsensusContract.ownedAggchainVKeys(aggchainSelector3)).to.be.equal(ownedAggchainVKey);
    });
});
