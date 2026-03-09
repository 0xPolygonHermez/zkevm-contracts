/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { takeSnapshot } from '@nomicfoundation/hardhat-network-helpers';
import {
    ERC20PermitMock,
    AgglayerGERL2,
    AgglayerBridgeL2,
    BridgeL2SovereignChainPessimistic,
    TokenWrappedBridgeUpgradeable,
    TokenWrappedTransparentProxy,
} from '../../typechain-types';
import { claimBeforeBridge, computeWrappedTokenProxyAddress } from './helpers/helpers-sovereign-bridge';

describe('Upgradeable Tokens', () => {
    let deployer: any;
    let receiver: any;
    let emergencyBridgePauser: any;
    let rollupManager: any;
    let proxiedTokensManager: any;
    let bridgeManager: any;
    let bridgeManager2: any;
    let indexLET = 0;
    let sovereignBridgeContract: any;
    let gasTokenBridgeContract: any;
    let polTokenContract: ERC20PermitMock;
    let polTokenContractUpgradeable: ERC20PermitMock;
    let sovereignGERContract: AgglayerGERL2;

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const LEAF_TYPE_ASSET = 0;
    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.MaxUint256;
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );

    let maticTokenFactory: any;

    beforeEach('Deploy contracts', async () => {
        upgrades.silenceWarnings();

        // load signers
        [
            deployer,
            rollupManager,
            receiver,
            emergencyBridgePauser,
            proxiedTokensManager,
            bridgeManager,
            bridgeManager2,
        ] = await ethers.getSigners();

        maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');

        // deploy PolygonZkEVMBridge pessimistic
        const sovBridgePessimisticFactory = await ethers.getContractFactory('BridgeL2SovereignChainPessimistic');
        sovereignBridgeContract = (await upgrades.deployProxy(sovBridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as BridgeL2SovereignChainPessimistic;

        // Deploy pessimistic bridge with gas token
        gasTokenBridgeContract = (await upgrades.deployProxy(sovBridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const sovGERFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignGERContract = (await upgrades.deployProxy(
            sovGERFactory,
            [deployer.address, deployer.address], // Initializer params
            {
                initializer: 'initialize', // initializer function name
                constructorArgs: [sovereignBridgeContract.target], // Constructor arguments
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            },
        )) as unknown as AgglayerGERL2;

        await sovereignBridgeContract.initialize(
            networkIDRollup,
            ethers.ZeroAddress, // gasTokenAddress: zero for ether
            networkIDMainnet, // gasTokenNetwork: zero for ethereum, L1, mainnet
            sovereignGERContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
        );

        // deploy token
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        polTokenContractUpgradeable = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );

        await gasTokenBridgeContract.initialize(
            networkIDRollup + 1,
            polTokenContract.target, // gasTokenAddress: zero for ether
            networkIDMainnet, // gasTokenNetwork: zero for ethereum, L1, mainnet
            sovereignGERContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
        );

        // Should make claim of a token
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContract.target;
        const amount = 1000;
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        indexLET = 0;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET++,
        );
        const precalculatedWrappedAddress = await sovereignBridgeContract.precalculatedWrapperAddress(
            originNetwork,
            tokenAddress,
            tokenName,
            tokenSymbol,
            decimals,
        );
        const wrappedAddressContract = maticTokenFactory.attach(precalculatedWrappedAddress) as ERC20PermitMock;
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Upgrade bridge to upgradeable tokens
        // Upgrade sov bridge to new version
        const sovBridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChainV1010');
        sovereignBridgeContract = (await upgrades.upgradeProxy(sovereignBridgeContract.target, sovBridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer-call', 'missing-initializer'],
            call: {
                fn: 'initialize(bytes32[],uint256[],address,address)',
                args: [[], [], emergencyBridgePauser.address, proxiedTokensManager.address],
            },
        })) as unknown as AgglayerBridgeL2;

        gasTokenBridgeContract = (await upgrades.upgradeProxy(gasTokenBridgeContract.target, sovBridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer-call', 'missing-initializer'],
            call: {
                fn: 'initialize(bytes32[],uint256[],address,address)',
                args: [[], [], emergencyBridgePauser.address, proxiedTokensManager.address],
            },
        })) as unknown as AgglayerBridgeL2;
    });

    it('Should migrate from a legacy token to a new upgradeable token, make a claim and migrate legacy tokens', async () => {
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContract.target;
        const amount = 1000;
        const legacyTokenAddress = await sovereignBridgeContract.tokenInfoToWrappedToken(
            ethers.solidityPackedKeccak256(['uint32', 'address'], [originNetwork, tokenAddress]),
        );

        // Deploy proxied token
        await expect(
            sovereignBridgeContract.deployWrappedTokenAndRemap(originNetwork, tokenAddress, false),
        ).to.be.revertedWithCustomError(sovereignBridgeContract, 'OnlyBridgeManager');

        // Try to deploy a gas token at a gas token network
        await expect(
            gasTokenBridgeContract
                .connect(bridgeManager)
                .deployWrappedTokenAndRemap(originNetwork, tokenAddress, false),
        ).to.be.revertedWithCustomError(gasTokenBridgeContract, 'TokenNotMapped');

        // Deploy weth for a gas token network
        const proxiedTokenAddressWETH = await computeWrappedTokenProxyAddress(
            originNetwork,
            ethers.ZeroAddress,
            gasTokenBridgeContract,
            true,
        );
        await expect(
            gasTokenBridgeContract
                .connect(bridgeManager)
                .deployWrappedTokenAndRemap(originNetwork, ethers.ZeroAddress, false),
        )
            .to.emit(gasTokenBridgeContract, 'SetSovereignWETHAddress')
            .withArgs(proxiedTokenAddressWETH, false);

        const proxiedTokenAddress = await computeWrappedTokenProxyAddress(
            originNetwork,
            tokenAddress,
            sovereignBridgeContract,
            false,
        );

        await expect(
            sovereignBridgeContract
                .connect(bridgeManager)
                .deployWrappedTokenAndRemap(originNetwork, tokenAddress, false),
        )
            .to.emit(sovereignBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(originNetwork, tokenAddress, proxiedTokenAddress, false);

        expect(
            await sovereignBridgeContract.tokenInfoToWrappedToken(
                ethers.solidityPackedKeccak256(['uint32', 'address'], [originNetwork, tokenAddress]),
            ),
        ).to.be.equal(proxiedTokenAddress);

        // Check balance of proxied token
        const proxyWrappedAddressContract = maticTokenFactory.attach(proxiedTokenAddress) as ERC20PermitMock;
        expect(await proxyWrappedAddressContract.balanceOf(receiver.address)).to.be.equal(0);
        // Check balance of legacy token
        const legacyWrappedAddressContract = maticTokenFactory.attach(legacyTokenAddress) as ERC20PermitMock;
        expect(await legacyWrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Make a claim to the new deployed proxy token
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET,
        );
        expect(await proxyWrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Migrate tokens from legacy token to new proxied token
        await expect(sovereignBridgeContract.connect(receiver).migrateLegacyToken(legacyTokenAddress, amount, '0x'))
            .to.emit(sovereignBridgeContract, 'MigrateLegacyToken')
            .withArgs(receiver.address, legacyTokenAddress, proxiedTokenAddress, amount);

        // Check amounts after migration
        expect(await proxyWrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount * 2);
        expect(await legacyWrappedAddressContract.balanceOf(receiver.address)).to.be.equal(0);
    });

    it('Should deploy a bridge and claim asset in different chains with different arguments and check address is the same', async () => {
        // Deploy bridge 1 with upgradeable tokens
        const sovBridgeFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignBridgeContract = (await upgrades.deployProxy(sovBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as BridgeL2SovereignChainPessimistic;

        // Make snapshot
        const snapshot = await takeSnapshot();

        await sovereignBridgeContract.initialize(
            networkIDRollup,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignGERContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // Get bridge proxy implementation address
        const bridgeImplementationAddress = await upgrades.erc1967.getImplementationAddress(
            sovereignBridgeContract.target,
        );

        // Make a claim to deploy a wtoken
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContractUpgradeable.target;
        const amount = 1000;
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET,
        );
        const wrappedTokenProxyAddress1 = await sovereignBridgeContract.computeTokenProxyAddress(
            originNetwork,
            tokenAddress,
        );
        // Check correct balance after claim
        const wrappedAddressContract = maticTokenFactory.attach(wrappedTokenProxyAddress1) as ERC20PermitMock;
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Restore snapshot and initialize with different params
        await snapshot.restore();

        await sovereignBridgeContract.initialize(
            networkIDRollup,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignGERContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager2),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // Make a claim to deploy a wtoken
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET,
        );
        const wrappedTokenProxyAddress2 = await sovereignBridgeContract.computeTokenProxyAddress(
            originNetwork,
            tokenAddress,
        );

        // Check correct balance after claim
        const wrappedAddressContract2 = maticTokenFactory.attach(wrappedTokenProxyAddress2) as ERC20PermitMock;
        expect(await wrappedAddressContract2.balanceOf(receiver.address)).to.be.equal(amount);

        expect(wrappedTokenProxyAddress1).to.be.equal(wrappedTokenProxyAddress2);

        // Restore and retry but upgrading the bridge to force a different wrapped token implementation address
        await snapshot.restore();
        await sovereignBridgeContract.initialize(
            networkIDRollup,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignGERContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );
        const wrappedTokenImplementationAddress = await sovereignBridgeContract.getWrappedTokenBridgeImplementation();
        // Upgrade proxy
        sovereignBridgeContract = (await upgrades.upgradeProxy(sovereignBridgeContract.target, sovBridgeFactory, {
            unsafeAllow: ['constructor', 'missing-initializer-call', 'missing-initializer'],
            redeployImplementation: 'always',
        })) as unknown as AgglayerBridgeL2;

        const bridgeImplementationAddress2 = await upgrades.erc1967.getImplementationAddress(
            sovereignBridgeContract.target,
        );

        expect(bridgeImplementationAddress).to.be.not.equal(bridgeImplementationAddress2);

        const wrappedTokenImplementationAddress2 = await sovereignBridgeContract.getWrappedTokenBridgeImplementation();
        expect(wrappedTokenImplementationAddress).to.be.not.equal(wrappedTokenImplementationAddress2);

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET,
        );
        const wrappedTokenProxyAddress3 = await sovereignBridgeContract.computeTokenProxyAddress(
            originNetwork,
            tokenAddress,
        );
        // Check correct balance after claim
        const wrappedAddressContract3 = maticTokenFactory.attach(wrappedTokenProxyAddress3) as ERC20PermitMock;
        expect(await wrappedAddressContract3.balanceOf(receiver.address)).to.be.equal(amount);
        expect(wrappedTokenProxyAddress1).to.be.equal(wrappedTokenProxyAddress3);
    });

    it('Should perform a migration from a legacy token to an upgradeable token', async () => {
        // Call function to deploy upgradeable token
        // const wrappedTokenProxyAddress = await sovereignBridgeContract.connect(bridgeManager).deployWrappedToken()
        // Remap te legacy token to the upgradeable token
        // Migrated the previous claimed tokens
        // Check balances
    });

    it('Should make a claim to a legacy token and check no new address is created', async () => {
        const nonceBefore = await ethers.provider.getTransactionCount(sovereignBridgeContract.target);

        // Should make claim of a token
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContract.target;
        const amount = 1000;
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET++,
        );

        // Check legacy token amount of destination has doubled
        const tokenInfo = ethers.solidityPackedKeccak256(['uint32', 'address'], [originNetwork, tokenAddress]);
        const wrappedTokenLegacyAddress = await sovereignBridgeContract.tokenInfoToWrappedToken(tokenInfo);
        const wrappedAddressContract = maticTokenFactory.attach(wrappedTokenLegacyAddress) as ERC20PermitMock;
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount * 2);

        // Check nonce after and before is the same so no contract has been deployed
        const nonceAfter = await ethers.provider.getTransactionCount(sovereignBridgeContract.target);
        expect(nonceAfter).to.be.equal(nonceBefore);
    });

    it('Should make a claim to an upgradeable token', async () => {
        const nonceBefore = await ethers.provider.getTransactionCount(sovereignBridgeContract.target);
        // Should make claim of an upgradeable token
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContractUpgradeable.target;
        const amount = 1000;
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET++,
        );
        const precalculatedWrappedAddress = await sovereignBridgeContract.computeTokenProxyAddress(
            originNetwork,
            tokenAddress,
        );

        // Check correct balance after claim
        const wrappedAddressContract = maticTokenFactory.attach(precalculatedWrappedAddress) as ERC20PermitMock;
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Check nonce increased after deploying new token
        const nonceAfter = await ethers.provider.getTransactionCount(sovereignBridgeContract.target);
        expect(nonceAfter).to.be.equal(nonceBefore + 1);
    });

    it('Should perform an upgrade to an upgradeable token and make a claim', async () => {
        // Make a claim of the wrapped token
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContractUpgradeable.target;
        const amount = 1000;
        const destinationNetwork = networkIDRollup;
        const destinationAddress = receiver.address;
        const metadata = metadataToken;
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET++,
        );

        // Check balance
        const precalculatedWrappedAddress = await sovereignBridgeContract.computeTokenProxyAddress(
            originNetwork,
            tokenAddress,
        );

        const wrappedAddressContract = maticTokenFactory.attach(
            precalculatedWrappedAddress,
        ) as TokenWrappedBridgeUpgradeable;
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Upgrade upgradeable token, from matic to upgradeable matic
        // Deploy new implementation
        const wrappedTokenFactory = await ethers.getContractFactory('TokenWrappedBridgeUpgradeable');
        const wrappedTokenNewImplementation = await wrappedTokenFactory.deploy();
        // Upgrade the implementation
        const proxyFactory = await ethers.getContractFactory('TokenWrappedTransparentProxy');
        const wrappedTokenProxy = proxyFactory.attach(precalculatedWrappedAddress) as TokenWrappedTransparentProxy;

        await wrappedTokenProxy.connect(proxiedTokensManager).upgradeTo(wrappedTokenNewImplementation.target);

        expect(await wrappedAddressContract.name()).to.be.equal(tokenName);
        expect(await wrappedAddressContract.symbol()).to.be.equal(tokenSymbol);
        expect(await wrappedAddressContract.decimals()).to.be.equal(decimals);
        // expect(await wrappedAddressContract.bridgeAddress()).to.be.equal(sovereignBridgeContract.target);

        // Check balance again
        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount);

        // Make a second claim with the new upgraded token implementation
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignGERContract,
            sovereignBridgeContract,
            polTokenContract,
            indexLET++,
        );

        expect(await wrappedAddressContract.balanceOf(receiver.address)).to.be.equal(amount * 2);
    });
});
