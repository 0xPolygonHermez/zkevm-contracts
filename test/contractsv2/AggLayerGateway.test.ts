/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AgglayerGateway, SP1VerifierPlonk } from '../../typechain-types';
import input from './real-prover-sp1/test-inputs/input.json';
import { computeSignersHash } from '../../src/utils-common-aggchain';
import {
    DEFAULT_ADMIN_ROLE,
    AGGCHAIN_DEFAULT_VKEY_ROLE,
    AL_ADD_PP_ROUTE_ROLE,
    AL_FREEZE_PP_ROUTE_ROLE,
    AL_MULTISIG_ROLE,
} from '../../src/constants';

describe('AgglayerGateway tests', () => {
    upgrades.silenceWarnings();

    let aggLayerGatewayContract: AgglayerGateway;
    let verifierContract: SP1VerifierPlonk;

    let deployer: any;
    let defaultAdmin: any;
    let aggLayerAdmin: any;
    let aggchainVKey: any;
    let addPPRoute: any;
    let freezePPRoute: any;

    const initPPVKeySelector = '0x00000001';
    const initPPVkey = '0xbbbbbb85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512';

    const selector = input.proof.slice(0, 10);
    const pessimisticVKey = input.vkey;
    const newPessimisticVKey = '0xaaaaaa85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512';

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, defaultAdmin, aggLayerAdmin, aggchainVKey, addPPRoute, freezePPRoute] = await ethers.getSigners();

        // deploy AgglayerGateway
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        aggLayerGatewayContract = (await upgrades.deployProxy(AgglayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        })) as unknown as AgglayerGateway;

        // deploy verifier contract
        const SP1VerifierPlonkFactory = await ethers.getContractFactory('SP1VerifierPlonk');
        verifierContract = (await SP1VerifierPlonkFactory.deploy()) as SP1VerifierPlonk;

        // Check invalid zero address from ALGateway initializer
        await expect(
            aggLayerGatewayContract.initialize(
                ethers.ZeroAddress,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                ethers.ZeroAddress,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                ethers.ZeroAddress,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                ethers.ZeroAddress,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');

        // Check multisigRole cannot be zero address
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                ethers.ZeroAddress, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');

        // initialize AgglayerGateway
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(DEFAULT_ADMIN_ROLE, defaultAdmin.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainVKey.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_ADD_PP_ROUTE_ROLE, addPPRoute.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_FREEZE_PP_ROUTE_ROLE, freezePPRoute.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_MULTISIG_ROLE, defaultAdmin.address, deployer.address)
            .to.emit(aggLayerGatewayContract, 'RouteAdded')
            .withArgs(initPPVKeySelector, verifierContract.target, initPPVkey);
    });

    it('should check the initialize parameters', async () => {
        expect(await aggLayerGatewayContract.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.be.equal(true);
        expect(await aggLayerGatewayContract.version()).to.be.equal('v1.1.0');
    });

    it("should check error 'contract is already initialized'", async () => {
        // initialize AgglayerGateway again should fail
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address, // multisigRole
                [], // signersToAdd
                0, // newThreshold
            ),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidInitialization');
    });

    it('addPessimisticVKeyRoute', async () => {
        // add pessimistic vkey route

        // check onlyRole
        await expect(
            aggLayerGatewayContract.addPessimisticVKeyRoute(selector, verifierContract.target, pessimisticVKey),
        )
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AL_ADD_PP_ROUTE_ROLE);
        // grantRole AL_ADD_PP_ROUTE_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        // check PPSelectorCannotBeZero
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute('0x00000000', verifierContract.target, pessimisticVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'PPSelectorCannotBeZero');

        // check VKeyCannotBeZero
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, verifierContract.target, ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'VKeyCannotBeZero');

        // check InvalidZeroAddress
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, ethers.ZeroAddress, pessimisticVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');

        // check RouteAdded
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, verifierContract.target, pessimisticVKey),
        )
            .to.emit(aggLayerGatewayContract, 'RouteAdded')
            .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check RouteAlreadyExists
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, verifierContract.target, pessimisticVKey),
        )
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'RouteAlreadyExists')
            .withArgs(selector, verifierContract.target);
    });

    it('freezePessimisticVKeyRoute', async () => {
        const testSelector = '0x00000002';

        // grantRole AL_ADD_PP_ROUTE_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        // add pessimistic vkey route
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, verifierContract.target, pessimisticVKey),
        )
            .to.emit(aggLayerGatewayContract, 'RouteAdded')
            .withArgs(selector, verifierContract.target, pessimisticVKey);

        // freeze pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.freezePessimisticVKeyRoute(selector))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AL_FREEZE_PP_ROUTE_ROLE);

        // grantRole AL_FREEZE_PP_ROUTE_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        // check RouteNotFound
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(testSelector))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'RouteNotFound')
            .withArgs(testSelector);

        // check RouteFrozen
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(selector))
            .to.emit(aggLayerGatewayContract, 'RouteFrozen')
            .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check RouteIsFrozen
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(selector))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'RouteIsAlreadyFrozen')
            .withArgs(selector);
    });

    it('addDefaultAggchainVKey', async () => {
        // add pessimistic vkey route

        // check onlyRole
        await expect(aggLayerGatewayContract.addDefaultAggchainVKey(selector, pessimisticVKey))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AGGCHAIN_DEFAULT_VKEY_ROLE);

        // grantRole AGGCHAIN_DEFAULT_VKEY_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address)).to.be.equal(
            true,
        );
        // check VKeyCannotBeZero
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(selector, ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'VKeyCannotBeZero');
        // check AddDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(selector, pessimisticVKey))
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(selector, pessimisticVKey);

        // check AggchainVKeyAlreadyExists
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(selector, pessimisticVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyAlreadyExists');
    });

    it('getDefaultAggchainVKey & updateDefaultAggchainVKey & unsetDefaultAggchainVKey', async () => {
        // add pessimistic vkey route
        // check onlyRole
        await expect(aggLayerGatewayContract.addDefaultAggchainVKey(selector, pessimisticVKey))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AGGCHAIN_DEFAULT_VKEY_ROLE);

        // grantRole AGGCHAIN_DEFAULT_VKEY_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // check AggchainVKeyNotFound
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).updateDefaultAggchainVKey(selector, pessimisticVKey),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyNotFound');

        // check getDefaultAggchainVKey --> ethers.ZeroHash
        await expect(aggLayerGatewayContract.getDefaultAggchainVKey(selector)).to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            'AggchainVKeyNotFound',
        );

        // check AddDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(selector, pessimisticVKey))
            .to.emit(aggLayerGatewayContract, 'AddDefaultAggchainVKey')
            .withArgs(selector, pessimisticVKey);

        // check getDefaultAggchainVKey --> pessimisticVKey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(selector)).to.be.equal(pessimisticVKey);

        // check onlyRole
        await expect(aggLayerGatewayContract.updateDefaultAggchainVKey(selector, pessimisticVKey))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AGGCHAIN_DEFAULT_VKEY_ROLE);

        // check non-zero
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).updateDefaultAggchainVKey(selector, ethers.ZeroHash),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'VKeyCannotBeZero');

        // check UpdateDefaultAggchainVKey
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).updateDefaultAggchainVKey(selector, newPessimisticVKey),
        )
            .to.emit(aggLayerGatewayContract, 'UpdateDefaultAggchainVKey')
            .withArgs(selector, pessimisticVKey, newPessimisticVKey);

        // check getDefaultAggchainVKey --> newPessimisticVKey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(selector)).to.be.equal(newPessimisticVKey);

        // unset default aggchain vkey
        // check onlyRole
        await expect(aggLayerGatewayContract.unsetDefaultAggchainVKey(selector))
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount')
            .withArgs(deployer.address, AGGCHAIN_DEFAULT_VKEY_ROLE);

        // check AggchainVKeyNotFound
        const selector2 = '0x00000002';
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).unsetDefaultAggchainVKey(selector2),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainVKeyNotFound');

        // unset correctly
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).unsetDefaultAggchainVKey(selector))
            .to.emit(aggLayerGatewayContract, 'UnsetDefaultAggchainVKey')
            .withArgs(selector);

        // check getDefaultAggchainVKey --> ethers.ZeroHash
        await expect(aggLayerGatewayContract.getDefaultAggchainVKey(selector)).to.be.revertedWithCustomError(
            aggLayerGatewayContract,
            'AggchainVKeyNotFound',
        );
    });

    it('verifyPessimisticProof', async () => {
        // verifyPessimisticProof
        // check InvalidProofBytesLength
        await expect(
            aggLayerGatewayContract.verifyPessimisticProof(input['public-values'], `0x01`),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidProofBytesLength');

        // check RouteNotFound
        await expect(
            aggLayerGatewayContract.verifyPessimisticProof(
                input['public-values'],
                `${selector}${input.proof.slice(2)}`,
            ),
        )
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'RouteNotFound')
            .withArgs(selector);

        // grantRole AL_ADD_PP_ROUTE_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(selector, verifierContract.target, pessimisticVKey),
        )
            .to.emit(aggLayerGatewayContract, 'RouteAdded')
            .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check verifyProof
        await expect(aggLayerGatewayContract.verifyPessimisticProof(input['public-values'], input.proof));

        // grantRole AL_FREEZE_PP_ROUTE_ROLE --> aggLayerAdmin
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleGranted')
            .withArgs(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(await aggLayerGatewayContract.hasRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        // frozen route
        await expect(aggLayerGatewayContract.connect(aggLayerAdmin).freezePessimisticVKeyRoute(selector))
            .to.emit(aggLayerGatewayContract, 'RouteFrozen')
            .withArgs(selector, verifierContract.target, pessimisticVKey);

        // check RouteIsFrozen
        await expect(
            aggLayerGatewayContract.verifyPessimisticProof(
                input['public-values'],
                `${selector}${input.proof.slice(2)}`,
            ),
        )
            .to.be.revertedWithCustomError(aggLayerGatewayContract, 'RouteIsFrozen')
            .withArgs(selector);
    });

    it('should test multisig functions', async () => {
        // Grant AL_MULTISIG_ROLE to defaultAdmin
        await aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, defaultAdmin.address);

        // Test initial state - empty signers
        expect(await aggLayerGatewayContract.getAggchainSignersCount()).to.equal(0);
        expect(await aggLayerGatewayContract.getAggchainSigners()).to.deep.equal([]);

        // Initialize with empty signers to set the hash
        await expect(aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold([], [], 0)).to.emit(
            aggLayerGatewayContract,
            'SignersAndThresholdUpdated',
        );

        // Now getAggchainMultisigHash should work
        // Use computeSignersHash from utils-common-aggchain to check the hash matches the contract's value
        // (Assume computeSignersHash is imported or available in scope)
        let expectedSignersHash = computeSignersHash(0, []);
        const emptySignersHash = await aggLayerGatewayContract.getAggchainMultisigHash();
        expect(emptySignersHash).to.be.equal(expectedSignersHash);

        // Test isSigner with no signers
        expect(await aggLayerGatewayContract.isSigner(deployer.address)).to.equal(false);

        // Add signers
        const signer1 = deployer;
        const signer2 = aggLayerAdmin;
        const signer3 = aggchainVKey;

        const signersToAdd = [
            { addr: signer1.address, url: 'https://signer1.com' },
            { addr: signer2.address, url: 'https://signer2.com' },
            { addr: signer3.address, url: 'https://signer3.com' },
        ];

        expectedSignersHash = computeSignersHash(
            2,
            signersToAdd.map((s) => s.addr),
        );
        await expect(aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold([], signersToAdd, 2))
            .to.emit(aggLayerGatewayContract, 'SignersAndThresholdUpdated')
            .withArgs([signer1.address, signer2.address, signer3.address], 2, expectedSignersHash);

        // Test getters after adding signers
        expect(await aggLayerGatewayContract.getAggchainSignersCount()).to.equal(3);
        expect(await aggLayerGatewayContract.getAggchainSigners()).to.deep.equal([
            signer1.address,
            signer2.address,
            signer3.address,
        ]);
        expect(await aggLayerGatewayContract.getThreshold()).to.equal(2);

        // Test isSigner
        expect(await aggLayerGatewayContract.isSigner(signer1.address)).to.equal(true);
        expect(await aggLayerGatewayContract.isSigner(signer2.address)).to.equal(true);
        expect(await aggLayerGatewayContract.isSigner(signer3.address)).to.equal(true);
        expect(await aggLayerGatewayContract.isSigner(addPPRoute.address)).to.equal(false);

        // Test signerToURLs mapping
        expect(await aggLayerGatewayContract.signerToURLs(signer1.address)).to.equal('https://signer1.com');
        expect(await aggLayerGatewayContract.signerToURLs(signer2.address)).to.equal('https://signer2.com');
        expect(await aggLayerGatewayContract.signerToURLs(signer3.address)).to.equal('https://signer3.com');

        // Test removing a signer
        const signersToRemove = [{ addr: signer2.address, index: 1 }];
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(signersToRemove, [], 1),
        ).to.emit(aggLayerGatewayContract, 'SignersAndThresholdUpdated');

        // Check after removal
        expect(await aggLayerGatewayContract.getAggchainSignersCount()).to.equal(2);
        const signersAfterRemoval = await aggLayerGatewayContract.getAggchainSigners();
        expect(signersAfterRemoval).to.include(signer1.address);
        expect(signersAfterRemoval).to.include(signer3.address);
        expect(signersAfterRemoval).to.not.include(signer2.address);
        expect(await aggLayerGatewayContract.isSigner(signer2.address)).to.equal(false);
        expect(await aggLayerGatewayContract.getThreshold()).to.equal(1);

        // Test access control - non-admin cannot update signers
        await expect(
            aggLayerGatewayContract.connect(deployer).updateSignersAndThreshold([], [], 0),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount');

        // Test error cases
        // Invalid threshold (greater than signers count)
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold([], [], 5),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'InvalidThreshold');

        // Try to add zero address as signer
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdmin)
                .updateSignersAndThreshold([], [{ addr: ethers.ZeroAddress, url: 'https://zero.com' }], 1),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'SignerCannotBeZero');

        // Try to add signer with empty URL
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdmin)
                .updateSignersAndThreshold([], [{ addr: addPPRoute.address, url: '' }], 1),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'SignerURLCannotBeEmpty');

        // Try to add existing signer
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdmin)
                .updateSignersAndThreshold([], [{ addr: signer1.address, url: 'https://duplicate.com' }], 1),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'SignerAlreadyExists');

        // Try to remove signer with wrong index
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdmin)
                .updateSignersAndThreshold([{ addr: signer1.address, index: 5 }], [], 1),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'SignerDoesNotExist');

        // Try to remove signer with mismatched address and index
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(
                [{ addr: signer1.address, index: 1 }], // signer1 is at index 0
                [],
                1,
            ),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'SignerDoesNotExist');

        // Test indices not in descending order
        const newSigner4 = addPPRoute;
        const newSigner5 = freezePPRoute;
        await aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(
            [],
            [
                { addr: newSigner4.address, url: 'https://signer4.com' },
                { addr: newSigner5.address, url: 'https://signer5.com' },
            ],
            2,
        );

        // Now we have 4 signers, try to remove multiple with wrong order
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(
                [
                    { addr: signer1.address, index: 0 },
                    { addr: signer3.address, index: 1 }, // Wrong: should be descending
                ],
                [],
                1,
            ),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'IndicesNotInDescendingOrder');

        // Test with correct descending order
        await expect(
            aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(
                [
                    { addr: newSigner5.address, index: 3 },
                    { addr: newSigner4.address, index: 2 },
                ],
                [],
                1,
            ),
        ).to.emit(aggLayerGatewayContract, 'SignersAndThresholdUpdated');

        // Test reaching maximum signers (255 limit)
        // First clear all signers
        const currentSigners = await aggLayerGatewayContract.getAggchainSigners();
        const removeAll = currentSigners.map((addr, index) => ({
            addr,
            index, // Remove the subtraction since we're using the index directly
        }));
        removeAll.reverse();
        await aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold(removeAll, [], 0);

        // Add 255 signers (maximum allowed)
        const maxSigners = [];
        for (let i = 0; i < 255; i++) {
            const wallet = ethers.Wallet.createRandom();
            maxSigners.push({ addr: wallet.address, url: `https://signer${i}.com` });
        }
        await aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold([], maxSigners, 128);
        expect(await aggLayerGatewayContract.getAggchainSignersCount()).to.equal(255);

        // Try to add one more (should fail)
        const extraWallet = ethers.Wallet.createRandom();
        await expect(
            aggLayerGatewayContract
                .connect(defaultAdmin)
                .updateSignersAndThreshold([], [{ addr: extraWallet.address, url: 'https://extra.com' }], 128),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AggchainSignersTooHigh');
    });

    it('should test version function', async () => {
        expect(await aggLayerGatewayContract.AGGLAYER_GATEWAY_VERSION()).to.equal('v1.1.0');
    });

    it('should test aggchainSigners array access', async () => {
        // Grant AL_MULTISIG_ROLE to defaultAdmin
        await aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, defaultAdmin.address);

        // Add some signers
        const signersToAdd = [
            { addr: deployer.address, url: 'https://signer1.com' },
            { addr: aggLayerAdmin.address, url: 'https://signer2.com' },
        ];

        await aggLayerGatewayContract.connect(defaultAdmin).updateSignersAndThreshold([], signersToAdd, 1);

        // Test direct array access
        expect(await aggLayerGatewayContract.aggchainSigners(0)).to.equal(deployer.address);
        expect(await aggLayerGatewayContract.aggchainSigners(1)).to.equal(aggLayerAdmin.address);

        // Test out of bounds access (should revert)
        await expect(aggLayerGatewayContract.aggchainSigners(2)).to.be.reverted;
    });

    it('should test role management edge cases', async () => {
        // Test revoking roles

        // Grant role
        await aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, aggLayerAdmin.address);
        expect(await aggLayerGatewayContract.hasRole(AL_MULTISIG_ROLE, aggLayerAdmin.address)).to.be.equal(true);

        // Revoke role
        await expect(aggLayerGatewayContract.connect(defaultAdmin).revokeRole(AL_MULTISIG_ROLE, aggLayerAdmin.address))
            .to.emit(aggLayerGatewayContract, 'RoleRevoked')
            .withArgs(AL_MULTISIG_ROLE, aggLayerAdmin.address, defaultAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AL_MULTISIG_ROLE, aggLayerAdmin.address)).to.be.equal(false);

        // Test that revoked account cannot call protected functions
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).updateSignersAndThreshold([], [], 0),
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, 'AccessControlUnauthorizedAccount');

        // Test renouncing role
        await aggLayerGatewayContract.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, aggLayerAdmin.address);
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).renounceRole(AL_MULTISIG_ROLE, aggLayerAdmin.address),
        )
            .to.emit(aggLayerGatewayContract, 'RoleRevoked')
            .withArgs(AL_MULTISIG_ROLE, aggLayerAdmin.address, aggLayerAdmin.address);

        expect(await aggLayerGatewayContract.hasRole(AL_MULTISIG_ROLE, aggLayerAdmin.address)).to.be.equal(false);
    });

    it('should test the second initialize function', async () => {
        // Deploy a fresh contract for testing the second initialize function
        const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const freshGateway = await upgrades.deployProxy(aggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });
        await freshGateway.waitForDeployment();

        // Test the second initialize function (lines 185-196)
        // This initialize function accepts aggchainSigners and threshold parameters
        const signersList = await ethers.getSigners();
        const signer1 = signersList[6];
        const signer2 = signersList[7];
        const signer3 = signersList[8];
        const signers = [signer1.address, signer2.address, signer3.address];
        const threshold = 2;

        // Initialize with the full initialize function
        await freshGateway.initialize(
            defaultAdmin.address,
            aggchainVKey.address,
            addPPRoute.address,
            freezePPRoute.address,
            initPPVKeySelector,
            verifierContract.target,
            initPPVkey,
            defaultAdmin.address, // multisigRole
            signers.map((addr, index) => ({ addr, url: `http://signer${index + 1}` })), // Convert to SignerInfo array with URL
            threshold,
        );

        // Verify initialization
        expect(await freshGateway.getAggchainSignersCount()).to.equal(signers.length);
        expect(await freshGateway.getThreshold()).to.equal(threshold);

        const actualSigners = await freshGateway.getAggchainSigners();
        expect(actualSigners).to.deep.equal(signers);

        // Test that it cannot be initialized again
        await expect(
            freshGateway.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
                defaultAdmin.address,
                signers.map((addr, index) => ({ addr, url: `http://signer${index + 1}` })),
                threshold,
            ),
        ).to.be.revertedWithCustomError(freshGateway, 'InvalidInitialization');
    });

    it('should test getAggchainMultisigHash edge case', async () => {
        // Test the edge case when aggchainMultisigHash is not set (line 595)
        // Deploy a fresh contract
        const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const edgeCaseGateway = await upgrades.deployProxy(aggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });
        await edgeCaseGateway.waitForDeployment();

        // Need to get signers for the test
        const signersList = await ethers.getSigners();
        const signer1 = signersList[6];
        const signer2 = signersList[7];

        // Initialize with empty signers to test edge case
        await edgeCaseGateway.initialize(
            defaultAdmin.address,
            aggchainVKey.address,
            addPPRoute.address,
            freezePPRoute.address,
            initPPVKeySelector,
            verifierContract.target,
            initPPVkey,
            defaultAdmin.address,
            [], // empty signers
            0, // threshold
        );

        // Test getAggchainMultisigHash when no signers are set
        const signersHash = await edgeCaseGateway.getAggchainMultisigHash();
        expect(signersHash).to.not.equal(ethers.ZeroHash);

        // Add signers and verify hash changes
        await edgeCaseGateway.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, aggLayerAdmin.address);
        await edgeCaseGateway.connect(aggLayerAdmin).updateSignersAndThreshold(
            [],
            [
                { addr: signer1.address, url: 'http://signer1' },
                { addr: signer2.address, url: 'http://signer2' },
            ],
            1,
        );

        const newSignersHash = await edgeCaseGateway.getAggchainMultisigHash();
        expect(newSignersHash).to.not.equal(signersHash);
        expect(newSignersHash).to.not.equal(ethers.ZeroHash);
    });

    it('should upgrade from previous version to new version', async () => {
        // Deploy the previous version of AgglayerGateway
        const aggLayerGatewayPreviousFactory = await ethers.getContractFactory('AggLayerGatewayPrevious');
        const aggLayerGatewayPrevious = await upgrades.deployProxy(aggLayerGatewayPreviousFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        });
        await aggLayerGatewayPrevious.waitForDeployment();

        // Initialize the previous version
        await aggLayerGatewayPrevious.initialize(
            defaultAdmin.address,
            aggchainVKey.address,
            addPPRoute.address,
            freezePPRoute.address,
            initPPVKeySelector,
            verifierContract.target,
            initPPVkey,
        );

        // Verify initialization of previous version
        expect(await aggLayerGatewayPrevious.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.be.equal(true);
        expect(await aggLayerGatewayPrevious.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainVKey.address)).to.be.equal(
            true,
        );
        expect(await aggLayerGatewayPrevious.hasRole(AL_ADD_PP_ROUTE_ROLE, addPPRoute.address)).to.be.equal(true);
        expect(await aggLayerGatewayPrevious.hasRole(AL_FREEZE_PP_ROUTE_ROLE, freezePPRoute.address)).to.be.equal(true);

        // Check that pessimistic route was added
        const route = await aggLayerGatewayPrevious.pessimisticVKeyRoutes(initPPVKeySelector);
        expect(route.verifier).to.be.equal(verifierContract.target);
        expect(route.pessimisticVKey).to.be.equal(initPPVkey);
        expect(route.frozen).to.be.equal(false);

        // Add a default aggchain vkey to test state preservation
        await aggLayerGatewayPrevious
            .connect(aggchainVKey)
            .addDefaultAggchainVKey('0x12340005', ethers.id('test_default_vkey'));

        // Get the new AgglayerGateway factory
        const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');

        // Prepare signers for the upgrade
        const signersList = await ethers.getSigners();
        const signer1 = signersList[6];
        const signer2 = signersList[7];
        const signer3 = signersList[8];
        const signers = [
            { addr: signer1.address, url: 'http://signer1' },
            { addr: signer2.address, url: 'http://signer2' },
            { addr: signer3.address, url: 'http://signer3' },
        ];
        const threshold = 2;

        // Upgrade to new version with multisig initialization
        const upgradedContract = await upgrades.upgradeProxy(aggLayerGatewayPrevious.target, aggLayerGatewayFactory, {
            unsafeAllow: ['constructor'],
            call: {
                fn: 'initialize(address,(address,string)[],uint256)',
                args: [defaultAdmin.address, signers, threshold],
            },
        });

        // Cast to the new interface
        const upgradedAgglayerGateway = upgradedContract as unknown as AgglayerGateway;

        // Verify that previous state is preserved
        // Check roles are preserved
        expect(await upgradedAgglayerGateway.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.be.equal(true);
        expect(await upgradedAgglayerGateway.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggchainVKey.address)).to.be.equal(
            true,
        );
        expect(await upgradedAgglayerGateway.hasRole(AL_ADD_PP_ROUTE_ROLE, addPPRoute.address)).to.be.equal(true);
        expect(await upgradedAgglayerGateway.hasRole(AL_FREEZE_PP_ROUTE_ROLE, freezePPRoute.address)).to.be.equal(true);

        // Check pessimistic route is preserved
        const upgradedRoute = await upgradedAgglayerGateway.pessimisticVKeyRoutes(initPPVKeySelector);
        expect(upgradedRoute.verifier).to.be.equal(verifierContract.target);
        expect(upgradedRoute.pessimisticVKey).to.be.equal(initPPVkey);
        expect(upgradedRoute.frozen).to.be.equal(false);

        // Check default aggchain vkey is preserved
        expect(await upgradedAgglayerGateway.defaultAggchainVKeys('0x12340005')).to.be.equal(
            ethers.id('test_default_vkey'),
        );

        // Verify new functionality - multisig was added
        expect(await upgradedAgglayerGateway.getAggchainSignersCount()).to.equal(3);
        expect(await upgradedAgglayerGateway.getThreshold()).to.equal(threshold);
        const actualSigners = await upgradedAgglayerGateway.getAggchainSigners();
        expect(actualSigners).to.deep.equal([signer1.address, signer2.address, signer3.address]);

        // Test that new multisig role can update signers
        await upgradedAgglayerGateway.connect(defaultAdmin).grantRole(AL_MULTISIG_ROLE, aggLayerAdmin.address);

        const signer4 = signersList[9];
        await expect(
            upgradedAgglayerGateway
                .connect(aggLayerAdmin)
                .updateSignersAndThreshold([], [{ addr: signer4.address, url: 'http://signer4' }], 3),
        ).to.emit(upgradedAgglayerGateway, 'SignersAndThresholdUpdated');

        expect(await upgradedAgglayerGateway.getAggchainSignersCount()).to.equal(4);
        expect(await upgradedAgglayerGateway.getThreshold()).to.equal(3);

        // Verify the new version string
        expect(await upgradedAgglayerGateway.version()).to.equal('v1.1.0');

        // Test that previous version functionality still works
        // Add another pessimistic route
        await expect(
            upgradedAgglayerGateway
                .connect(addPPRoute)
                .addPessimisticVKeyRoute('0x00000099', verifierContract.target, ethers.id('new_pp_vkey')),
        ).to.emit(upgradedAgglayerGateway, 'RouteAdded');

        const newRoute = await upgradedAgglayerGateway.pessimisticVKeyRoutes('0x00000099');
        expect(newRoute.verifier).to.be.equal(verifierContract.target);
        expect(newRoute.pessimisticVKey).to.be.equal(ethers.id('new_pp_vkey'));
    });
});
