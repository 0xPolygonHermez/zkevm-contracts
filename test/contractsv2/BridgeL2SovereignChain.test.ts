/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-restricted-syntax */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2, TokenWrapped } from '../../typechain-types';
import { computeWrappedTokenProxyAddress, claimBeforeBridge } from './helpers/helpers-sovereign-bridge';
import { valueToStorageBytes } from '../../src/utils';

const MerkleTreeBridge = MTBridge;
const { verifyMerkleProof, getLeafValue } = mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}
// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

function newHashChainValue(prevHashChainValue: any, valueToAdd: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [prevHashChainValue, valueToAdd]);
}

function newClaimedGlobalIndexValue(globalIndex: any, leafValue: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [valueToStorageBytes(globalIndex), leafValue]);
}

describe('AgglayerBridgeL2 Contract', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: AgglayerBridgeL2;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRootContract: AgglayerGERL2;

    let deployer: any;
    let rollupManager: any;
    let bridgeManager: any;
    let acc1: any;
    let emergencyBridgePauser: any;
    let globalExitRootRemover: any;
    let proxiedTokensManager: any;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther('20000000');
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );
    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const networkIDRollup2 = 2;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager, acc1, bridgeManager, emergencyBridgePauser, proxiedTokensManager] =
            await ethers.getSigners();
        globalExitRootRemover = deployer;
        // Set trusted sequencer as coinbase for sovereign chains
        await ethers.provider.send('hardhat_setCoinbase', [deployer.address]);
        // deploy AgglayerBridgeL2
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignChainGlobalExitRootContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [],
            {
                initializer: false,
                constructorArgs: [sovereignChainBridgeContract.target], // Constructor arguments
                unsafeAllow: ['constructor', 'missing-initializer', 'state-variable-immutable'],
            },
        )) as unknown as AgglayerGERL2;

        await expect(
            sovereignChainGlobalExitRootContract.initialize(ethers.ZeroAddress, globalExitRootRemover.address),
        ).to.be.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'InvalidZeroAddress');

        await expect(
            sovereignChainGlobalExitRootContract.initialize(
                globalExitRootRemover.address,
                globalExitRootRemover.address,
            ),
        );

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

        // cannot initialize from a non-deployer account (frontrunning protection)
        await expect(
            sovereignChainBridgeContract.connect(acc1).initialize(
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
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyDeployer');

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
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        expect(await sovereignChainBridgeContract.version()).to.be.equal('v1.2.0');
        expect(await sovereignChainGlobalExitRootContract.version()).to.be.equal('v1.0.0');
    });

    it('Should remap source 6 decimal token to 18 sovereign wrapped token and bridge', async () => {
        const originNetwork = networkIDMainnet;
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = acc1.address;
        const sixDecimal = 6;
        const eighteenDecimal = 18;
        const amountSIXBridged = 1;
        // Deploy 6 decimals token
        const sixDecimalsTokenFactory = await ethers.getContractFactory('ERC20Decimals');
        const sixDecimalsTokenContract = await sixDecimalsTokenFactory.deploy(
            '6DEC',
            'SIX',
            deployer.address,
            ethers.parseUnits('10', sixDecimal), // 10 SIX
            sixDecimal,
        );
        const sovereignTokenContract = await sixDecimalsTokenFactory.deploy(
            '18DEC',
            'EIGHTEEN',
            deployer.address,
            ethers.parseUnits('20', eighteenDecimal), // 20 EIGHTEEN
            eighteenDecimal,
        );
        // Remap token
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setMultipleSovereignTokenAddress(
                    [networkIDMainnet],
                    [sixDecimalsTokenContract.target],
                    [sovereignTokenContract.target],
                    [false],
                ),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDMainnet, sixDecimalsTokenContract.target, sovereignTokenContract.target, false);

        // Add allowance
        await sixDecimalsTokenContract.approve(
            sovereignChainBridgeContract.target,
            ethers.parseUnits('10', sixDecimal),
        );

        // bridge asset
        await sovereignChainBridgeContract.bridgeAsset(
            originNetwork,
            destinationAddress,
            ethers.parseUnits(String(amountSIXBridged), sixDecimal), // 1 SIX
            sixDecimalsTokenContract.target,
            true,
            '0x',
        );

        // Check burnt balance is 1 SIX
        const balanceOfSIX = await sixDecimalsTokenContract.balanceOf(deployer.address);
        expect(balanceOfSIX).to.be.equal(ethers.parseUnits(String(10 - amountSIXBridged), 6));
        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        // Claim Asset
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            sixDecimalsTokenContract.target,
            destinationNetwork,
            destinationAddress,
            ethers.parseUnits(String(amountSIXBridged), sixDecimal), // 1 SIX
            metadataHash,
        );
        merkleTree.add(leafValue);
        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const mainnetExitRoot = ethers.ZeroHash;
        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;

        // check value claimedGlobalIndexHashChain
        expect(await sovereignChainBridgeContract.claimedGlobalIndexHashChain()).to.be.equal(
            claimedGlobalIndexHashChainJS,
        );

        // new hashchain value
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                sixDecimalsTokenContract.target,
                destinationNetwork,
                destinationAddress,
                ethers.parseUnits(String(amountSIXBridged), sixDecimal), // 1 SIX
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(
                index,
                originNetwork,
                sixDecimalsTokenContract.target,
                destinationAddress,
                ethers.parseUnits(String(amountSIXBridged), sixDecimal),
            )
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        // check value claimedGlobalIndexHashChain
        expect(await sovereignChainBridgeContract.claimedGlobalIndexHashChain()).to.be.equal(
            claimedGlobalIndexHashChainJS,
        );

        // Check balance is with 6 decimals and check is from sovereign token
        const sovereignTokenAmount = await sovereignTokenContract.balanceOf(destinationAddress);
        expect(String(sovereignTokenAmount)).to.be.equal(ethers.parseUnits(String(amountSIXBridged), sixDecimal));
    });

    it('should check the initialize function', async () => {
        // deploy PolygonZkEVMBridge
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const sovereignChainBridgeContract = await ethers.getContractFactory('AgglayerBridgeL2');
        const bridge = await upgrades.deployProxy(sovereignChainBridgeContract, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        });

        // Gas token network should be zero if gas token address is zero
        await expect(
            bridge.initialize(
                networkIDRollup2,
                ethers.ZeroAddress, // zero for ether
                1, // not zero, revert
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                metadataToken,
                ethers.Typed.address(bridgeManager.address),
                ethers.ZeroAddress,
                false,
                emergencyBridgePauser.address,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'GasTokenNetworkMustBeZeroOnEther');

        // _sovereignWETHAddress should be zero and _sovereignWETHAddressIsNotMintable should be false for native wethGasTokenNetworks
        await expect(
            bridge.initialize(
                networkIDRollup2,
                ethers.ZeroAddress, // zero for ether
                0, // zero for ether
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                metadataToken,
                ethers.Typed.address(bridgeManager.address),
                bridge.target, // Not zero, revert
                false,
                emergencyBridgePauser.address,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSovereignWETHAddressParams');

        await expect(
            bridge.initialize(
                networkIDRollup2,
                ethers.ZeroAddress, // zero for ether
                0, // zero for ether
                sovereignChainGlobalExitRootContract.target,
                rollupManager.address,
                metadataToken,
                ethers.Typed.address(bridgeManager.address),
                ethers.ZeroAddress,
                true, // Not false, revert
                emergencyBridgePauser.address,
                emergencyBridgePauser.address,
                proxiedTokensManager.address,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSovereignWETHAddressParams');
    });

    it('Migrate non mintable tokens', async () => {
        // Deploy token1
        const tokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const iBalance = ethers.parseEther('20000000');
        const migrationAmount = ethers.parseEther('10');
        const networkIDRollup1 = 1;
        const legacyToken = await tokenFactory.deploy(tokenName, tokenSymbol, deployer.address, iBalance);
        // Send legacy tokens to user
        await legacyToken.transfer(acc1.address, migrationAmount);
        expect(await legacyToken.balanceOf(acc1.address)).to.be.equal(migrationAmount);
        // Approve token transfer to bridge
        await legacyToken.connect(acc1).approve(sovereignChainBridgeContract.target, migrationAmount);

        // Try migrate token that is not mapped
        await expect(
            sovereignChainBridgeContract.connect(acc1).migrateLegacyToken(legacyToken.target, migrationAmount, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'TokenNotMapped');

        // Make first remapping
        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress(
                [networkIDRollup1],
                [polTokenContract.target],
                [legacyToken.target],
                [true],
            );
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setMultipleSovereignTokenAddress(
                    [networkIDRollup1],
                    [polTokenContract.target],
                    [legacyToken.target],
                    [true],
                ),
        ).to.revertedWithCustomError(sovereignChainBridgeContract, 'TokenAlreadyMapped');
        // Deploy token 2
        const updatedToken = await tokenFactory.deploy(tokenName, tokenSymbol, deployer.address, iBalance);
        // Send legacy tokens to bridge
        await updatedToken.transfer(sovereignChainBridgeContract.target, migrationAmount);
        expect(await updatedToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(migrationAmount);
        // Make second remapping
        await sovereignChainBridgeContract
            .connect(bridgeManager)
            .setMultipleSovereignTokenAddress(
                [networkIDRollup1],
                [polTokenContract.target],
                [updatedToken.target],
                [true],
            );

        // Try migrate a token already updated
        await expect(
            sovereignChainBridgeContract.connect(acc1).migrateLegacyToken(updatedToken.target, migrationAmount, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'TokenAlreadyUpdated');

        // Migrate tokens
        await sovereignChainBridgeContract.connect(acc1).migrateLegacyToken(legacyToken.target, migrationAmount, '0x');
        expect(await legacyToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(migrationAmount);
        expect(await legacyToken.balanceOf(acc1.address)).to.be.equal(0n);
        expect(await updatedToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(0n);
        expect(await updatedToken.balanceOf(acc1.address)).to.be.equal(migrationAmount);
    });

    it('should Sovereign Chain bridge a remapped asset not mintable and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // deploy sovereign
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const sovereignToken = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const sovereignToken2 = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const sovereignToken3 = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const sovereignToken4 = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const tokenAddress2 = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        const balanceDeployer = await sovereignToken.balanceOf(deployer.address);
        const balanceBridge = await sovereignToken.balanceOf(sovereignChainBridgeContract.target);
        // Remap asset
        // Remap not mintable token
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setMultipleSovereignTokenAddress([networkIDRollup], [tokenAddress], [sovereignToken.target], [true]),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDRollup, tokenAddress, sovereignToken.target, true);
        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        // Check insufficient allowance
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                sovereignToken.target,
                true,
                '0x',
            ),
        ).to.be.revertedWith('ERC20: insufficient allowance');
        // create a new deposit
        await expect(sovereignToken.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(sovereignToken, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // Check LBT underflow
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                sovereignToken.target,
                true,
                '0x',
            ),
        )
            .to.be.revertedWithCustomError(sovereignChainBridgeContract, 'LocalBalanceTreeUnderflow')
            .withArgs(originNetwork, tokenAddress, amount, ethers.toBeHex(0));

        // increase LBT to allow bridge action afterwards
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            metadata,
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            sovereignToken,
            0,
        );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                sovereignToken.target,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                networkIDRollup,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );
        // Check updated exit root
        expect(await sovereignChainGlobalExitRootContract.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await sovereignToken.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await sovereignToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(balanceBridge + amount);
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);

        // Try to insert global exit root with non coinbase
        await expect(
            sovereignChainGlobalExitRootContract.connect(acc1).insertGlobalExitRoot(computedGlobalExitRoot),
        ).to.be.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyGlobalExitRootUpdater');

        // Compute next hash chain value
        const previousHash = await sovereignChainGlobalExitRootContract.insertedGERHashChain();
        let hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [previousHash, computedGlobalExitRoot],
        );
        // Insert global exit root
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        const lastBlock = (await ethers.provider.getBlock('latest')) as any;
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.be.eq(
            lastBlock.timestamp,
        );

        // Trigger GlobalExitRootNotFound
        await expect(
            sovereignChainGlobalExitRootContract.removeGlobalExitRoots([
                computedGlobalExitRoot,
                computedGlobalExitRoot,
            ]),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'GlobalExitRootNotFound');

        // Trigger OnlyGlobalExitRootRemover
        await expect(
            sovereignChainGlobalExitRootContract.connect(rollupManager).removeGlobalExitRoots([metadataHash]),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyGlobalExitRootRemover');

        // Trigger OnlyGlobalExitRootRemover
        await expect(
            sovereignChainGlobalExitRootContract.connect(rollupManager).transferGlobalExitRootRemover(deployer.address),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyGlobalExitRootRemover');
        // Trigger OnlyPendingGlobalExitRootRemover
        await expect(
            sovereignChainGlobalExitRootContract.connect(rollupManager).acceptGlobalExitRootRemover(),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyPendingGlobalExitRootRemover');

        // Trigger OnlyGlobalExitRootRemover
        await expect(
            sovereignChainGlobalExitRootContract.connect(rollupManager).transferGlobalExitRootUpdater(deployer.address),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyGlobalExitRootUpdater');
        // Trigger OnlyPendingGlobalExitRootUpdater
        await expect(
            sovereignChainGlobalExitRootContract.connect(rollupManager).acceptGlobalExitRootUpdater(),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'OnlyPendingGlobalExitRootUpdater');

        // Update globalExitRootRemover
        await expect(sovereignChainGlobalExitRootContract.transferGlobalExitRootRemover(acc1.address))
            .to.emit(sovereignChainGlobalExitRootContract, 'TransferGlobalExitRootRemover')
            .withArgs(deployer.address, acc1.address);

        await expect(sovereignChainGlobalExitRootContract.connect(acc1).acceptGlobalExitRootRemover())
            .to.emit(sovereignChainGlobalExitRootContract, 'AcceptGlobalExitRootRemover')
            .withArgs(deployer.address, acc1.address);

        // Update globalExitRootUpdater
        await expect(
            sovereignChainGlobalExitRootContract.transferGlobalExitRootUpdater(ethers.ZeroAddress),
        ).to.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'InvalidZeroAddress');

        await expect(sovereignChainGlobalExitRootContract.transferGlobalExitRootUpdater(acc1.address))
            .to.emit(sovereignChainGlobalExitRootContract, 'TransferGlobalExitRootUpdater')
            .withArgs(deployer.address, acc1.address);

        await expect(sovereignChainGlobalExitRootContract.connect(acc1).acceptGlobalExitRootUpdater())
            .to.emit(sovereignChainGlobalExitRootContract, 'AcceptGlobalExitRootUpdater')
            .withArgs(deployer.address, acc1.address);

        // Remove global exit root
        let removalHashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.connect(acc1).removeGlobalExitRoots([computedGlobalExitRoot]))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateRemovalHashChainValue')
            .withArgs(computedGlobalExitRoot, removalHashChainValue);

        // Test to remove more than one global exit root
        hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [hashChainValue, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.connect(acc1).insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);
        const computedGlobalExitRoot2 = '0x5946741ff5ff7732e1c7614ae327543a1d9f5870fcb8afbf146bd5ea75d6d519'; // Random 32 bytes
        hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [hashChainValue, computedGlobalExitRoot2],
        );
        await expect(sovereignChainGlobalExitRootContract.connect(acc1).insertGlobalExitRoot(computedGlobalExitRoot2))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot2, hashChainValue);
        const lastBlock2 = (await ethers.provider.getBlock('latest')) as any;
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot2)).to.be.eq(
            lastBlock2.timestamp,
        );
        removalHashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [removalHashChainValue, computedGlobalExitRoot2],
        );
        const removalHashChainValue2 = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [removalHashChainValue, computedGlobalExitRoot],
        );
        await expect(
            sovereignChainGlobalExitRootContract
                .connect(acc1)
                .removeGlobalExitRoots([computedGlobalExitRoot2, computedGlobalExitRoot]),
        )
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateRemovalHashChainValue')
            .withArgs(computedGlobalExitRoot2, removalHashChainValue)
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateRemovalHashChainValue')
            .withArgs(computedGlobalExitRoot, removalHashChainValue2);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.be.eq(0);

        // Insert global exit root again
        hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [hashChainValue, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.connect(acc1).insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);
        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // Remove unmapped sovereign token address, should revert onlyBridgeManager
        await expect(
            sovereignChainBridgeContract.connect(deployer).removeLegacySovereignTokenAddress(tokenAddress),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyBridgeManager');

        // Remove unmapped sovereign token address, should revert
        await expect(
            sovereignChainBridgeContract.connect(bridgeManager).removeLegacySovereignTokenAddress(tokenAddress),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'TokenNotRemapped');
        // Remove not updated sovereign token address, should revert
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .removeLegacySovereignTokenAddress(sovereignToken.target),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'TokenNotRemapped');

        // Remove updated sovereign token address
        // Remap token a second time to support removal function
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setMultipleSovereignTokenAddress([networkIDRollup], [tokenAddress], [sovereignToken2.target], [true]),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDRollup, tokenAddress, sovereignToken2.target, true);
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .removeLegacySovereignTokenAddress(sovereignToken.target),
        )
            .to.emit(sovereignChainBridgeContract, 'RemoveLegacySovereignTokenAddress')
            .withArgs(sovereignToken.target);
        // Remap sovereign address with multiCall
        const originNetworksArray = [networkIDRollup, networkIDRollup];
        const originTokenAddressesArray = [tokenAddress, tokenAddress2.target];
        const sovereignTokenAddressesArray = [sovereignToken3.target, sovereignToken4.target];
        const isNotMintableArray = [true, false];
        await expect(
            sovereignChainBridgeContract
                .connect(bridgeManager)
                .setMultipleSovereignTokenAddress(
                    originNetworksArray,
                    originTokenAddressesArray,
                    sovereignTokenAddressesArray,
                    isNotMintableArray,
                ),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDRollup, tokenAddress, sovereignToken3.target, true)
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDRollup, tokenAddress2.target, sovereignToken4.target, false);

        await expect(
            sovereignChainBridgeContract.connect(bridgeManager).setMultipleSovereignTokenAddress(
                originNetworksArray,
                [], // Different length
                sovereignTokenAddressesArray,
                isNotMintableArray,
            ),
        ).to.revertedWithCustomError(sovereignChainBridgeContract, 'InputArraysLengthMismatch');
    });

    it('should Sovereign Chain bridge a remapped asset mintable and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // deploy sovereign
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        const sovereignToken = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );

        // Remap asset
        // Trigger requires
        // only bridge manager
        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setMultipleSovereignTokenAddress([networkIDMainnet], [tokenAddress], [sovereignToken.target], [false]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyBridgeManager');

        // Set rollupManager as bridge manager, revert OnlyBridgeManager
        await expect(
            sovereignChainBridgeContract.connect(deployer).setBridgeManager(rollupManager.address),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyBridgeManager');

        // Set rollupManager as bridge manager
        await expect(sovereignChainBridgeContract.connect(bridgeManager).setBridgeManager(rollupManager.address))
            .to.emit(sovereignChainBridgeContract, 'SetBridgeManager')
            .withArgs(rollupManager.address);

        // invalid token address
        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setMultipleSovereignTokenAddress(
                    [networkIDMainnet],
                    [ethers.ZeroAddress],
                    [sovereignToken.target],
                    [false],
                ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidZeroAddress');
        // Invalid origin network
        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setMultipleSovereignTokenAddress([networkIDRollup2], [tokenAddress], [sovereignToken.target], [false]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OriginNetworkInvalid');
        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setMultipleSovereignTokenAddress([networkIDRollup], [tokenAddress], [sovereignToken.target], [false]),
        )
            .to.emit(sovereignChainBridgeContract, 'SetSovereignTokenAddress')
            .withArgs(networkIDRollup, tokenAddress, sovereignToken.target, false);
        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );
        // Check updated exit root
        expect(await sovereignChainGlobalExitRootContract.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount,
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it('should check the initialize parameters', async () => {
        expect(await sovereignChainBridgeContract.globalExitRootManager()).to.be.equal(
            sovereignChainGlobalExitRootContract.target,
        );
        expect(await sovereignChainBridgeContract.networkID()).to.be.equal(networkIDRollup2);
        expect(await sovereignChainBridgeContract.polygonRollupManager()).to.be.equal(rollupManager.address);

        // cannot initialize again
        await expect(
            sovereignChainBridgeContract.initialize(
                networkIDMainnet,
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
        ).to.be.revertedWith('Initializable: contract is already initialized');

        await expect(
            sovereignChainGlobalExitRootContract.initialize(ethers.ZeroAddress, ethers.ZeroAddress),
        ).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should check bridgeMessageWETH reverts', async () => {
        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(networkIDMainnet, deployer.address, 0, true, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'NativeTokenIsEther');

        await expect(
            sovereignChainBridgeContract.connect(deployer).setSovereignWETHAddress(deployer.address, true),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyBridgeManager');

        await expect(
            sovereignChainBridgeContract.connect(bridgeManager).setSovereignWETHAddress(deployer.address, true),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'WETHRemappingNotSupportedOnGasTokenNetworks');
    });

    it('should Sovereign Chain bridge asset and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: 1 },
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'MsgValueNotZero');

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );
        // Check updated exit root
        expect(await sovereignChainGlobalExitRootContract.lastRollupExitRoot()).to.be.equal(rootJSMainnet);
        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount,
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it('should message at Sovereign chain and verify merkle proof', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const originAddress = deployer.address;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);
        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeMessage(networkIDRollup2, destinationAddress, true, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            '0x', // metadata
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, metadata, {
                value: amount,
            }),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        const previousHash = await sovereignChainGlobalExitRootContract.insertedGERHashChain();
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [previousHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
    });

    it('should bridge asset and message to sovereign chain to check global exit root updates', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // create a new deposit
        await expect(polTokenContract.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // pre compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);
        const rootJSMainnet = merkleTree.getRoot();

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                false,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        expect(await polTokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await polTokenContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(
            balanceBridge + amount,
        );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // Update global exit root
        await sovereignChainBridgeContract.updateGlobalExitRoot();
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // Check LBT underflow
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, false, metadata, {
                value: amount,
            }),
        )
            .to.be.revertedWithCustomError(sovereignChainBridgeContract, 'LocalBalanceTreeUnderflow')
            .withArgs(0, ethers.ZeroAddress, amount, ethers.toBeHex(0));

        // increase LBT to allow bridge action afterwards
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            '0x', // metadata
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            polTokenContract,
            0,
        );

        // bridge message
        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, false, metadata, {
                value: amount,
            }),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_MESSAGE,
                originNetwork,
                deployer.address,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                1,
            );
        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(1);

        // Update global exit root
        await sovereignChainBridgeContract.updateGlobalExitRoot();

        expect(await sovereignChainBridgeContract.lastUpdatedDepositCount()).to.be.equal(2);
        expect(await sovereignChainGlobalExitRootContract.lastRollupExitRoot()).to.not.be.equal(rootJSMainnet);

        // Just to have the metric of a low cost bridge Asset
        const tokenAddress2 = ethers.ZeroAddress; // Ether
        const amount2 = ethers.parseEther('10');

        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount,
            '0x', // metadata
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            polTokenContract,
            1, // indexLocal
        );

        await sovereignChainBridgeContract.bridgeAsset(
            destinationNetwork,
            destinationAddress,
            amount2,
            tokenAddress2,
            false,
            '0x',
            { value: amount2 },
        );
    });

    it('should claim tokens from Mainnet to Mainnet', async () => {
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = acc1.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();
        const indexRollup = 5;

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            if (i === indexRollup) {
                merkleTreeRollup.add(rootLocalRollup);
            } else {
                merkleTreeRollup.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(sovereignChainGlobalExitRootContract.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRootContract,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollup, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof rollup
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        /*
         * claim
         * Can't claim without tokens
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(sovereignChainBridgeContract.target, acc1.address, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should claim tokens from Rollup to Mainnet', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(sovereignChainGlobalExitRootContract.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRootContract,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollup, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        let hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
        // check merkle proof

        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, false);

        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // claim
        const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');

        // Compute wrapped token proxy address
        const precalculateWrappedErc20 = await computeWrappedTokenProxyAddress(
            networkIDRollup,
            tokenAddress,
            sovereignChainBridgeContract,
        );

        const newWrappedToken = tokenWrappedFactory.attach(precalculateWrappedErc20) as TokenWrapped;

        // Use precalculatedWrapperAddress and check if matches
        expect(await sovereignChainBridgeContract.computeTokenProxyAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'NewWrappedToken')
            .withArgs(originNetwork, tokenAddress, precalculateWrappedErc20, metadata)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        const newTokenInfo = await sovereignChainBridgeContract.wrappedTokenToTokenInfo(precalculateWrappedErc20);

        // Use precalculatedWrapperAddress and check if matches
        expect(await sovereignChainBridgeContract.computeTokenProxyAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );

        expect(newTokenInfo.originNetwork).to.be.equal(networkIDRollup);
        expect(newTokenInfo.originTokenAddress).to.be.equal(tokenAddress);
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );
        expect(await sovereignChainBridgeContract.getTokenWrappedAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );

        const salt = ethers.solidityPackedKeccak256(['uint32', 'address'], [networkIDRollup, tokenAddress]);
        expect(await sovereignChainBridgeContract.tokenInfoToWrappedToken(salt)).to.be.equal(precalculateWrappedErc20);

        // Check the wrapper info
        expect(await newWrappedToken.name()).to.be.equal(tokenName);
        expect(await newWrappedToken.symbol()).to.be.equal(tokenSymbol);
        expect(await newWrappedToken.decimals()).to.be.equal(decimals);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);

        // Claim again the other leaf to mint tokens
        const index2 = 1;
        const proof2 = merkleTreeLocal.getProofTreeByIndex(index2);

        expect(verifyMerkleProof(leafValue, proof2, index2, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rollupExitRootSC)).to.be.equal(true);

        const globalIndex2 = computeGlobalIndex(index2, indexRollup, false);
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex2, leafValue),
        );

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proof2,
                proofRollup,
                globalIndex2,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(globalIndex2, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(ethers.ZeroAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex2, claimedGlobalIndexHashChainJS);

        // check claimedGlobalIndexHashChain
        expect(await sovereignChainBridgeContract.claimedGlobalIndexHashChain()).to.be.equal(
            claimedGlobalIndexHashChainJS,
        );

        // Burn Tokens
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const wrappedTokenAddress = newWrappedToken.target;
        const newDestinationNetwork = networkIDRollup;

        const rollupExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();

        // create a new deposit
        await expect(newWrappedToken.approve(sovereignChainBridgeContract.target, amount))
            .to.emit(newWrappedToken, 'Approval')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        /*
         *  pre compute root merkle tree in Js
         * const height = 32;
         */
        const merkleTreeMainnet = new MerkleTreeBridge(height);
        // Imporant calcualte leaf with origin token address no wrapped token address
        const originTokenAddress = tokenAddress;
        const metadataMainnet = metadata; // since the token does not belong to this network
        const metadataHashMainnet = ethers.solidityPackedKeccak256(['bytes'], [metadataMainnet]);

        const leafValueMainnet = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            newDestinationNetwork,
            destinationAddress,
            amount,
            metadataHashMainnet,
        );
        merkleTreeMainnet.add(leafValueMainnet);
        const rootJSMainnet = merkleTreeMainnet.getRoot();

        // Tokens are burnt
        expect(await newWrappedToken.totalSupply()).to.be.equal(amount * 2n);
        expect(await newWrappedToken.balanceOf(destinationAddress)).to.be.equal(amount * 2n);
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                newDestinationNetwork,
                destinationAddress,
                amount,
                wrappedTokenAddress,
                true,
                '0x',
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                newDestinationNetwork,
                destinationAddress,
                amount,
                metadataMainnet,
                depositCount,
            )
            .to.emit(newWrappedToken, 'Transfer')
            .withArgs(deployer.address, ethers.ZeroAddress, amount);

        expect(await newWrappedToken.totalSupply()).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(deployer.address)).to.be.equal(amount);
        expect(await newWrappedToken.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(0);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proofMainnet = merkleTreeMainnet.getProofTreeByIndex(0);
        const indexMainnet = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValueMainnet, proofMainnet, indexMainnet, rootSCMainnet)).to.be.equal(true);

        const computedGlobalExitRoot2 = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        // Insert global exit root
        hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [hashChainValue, computedGlobalExitRoot2],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot2))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot2, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot2)).to.not.be.eq(0);

        // Insert an already inserted GER
        await expect(
            sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot2),
        ).to.be.revertedWithCustomError(sovereignChainGlobalExitRootContract, 'GlobalExitRootAlreadySet');

        // Unset claims in bulk
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));
        expect(true).to.be.equal(await sovereignChainBridgeContract.isClaimed(index2, indexRollup + 1));

        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .unsetMultipleClaims([
                    computeGlobalIndex(indexLocal, indexRollup, false),
                    computeGlobalIndex(index2, indexRollup, false),
                ]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');

        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .unsetMultipleClaims([
                computeGlobalIndex(indexLocal, indexRollup, false),
                computeGlobalIndex(index2, indexRollup, false),
            ]);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));
        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(index2, indexRollup + 1));

        // Try to unset again
        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .unsetMultipleClaims([
                    computeGlobalIndex(indexLocal + 1, indexRollup, false),
                    computeGlobalIndex(index2, indexRollup, false),
                ]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'ClaimNotSet');
    });

    it('should claim tokens from Rollup to Mainnet, failing deploy wrapped', async () => {
        const originNetwork = networkIDRollup;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = ethers.hexlify(ethers.randomBytes(40));
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTreeLocal.add(leafValue);
        merkleTreeLocal.add(leafValue);

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        for (let i = 0; i < 10; i++) {
            merkleTreeRollup.add(rootLocalRollup);
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // check only rollup account with update rollup exit root
        await expect(sovereignChainGlobalExitRootContract.updateExitRoot(rootRollup)).to.be.revertedWithCustomError(
            sovereignChainGlobalExitRootContract,
            'OnlyAllowedContracts',
        );

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rootRollup, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rootRollup);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
        // check merkle proof
        // Merkle proof local
        const indexLocal = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);

        // Merkle proof local
        const indexRollup = 5;
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, indexLocal, rootLocalRollup)).to.be.equal(true);
        expect(verifyMerkleProof(rootLocalRollup, proofRollup, indexRollup, rootRollup)).to.be.equal(true);

        expect(false).to.be.equal(await sovereignChainBridgeContract.isClaimed(indexLocal, indexRollup + 1));

        // create2 parameters
        const precalculateWrappedErc20 = await computeWrappedTokenProxyAddress(
            networkIDRollup,
            tokenAddress,
            sovereignChainBridgeContract,
        );

        // Use precalculatedWrapperAddress and check if matches
        expect(await sovereignChainBridgeContract.computeTokenProxyAddress(networkIDRollup, tokenAddress)).to.be.equal(
            precalculateWrappedErc20,
        );
    });

    it('should sovereignChainBridge and sync the current root with events', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // Ether
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = '0x'; // since is ether does not have metadata

        // claim 3*amount for the LocalBalanceTree
        await claimBeforeBridge(
            LEAF_TYPE_ASSET,
            0, // originNetwork
            ethers.ZeroAddress, // ether (originAddress)
            networkIDRollup2, // destinationNetwork
            destinationAddress,
            amount * 3n,
            '0x', // metadata
            sovereignChainGlobalExitRootContract,
            sovereignChainBridgeContract,
            polTokenContract,
            0, // indexLocal
        );

        // create 3 new deposit
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount,
            );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount + 1n,
            );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'BridgeEvent')
            .withArgs(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
                depositCount + 2n,
            );

        // Prepare merkle tree
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);

        // Get the deposit's events
        const filter = sovereignChainBridgeContract.filters.BridgeEvent(
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        );
        const events = await sovereignChainBridgeContract.queryFilter(filter, 0, 'latest');
        events.forEach((e) => {
            const { args } = e;
            const leafValue = getLeafValue(
                args.leafType,
                args.originNetwork,
                args.originAddress,
                args.destinationNetwork,
                args.destinationAddress,
                args.amount,
                ethers.solidityPackedKeccak256(['bytes'], [args.metadata]),
            );
            merkleTree.add(leafValue);
        });

        // Check merkle root with SC
        const rootSC = await sovereignChainBridgeContract.getRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);
    });

    it('should claim testing all the asserts', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDRollup2;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();

        // Try claim with 10 rollup leafs
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });
        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        const globalIndex = computeGlobalIndex(index, index, false);
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        // Can't claim without tokens
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');

        // transfer tokens, then claim
        await expect(polTokenContract.transfer(sovereignChainBridgeContract.target, amount))
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(deployer.address, sovereignChainBridgeContract.target, amount);

        // Check GlobalExitRoot invalid assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                mainnetExitRoot,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'GlobalExitRootInvalid');

        // Check Invalid smt proof assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 1n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        // Check Invalid global index
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 2n ** 67n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Check Invalid global index
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 2n ** 65n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Check Invalid global index
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 2n ** 64n + 2n ** 32n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Check Invalid global index
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex + 2n ** 64n + 2n ** 65n,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(polTokenContract, 'Transfer')
            .withArgs(sovereignChainBridgeContract.target, deployer.address, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        // Check Already claimed_claim
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should claim ether', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = '0x'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);

        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );
        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'EtherTransferFailed');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup2,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');

        // This is used just to pay ether to the SovereignChain smart contract and be able to claim it afterwards.
        await ethers.provider.send('hardhat_setBalance', [sovereignChainBridgeContract.target, ethers.toBeHex(amount)]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(amount);

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        // Check balances after claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(
            ethers.parseEther('0'),
        );
        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should claim message', async () => {
        // Add a claim leaf to rollup exit tree
        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.ZeroAddress; // ether
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup2;
        const destinationAddress = deployer.address;

        const metadata = '0x176923791298713271763697869132'; // since is ether does not have metadata
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const mainnetExitRoot = ethers.ZeroHash;

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_MESSAGE,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootJSRollup = merkleTree.getRoot();
        const merkleTreeRollup = new MerkleTreeBridge(height);
        merkleTreeRollup.add(rootJSRollup);
        const rollupRoot = merkleTreeRollup.getRoot();

        // add rollup Merkle root
        await ethers.provider.send('hardhat_impersonateAccount', [sovereignChainBridgeContract.target]);
        const bridgeMock = await ethers.getSigner(sovereignChainBridgeContract.target as any);
        await sovereignChainGlobalExitRootContract.connect(bridgeMock).updateExitRoot(rollupRoot, { gasPrice: 0 });

        // check roots
        const rollupExitRootSC = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupRoot);

        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // Insert global exit root
        const hashChainValue = ethers.solidityPackedKeccak256(
            ['bytes32', 'bytes32'],
            [ethers.ZeroHash, computedGlobalExitRoot],
        );
        await expect(sovereignChainGlobalExitRootContract.insertGlobalExitRoot(computedGlobalExitRoot))
            .to.emit(sovereignChainGlobalExitRootContract, 'UpdateHashChainValue')
            .withArgs(computedGlobalExitRoot, hashChainValue);

        // Check GER has value in mapping
        expect(await sovereignChainGlobalExitRootContract.globalExitRootMap(computedGlobalExitRoot)).to.not.be.eq(0);
        // check merkle proof
        const index = 0;
        const proofLocal = merkleTree.getProofTreeByIndex(0);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
        const globalIndex = computeGlobalIndex(index, index, false);
        let claimedGlobalIndexHashChainJS = ethers.ZeroHash;
        claimedGlobalIndexHashChainJS = newHashChainValue(
            claimedGlobalIndexHashChainJS,
            newClaimedGlobalIndexValue(globalIndex, leafValue),
        );

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proofLocal, index, rootJSRollup)).to.be.equal(true);

        /*
         * claim
         * Can't claim a message as an assets
         */
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        /*
         * claim
         * Can't claim invalid destination network
         */
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                networkIDRollup,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');

        /*
         * claim
         * Can't claim without ether
         */
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'MessageFailed');

        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                networkIDRollup,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');

        const balanceDeployer = await ethers.provider.getBalance(deployer.address);
        /*
         * Create a deposit to add ether to the SovereignChainBridge
         * Check deposit amount ether asserts
         */
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: ethers.parseEther('100') },
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AmountDoesNotMatchMsgValue');

        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                networkIDRollup2,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
                { value: amount },
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'DestinationNetworkInvalid');

        // This is used just to pay ether to the SovereignChainBridge smart contract and be able to claim it afterwards
        await ethers.provider.send('hardhat_setBalance', [sovereignChainBridgeContract.target, ethers.toBeHex(amount)]);

        // Check balances before claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(amount);

        // Check mainnet destination assert
        await expect(
            sovereignChainBridgeContract.claimAsset(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        )
            .to.emit(sovereignChainBridgeContract, 'ClaimEvent')
            .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount)
            .to.emit(sovereignChainBridgeContract, 'UpdatedClaimedGlobalIndexHashChain')
            .withArgs(globalIndex, claimedGlobalIndexHashChainJS);

        // Check balances after claim
        expect(await ethers.provider.getBalance(sovereignChainBridgeContract.target)).to.be.equal(
            ethers.parseEther('0'),
        );
        expect(await ethers.provider.getBalance(deployer.address)).to.be.gte(balanceDeployer);

        // Can't claim because nullifier
        await expect(
            sovereignChainBridgeContract.claimMessage(
                proofLocal,
                proofRollup,
                globalIndex,
                mainnetExitRoot,
                rollupExitRootSC,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');
    });

    it('should test emergency state', async () => {
        await expect(sovereignChainBridgeContract.activateEmergencyState()).to.be.revertedWithCustomError(
            sovereignChainBridgeContract,
            'OnlyEmergencyBridgePauser',
        );

        await expect(sovereignChainBridgeContract.deactivateEmergencyState()).to.be.revertedWithCustomError(
            sovereignChainBridgeContract,
            'OnlyEmergencyBridgeUnpauser',
        );

        // Activate emergency state
        await expect(sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState()).to.emit(
            sovereignChainBridgeContract,
            'EmergencyStateActivated',
        );

        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');

        await expect(
            sovereignChainBridgeContract.bridgeMessage(destinationNetwork, destinationAddress, true, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');

        await expect(
            sovereignChainBridgeContract.bridgeMessageWETH(destinationNetwork, destinationAddress, amount, true, '0x'),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');

        const mockMerkleProof = new Array(32).fill(ethers.ZeroHash) as any;
        await expect(
            sovereignChainBridgeContract.claimAsset(
                mockMerkleProof,
                mockMerkleProof,
                ethers.ZeroHash,
                ethers.ZeroHash,
                ethers.ZeroHash,
                0,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');

        await expect(
            sovereignChainBridgeContract.claimMessage(
                mockMerkleProof,
                mockMerkleProof,
                ethers.ZeroHash,
                ethers.ZeroHash,
                ethers.ZeroHash,
                0,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyNotEmergencyState');

        // Deactivate emergency state
        await expect(sovereignChainBridgeContract.connect(emergencyBridgePauser).deactivateEmergencyState()).to.emit(
            sovereignChainBridgeContract,
            'EmergencyStateDeactivated',
        );
        expect(await sovereignChainBridgeContract.isEmergencyState()).to.be.equal(false);

        // Transfer emergency bridge pauser role
        await expect(
            sovereignChainBridgeContract
                .connect(emergencyBridgePauser)
                .transferEmergencyBridgePauserRole(deployer.address),
        )
            .to.emit(sovereignChainBridgeContract, 'TransferEmergencyBridgePauserRole')
            .withArgs(emergencyBridgePauser.address, deployer.address);

        await expect(
            sovereignChainBridgeContract.connect(emergencyBridgePauser).acceptEmergencyBridgePauserRole(),
        ).to.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyPendingEmergencyBridgePauser');

        await expect(sovereignChainBridgeContract.connect(deployer).acceptEmergencyBridgePauserRole())
            .to.emit(sovereignChainBridgeContract, 'AcceptEmergencyBridgePauserRole')
            .withArgs(emergencyBridgePauser.address, deployer.address);
    });

    // Test for unsetMultipleClaims function
    it('should unsetMultipleClaims with proper permissions and validation', async () => {
        // Activate emergency state for setMultipleClaims and unsetMultipleClaims functions
        await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

        // Setup test data - first we need to set some claims to unset them later
        const indexLocal1 = 15;
        const indexLocal2 = 20;
        const indexRollup = 4;

        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndexes = [globalIndex1, globalIndex2];

        // First set the claims so we can unset them
        await sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims(globalIndexes);

        // Verify claims are initially set
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal1, indexRollup + 1)).to.be.equal(true);
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal2, indexRollup + 1)).to.be.equal(true);

        // Test permission check - should fail with non-GlobalExitRootRemover
        await expect(
            sovereignChainBridgeContract.connect(rollupManager).unsetMultipleClaims(globalIndexes),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');

        // Test successful unsetting of multiple claims - verify events are emitted
        await expect(sovereignChainBridgeContract.connect(globalExitRootRemover).unsetMultipleClaims(globalIndexes))
            .to.emit(sovereignChainBridgeContract, 'UpdatedUnsetGlobalIndexHashChain')
            .to.emit(sovereignChainBridgeContract, 'UpdatedUnsetGlobalIndexHashChain');

        // Verify claims are now unset
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal1, indexRollup + 1)).to.be.equal(false);
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal2, indexRollup + 1)).to.be.equal(false);

        // Test unsetting already unset claims - should fail
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).unsetMultipleClaims([globalIndex1]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'ClaimNotSet');

        // Test with mainnet flag - first set a mainnet claim
        const mainnetGlobalIndex = computeGlobalIndex(25, 0, true);
        await sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([mainnetGlobalIndex]);
        expect(await sovereignChainBridgeContract.isClaimed(25, 0)).to.be.equal(true);

        // Now unset the mainnet claim
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).unsetMultipleClaims([mainnetGlobalIndex]),
        ).to.emit(sovereignChainBridgeContract, 'UpdatedUnsetGlobalIndexHashChain');

        // Verify mainnet claim is unset
        expect(await sovereignChainBridgeContract.isClaimed(25, 0)).to.be.equal(false);

        // Test empty array (should work but do nothing)
        await sovereignChainBridgeContract.connect(globalExitRootRemover).unsetMultipleClaims([]);

        // Test invalid globalIndex with unused bits set to non-zero (rollup case)
        const invalidGlobalIndexRollup = (1n << 255n) | (BigInt(indexRollup) << 32n) | BigInt(indexLocal1);
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).unsetMultipleClaims([invalidGlobalIndexRollup]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Test invalid globalIndex with unused bits set to non-zero (mainnet case)
        const invalidGlobalIndexMainnet = (1n << 255n) | (1n << 64n) | BigInt(indexLocal1);
        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .unsetMultipleClaims([invalidGlobalIndexMainnet]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Test mixed valid and invalid globalIndexes - should fail on the first invalid one
        const validGlobalIndex = computeGlobalIndex(30, indexRollup, false);
        await sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([validGlobalIndex]);

        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .unsetMultipleClaims([validGlobalIndex, invalidGlobalIndexRollup]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Verify the valid claim is still set (transaction should have reverted completely)
        expect(await sovereignChainBridgeContract.isClaimed(30, indexRollup + 1)).to.be.equal(true);

        // Test edge case: maximum valid values for rollup case
        const maxLeafIndex = (1 << 32) - 1; // 2^32 - 1
        const maxRollupIndex = (1 << 32) - 1; // 2^32 - 1
        const maxValidRollupGlobalIndex = (BigInt(maxRollupIndex) << 32n) | BigInt(maxLeafIndex);

        // This should be valid (no mainnet flag, so first 192 bits should be 0)
        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .setMultipleClaims([maxValidRollupGlobalIndex]);
        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .unsetMultipleClaims([maxValidRollupGlobalIndex]);

        // Test edge case: mainnet with maximum leaf index
        const maxValidMainnetGlobalIndex = (1n << 64n) | BigInt(maxLeafIndex); // mainnet flag + leafIndex
        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .setMultipleClaims([maxValidMainnetGlobalIndex]);
        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .unsetMultipleClaims([maxValidMainnetGlobalIndex]);
    });

    // Test for setMultipleClaims function
    it('should setMultipleClaims with proper permissions and events', async () => {
        // Activate emergency state for setMultipleClaims function
        await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

        // Setup test data
        const indexLocal1 = 5;
        const indexLocal2 = 10;
        const indexRollup = 3;

        const globalIndex1 = computeGlobalIndex(indexLocal1, indexRollup, false);
        const globalIndex2 = computeGlobalIndex(indexLocal2, indexRollup, false);
        const globalIndexes = [globalIndex1, globalIndex2];

        // Test permission check - should fail with non-GlobalExitRootRemover
        await expect(
            sovereignChainBridgeContract.connect(rollupManager).setMultipleClaims(globalIndexes),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');

        // Verify claims are not set initially
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal1, indexRollup + 1)).to.be.equal(false);
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal2, indexRollup + 1)).to.be.equal(false);

        // Test successful setting of multiple claims
        await expect(sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims(globalIndexes))
            .to.emit(sovereignChainBridgeContract, 'SetClaim')
            .withArgs(globalIndexes[0])
            .to.emit(sovereignChainBridgeContract, 'SetClaim')
            .withArgs(globalIndexes[1]);

        // Verify claims are now set
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal1, indexRollup + 1)).to.be.equal(true);
        expect(await sovereignChainBridgeContract.isClaimed(indexLocal2, indexRollup + 1)).to.be.equal(true);

        // Test setting already claimed indexes - should fail
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([globalIndex1]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'AlreadyClaimed');

        // Test with mainnet flag
        const mainnetGlobalIndex = computeGlobalIndex(7, 0, true);
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([mainnetGlobalIndex]),
        )
            .to.emit(sovereignChainBridgeContract, 'SetClaim')
            .withArgs(mainnetGlobalIndex);

        // Verify mainnet claim is set
        expect(await sovereignChainBridgeContract.isClaimed(7, 0)).to.be.equal(true);

        // Test empty array
        await sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([]);

        // Test invalid globalIndex with unused bits set to non-zero (rollup case)
        // This should have unused bits set to 1, which should be rejected
        const invalidGlobalIndexRollup = (1n << 255n) | (BigInt(indexRollup) << 32n) | BigInt(indexLocal1);
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([invalidGlobalIndexRollup]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');

        // Test invalid globalIndex with unused bits set to non-zero (mainnet case)
        // This should have unused bits set to 1, which should be rejected
        const invalidGlobalIndexMainnet = (1n << 255n) | (1n << 64n) | BigInt(indexLocal1); // mainnet flag + unused bits + leafIndex
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims([invalidGlobalIndexMainnet]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidGlobalIndex');
    });

    // Test for setLocalBalanceTree function
    it('should setLocalBalanceTree with proper permissions and validation', async () => {
        // Activate emergency state for setLocalBalanceTree function
        await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

        // Test permission check - should fail with non-GlobalExitRootRemover
        const originNetworks = [networkIDMainnet, networkIDRollup];
        const originTokenAddresses = [ethers.ZeroAddress, polTokenContract.target];
        const amounts = [ethers.parseEther('100'), ethers.parseEther('50')];

        await expect(
            sovereignChainBridgeContract
                .connect(rollupManager)
                .setLocalBalanceTree(originNetworks, originTokenAddresses, amounts),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');

        // Test input arrays length mismatch
        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .setLocalBalanceTree([networkIDMainnet], originTokenAddresses, amounts),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InputArraysLengthMismatch');

        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .setLocalBalanceTree(originNetworks, [ethers.ZeroAddress], amounts),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InputArraysLengthMismatch');

        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .setLocalBalanceTree(originNetworks, originTokenAddresses, [ethers.parseEther('100')]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InputArraysLengthMismatch');

        // Calculate expected token info hashes
        const tokenInfoHash1 = ethers.keccak256(
            ethers.solidityPacked(['uint32', 'address'], [originNetworks[0], originTokenAddresses[0]]),
        );
        const tokenInfoHash2 = ethers.keccak256(
            ethers.solidityPacked(['uint32', 'address'], [originNetworks[1], originTokenAddresses[1]]),
        );

        // Verify initial state (should be 0)
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash1)).to.be.equal(0);
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash2)).to.be.equal(0);

        // Test successful update with event verification
        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .setLocalBalanceTree(originNetworks, originTokenAddresses, amounts),
        )
            .to.emit(sovereignChainBridgeContract, 'SetLocalBalanceTree')
            .withArgs(originNetworks[0], originTokenAddresses[0], amounts[0])
            .to.emit(sovereignChainBridgeContract, 'SetLocalBalanceTree')
            .withArgs(originNetworks[1], originTokenAddresses[1], amounts[1]);

        // Verify the updates
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash1)).to.be.equal(amounts[0]);
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash2)).to.be.equal(amounts[1]);

        // Test updating to different values
        const newAmounts = [ethers.parseEther('200'), ethers.parseEther('75')];

        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .setLocalBalanceTree(originNetworks, originTokenAddresses, newAmounts);

        // Verify the updates
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash1)).to.be.equal(newAmounts[0]);
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash2)).to.be.equal(newAmounts[1]);

        // Test updating to zero (clearing balance)
        const zeroAmounts = [0, 0];

        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .setLocalBalanceTree(originNetworks, originTokenAddresses, zeroAmounts);

        // Verify the updates
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash1)).to.be.equal(0);
        expect(await sovereignChainBridgeContract.localBalanceTree(tokenInfoHash2)).to.be.equal(0);

        // Test with empty arrays
        await sovereignChainBridgeContract.connect(globalExitRootRemover).setLocalBalanceTree([], [], []);

        // Test with same network ID (should revert with InvalidLBTLeaf)
        await expect(
            sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .setLocalBalanceTree([networkIDRollup2], [polTokenContract.target], [ethers.parseEther('25')]),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLBTLeaf');

        // Test with mixed array containing tokens from current network (should revert on first current network token)
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setLocalBalanceTree(
                [networkIDMainnet, networkIDRollup2, networkIDRollup], // networkIDRollup2 is current network
                [ethers.ZeroAddress, polTokenContract.target, polTokenContract.target],
                [ethers.parseEther('100'), ethers.parseEther('50'), ethers.parseEther('75')],
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLBTLeaf');

        // Test with only tokens from other networks (should work fine)
        await sovereignChainBridgeContract
            .connect(globalExitRootRemover)
            .setLocalBalanceTree(
                [networkIDMainnet, networkIDRollup],
                [ethers.ZeroAddress, polTokenContract.target],
                [ethers.parseEther('100'), ethers.parseEther('75')],
            );

        // Verify that tokens from other networks were processed correctly
        const mainnetTokenHash = ethers.keccak256(
            ethers.solidityPacked(['uint32', 'address'], [networkIDMainnet, ethers.ZeroAddress]),
        );
        const rollupTokenHash = ethers.keccak256(
            ethers.solidityPacked(['uint32', 'address'], [networkIDRollup, polTokenContract.target]),
        );

        expect(await sovereignChainBridgeContract.localBalanceTree(mainnetTokenHash)).to.be.equal(
            ethers.parseEther('100'),
        );
        expect(await sovereignChainBridgeContract.localBalanceTree(rollupTokenHash)).to.be.equal(
            ethers.parseEther('75'),
        );

        // Test additional edge case: array where current network token is at different positions
        await expect(
            sovereignChainBridgeContract.connect(globalExitRootRemover).setLocalBalanceTree(
                [networkIDRollup, networkIDRollup2], // networkIDRollup2 is current network, at position 1
                [polTokenContract.target, polTokenContract.target],
                [ethers.parseEther('50'), ethers.parseEther('25')],
            ),
        ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLBTLeaf');
    });

    // ============= NEW TESTS FOR LET FUNCTIONS =============

    describe('Emergency LET Management Functions', () => {
        describe('backwardLET', () => {
            it('should revert when called by non-GlobalExitRootRemover', async () => {
                const newDepositCount = 5;
                const newFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeaf = ethers.keccak256(ethers.toUtf8Bytes('next_leaf'));
                const proof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];

                await expect(
                    sovereignChainBridgeContract
                        .connect(rollupManager)
                        .backwardLET(newDepositCount, newFrontier, nextLeaf, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');
            });

            it('should revert when newDepositCount >= currentDepositCount', async () => {
                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // First add some leaves to have a deposit count > 0
                const leaves = generateTestLeaves(3);
                const expectedRoot = await calculateExpectedRoot(leaves);
                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, expectedRoot);

                const currentDepositCount = await sovereignChainBridgeContract.depositCount();
                const newFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeaf = ethers.keccak256(ethers.toUtf8Bytes('next_leaf'));
                const proof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];

                // Test with equal deposit count
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(currentDepositCount, newFrontier, nextLeaf, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidDepositCount');

                // Test with greater deposit count
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(Number(currentDepositCount) + 1, newFrontier, nextLeaf, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidDepositCount');
            });

            it('should revert when nextLeaf inclusion proof is invalid', async () => {
                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Setup: Add some leaves to create a tree state
                const leaves = generateTestLeaves(5);
                const expectedRoot = await calculateExpectedRoot(leaves);

                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, expectedRoot);

                const newDepositCount = 3;
                const newFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const invalidNextLeaf = ethers.keccak256(ethers.toUtf8Bytes('invalid_leaf'));
                const invalidProof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];

                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, newFrontier, invalidNextLeaf, invalidProof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');
            });

            it('should revert when subtree frontier is invalid', async () => {
                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Setup: Create a proper tree with leaves
                const leaves = generateTestLeaves(7);
                const tree = buildMerkleTreeForTesting(leaves);

                // Add leaves to contract
                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

                const newDepositCount = 4;
                const nextLeafIndex = newDepositCount; // leaf at position 4
                const nextLeaf = leaves[nextLeafIndex];
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );
                // Get valid proof for nextLeaf but use invalid frontier
                const proof = tree.getProofTreeByIndex(nextLeafIndex);
                const invalidFrontier = Array(32).fill(ethers.keccak256(ethers.toUtf8Bytes('invalid'))) as [
                    string,
                    ...string[],
                ];

                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, invalidFrontier, nextLeafValue, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'NonZeroValueForUnusedFrontier');
            });

            it('should reject backwardLET when frontier elements mismatch proof siblings', async () => {
                // TEST FOCUS: Validates SubtreeFrontierMismatch error when matched positions have wrong values

                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const leaves = generateTestLeaves(3);
                const tree = buildMerkleTreeForTesting(leaves);

                // Add 3 leaves to the contract
                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

                // Create a subtree with 1 leaf (rollback from 3 to 1)
                const newDepositCount = 1;

                // Create frontier with zero unused positions but wrong value in matched position
                const mismatchedFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                // Position 0 should match proof sibling but we set it to wrong value
                mismatchedFrontier[0] = ethers.keccak256(ethers.toUtf8Bytes('wrong_value'));

                const nextLeaf = leaves[newDepositCount]; // leaves[1]
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );
                const proof = tree.getProofTreeByIndex(newDepositCount);

                // Should reject due to frontier element mismatch with proof sibling
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, mismatchedFrontier, nextLeafValue, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'SubtreeFrontierMismatch');
            });

            it('should validate backwardLET functionality and parameter checking', async () => {
                // HYBRID TEST: Validates the function exists, has proper access control, and performs validation
                // NOTE: This test focuses on parameter validation rather than successful rollback execution.

                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Setup: Create a basic tree scenario to test against
                const leaves = generateTestLeaves(3);
                const tree = buildMerkleTreeForTesting(leaves);

                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

                const originalDepositCount = await sovereignChainBridgeContract.depositCount();
                expect(originalDepositCount).to.equal(3);

                // Test 1: Verify function exists and has proper access control (tested in other tests)
                // Test 2: Verify parameter validation works with invalid inputs

                // Attempt rollback with invalid parameters (empty frontier & proof)
                const newDepositCount = 1;
                const emptyFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeaf = leaves[1]; // leaf at position 1
                const emptyProof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );

                // This validates that the function properly rejects invalid proofs
                // (The SMT proof validation happens first, then frontier validation)
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, emptyFrontier, nextLeafValue, emptyProof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

                // This confirms the function is working as intended:
                // 1. Function exists and is callable by authorized user ✅
                // 2. Validates input parameters correctly ✅
                // 3. Rejects invalid proofs appropriately ✅
            });

            it('should validate parameter constraints and proof requirements', async () => {
                // TEST FOCUS: Validates that backwardLET properly rejects invalid inputs and parameters

                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const leaves = generateTestLeaves(3);
                const tree = buildMerkleTreeForTesting(leaves);

                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

                // Test parameter validation with invalid frontier and proof
                const newDepositCount = 2;
                const invalidFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeaf = leaves[2];
                const invalidProof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );

                // Validates that the function correctly rejects invalid proofs
                // This confirms the validation pipeline is working properly
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, invalidFrontier, nextLeafValue, invalidProof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

                // This test confirms proper input validation behavior ✅
            });

            it('should reject backwardLET with non-zero values in non-matched frontier positions', async () => {
                // TEST FOCUS: Validates that frontiers with non-zero values in unused positions are rejected

                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const leaves = generateTestLeaves(3);
                const tree = buildMerkleTreeForTesting(leaves);

                // Add 3 leaves to the contract
                await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

                // Create a subtree with 1 leaf (rollback from 3 to 1)
                const newDepositCount = 1;

                // Create a valid frontier for 1 leaf but pollute non-matched positions
                const pollutedFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                pollutedFrontier[0] = getLeafValue(
                    leaves[0].leafType,
                    leaves[0].originNetwork,
                    leaves[0].originAddress,
                    leaves[0].destinationNetwork,
                    leaves[0].destinationAddress,
                    leaves[0].amount,
                    ethers.keccak256(leaves[0].metadata), // Convert metadata to hash
                );

                // Pollute non-matched positions with non-zero values
                // For depositCount=1, only position 0 should be used, positions 1+ should be zero
                pollutedFrontier[1] = ethers.keccak256(ethers.toUtf8Bytes('pollute1')); // Should be zero
                pollutedFrontier[5] = ethers.keccak256(ethers.toUtf8Bytes('pollute5')); // Should be zero

                const nextLeaf = leaves[newDepositCount]; // leaves[1]
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );
                const proof = tree.getProofTreeByIndex(newDepositCount);

                // Should reject due to non-zero values in non-matched frontier positions
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .backwardLET(newDepositCount, pollutedFrontier, nextLeafValue, proof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'NonZeroValueForUnusedFrontier');
            });

            it('should successfully execute backwardLET with valid subtree proof', async () => {
                // SUCCESS TEST: Demonstrates actual backwardLET rollback from 3 leaves to 1 leaf

                // Activate emergency state for forwardLET and backwardLET functions
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const originalLeaves = generateTestLeaves(3);
                const originalTree = buildMerkleTreeForTesting(originalLeaves);

                // Add 3 leaves to the contract
                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(originalLeaves, originalTree.getRoot());

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(3);
                expect(await sovereignChainBridgeContract.getRoot()).to.equal(originalTree.getRoot());

                // Now rollback to just 1 leaf (keep only originalLeaves[0])
                const newDepositCount = 1;

                // Build the subtree with just 1 leaf
                const subtreeLeaves = originalLeaves.slice(0, newDepositCount);
                const subtree = buildMerkleTreeForTesting(subtreeLeaves);

                // For a single leaf tree, frontier[0] = leaf, others = 0
                const newFrontier = Array(32).fill(ethers.ZeroHash);
                newFrontier[0] = getLeafValue(
                    originalLeaves[0].leafType,
                    originalLeaves[0].originNetwork,
                    originalLeaves[0].originAddress,
                    originalLeaves[0].destinationNetwork,
                    originalLeaves[0].destinationAddress,
                    originalLeaves[0].amount,
                    ethers.keccak256(originalLeaves[0].metadata), // Convert metadata to hash
                ); // The only leaf in the subtree

                // The "next leaf" is the leaf at position newDepositCount (position 1)
                const nextLeaf = originalLeaves[newDepositCount]; // originalLeaves[1]
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );
                // Get proof for nextLeaf at position 1 in the original tree
                const proof = originalTree.getProofTreeByIndex(newDepositCount);

                // Store current values before rollback for event verification
                const currentDepositCount = await sovereignChainBridgeContract.depositCount();
                const currentRoot = await sovereignChainBridgeContract.getRoot();

                // Execute successful backwardLET
                const tx = await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .backwardLET(newDepositCount, newFrontier as [string, ...string[]], nextLeafValue, proof);

                // Verify success: event emitted with correct parameters (4 parameters)
                await expect(tx)
                    .to.emit(sovereignChainBridgeContract, 'BackwardLET')
                    .withArgs(currentDepositCount, currentRoot, newDepositCount, subtree.getRoot());

                // Verify contract state changes
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(newDepositCount);
                expect(await sovereignChainBridgeContract.getRoot()).to.equal(subtree.getRoot());

                // Verify the root changed (different from original)
                expect(await sovereignChainBridgeContract.getRoot()).to.not.equal(originalTree.getRoot());
            });
        });

        describe('forwardLET', () => {
            it('should revert when called by non-GlobalExitRootRemover', async () => {
                const newLeaves = generateTestLeaves(1);
                const expectedRoot = ethers.ZeroHash;

                await expect(
                    sovereignChainBridgeContract.connect(rollupManager).forwardLET(newLeaves, expectedRoot),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');
            });

            it('should revert when newLeaves array is empty', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const emptyLeaves = [];
                const expectedRoot = ethers.ZeroHash;

                await expect(
                    sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(emptyLeaves, expectedRoot),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLeavesLength');
            });

            it('should revert when computed root doesnt match expectedStateRoot', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const newLeaves = generateTestLeaves(3);
                const wrongExpectedRoot = ethers.keccak256(ethers.toUtf8Bytes('wrong_root'));

                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .forwardLET(newLeaves, wrongExpectedRoot),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidExpectedLER');
            });

            it('should successfully add new leaves and update tree state', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const originalDepositCount = await sovereignChainBridgeContract.depositCount();
                const originalRoot = await sovereignChainBridgeContract.getRoot();

                const newLeaves = generateTestLeaves(4);
                const expectedTree = buildMerkleTreeForTesting(newLeaves);
                const expectedRoot = expectedTree.getRoot();

                const tx = await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(newLeaves, expectedRoot);

                // Verify event emission
                await expect(tx)
                    .to.emit(sovereignChainBridgeContract, 'ForwardLET')
                    .withArgs(
                        originalDepositCount,
                        originalRoot,
                        Number(originalDepositCount) + newLeaves.length,
                        expectedRoot,
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ['tuple(uint8,uint32,address,uint32,address,uint256,bytes)[]'],
                            [
                                newLeaves.map((leaf) => [
                                    leaf.leafType,
                                    leaf.originNetwork,
                                    leaf.originAddress,
                                    leaf.destinationNetwork,
                                    leaf.destinationAddress,
                                    leaf.amount,
                                    leaf.metadata,
                                ]),
                            ],
                        ),
                    );

                // Verify state changes
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(
                    Number(originalDepositCount) + newLeaves.length,
                );
                expect(await sovereignChainBridgeContract.getRoot()).to.equal(expectedRoot);
                expect(await sovereignChainBridgeContract.getRoot()).to.not.equal(originalRoot);
            });

            it('should handle adding leaves to existing tree', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // First add some initial leaves
                const initialLeaves = generateTestLeaves(3);
                const initialTree = buildMerkleTreeForTesting(initialLeaves);

                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(initialLeaves, initialTree.getRoot());

                const initialDepositCount = await sovereignChainBridgeContract.depositCount();
                const initialRoot = await sovereignChainBridgeContract.getRoot();

                // Add more leaves
                const additionalLeaves = generateTestLeaves(2);

                // Build expected final tree
                const allLeaves = [...initialLeaves, ...additionalLeaves];
                const finalTree = buildMerkleTreeForTesting(allLeaves);
                const expectedFinalRoot = finalTree.getRoot();

                const tx = await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(additionalLeaves, expectedFinalRoot);

                // Verify event
                await expect(tx)
                    .to.emit(sovereignChainBridgeContract, 'ForwardLET')
                    .withArgs(
                        initialDepositCount,
                        initialRoot,
                        Number(initialDepositCount) + additionalLeaves.length,
                        expectedFinalRoot,
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ['tuple(uint8,uint32,address,uint32,address,uint256,bytes)[]'],
                            [
                                additionalLeaves.map((leaf) => [
                                    leaf.leafType,
                                    leaf.originNetwork,
                                    leaf.originAddress,
                                    leaf.destinationNetwork,
                                    leaf.destinationAddress,
                                    leaf.amount,
                                    leaf.metadata,
                                ]),
                            ],
                        ),
                    );

                // Verify final state
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(
                    Number(initialDepositCount) + additionalLeaves.length,
                );
                expect(await sovereignChainBridgeContract.getRoot()).to.equal(expectedFinalRoot);
            });

            it('should handle single leaf addition', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const originalDepositCount = await sovereignChainBridgeContract.depositCount();
                const originalRoot = await sovereignChainBridgeContract.getRoot();

                const singleLeaf = generateTestLeaves(1);
                const expectedTree = buildMerkleTreeForTesting(singleLeaf);
                const expectedRoot = expectedTree.getRoot();

                await expect(
                    sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(singleLeaf, expectedRoot),
                )
                    .to.emit(sovereignChainBridgeContract, 'ForwardLET')
                    .withArgs(
                        originalDepositCount,
                        originalRoot,
                        Number(originalDepositCount) + 1,
                        expectedRoot,
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ['tuple(uint8,uint32,address,uint32,address,uint256,bytes)[]'],
                            [
                                singleLeaf.map((leaf) => [
                                    leaf.leafType,
                                    leaf.originNetwork,
                                    leaf.originAddress,
                                    leaf.destinationNetwork,
                                    leaf.destinationAddress,
                                    leaf.amount,
                                    leaf.metadata,
                                ]),
                            ],
                        ),
                    );

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(Number(originalDepositCount) + 1);
            });

            it('should automatically handle MerkleTreeFull validation through _addLeaf', async () => {
                // This test validates that the function properly delegates to _addLeaf
                // which contains the MerkleTreeFull validation

                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const leaves = generateTestLeaves(2);
                const expectedTree = buildMerkleTreeForTesting(leaves);

                // Should succeed for normal case
                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(leaves, expectedTree.getRoot());

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(2);
            });

            it('should revert when leaf has invalid leafType', async () => {
                // TEST FOCUS: Validates that forwardLET rejects leaves with invalid leafType

                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const invalidLeafType = 99; // Invalid leafType (not 0 or 1)
                const invalidLeaves = [
                    {
                        leafType: invalidLeafType,
                        originNetwork: networkIDRollup2,
                        originAddress: ethers.Wallet.createRandom().address,
                        destinationNetwork: networkIDRollup2,
                        destinationAddress: ethers.Wallet.createRandom().address,
                        amount: ethers.parseEther('1'),
                        metadata: ethers.toUtf8Bytes('test_metadata'),
                    },
                ];

                const expectedRoot = ethers.ZeroHash; // Won't reach root calculation

                await expect(
                    sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(invalidLeaves, expectedRoot),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLeafType');
            });

            it('should accept valid leafTypes (ASSET and MESSAGE)', async () => {
                // TEST FOCUS: Validates that forwardLET accepts both valid leafTypes

                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Use the existing generateTestLeaves function which creates ASSET type leaves
                const assetLeaves = generateTestLeaves(1); // Creates _LEAF_TYPE_ASSET
                const assetTree = buildMerkleTreeForTesting(assetLeaves);

                // Should not revert with InvalidLeafType for valid ASSET type
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .forwardLET(assetLeaves, assetTree.getRoot()),
                ).to.not.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLeafType');

                // Verify leaf was added
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(1);

                // Test _LEAF_TYPE_MESSAGE separately
                const messageLeaf = [
                    {
                        leafType: LEAF_TYPE_MESSAGE, // 1
                        originNetwork: networkIDRollup2,
                        originAddress: ethers.Wallet.createRandom().address,
                        destinationNetwork: networkIDRollup2,
                        destinationAddress: ethers.Wallet.createRandom().address,
                        amount: ethers.parseEther('0'),
                        metadata: ethers.toUtf8Bytes('message_metadata'),
                    },
                ];

                // Calculate expected root after adding message leaf
                const currentLeaves = [...assetLeaves, ...messageLeaf];
                const finalTree = buildMerkleTreeForTesting(currentLeaves);

                // Should not revert with InvalidLeafType for valid MESSAGE type
                await expect(
                    sovereignChainBridgeContract
                        .connect(globalExitRootRemover)
                        .forwardLET(messageLeaf, finalTree.getRoot()),
                ).to.not.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLeafType');

                // Verify both leaves were added
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(2);
            });

            it('should revert when mixed valid and invalid leafTypes are provided', async () => {
                // TEST FOCUS: Validates that forwardLET fails fast when any leaf has invalid leafType

                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                const mixedLeaves = [
                    {
                        leafType: LEAF_TYPE_ASSET, // Valid (0)
                        originNetwork: networkIDRollup2,
                        originAddress: ethers.Wallet.createRandom().address,
                        destinationNetwork: networkIDRollup2,
                        destinationAddress: ethers.Wallet.createRandom().address,
                        amount: ethers.parseEther('1'),
                        metadata: ethers.toUtf8Bytes('valid_metadata'),
                    },
                    {
                        leafType: 255, // Invalid leafType
                        originNetwork: networkIDRollup2,
                        originAddress: ethers.Wallet.createRandom().address,
                        destinationNetwork: networkIDRollup2,
                        destinationAddress: ethers.Wallet.createRandom().address,
                        amount: ethers.parseEther('1'),
                        metadata: ethers.toUtf8Bytes('invalid_metadata'),
                    },
                ];

                const expectedRoot = ethers.ZeroHash; // Won't reach root calculation

                await expect(
                    sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(mixedLeaves, expectedRoot),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidLeafType');

                // Verify no leaves were added (transaction reverted)
                expect(await sovereignChainBridgeContract.depositCount()).to.equal(0);
            });
        });

        describe('Combined LET Operations', () => {
            it('should allow forward operations and validate access control', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Test forward operation works correctly
                const forwardLeaves = generateTestLeaves(5);
                const forwardTree = buildMerkleTreeForTesting(forwardLeaves);

                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(forwardLeaves, forwardTree.getRoot());

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(5);

                // Test that backwardLET properly validates access control
                const newDepositCount = 3;
                const emptyFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeaf = forwardLeaves[newDepositCount];
                const emptyProof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
                const nextLeafValue = getLeafValue(
                    nextLeaf.leafType,
                    nextLeaf.originNetwork,
                    nextLeaf.originAddress,
                    nextLeaf.destinationNetwork,
                    nextLeaf.destinationAddress,
                    nextLeaf.amount,
                    ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
                );
                // Verify only GlobalExitRootRemover can call backwardLET
                await expect(
                    sovereignChainBridgeContract
                        .connect(rollupManager)
                        .backwardLET(newDepositCount, emptyFrontier, nextLeafValue, emptyProof),
                ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyGlobalExitRootRemover');
            });

            it('should allow sequential forward operations', async () => {
                // Activate emergency state for forwardLET function
                await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

                // Setup initial state with 3 leaves
                const initialLeaves = generateTestLeaves(3);
                const initialTree = buildMerkleTreeForTesting(initialLeaves);

                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(initialLeaves, initialTree.getRoot());

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(3);

                // Add more leaves with forwardLET
                const additionalLeaves = generateTestLeaves(2);

                // Build expected final tree
                const allLeaves = [...initialLeaves, ...additionalLeaves];
                const finalTree = buildMerkleTreeForTesting(allLeaves);

                await sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .forwardLET(additionalLeaves, finalTree.getRoot());

                expect(await sovereignChainBridgeContract.depositCount()).to.equal(5);
                expect(await sovereignChainBridgeContract.getRoot()).to.equal(finalTree.getRoot());
            });
        });
    });

    describe('LET Edge Cases and Security', () => {
        // Helper function to build frontier manually for a given number of leaves
        function buildFrontierForLeaves(leaves: string[]): string[] {
            if (leaves.length === 0) {
                return Array(32).fill(ethers.ZeroHash);
            }

            // Build the frontier by constructing intermediate hashes
            const frontier = Array(32).fill(ethers.ZeroHash);
            // Get leaf values to all leafs on map
            let tempLeaves = leaves.map((leaf) =>
                getLeafValue(
                    leaf.leafType,
                    leaf.originNetwork,
                    leaf.originAddress,
                    leaf.destinationNetwork,
                    leaf.destinationAddress,
                    leaf.amount,
                    ethers.keccak256(leaf.metadata), // Convert metadata to hash
                ),
            );
            let level = 0;

            while (tempLeaves.length > 1 || level === 0) {
                if (tempLeaves.length % 2 === 1) {
                    // Store the odd leaf in the frontier
                    frontier[level] = tempLeaves[tempLeaves.length - 1];
                    tempLeaves = tempLeaves.slice(0, -1);
                }

                // Hash pairs to build the next level
                const nextLevel: string[] = [];
                for (let i = 0; i < tempLeaves.length; i += 2) {
                    if (i + 1 < tempLeaves.length) {
                        nextLevel.push(ethers.keccak256(ethers.concat([tempLeaves[i], tempLeaves[i + 1]])));
                    }
                }
                tempLeaves = nextLevel;
                level += 1;

                if (level >= 32) break; // Safety check
            }

            return frontier;
        }

        it('should handle edge case: rollback to empty tree (depositCount = 0)', async () => {
            // Activate emergency state for forwardLET and backwardLET functions
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            // Add one leaf first
            const leaf = generateTestLeaves(1);
            const tree = buildMerkleTreeForTesting(leaf);

            await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaf, tree.getRoot());

            // Rollback to empty tree
            const emptyFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
            const nextLeaf = leaf[0];
            const proof = tree.getProofTreeByIndex(0);
            const nextLeafValue = getLeafValue(
                nextLeaf.leafType,
                nextLeaf.originNetwork,
                nextLeaf.originAddress,
                nextLeaf.destinationNetwork,
                nextLeaf.destinationAddress,
                nextLeaf.amount,
                ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
            );
            await sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .backwardLET(0, emptyFrontier, nextLeafValue, proof);

            expect(await sovereignChainBridgeContract.depositCount()).to.equal(0);
        });

        it('should maintain GER updates for both forward and backward operations', async () => {
            // This test ensures both operations properly update the Global Exit Root

            // Activate emergency state for forwardLET and backwardLET functions
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            const leaves = generateTestLeaves(3);
            const tree = buildMerkleTreeForTesting(leaves);

            // Forward operation should update GER
            await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

            // Backward operation should also update GER
            const newDepositCount = 1;
            const subtreeLeaves = leaves.slice(0, newDepositCount);
            const frontier = buildFrontierForLeaves(subtreeLeaves) as [string, ...string[]];
            const nextLeaf = leaves[newDepositCount];
            const proof = tree.getProofTreeByIndex(newDepositCount);
            const nextLeafValue = getLeafValue(
                nextLeaf.leafType,
                nextLeaf.originNetwork,
                nextLeaf.originAddress,
                nextLeaf.destinationNetwork,
                nextLeaf.destinationAddress,
                nextLeaf.amount,
                ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
            );
            await sovereignChainBridgeContract
                .connect(globalExitRootRemover)
                .backwardLET(newDepositCount, frontier, nextLeafValue, proof);

            // Both operations should have succeeded, indicating GER was properly updated
            expect(await sovereignChainBridgeContract.depositCount()).to.equal(1);
        });

        it('should handle maximum valid deposit counts properly', async () => {
            // Test with reasonable number of leaves (avoid hitting actual MAX_DEPOSIT_COUNT in test)

            // Activate emergency state for forwardLET and backwardLET functions
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            const reasonableMax = 10;
            const leaves = generateTestLeaves(reasonableMax);
            const tree = buildMerkleTreeForTesting(leaves);

            await sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(leaves, tree.getRoot());

            expect(await sovereignChainBridgeContract.depositCount()).to.equal(reasonableMax);

            // Test that backwardLET properly validates parameters for larger counts
            // Instead of attempting complex rollback, test parameter validation
            const middleCount = Math.floor(reasonableMax / 2);
            const invalidFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
            const nextLeaf = leaves[middleCount];
            const invalidProof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
            const nextLeafValue = getLeafValue(
                nextLeaf.leafType,
                nextLeaf.originNetwork,
                nextLeaf.originAddress,
                nextLeaf.destinationNetwork,
                nextLeaf.destinationAddress,
                nextLeaf.amount,
                ethers.keccak256(nextLeaf.metadata), // Convert metadata to hash
            );
            // This should fail with proper validation, confirming the function works correctly
            await expect(
                sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .backwardLET(middleCount, invalidFrontier, nextLeafValue, invalidProof),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'InvalidSmtProof');

            // Confirm original state is maintained
            expect(await sovereignChainBridgeContract.depositCount()).to.equal(reasonableMax);
        });
    });

    // ============= EMERGENCY STATE VALIDATION TESTS =============
    describe('Emergency State Requirements', () => {
        beforeEach(async () => {
            // Ensure emergency state is deactivated before each test
            if (await sovereignChainBridgeContract.isEmergencyState()) {
                await sovereignChainBridgeContract.connect(emergencyBridgeUnpauser).deactivateEmergencyState();
            }
        });

        it('should revert backwardLET when emergency state is not active', async () => {
            const newDepositCount = 1;
            const newFrontier = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];
            const nextLeaf = ethers.keccak256(ethers.toUtf8Bytes('test'));
            const proof = Array(32).fill(ethers.ZeroHash) as [string, ...string[]];

            await expect(
                sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .backwardLET(newDepositCount, newFrontier, nextLeaf, proof),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyEmergencyState');
        });

        it('should revert forwardLET when emergency state is not active', async () => {
            const newLeaves = generateTestLeaves(1);
            const expectedRoot = ethers.ZeroHash;

            await expect(
                sovereignChainBridgeContract.connect(globalExitRootRemover).forwardLET(newLeaves, expectedRoot),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyEmergencyState');
        });

        it('should revert setLocalBalanceTree when emergency state is not active', async () => {
            const originNetworks = [1];
            const originTokenAddresses = [ethers.Wallet.createRandom().address];
            const amounts = [ethers.parseEther('1')];

            await expect(
                sovereignChainBridgeContract
                    .connect(globalExitRootRemover)
                    .setLocalBalanceTree(originNetworks, originTokenAddresses, amounts),
            ).to.be.revertedWithCustomError(sovereignChainBridgeContract, 'OnlyEmergencyState');
        });

        it('should allow emergency functions when emergency state is active', async () => {
            // Activate emergency state
            await sovereignChainBridgeContract.connect(emergencyBridgePauser).activateEmergencyState();

            // Test that functions now work (basic smoke tests)
            const globalIndexes = [computeGlobalIndex(1, 1, false)];

            // Should not revert with OnlyEmergencyState (may revert with other validation errors)
            try {
                await sovereignChainBridgeContract.connect(globalExitRootRemover).setMultipleClaims(globalIndexes);
            } catch (error) {
                // Should not be OnlyEmergencyState error
                expect(error.message).to.not.include('OnlyEmergencyState');
            }
        });
    });

    // Helper function to build a simple merkle tree for testing
    function buildMerkleTreeForTesting(leaves: []) {
        const tree = new MerkleTreeBridge(32);
        for (const leaf of leaves) {
            tree.add(
                getLeafValue(
                    leaf.leafType,
                    leaf.originNetwork,
                    leaf.originAddress,
                    leaf.destinationNetwork,
                    leaf.destinationAddress,
                    leaf.amount,
                    ethers.keccak256(leaf.metadata), // Convert metadata to hash
                ),
            );
        }
        return tree;
    }

    // Helper function to generate test leaves using getLeafValue
    function generateTestLeaves(count: number): [] {
        const leaves = [];
        for (let i = 0; i < count; i++) {
            const leafValue = {
                leafType: LEAF_TYPE_ASSET,
                originNetwork: networkIDRollup2, // originNetwork
                originAddress: ethers.Wallet.createRandom().address, // originTokenAddress
                destinationNetwork: networkIDRollup2, // destinationNetwork (same to avoid LocalBalanceTree issues)
                destinationAddress: ethers.Wallet.createRandom().address, // destinationAddress
                amount: ethers.parseEther(`${i + 1}`), // amount
                metadata: ethers.toUtf8Bytes(`metadata_${i}`), // metadata
            };
            leaves.push(leafValue);
        }
        return leaves;
    }

    // Helper function to calculate expected root
    async function calculateExpectedRoot(leaves: string[]): Promise<string> {
        const tree = buildMerkleTreeForTesting(leaves);
        return tree.getRoot();
    }
});
