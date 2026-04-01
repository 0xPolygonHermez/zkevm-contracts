import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { setBalance } from '@nomicfoundation/hardhat-network-helpers';
import { computeGlobalIndex } from './helpers/helpers-sovereign-bridge';
import {
    ERC20PermitMock,
    PolygonZkEVMGlobalExitRoot,
    PolygonZkEVMBridgeV2Pessimistic,
    AgglayerBridgeL2NativeBlockedFromEtrog,
} from '../../typechain-types';

const MerkleTreeBridge = MTBridge;
const { getLeafValue } = mtBridgeUtils;

describe('AgglayerBridgeL2NativeBlockedFromEtrog', () => {
    upgrades.silenceWarnings();

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther('20000000');
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );
    const networkIDMainnet = 0;
    const bridgeNetworkID = 1;

    const LEAF_TYPE_ASSET = 0;

    /**
     * Upgrade from PolygonZkEVMBridgeV2Pessimistic to AgglayerBridgeL2NativeBlockedFromEtrog
     * and call initializeFromEtrog.
     * Based on AgglayerBridgeL2FromEtrogUpgrade.test.ts upgradeAndInitializeBridge helper.
     */
    async function upgradeAndInitialize(
        oldBridge: PolygonZkEVMBridgeV2Pessimistic,
        bridgeManager: string,
        emergencyBridgePauser: string,
        emergencyBridgeUnpauser: string,
        proxiedTokensManager: string,
        wrappedTokens: string[] = [],
        initNativeSupply?: bigint,
    ): Promise<AgglayerBridgeL2NativeBlockedFromEtrog> {
        const balance = await ethers.provider.getBalance(oldBridge.target);
        const initSupply = initNativeSupply ?? balance;

        const nativeBlockedFactory = await ethers.getContractFactory('AgglayerBridgeL2NativeBlockedFromEtrog');
        return (await upgrades.upgradeProxy(oldBridge.target, nativeBlockedFactory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            call: {
                fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                args: [
                    bridgeManager,
                    emergencyBridgePauser,
                    emergencyBridgeUnpauser,
                    proxiedTokensManager,
                    wrappedTokens,
                    initSupply,
                ],
            },
        })) as unknown as AgglayerBridgeL2NativeBlockedFromEtrog;
    }

    // =========================================================================
    // Gas token network: non-ether native token (WETHToken != address(0))
    // =========================================================================
    describe('Gas token network (non-ether native)', () => {
        let bridgeContract: AgglayerBridgeL2NativeBlockedFromEtrog;
        let polTokenContract: ERC20PermitMock;
        let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
        let deployer: any;
        let rollupManager: any;
        let acc1: any;
        let bridgeManager: any;
        let proxiedTokensManager: any;

        beforeEach('Deploy contracts', async () => {
            [deployer, rollupManager, acc1, bridgeManager, proxiedTokensManager] = await ethers.getSigners();

            // Deploy ERC20 token (used as gas token)
            const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
            polTokenContract = await maticTokenFactory.deploy(
                tokenName,
                tokenSymbol,
                deployer.address,
                tokenInitialBalance,
            );

            // Deploy old bridge (PolygonZkEVMBridgeV2Pessimistic)
            const oldBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const oldBridge = (await upgrades.deployProxy(oldBridgeFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            // Deploy GER
            const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
            polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
                rollupManager.address,
                oldBridge.target,
            );

            // Initialize old bridge with gas token
            await oldBridge.initialize(
                bridgeNetworkID,
                polTokenContract.target,
                0,
                polygonZkEVMGlobalExitRoot.target,
                rollupManager.address,
                metadataToken,
            );

            // Upgrade to NativeBlocked and call initializeFromEtrog
            bridgeContract = await upgradeAndInitialize(
                oldBridge,
                bridgeManager.address,
                deployer.address, // emergencyBridgePauser
                deployer.address, // emergencyBridgeUnpauser
                proxiedTokensManager.address,
                [],
                ethers.parseEther('1000'),
            );

            // Verify WETH token is set (gas token network)
            const wethAddress = await bridgeContract.WETHToken();
            expect(wethAddress).to.not.be.equal(ethers.ZeroAddress);
        });

        /**
         * Positive test: ERC20 bridgeAsset works on gas token network.
         * Based on BridgeV2.test.ts "should PolygonZkEVM bridge asset and verify merkle proof" (lines 111-200).
         */
        it('should bridgeAsset ERC20 tokens', async () => {
            const depositCount = await bridgeContract.depositCount();
            const originNetwork = bridgeNetworkID;

            // Deploy a fresh ERC20 (distinct from gas token)
            const erc20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const testToken = await erc20Factory.deploy('Test Token', 'TST', deployer.address, tokenInitialBalance);

            const tokenAddress = testToken.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDMainnet;
            const destinationAddress = deployer.address;

            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['string', 'string', 'uint8'],
                ['Test Token', 'TST', 18],
            );

            await testToken.approve(bridgeContract.target, amount);

            await expect(
                bridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x'),
            )
                .to.emit(bridgeContract, 'BridgeEvent')
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

            expect(await testToken.balanceOf(bridgeContract.target)).to.be.equal(amount);
        });

        /**
         * Positive test: ERC20 claimAsset works on gas token network.
         * Based on BridgeV2.test.ts "should claim tokens from Mainnet to Mainnet" (lines 388-552).
         */
        it('should claimAsset ERC20 tokens', async () => {
            const erc20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const testToken = await erc20Factory.deploy('Test Token', 'TST', deployer.address, tokenInitialBalance);

            const originNetwork = bridgeNetworkID;
            const tokenAddress = testToken.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = bridgeNetworkID;
            const destinationAddress = acc1.address;

            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['string', 'string', 'uint8'],
                ['Test Token', 'TST', 18],
            );
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

            // Compute merkle tree
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

            const mainnetExitRoot = merkleTreeLocal.getRoot();
            const indexRollup = 0;

            // Update exit root via bridge impersonation
            await ethers.provider.send('hardhat_impersonateAccount', [bridgeContract.target]);
            const bridgeSigner = await ethers.getSigner(bridgeContract.target as any);
            await expect(
                polygonZkEVMGlobalExitRoot.connect(bridgeSigner).updateExitRoot(mainnetExitRoot, { gasPrice: 0 }),
            )
                .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
                .withArgs(mainnetExitRoot, rollupExitRoot);

            const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
            const indexLocal = 0;
            const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, true);

            // Transfer tokens to bridge so claim can succeed
            await testToken.transfer(bridgeContract.target, amount);

            await expect(
                bridgeContract.claimAsset(
                    proofLocal,
                    proofLocal,
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
                .to.emit(bridgeContract, 'ClaimEvent')
                .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount);

            expect(await testToken.balanceOf(acc1.address)).to.be.equal(amount);

            // Can't claim again (nullifier set)
            await expect(
                bridgeContract.claimAsset(
                    proofLocal,
                    proofLocal,
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
            ).to.be.revertedWithCustomError(bridgeContract, 'AlreadyClaimed');
        });

        /**
         * Negative test: native gas token bridgeAsset is blocked.
         * Based on BridgeV2GasTokens.test.ts bridge patterns.
         */
        it('should block native gas token bridgeAsset', async () => {
            const amount = ethers.parseEther('10');
            await expect(
                bridgeContract.bridgeAsset(networkIDMainnet, deployer.address, amount, ethers.ZeroAddress, true, '0x', {
                    value: amount,
                }),
            ).to.be.revertedWithCustomError(bridgeContract, 'NativeTokenBridgeBlocked');
        });

        /**
         * Negative test: native gas token claimAsset is blocked.
         * Based on BridgeV2GasTokens.test.ts "should claim Gas tokens from Mainnet to Mainnet" (lines 529-665).
         */
        it('should block native gas token claimAsset', async () => {
            const originNetwork = networkIDMainnet; // gasTokenNetwork = 0
            const tokenAddress = polTokenContract.target; // gas token
            const amount = ethers.parseEther('10');
            const destinationNetwork = bridgeNetworkID;
            const destinationAddress = acc1.address;

            const metadata = metadataToken;
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

            // Compute merkle tree
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

            const mainnetExitRoot = merkleTreeLocal.getRoot();
            const indexRollup = 0;

            // Update exit root via bridge impersonation
            await ethers.provider.send('hardhat_impersonateAccount', [bridgeContract.target]);
            const bridgeSigner = await ethers.getSigner(bridgeContract.target as any);
            await expect(
                polygonZkEVMGlobalExitRoot.connect(bridgeSigner).updateExitRoot(mainnetExitRoot, { gasPrice: 0 }),
            )
                .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
                .withArgs(mainnetExitRoot, rollupExitRoot);

            const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
            const indexLocal = 0;
            const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, true);

            // Fund bridge with native balance
            await setBalance(bridgeContract.target as any, amount);

            // Gas token claim is blocked
            await expect(
                bridgeContract.claimAsset(
                    proofLocal,
                    proofLocal,
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
            ).to.be.revertedWithCustomError(bridgeContract, 'NativeTokenBridgeBlocked');
        });
    });

    // =========================================================================
    // Ether network: ether is native (WETHToken == address(0))
    // =========================================================================
    describe('Ether network (ether native)', () => {
        let bridgeContract: AgglayerBridgeL2NativeBlockedFromEtrog;
        let polTokenContract: ERC20PermitMock;
        let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;
        let deployer: any;
        let rollupManager: any;
        let acc1: any;
        let bridgeManager: any;
        let proxiedTokensManager: any;

        beforeEach('Deploy contracts', async () => {
            [deployer, rollupManager, acc1, bridgeManager, proxiedTokensManager] = await ethers.getSigners();

            // Deploy ERC20 token
            const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
            polTokenContract = await maticTokenFactory.deploy(
                tokenName,
                tokenSymbol,
                deployer.address,
                tokenInitialBalance,
            );

            // Deploy old bridge (PolygonZkEVMBridgeV2Pessimistic)
            const oldBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const oldBridge = (await upgrades.deployProxy(oldBridgeFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            // Deploy GER
            const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
            polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
                rollupManager.address,
                oldBridge.target,
            );

            // Initialize old bridge with ether as native (no gas token)
            await oldBridge.initialize(
                bridgeNetworkID,
                ethers.ZeroAddress,
                0,
                polygonZkEVMGlobalExitRoot.target,
                rollupManager.address,
                '0x',
            );

            // Upgrade to NativeBlocked and call initializeFromEtrog
            // initNativeSupply must exceed bridge balance so LBT allows outgoing bridges
            bridgeContract = await upgradeAndInitialize(
                oldBridge,
                bridgeManager.address,
                deployer.address, // emergencyBridgePauser
                deployer.address, // emergencyBridgeUnpauser
                proxiedTokensManager.address,
                [],
                ethers.parseEther('1000'),
            );

            // Verify WETHToken is 0 (ether is native)
            expect(await bridgeContract.WETHToken()).to.be.equal(ethers.ZeroAddress);
        });

        /**
         * Positive test: ERC20 bridgeAsset works on ether network.
         * Based on BridgeV2.test.ts "should PolygonZkEVM bridge asset and verify merkle proof" (lines 111-200).
         */
        it('should bridgeAsset ERC20 tokens', async () => {
            const depositCount = await bridgeContract.depositCount();
            const originNetwork = bridgeNetworkID;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDMainnet;
            const destinationAddress = deployer.address;

            const metadata = metadataToken;

            await polTokenContract.approve(bridgeContract.target, amount);

            await expect(
                bridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x'),
            )
                .to.emit(bridgeContract, 'BridgeEvent')
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

            expect(await polTokenContract.balanceOf(bridgeContract.target)).to.be.equal(amount);
        });

        /**
         * Positive test: ERC20 claimAsset works on ether network.
         * Based on BridgeV2.test.ts "should claim tokens from Mainnet to Mainnet" (lines 388-552).
         */
        it('should claimAsset ERC20 tokens', async () => {
            const originNetwork = bridgeNetworkID;
            const tokenAddress = polTokenContract.target;
            const amount = ethers.parseEther('10');
            const destinationNetwork = bridgeNetworkID;
            const destinationAddress = acc1.address;

            const metadata = metadataToken;
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();

            // Compute merkle tree
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

            const mainnetExitRoot = merkleTreeLocal.getRoot();
            const indexRollup = 0;

            // Update exit root
            await ethers.provider.send('hardhat_impersonateAccount', [bridgeContract.target]);
            const bridgeSigner = await ethers.getSigner(bridgeContract.target as any);
            await expect(
                polygonZkEVMGlobalExitRoot.connect(bridgeSigner).updateExitRoot(mainnetExitRoot, { gasPrice: 0 }),
            )
                .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
                .withArgs(mainnetExitRoot, rollupExitRoot);

            const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
            const indexLocal = 0;
            const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
            const globalIndex = computeGlobalIndex(indexLocal, indexRollup, true);

            // Transfer tokens to bridge
            await polTokenContract.transfer(bridgeContract.target, amount);

            await expect(
                bridgeContract.claimAsset(
                    proofLocal,
                    proofLocal,
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
                .to.emit(bridgeContract, 'ClaimEvent')
                .withArgs(globalIndex, originNetwork, tokenAddress, destinationAddress, amount);

            expect(await polTokenContract.balanceOf(acc1.address)).to.be.equal(amount);

            // Can't claim again
            await expect(
                bridgeContract.claimAsset(
                    proofLocal,
                    proofLocal,
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
            ).to.be.revertedWithCustomError(bridgeContract, 'AlreadyClaimed');
        });

        /**
         * Positive test: ether bridgeAsset works on ether network.
         * Based on BridgeV2.test.ts "should claim ether" bridge portion (lines 1437-1448).
         */
        it('should bridgeAsset ether', async () => {
            const depositCount = await bridgeContract.depositCount();
            const originNetwork = networkIDMainnet; // ether originNetwork is always 0
            const tokenAddress = ethers.ZeroAddress;
            const amount = ethers.parseEther('10');
            const destinationNetwork = networkIDMainnet;
            const destinationAddress = deployer.address;

            const metadata = '0x';

            const balanceBefore = await ethers.provider.getBalance(bridgeContract.target);

            await expect(
                bridgeContract.bridgeAsset(destinationNetwork, destinationAddress, amount, tokenAddress, true, '0x', {
                    value: amount,
                }),
            )
                .to.emit(bridgeContract, 'BridgeEvent')
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

            expect(await ethers.provider.getBalance(bridgeContract.target)).to.be.equal(balanceBefore + amount);
        });

        /**
         * Positive test: ether claimAsset works on ether network.
         * Based on BridgeV2.test.ts "should claim ether" (lines 1333-1492).
         */
        it('should claimAsset ether', async () => {
            const originNetwork = networkIDMainnet; // ether originNetwork is always 0
            const tokenAddress = ethers.ZeroAddress;
            const amount = ethers.parseEther('10');
            const destinationNetwork = bridgeNetworkID;
            const destinationAddress = deployer.address;

            const metadata = '0x';
            const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

            const mainnetExitRoot = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();

            // Compute merkle tree
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

            const rootJSRollup = merkleTree.getRoot();
            const merkleTreeRollup = new MerkleTreeBridge(height);
            merkleTreeRollup.add(rootJSRollup);
            const rollupRoot = merkleTreeRollup.getRoot();

            // Add rollup merkle root
            await expect(polygonZkEVMGlobalExitRoot.connect(rollupManager).updateExitRoot(rollupRoot))
                .to.emit(polygonZkEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
                .withArgs(mainnetExitRoot, rollupRoot);

            const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
            const index = 0;
            const proofLocal = merkleTree.getProofTreeByIndex(0);
            const proofRollup = merkleTreeRollup.getProofTreeByIndex(0);
            const globalIndex = computeGlobalIndex(index, index, false);

            // Can't claim without ether on bridge
            await expect(
                bridgeContract.claimAsset(
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
            ).to.be.revertedWithCustomError(bridgeContract, 'EtherTransferFailed');

            // Fund bridge with ether directly
            await setBalance(bridgeContract.target as any, amount);

            // Claim ether
            await expect(
                bridgeContract.claimAsset(
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
                .to.emit(bridgeContract, 'ClaimEvent')
                .withArgs(index, originNetwork, tokenAddress, destinationAddress, amount);

            // Bridge balance should be 0 after claim
            expect(await ethers.provider.getBalance(bridgeContract.target)).to.be.equal(0n);

            // Can't claim again
            await expect(
                bridgeContract.claimAsset(
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
            ).to.be.revertedWithCustomError(bridgeContract, 'AlreadyClaimed');
        });
    });
});
