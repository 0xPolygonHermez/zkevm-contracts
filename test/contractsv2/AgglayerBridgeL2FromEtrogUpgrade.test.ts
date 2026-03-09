/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import {
    PolygonZkEVMBridgeV2Pessimistic,
    AgglayerBridgeL2FromEtrog,
    LegacyAgglayerGERL2,
    AgglayerGERL2,
    TokenWrapped,
    ERC20PermitMock,
} from '../../typechain-types';
import { computeGlobalIndex, calculateGlobalExitRoot } from './helpers/helpers-sovereign-bridge';

const { getLeafValue } = mtBridgeUtils;
const MerkleTreeBridge = MTBridge;

describe('PolygonZkEVMBridgeV2Pessimistic upgrade -> AgglayerBridgeL2FromEtrog', () => {
    upgrades.silenceWarnings();

    let bridgeOldContract: PolygonZkEVMBridgeV2Pessimistic;
    let gerOldContract: LegacyAgglayerGERL2;
    let bridgeContract: AgglayerBridgeL2FromEtrog;
    let gerContract: AgglayerGERL2;

    const BRIDGE_SOVEREIGN_VERSION = 'v1.2.0';
    const GER_VERSION = 'v1.0.0';

    let rollupManager: any;
    let bridgeManager: any;
    let emergencyBridgePauser: any;
    let emergencyBridgeUnpauser: any;
    let proxiedTokensManager: any;
    let globalExitRootUpdater: any;
    let globalExitRootRemover: any;
    let beneficiary: any;

    const networkID = 1;
    const LEAF_TYPE_ASSET = 0;

    // Helper function to upgrade and initialize bridge
    async function upgradeAndInitializeBridge(
        bridge: PolygonZkEVMBridgeV2Pessimistic,
        wrappedTokens: string[] = [],
        initNativeSupply?: bigint,
    ): Promise<AgglayerBridgeL2FromEtrog> {
        const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
        const balance = await ethers.provider.getBalance(bridge.target);
        const initSupply = initNativeSupply ?? balance;

        return (await upgrades.upgradeProxy(bridge.target, bridgeL2Factory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            call: {
                fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                args: [
                    bridgeManager.address,
                    emergencyBridgePauser.address,
                    emergencyBridgeUnpauser.address,
                    proxiedTokensManager.address,
                    wrappedTokens,
                    initSupply,
                ],
            },
        })) as unknown as AgglayerBridgeL2FromEtrog;
    }

    // Helper function to upgrade and initialize GER
    async function upgradeAndInitializeGER(bridge: AgglayerBridgeL2FromEtrog): Promise<AgglayerGERL2> {
        const gerL2Factory = await ethers.getContractFactory('AgglayerGERL2');
        return (await upgrades.upgradeProxy(gerOldContract.target, gerL2Factory, {
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            constructorArgs: [bridge.target],
            call: {
                fn: 'initialize(address,address)',
                args: [globalExitRootUpdater.address, globalExitRootRemover.address],
            },
        })) as unknown as AgglayerGERL2;
    }

    // Helper function to create a claim and set up wrapped token via claimAsset
    async function createWrappedTokenViaClaim(
        bridge: PolygonZkEVMBridgeV2Pessimistic,
        ger: LegacyAgglayerGERL2,
        originNetwork: number,
        tokenAddress: string,
        tokenContract: ERC20PermitMock,
        amount: bigint,
        metadata: string,
        destinationNetwork: number,
        destinationAddress: string,
        indexLocal: number,
        tokenOwner: any,
    ): Promise<string> {
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);
        const height = 32;

        // Build merkle tree
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

        // Add leaf to merkle tree
        for (let i = 0; i < 100; i++) {
            if (i === indexLocal) {
                merkleTreeLocal.add(leafValue);
            } else {
                merkleTreeLocal.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }

        const rootLocalRollup = merkleTreeLocal.getRoot();

        // Build rollup merkle tree
        // For rollup networks (originNetwork != 0), indexRollup = originNetwork - 1
        // For mainnet (originNetwork == 0), we use a fixed indexRollup
        const merkleTreeRollup = new MerkleTreeBridge(height);
        const indexRollup = originNetwork === 0 ? 5 : originNetwork - 1; // Use index 5 for mainnet like other tests
        // Ensure we have enough slots for different rollup networks
        const maxRollupIndex = Math.max(10, indexRollup + 1);
        for (let i = 0; i < maxRollupIndex; i++) {
            if (i === indexRollup) {
                merkleTreeRollup.add(rootLocalRollup);
            } else {
                merkleTreeRollup.add(ethers.toBeHex(ethers.toQuantity(ethers.randomBytes(32)), 32));
            }
        }

        const rootRollup = merkleTreeRollup.getRoot();

        // For L2 GER, mainnet exit root is always ZeroHash (L2 doesn't track mainnet roots)
        const mainnetExitRoot = ethers.ZeroHash;
        const rollupExitRootSC = rootRollup;

        // Calculate global exit root and manually insert it into the map (for LegacyAgglayerGERL2, zkRom updates this)
        // We need to set it manually for testing since zkRom isn't available
        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        // globalExitRootMap is at storage slot 0 (first variable in the contract)
        // For mapping(bytes32 => uint256), slot is keccak256(abi.encode(key, slot))
        const gerMapSlot = ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [computedGlobalExitRoot, 0]);
        const blockTimestamp = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
        // Only set if not already set (to avoid overwriting previous claims)
        const currentValue = await ethers.provider.getStorage(ger.target, gerMapSlot);
        if (currentValue === ethers.ZeroHash || currentValue === `0x${'0'.repeat(64)}`) {
            await ethers.provider.send('hardhat_setStorageAt', [
                ger.target,
                gerMapSlot,
                ethers.zeroPadValue(ethers.toBeHex(blockTimestamp), 32),
            ]);
        }

        // Get proofs
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(indexLocal);
        const proofRollup = merkleTreeRollup.getProofTreeByIndex(indexRollup);
        const globalIndex = computeGlobalIndex(indexLocal, indexRollup, originNetwork === 0);

        // Transfer tokens to bridge if needed (for non-native tokens)
        // Note: For claimAsset to work, tokens need to be in the bridge already
        // This simulates a deposit that happened before the claim
        if (tokenAddress !== ethers.ZeroAddress) {
            // Transfer from token owner to bridge
            const tokenWithOwner = tokenContract.connect(tokenOwner);
            await tokenWithOwner.transfer(bridge.target, amount);
        } else {
            // For native token, set balance
            await ethers.provider.send('hardhat_setBalance', [bridge.target, ethers.toBeHex(amount)]);
        }

        // Compute wrapped token address using old bridge's function
        // Extract metadata from token contract
        const tokenName = await tokenContract.name();
        const tokenSymbol = await tokenContract.symbol();
        const tokenDecimals = await tokenContract.decimals();
        const wrappedTokenAddress = await bridge.precalculatedWrapperAddress(
            originNetwork,
            tokenAddress,
            tokenName,
            tokenSymbol,
            tokenDecimals,
        );

        // Perform claim
        await bridge.claimAsset(
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
        );

        return wrappedTokenAddress;
    }

    beforeEach('Deploy contracts', async () => {
        // load signers
        [
            rollupManager,
            bridgeManager,
            emergencyBridgePauser,
            emergencyBridgeUnpauser,
            proxiedTokensManager,
            globalExitRootRemover,
            globalExitRootUpdater,
            beneficiary,
        ] = await ethers.getSigners();

        // deploy bridgeV2Pessimistic
        const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
        bridgeOldContract = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
        gerOldContract = (await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            constructorArgs: [bridgeOldContract.target],
        })) as unknown as LegacyAgglayerGERL2;

        // Initialize bridgeV2Pessimistic
        await bridgeOldContract.initialize(
            networkID,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            gerOldContract.target,
            rollupManager.address,
            '0x',
        );
    });

    describe('Successful upgrade and initialization', () => {
        it('Should upgrade and verify all parameters after upgrade', async () => {
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract);
            gerContract = await upgradeAndInitializeGER(bridgeContract);

            // Verify bridge parameters
            expect(await bridgeContract.getProxiedTokensManager()).to.equal(proxiedTokensManager.address);
            expect(await bridgeContract.getWrappedTokenBridgeImplementation()).to.not.equal(ethers.ZeroAddress);
            expect(await bridgeContract.version()).to.equal(BRIDGE_SOVEREIGN_VERSION);
            expect(await bridgeContract.globalExitRootManager()).to.equal(gerContract.target);
            expect(await bridgeContract.polygonRollupManager()).to.equal(rollupManager.address);
            expect(await bridgeContract.emergencyBridgePauser()).to.equal(emergencyBridgePauser.address);
            expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(emergencyBridgeUnpauser.address);
            expect(await bridgeContract.bridgeManager()).to.equal(bridgeManager.address);

            // Verify GER parameters
            expect(await gerContract.globalExitRootUpdater()).to.equal(globalExitRootUpdater.address);
            expect(await gerContract.globalExitRootRemover()).to.equal(globalExitRootRemover.address);
            expect(await gerContract.GER_SOVEREIGN_VERSION()).to.equal(GER_VERSION);
            expect(await gerContract.bridgeAddress()).to.equal(bridgeContract.target);
        });

        it('Should initialize LBT with native token balance correctly', async () => {
            // Send some ETH to the bridge
            const initialBalance = ethers.parseEther('100');
            await ethers.provider.send('hardhat_setBalance', [
                bridgeOldContract.target,
                `0x${initialBalance.toString(16)}`,
            ]);

            const currentBalance = await ethers.provider.getBalance(bridgeOldContract.target);
            const initNativeSupply = ethers.parseEther('1000');

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [], initNativeSupply);

            // Check native token balance in LBT
            const nativeTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, ethers.ZeroAddress]);
            const nativeAmount = await bridgeContract.localBalanceTree(nativeTokenInfoHash);
            const expectedAmount = initNativeSupply - currentBalance;
            expect(nativeAmount.toString()).to.equal(expectedAmount.toString());
        });

        it('Should initialize LBT with wrapped token created via claimAsset', async () => {
            // Deploy a token to claim
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const tokenContract = await ERC20Factory.deploy(
                'Test Token',
                'TEST',
                beneficiary.address,
                ethers.parseEther('1000000'),
            );

            const tokenAddress = tokenContract.target;
            const amount = ethers.parseEther('1000');
            const tokenName = 'Test Token';
            const tokenSymbol = 'TEST';
            const decimals = 18;
            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['string', 'string', 'uint8'],
                [tokenName, tokenSymbol, decimals],
            );

            // Use a rollup network (not mainnet) as origin since L2 bridges claim from rollups
            // Using networkID 2 as origin (a different rollup network)
            const claimOriginNetwork = 2;

            // Create wrapped token via claim
            const wrappedTokenAddress = await createWrappedTokenViaClaim(
                bridgeOldContract,
                gerOldContract,
                claimOriginNetwork,
                tokenAddress,
                tokenContract,
                amount,
                metadata,
                networkID,
                beneficiary.address,
                0,
                beneficiary,
            );

            // Verify wrapped token was created
            const tokenInfoHash = ethers.solidityPackedKeccak256(
                ['uint32', 'address'],
                [claimOriginNetwork, tokenAddress],
            );
            const mappedWrappedToken = await bridgeOldContract.tokenInfoToWrappedToken(tokenInfoHash);
            expect(mappedWrappedToken).to.equal(wrappedTokenAddress);

            const tokenInfo = await bridgeOldContract.wrappedTokenToTokenInfo(wrappedTokenAddress);
            expect(tokenInfo.originNetwork).to.equal(claimOriginNetwork);
            expect(tokenInfo.originTokenAddress).to.equal(tokenAddress);

            // Get wrapped token contract and check total supply
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken = tokenWrappedFactory.attach(wrappedTokenAddress) as TokenWrapped;
            const totalSupply = await wrappedToken.totalSupply();
            expect(totalSupply).to.equal(amount);

            // Upgrade bridge with wrapped token in LBT
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [wrappedTokenAddress]);

            // Verify wrapped token is in LBT
            const lbtAmount = await bridgeContract.localBalanceTree(tokenInfoHash);
            expect(lbtAmount.toString()).to.equal(totalSupply.toString());

            // Verify token info is preserved
            const tokenInfoAfter = await bridgeContract.wrappedTokenToTokenInfo(wrappedTokenAddress);
            expect(tokenInfoAfter.originNetwork).to.equal(claimOriginNetwork);
            expect(tokenInfoAfter.originTokenAddress).to.equal(tokenAddress);
        });
    });

    describe('Error cases', () => {
        it('Should revert when proxiedTokensManager is zero address', async () => {
            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);

            await expect(
                upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                    unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                    call: {
                        fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                        args: [
                            bridgeManager.address,
                            emergencyBridgePauser.address,
                            emergencyBridgeUnpauser.address,
                            ethers.ZeroAddress,
                            [],
                            balance,
                        ],
                    },
                }),
            ).to.be.revertedWithCustomError(bridgeL2Factory, 'InvalidZeroAddress');
        });

        it('Should revert when proxiedTokensManager is the bridge address itself', async () => {
            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);

            await expect(
                upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                    unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                    call: {
                        fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                        args: [
                            bridgeManager.address,
                            emergencyBridgePauser.address,
                            emergencyBridgeUnpauser.address,
                            bridgeOldContract.target,
                            [],
                            balance,
                        ],
                    },
                }),
            ).to.be.revertedWithCustomError(bridgeL2Factory, 'BridgeAddressNotAllowed');
        });

        it('Should revert when wrapped token address is not mapped', async () => {
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            await ethers.provider.send('hardhat_impersonateAccount', [bridgeOldContract.target]);
            await ethers.provider.send('hardhat_setBalance', [
                bridgeOldContract.target,
                `0x${ethers.parseUnits('2000', 18).toString(16)}`,
            ]);
            const bridgeSigner = await ethers.getSigner(bridgeOldContract.target as any);
            const tokenWrapped = await tokenWrappedFactory
                .connect(bridgeSigner)
                .deploy('name', 'symbol', '18', { gasPrice: 0 });
            const tokenWrappedAddress = await tokenWrapped.getAddress();

            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);

            await expect(
                upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                    unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                    call: {
                        fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                        args: [
                            bridgeManager.address,
                            emergencyBridgePauser.address,
                            emergencyBridgeUnpauser.address,
                            proxiedTokensManager.address,
                            [tokenWrappedAddress],
                            balance,
                        ],
                    },
                }),
            ).to.be.revertedWithCustomError(bridgeL2Factory, 'TokenNotMapped');
        });

        it('Should revert when initNativeSupply is less than current balance (underflow)', async () => {
            const bridgeBalance = ethers.parseEther('100');
            await ethers.provider.send('hardhat_setBalance', [
                bridgeOldContract.target,
                `0x${bridgeBalance.toString(16)}`,
            ]);

            const currentBalance = await ethers.provider.getBalance(bridgeOldContract.target);
            const initNativeSupply = BigInt(currentBalance) - 1n;
            const initNativeSupplyUint128 = initNativeSupply > 2n ** 128n - 1n ? 0n : initNativeSupply;

            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');

            await expect(
                upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                    unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                    call: {
                        fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                        args: [
                            bridgeManager.address,
                            emergencyBridgePauser.address,
                            emergencyBridgeUnpauser.address,
                            proxiedTokensManager.address,
                            [],
                            initNativeSupplyUint128,
                        ],
                    },
                }),
            ).to.be.revertedWithPanic(0x11); // Arithmetic underflow
        });

        it('Should not allow re-initialization after successful initialization', async () => {
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract);

            await expect(
                bridgeContract.initializeFromEtrog(
                    bridgeManager.address,
                    emergencyBridgePauser.address,
                    emergencyBridgeUnpauser.address,
                    proxiedTokensManager.address,
                    [],
                    0,
                ),
            ).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('Should prevent initialization if old contract was never initialized', async () => {
            const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const uninitializedBridge = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(uninitializedBridge.target);

            await expect(
                upgrades.upgradeProxy(uninitializedBridge.target, bridgeL2Factory, {
                    unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                    call: {
                        fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                        args: [
                            bridgeManager.address,
                            emergencyBridgePauser.address,
                            emergencyBridgeUnpauser.address,
                            proxiedTokensManager.address,
                            [],
                            balance,
                        ],
                    },
                }),
            ).to.be.revertedWithCustomError(bridgeL2Factory, 'InvalidInitializeFunction');
        });
    });

    describe('Edge cases', () => {
        it('Should handle empty wrapped tokens array', async () => {
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, []);

            expect(await bridgeContract.bridgeManager()).to.equal(bridgeManager.address);
            expect(await bridgeContract.getProxiedTokensManager()).to.equal(proxiedTokensManager.address);
        });

        it('Should handle zero address for emergencyBridgePauser', async () => {
            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);

            bridgeContract = (await upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                call: {
                    fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                    args: [
                        bridgeManager.address,
                        ethers.ZeroAddress,
                        emergencyBridgeUnpauser.address,
                        proxiedTokensManager.address,
                        [],
                        balance,
                    ],
                },
            })) as unknown as AgglayerBridgeL2FromEtrog;

            expect(await bridgeContract.emergencyBridgePauser()).to.equal(ethers.ZeroAddress);
            expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(emergencyBridgeUnpauser.address);
        });

        it('Should handle zero address for emergencyBridgeUnpauser', async () => {
            const bridgeL2Factory = await ethers.getContractFactory('AgglayerBridgeL2FromEtrog');
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);

            bridgeContract = (await upgrades.upgradeProxy(bridgeOldContract.target, bridgeL2Factory, {
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                call: {
                    fn: 'initializeFromEtrog(address,address,address,address,address[],uint128)',
                    args: [
                        bridgeManager.address,
                        emergencyBridgePauser.address,
                        ethers.ZeroAddress,
                        proxiedTokensManager.address,
                        [],
                        balance,
                    ],
                },
            })) as unknown as AgglayerBridgeL2FromEtrog;

            expect(await bridgeContract.emergencyBridgePauser()).to.equal(emergencyBridgePauser.address);
            expect(await bridgeContract.emergencyBridgeUnpauser()).to.equal(ethers.ZeroAddress);
        });

        it('Should preserve existing state after upgrade', async () => {
            const oldNetworkID = await bridgeOldContract.networkID();
            const oldGER = await bridgeOldContract.globalExitRootManager();
            const oldRollupManager = await bridgeOldContract.polygonRollupManager();

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract);

            expect(await bridgeContract.networkID()).to.equal(oldNetworkID);
            expect(await bridgeContract.globalExitRootManager()).to.equal(oldGER);
            expect(await bridgeContract.polygonRollupManager()).to.equal(oldRollupManager);
        });

        it('Should handle initNativeSupply equal to current balance', async () => {
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [], balance);

            const nativeTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, ethers.ZeroAddress]);
            const nativeAmount = await bridgeContract.localBalanceTree(nativeTokenInfoHash);
            expect(nativeAmount.toString()).to.equal('0');
        });

        it('Should handle very large initNativeSupply values', async () => {
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);
            const initNativeSupply = 2n ** 128n - 1n; // Maximum uint128 value

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [], initNativeSupply);

            const nativeTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, ethers.ZeroAddress]);
            const nativeAmount = await bridgeContract.localBalanceTree(nativeTokenInfoHash);
            expect(nativeAmount.toString()).to.equal((initNativeSupply - balance).toString());
        });
    });

    describe('WETHToken scenarios', () => {
        it('Should initialize LBT correctly when WETHToken is set (custom gas token)', async () => {
            // Deploy custom gas token
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const gasToken = await ERC20Factory.deploy(
                'Gas Token',
                'GAS',
                beneficiary.address,
                ethers.parseEther('1000000'),
            );

            // Deploy new bridge with custom gas token
            const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const bridgeOldWithGasToken = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            const gerOldFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
            const gerOldWithGasToken = (await upgrades.deployProxy(gerOldFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                constructorArgs: [bridgeOldWithGasToken.target],
            })) as unknown as LegacyAgglayerGERL2;

            await bridgeOldWithGasToken.initialize(
                networkID,
                gasToken.target,
                0,
                gerOldWithGasToken.target,
                rollupManager.address,
                ethers.AbiCoder.defaultAbiCoder().encode(['string', 'string', 'uint8'], ['Gas Token', 'GAS', 18]),
            );

            // Verify WETHToken is set
            const wethTokenAddress = await bridgeOldWithGasToken.WETHToken();
            expect(wethTokenAddress).to.not.equal(ethers.ZeroAddress);

            // Mint WETH tokens
            const WETHTokenContract = await ethers.getContractAt('TokenWrapped', wethTokenAddress);
            await ethers.provider.send('hardhat_impersonateAccount', [bridgeOldWithGasToken.target]);
            await ethers.provider.send('hardhat_setBalance', [
                bridgeOldWithGasToken.target,
                `0x${ethers.parseUnits('2000', 18).toString(16)}`,
            ]);
            const bridgeSigner = await ethers.getSigner(bridgeOldWithGasToken.target as any);
            await WETHTokenContract.connect(bridgeSigner).mint(beneficiary.address, ethers.parseUnits('500', 18));
            const wethTotalSupply = await WETHTokenContract.totalSupply();

            const balance = await ethers.provider.getBalance(bridgeOldWithGasToken.target);
            const initNativeSupply = balance + ethers.parseEther('1000');

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldWithGasToken, [], initNativeSupply);

            // Verify WETH is set in LBT
            const wethTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, ethers.ZeroAddress]);
            const wethAmount = await bridgeContract.localBalanceTree(wethTokenInfoHash);
            expect(wethAmount.toString()).to.equal(wethTotalSupply.toString());

            // Verify gas token is set in LBT
            const gasTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, gasToken.target]);
            const gasTokenAmount = await bridgeContract.localBalanceTree(gasTokenInfoHash);
            expect(gasTokenAmount.toString()).to.equal((initNativeSupply - balance).toString());
        });

        it('Should initialize LBT correctly when WETHToken is not set (ether as gas token)', async () => {
            const balance = await ethers.provider.getBalance(bridgeOldContract.target);
            const initNativeSupply = ethers.parseEther('1000');

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [], initNativeSupply);

            // Verify WETHToken is zero
            const wethTokenAddress = await bridgeContract.WETHToken();
            expect(wethTokenAddress).to.equal(ethers.ZeroAddress);

            // Verify native token (ether) is set in LBT
            const nativeTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, ethers.ZeroAddress]);
            const nativeAmount = await bridgeContract.localBalanceTree(nativeTokenInfoHash);
            expect(nativeAmount.toString()).to.equal((initNativeSupply - balance).toString());
        });
    });

    describe('Gas token and network preservation', () => {
        it('Should preserve gasTokenAddress and gasTokenNetwork after upgrade', async () => {
            // Deploy bridge with custom gas token
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const gasToken = await ERC20Factory.deploy(
                'Gas Token',
                'GAS',
                beneficiary.address,
                ethers.parseEther('1000000'),
            );

            const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const bridgeOldWithGasToken = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            const gerOldFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
            const gerOldWithGasToken = (await upgrades.deployProxy(gerOldFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                constructorArgs: [bridgeOldWithGasToken.target],
            })) as unknown as LegacyAgglayerGERL2;

            const gasTokenNetwork = 0;
            await bridgeOldWithGasToken.initialize(
                networkID,
                gasToken.target,
                gasTokenNetwork,
                gerOldWithGasToken.target,
                rollupManager.address,
                ethers.AbiCoder.defaultAbiCoder().encode(['string', 'string', 'uint8'], ['Gas Token', 'GAS', 18]),
            );

            const oldGasTokenAddress = await bridgeOldWithGasToken.gasTokenAddress();
            const oldGasTokenNetwork = await bridgeOldWithGasToken.gasTokenNetwork();

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldWithGasToken);

            expect(await bridgeContract.gasTokenAddress()).to.equal(oldGasTokenAddress);
            expect(await bridgeContract.gasTokenNetwork()).to.equal(oldGasTokenNetwork);
        });

        it('Should preserve zero gasTokenAddress and gasTokenNetwork when ether is gas token', async () => {
            const oldGasTokenAddress = await bridgeOldContract.gasTokenAddress();
            const oldGasTokenNetwork = await bridgeOldContract.gasTokenNetwork();
            expect(oldGasTokenAddress).to.equal(ethers.ZeroAddress);
            expect(oldGasTokenNetwork).to.equal(0);

            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract);

            expect(await bridgeContract.gasTokenAddress()).to.equal(oldGasTokenAddress);
            expect(await bridgeContract.gasTokenNetwork()).to.equal(oldGasTokenNetwork);
        });

        it('Should handle gasTokenAddress != 0 with gasTokenNetwork == 0', async () => {
            // Deploy custom gas token
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const gasToken = await ERC20Factory.deploy(
                'Gas Token',
                'GAS',
                beneficiary.address,
                ethers.parseEther('1000000'),
            );

            const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const bridgeOldWithGasToken = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            const gerOldFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
            const gerOldWithGasToken = (await upgrades.deployProxy(gerOldFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                constructorArgs: [bridgeOldWithGasToken.target],
            })) as unknown as LegacyAgglayerGERL2;

            // Initialize with gasTokenAddress != 0 and gasTokenNetwork == 0
            await bridgeOldWithGasToken.initialize(
                networkID,
                gasToken.target, // gasTokenAddress != 0
                0, // gasTokenNetwork == 0
                gerOldWithGasToken.target,
                rollupManager.address,
                ethers.AbiCoder.defaultAbiCoder().encode(['string', 'string', 'uint8'], ['Gas Token', 'GAS', 18]),
            );

            // Verify gas token settings
            expect(await bridgeOldWithGasToken.gasTokenAddress()).to.equal(gasToken.target);
            expect(await bridgeOldWithGasToken.gasTokenNetwork()).to.equal(0);

            // Upgrade and verify preservation
            const balance = await ethers.provider.getBalance(bridgeOldWithGasToken.target);
            const initNativeSupply = balance + ethers.parseEther('1000');
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldWithGasToken, [], initNativeSupply);

            expect(await bridgeContract.gasTokenAddress()).to.equal(gasToken.target);
            expect(await bridgeContract.gasTokenNetwork()).to.equal(0);

            // Verify LBT is initialized correctly for gas token
            const gasTokenInfoHash = ethers.solidityPackedKeccak256(['uint32', 'address'], [0, gasToken.target]);
            const expectedGasTokenAmount = initNativeSupply - balance;
            const gasTokenAmount = await bridgeContract.localBalanceTree(gasTokenInfoHash);
            expect(gasTokenAmount.toString()).to.equal(expectedGasTokenAmount.toString());
        });

        it('Should handle gasTokenAddress != 0 with gasTokenNetwork != 0', async () => {
            // Deploy custom gas token
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const gasToken = await ERC20Factory.deploy(
                'Gas Token',
                'GAS',
                beneficiary.address,
                ethers.parseEther('1000000'),
            );

            const bridgePessimisticFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2Pessimistic');
            const bridgeOldWithGasToken = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
            })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

            const gerOldFactory = await ethers.getContractFactory('LegacyAgglayerGERL2');
            const gerOldWithGasToken = (await upgrades.deployProxy(gerOldFactory, [], {
                initializer: false,
                unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
                constructorArgs: [bridgeOldWithGasToken.target],
            })) as unknown as LegacyAgglayerGERL2;

            // Initialize with gasTokenAddress != 0 and gasTokenNetwork != 0 (e.g., 0x123123 = 1192227)
            const gasTokenNetwork = 0x123123; // Non-zero network ID
            await bridgeOldWithGasToken.initialize(
                networkID,
                gasToken.target, // gasTokenAddress != 0
                gasTokenNetwork, // gasTokenNetwork != 0
                gerOldWithGasToken.target,
                rollupManager.address,
                ethers.AbiCoder.defaultAbiCoder().encode(['string', 'string', 'uint8'], ['Gas Token', 'GAS', 18]),
            );

            // Verify gas token settings
            expect(await bridgeOldWithGasToken.gasTokenAddress()).to.equal(gasToken.target);
            expect(await bridgeOldWithGasToken.gasTokenNetwork()).to.equal(gasTokenNetwork);

            // Upgrade and verify preservation
            const balance = await ethers.provider.getBalance(bridgeOldWithGasToken.target);
            const initNativeSupply = balance + ethers.parseEther('1000');
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldWithGasToken, [], initNativeSupply);

            expect(await bridgeContract.gasTokenAddress()).to.equal(gasToken.target);
            expect(await bridgeContract.gasTokenNetwork()).to.equal(gasTokenNetwork);

            // Verify LBT is initialized correctly for gas token with non-zero network
            const gasTokenInfoHash = ethers.solidityPackedKeccak256(
                ['uint32', 'address'],
                [gasTokenNetwork, gasToken.target],
            );
            const expectedGasTokenAmount = initNativeSupply - balance;
            const gasTokenAmount = await bridgeContract.localBalanceTree(gasTokenInfoHash);
            expect(gasTokenAmount.toString()).to.equal(expectedGasTokenAmount.toString());
        });
    });

    describe('Wrapped token claims and LBT initialization', () => {
        it('Should initialize LBT with multiple wrapped tokens created via claimAsset', async () => {
            // Deploy tokens to claim
            const ERC20Factory = await ethers.getContractFactory('ERC20PermitMock');
            const token1 = await ERC20Factory.deploy('Token1', 'T1', beneficiary.address, ethers.parseEther('1000000'));
            const token2 = await ERC20Factory.deploy('Token2', 'T2', beneficiary.address, ethers.parseEther('1000000'));

            const amount1 = ethers.parseEther('500');
            const amount2 = ethers.parseEther('300');
            const tokenName = 'Token';
            const tokenSymbol = 'T';
            const decimals = 18;
            const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
                ['string', 'string', 'uint8'],
                [tokenName, tokenSymbol, decimals],
            );

            // Use rollup networks as origin (not mainnet) since L2 bridges claim from rollups
            const claimOriginNetwork1 = 2;
            const claimOriginNetwork2 = 3;

            // Create wrapped tokens via claims
            // Use different local indices to avoid conflicts
            await createWrappedTokenViaClaim(
                bridgeOldContract,
                gerOldContract,
                claimOriginNetwork1,
                token1.target,
                token1,
                amount1,
                metadata,
                networkID,
                beneficiary.address,
                0,
                beneficiary,
            );

            // Verify first wrapped token was created before creating the second one
            const tokenInfoHash1Check = ethers.solidityPackedKeccak256(
                ['uint32', 'address'],
                [claimOriginNetwork1, token1.target],
            );
            const storedWrappedToken1 = await bridgeOldContract.tokenInfoToWrappedToken(tokenInfoHash1Check);
            // The wrapped token should be created by the claim
            expect(storedWrappedToken1).to.not.equal(ethers.ZeroAddress);

            await createWrappedTokenViaClaim(
                bridgeOldContract,
                gerOldContract,
                claimOriginNetwork2,
                token2.target,
                token2,
                amount2,
                metadata,
                networkID,
                beneficiary.address,
                1, // Use different local index
                beneficiary,
            );

            // Verify wrapped tokens were created
            const tokenInfoHash1 = ethers.solidityPackedKeccak256(
                ['uint32', 'address'],
                [claimOriginNetwork1, token1.target],
            );
            const tokenInfoHash2 = ethers.solidityPackedKeccak256(
                ['uint32', 'address'],
                [claimOriginNetwork2, token2.target],
            );
            // Use actual stored addresses
            const actualWrappedToken1Address = await bridgeOldContract.tokenInfoToWrappedToken(tokenInfoHash1);
            const actualWrappedToken2Address = await bridgeOldContract.tokenInfoToWrappedToken(tokenInfoHash2);
            expect(actualWrappedToken1Address).to.not.equal(ethers.ZeroAddress);
            expect(actualWrappedToken2Address).to.not.equal(ethers.ZeroAddress);

            // Get wrapped token contracts and verify total supplies
            const tokenWrappedFactory = await ethers.getContractFactory('TokenWrapped');
            const wrappedToken1 = tokenWrappedFactory.attach(actualWrappedToken1Address) as TokenWrapped;
            const wrappedToken2 = tokenWrappedFactory.attach(actualWrappedToken2Address) as TokenWrapped;
            expect(await wrappedToken1.totalSupply()).to.equal(amount1);
            expect(await wrappedToken2.totalSupply()).to.equal(amount2);

            // Upgrade bridge with both wrapped tokens
            bridgeContract = await upgradeAndInitializeBridge(bridgeOldContract, [
                actualWrappedToken1Address,
                actualWrappedToken2Address,
            ]);

            // Verify both tokens are in LBT
            const lbtAmount1 = await bridgeContract.localBalanceTree(tokenInfoHash1);
            const lbtAmount2 = await bridgeContract.localBalanceTree(tokenInfoHash2);
            expect(lbtAmount1.toString()).to.equal(amount1.toString());
            expect(lbtAmount2.toString()).to.equal(amount2.toString());

            // Verify token info is preserved
            const tokenInfo1 = await bridgeContract.wrappedTokenToTokenInfo(actualWrappedToken1Address);
            const tokenInfo2 = await bridgeContract.wrappedTokenToTokenInfo(actualWrappedToken2Address);
            expect(tokenInfo1.originNetwork).to.equal(claimOriginNetwork1);
            expect(tokenInfo1.originTokenAddress).to.equal(token1.target);
            expect(tokenInfo2.originNetwork).to.equal(claimOriginNetwork2);
            expect(tokenInfo2.originTokenAddress).to.equal(token2.target);
        });
    });
});
