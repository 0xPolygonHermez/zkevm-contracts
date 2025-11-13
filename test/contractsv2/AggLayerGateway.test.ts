/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AggLayerGateway, SP1VerifierPlonk } from '../../typechain-types';
import input from './real-prover-sp1/test-inputs/input.json';

describe('AggLayerGateway tests', () => {
    upgrades.silenceWarnings();

    let aggLayerGatewayContract: AggLayerGateway;
    let verifierContract: SP1VerifierPlonk;

    let deployer: any;
    let defaultAdmin: any;
    let aggLayerAdmin: any;
    let aggchainVKey: any;
    let addPPRoute: any;
    let freezePPRoute: any;

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const AGGCHAIN_DEFAULT_VKEY_ROLE = ethers.id('AGGCHAIN_DEFAULT_VKEY_ROLE');
    const AL_ADD_PP_ROUTE_ROLE = ethers.id('AL_ADD_PP_ROUTE_ROLE');
    const AL_FREEZE_PP_ROUTE_ROLE = ethers.id('AL_FREEZE_PP_ROUTE_ROLE');

    const initPPVKeySelector = '0x00000001';
    const initPPVkey = '0xbbbbbb85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512';

    const selector = input.proof.slice(0, 10);
    const pessimisticVKey = input.vkey;
    const newPessimisticVKey = '0xaaaaaa85702e0582d900f3a19521270c92a58e2588230c4a5cf3b45103f4a512';

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, defaultAdmin, aggLayerAdmin, aggchainVKey, addPPRoute, freezePPRoute] = await ethers.getSigners();

        // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway');
        aggLayerGatewayContract = (await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor'],
        })) as unknown as AggLayerGateway;

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
            ),
        ).to.revertedWithCustomError(aggLayerGatewayContract, 'InvalidZeroAddress');
        // initialize AggLayerGateway
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
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
            .to.emit(aggLayerGatewayContract, 'RouteAdded')
            .withArgs(initPPVKeySelector, verifierContract.target, initPPVkey);
    });

    it('should check the initialize parameters', async () => {
        expect(await aggLayerGatewayContract.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin.address)).to.be.equal(true);
    });

    it("should check error 'contract is already initialized'", async () => {
        // initialize AggLayerGateway
        await expect(
            aggLayerGatewayContract.initialize(
                defaultAdmin.address,
                aggchainVKey.address,
                addPPRoute.address,
                freezePPRoute.address,
                initPPVKeySelector,
                verifierContract.target,
                initPPVkey,
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
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

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
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

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
        expect(await aggLayerGatewayContract.hasRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

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
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_DEFAULT_VKEY_ROLE, aggLayerAdmin.address)).to.be.true;
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
        expect(await aggLayerGatewayContract.hasRole(AL_ADD_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

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
        expect(await aggLayerGatewayContract.hasRole(AL_FREEZE_PP_ROUTE_ROLE, aggLayerAdmin.address)).to.be.true;

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
});
