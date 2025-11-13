import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import {
    ERC20PermitMock,
    GlobalExitRootManagerL2SovereignChain,
    BridgeL2SovereignChain,
    BridgeL2SovereignChainV1010,
} from '../../typechain-types';
import { claimBeforeBridge, createClaimAndAddGER } from './helpers/helpers-sovereign-bridge';

describe('BridgeL2SovereignChain: LBT & upgrade', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: BridgeL2SovereignChain;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRootContract: GlobalExitRootManagerL2SovereignChain;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
    let emergencyBridgePauser: any;
    let proxiedTokensManager: any;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.MaxUint256;
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );
    const networkIDMainnet = 0;
    const networkIDRollup2 = 2;

    const LEAF_TYPE_ASSET = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager, , bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();
        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);
        // deploy BridgeL2SovereignChain
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('BridgeL2SovereignChainPessimistic');
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as BridgeL2SovereignChain;

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory(
            'GlobalExitRootManagerL2SovereignChain',
        );
        sovereignChainGlobalExitRootContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [deployer.address, deployer.address], // Initializer params
            {
                initializer: 'initialize', // initializer function name
                constructorArgs: [sovereignChainBridgeContract.target], // Constructor arguments
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            },
        )) as unknown as GlobalExitRootManagerL2SovereignChain;

        // cannot initialize bridgeV2 initializer from Sovereign bridge
        await expect(
            sovereignChainBridgeContract['initialize(uint32,address,uint32,address,address,bytes)'](
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                '0x',
            ),
        ).to.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidInitializeFunction');

        await sovereignChainBridgeContract.initialize(
            networkIDRollup2,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignChainGlobalExitRootContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(bridgeManager),
            ethers.ZeroAddress,
            false,
        );

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
    });

    it('Should test upgrade to BridgeL2SovereignChain', async () => {
        // load correct contract interface
        const BridgeL2SovereignChainFactoryNew = await ethers.getContractFactory('BridgeL2SovereignChainV1010');
        sovereignChainBridgeContract = BridgeL2SovereignChainFactoryNew.attach(
            sovereignChainBridgeContract.target,
        ) as BridgeL2SovereignChainV1010;

        // get new version
        const newBridgeL2SovereignChainFactory = await ethers.getContractFactory('BridgeL2SovereignChainV1010');

        await upgrades.upgradeProxy(sovereignChainBridgeContract.target, newBridgeL2SovereignChainFactory, {
            unsafeAllow: ['constructor', 'missing-initializer-call', 'missing-initializer'],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
        });

        // call invalid legacy initialize function
        await expect(
            sovereignChainBridgeContract['initialize(uint32,address,uint32,address,address,bytes)'](
                networkIDMainnet,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                '0x',
            ),
        ).to.be.revertedWith('Initializable: contract is already initialized');

        // call invalid initial deployment initialize function
        await expect(
            sovereignChainBridgeContract.initialize(
                networkIDRollup2,
                ethers.ZeroAddress, // zero for ether
                ethers.ZeroAddress, // zero for ether
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                '0x',
                ethers.Typed.address(bridgeManager),
                ethers.ZeroAddress,
                false,
                emergencyBridgePauser.address,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidInitializeFunction');

        // call correct initialize function: InputArraysLengthMismatch error
        const arrayTokeInfoHash = [ethers.ZeroHash, ethers.ZeroHash];
        const arrayAmount = [0, 0, 0];
        await expect(
            sovereignChainBridgeContract.initialize(
                arrayTokeInfoHash,
                arrayAmount,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InputArraysLengthMismatch');

        // call correct initialize function: InputArraysLengthMismatch error
        const arrayTokeInfoHashOk = [ethers.randomBytes(32), ethers.randomBytes(32)];
        const arrayAmountOk = [11, 22];
        await expect(
            sovereignChainBridgeContract.initialize(
                arrayTokeInfoHashOk,
                arrayAmountOk,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'SetInitialLocalBalanceTreeAmount')
            .withArgs(arrayTokeInfoHashOk[0], arrayAmountOk[0])
            .to.emit(sovereignChainBridgeContract, 'SetInitialLocalBalanceTreeAmount')
            .withArgs(arrayTokeInfoHashOk[1], arrayAmountOk[1]);
    });

    it('LBT overflow', async () => {
        // load correct contract interface
        const BridgeL2SovereignChainFactoryNew = await ethers.getContractFactory('BridgeL2SovereignChainV1010');
        sovereignChainBridgeContract = BridgeL2SovereignChainFactoryNew.attach(
            sovereignChainBridgeContract.target,
        ) as BridgeL2SovereignChain;

        // get new version
        const newBridgeL2SovereignChainFactory = await ethers.getContractFactory('BridgeL2SovereignChainV1010');

        await upgrades.upgradeProxy(sovereignChainBridgeContract.target, newBridgeL2SovereignChainFactory, {
            unsafeAllow: ['constructor', 'missing-initializer-call', 'missing-initializer'],
            unsafeAllowRenames: true,
            unsafeAllowCustomTypes: true,
            unsafeSkipStorageCheck: true,
        });

        // Initialize bridge
        await sovereignChainBridgeContract.initialize(
            [],
            [],
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );
        // claim before bridge
        const originNetwork = 0; // mainnet
        const tokenAddress = polTokenContract.target;
        const amount = ethers.MaxUint256;
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        // check LBT balance
        const tokenInfoHash = await ethers.solidityPackedKeccak256(
            ['uint32', 'address'],
            [originNetwork, tokenAddress],
        );
        const balance = await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash);
        expect(balance).to.be.equal(amount);

        // do a remapping
        const amount2 = ethers.parseEther('1');
        const tokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const newToken = await tokenFactory.deploy(tokenName, tokenSymbol, deployer.address, amount2);

        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress([originNetwork], [tokenAddress], [newToken.target], [false]);

        // try to claim again
        const res = await createClaimAndAddGER(
            LEAF_TYPE_ASSET,
            originNetwork, // originNetwork
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount2,
            metadata,
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            newToken,
            1,
        );

        // claim
        await expect(
            sovereignChainBridgeContract.claimAsset(
                res.proofLocal,
                res.proofRollup,
                res.globalIndex,
                res.mainnetLER,
                res.rootRollupsLERS,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount2,
                metadata,
            ),
        )
            .to.be.revertedWithCustomError(sovereignChainBridgeContract, 'LocalBalanceTreeOverflow')
            .withArgs(originNetwork, tokenAddress, amount2, amount);
    });
});
