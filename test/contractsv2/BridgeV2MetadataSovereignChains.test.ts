import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { ERC20PermitMock, AgglayerGERL2, AgglayerBridgeL2, BridgeLib } from '../../typechain-types';
import {
    createPermitSignature,
    ifacePermit,
    createPermitSignatureDaiType,
    ifacePermitDAI,
    createPermitSignatureUniType,
} from '../../src/permit-helper';

const MerkleTreeBridge = MTBridge;
const { verifyMerkleProof, getLeafValue } = mtBridgeUtils;

describe('SovereignBridge Contract', () => {
    upgrades.silenceWarnings();

    let sovereignChainBridgeContract: AgglayerBridgeL2;
    let polTokenContract: ERC20PermitMock;
    let sovereignChainGlobalExitRootContract: AgglayerGERL2;
    let bridgeLibContract: BridgeLib;

    let deployer: any;
    let rollupManager: any;
    let emergencyBridgePauser: any;
    let proxiedTokensManager: any;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther('20000000');
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );
    const networkIDMainnet = 2;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollupManager, , emergencyBridgePauser, proxiedTokensManager] = await ethers.getSigners();

        // deploy PolygonZkEVMBridge
        const BridgeL2SovereignChainFactory = await ethers.getContractFactory('AgglayerBridgeL2');
        sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
            initializer: false,
            unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
        })) as unknown as AgglayerBridgeL2;

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        sovereignChainGlobalExitRootContract = await GlobalExitRootManagerL2SovereignChainFactory.deploy(
            sovereignChainBridgeContract.target,
        );

        await sovereignChainBridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            sovereignChainGlobalExitRootContract.target,
            rollupManager.address,
            '0x',
            ethers.Typed.address(deployer.address),
            ethers.ZeroAddress,
            false,
            emergencyBridgePauser.address,
            emergencyBridgePauser.address,
            proxiedTokensManager.address,
        );

        // get bridge lib instance
        const bridgeLibAddress = await sovereignChainBridgeContract.bridgeLib();
        bridgeLibContract = await ethers.getContractAt('BridgeLib', bridgeLibAddress);

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
    });

    it('should PolygonZkEVMBridge with weird token metadata', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = 'nameToken';
        const symbolWeird = 'NTK';

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 14;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(sovereignChainBridgeContract.target, tokenInitialBalance);

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameWeird, symbolWeird, decimalsWeird],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        expect(await sovereignChainBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it('should PolygonZkEVMBridge with weird token metadata with reverts', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = 'nameToken';
        const symbolWeird = 'NTK';

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = ethers.MaxUint256;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(sovereignChainBridgeContract.target, tokenInitialBalance);

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Since cannot decode decimals
        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                '0x',
            ),
        ).to.be.reverted;

        // toogle revert
        await weirdTokenContract.toggleIsRevert();
        // Use revert strings
        const nameRevert = 'NO_NAME';
        const symbolRevert = 'NO_SYMBOL';
        const decimalsTooRevert = 18;
        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameRevert, symbolRevert, decimalsTooRevert],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        expect(await sovereignChainBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it('should PolygonZkEVMBridge with weird token metadata with empty data', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20WeirdMetadata');

        const nameWeird = '';
        const symbolWeird = '';

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 255;

        const weirdTokenContract = await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        );
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(sovereignChainBridgeContract.target, tokenInitialBalance);

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Empty bytes32 is a not valid encoding
        const nameEmpty = 'NOT_VALID_ENCODING'; // bytes32 empty
        const symbolEmpty = '';

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameEmpty, symbolEmpty, decimalsWeird],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        expect(await sovereignChainBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it('should PolygonZkEVMBridge with weird token metadata with invalid data', async () => {
        const weirdErc20Metadata = await ethers.getContractFactory('ERC20InvalidMetadata');

        const nameWeird = '';
        const symbolWeird = '';

        const nameWeirdBytes32 = ethers.encodeBytes32String(nameWeird);
        const symbolWeirdBytes = ethers.toUtf8Bytes(symbolWeird);
        const decimalsWeird = 255;

        const weirdTokenContract = (await weirdErc20Metadata.deploy(
            nameWeirdBytes32, // bytes32
            symbolWeirdBytes, // bytes
            decimalsWeird,
        )) as any;
        await weirdTokenContract.waitForDeployment();

        // mint and approve tokens
        await weirdTokenContract.mint(deployer.address, tokenInitialBalance);
        await weirdTokenContract.approve(sovereignChainBridgeContract.target, tokenInitialBalance);

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = weirdTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        // Empty bytes32 is a not valid encoding
        const nameEmpty = 'NOT_VALID_ENCODING'; // bytes32 empty
        const symbolEmpty = 'NOT_VALID_ENCODING';

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [nameEmpty, symbolEmpty, decimalsWeird],
        );

        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

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

        expect(await sovereignChainBridgeContract.getRoot()).to.be.equal(rootJSMainnet);
    });

    it('should PolygonZkEVMBridge and with permit eip-2612 compilant', async () => {
        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = polTokenContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await polTokenContract.balanceOf(deployer.address);
        const balanceBridge = await polTokenContract.balanceOf(sovereignChainBridgeContract.target);

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
        ).to.be.revertedWith('ERC20: insufficient allowance');

        // user permit
        const nonce = await polTokenContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;
        const { chainId } = await ethers.provider.getNetwork();

        const { v, r, s } = await createPermitSignature(
            polTokenContract,
            deployer,
            sovereignChainBridgeContract.target,
            amount,
            nonce,
            deadline,
            chainId,
        );

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                ethers.ZeroHash,
            ),
        ).to.be.revertedWithCustomError(bridgeLibContract, 'NotValidSignature');

        const dataPermit = ifacePermit.encodeFunctionData('permit', [
            deployer.address,
            sovereignChainBridgeContract.target,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit,
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

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    });

    it('should PolygonZkEVMBridge with permit DAI type contracts', async () => {
        const { chainId } = await ethers.provider.getNetwork();
        const daiTokenFactory = await ethers.getContractFactory('DaiMock');
        const daiContract = (await daiTokenFactory.deploy(chainId)) as any;
        await daiContract.waitForDeployment();
        await daiContract.mint(deployer.address, ethers.parseEther('100'));

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = daiContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [await daiContract.name(), await daiContract.symbol(), await daiContract.decimals()],
        );
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await daiContract.balanceOf(deployer.address);
        const balanceBridge = await daiContract.balanceOf(sovereignChainBridgeContract.target);

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
        ).to.be.revertedWith('Dai/insufficient-allowance');

        // user permit
        const nonce = await daiContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;

        const { v, r, s } = await createPermitSignatureDaiType(
            daiContract,
            deployer,
            sovereignChainBridgeContract.target,
            nonce,
            deadline,
            chainId,
        );

        const dataPermit = ifacePermitDAI.encodeFunctionData('permit', [
            deployer.address,
            sovereignChainBridgeContract.target,
            nonce,
            deadline,
            true,
            v,
            r,
            s,
        ]);

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit,
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

        expect(await daiContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await daiContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(balanceBridge + amount);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    });

    it('should PolygonZkEVMBridge with permit UNI type contracts', async () => {
        const uniTokenFactory = await ethers.getContractFactory('Uni');
        const lastBlock = (await ethers.provider.getBlock('latest')) as any;
        const uniContract = (await uniTokenFactory.deploy(
            deployer.address,
            deployer.address,
            lastBlock.timestamp + 1,
        )) as any;
        await uniContract.waitForDeployment();
        await uniContract.mint(deployer.address, ethers.parseEther('100'));

        const depositCount = await sovereignChainBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = uniContract.target;
        const amount = ethers.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'string', 'uint8'],
            [await uniContract.name(), await uniContract.symbol(), await uniContract.decimals()],
        );
        const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await uniContract.balanceOf(deployer.address);
        const balanceBridge = await uniContract.balanceOf(sovereignChainBridgeContract.target);

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
        ).to.be.revertedWith('Uni::transferFrom: transfer amount exceeds spender allowance');

        // user permit
        const nonce = await uniContract.nonces(deployer.address);
        const deadline = ethers.MaxUint256;
        const { chainId } = await ethers.provider.getNetwork();

        const { v, r, s } = await createPermitSignatureUniType(
            uniContract,
            deployer,
            sovereignChainBridgeContract.target,
            amount,
            nonce,
            deadline,
            chainId,
        );

        const dataPermit = ifacePermit.encodeFunctionData('permit', [
            deployer.address,
            sovereignChainBridgeContract.target,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(
            sovereignChainBridgeContract.bridgeAsset(
                destinationNetwork,
                destinationAddress,
                amount,
                tokenAddress,
                true,
                dataPermit,
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

        expect(await uniContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer - amount);
        expect(await uniContract.balanceOf(sovereignChainBridgeContract.target)).to.be.equal(balanceBridge + amount);

        // check merkle root with SC
        const rootSCMainnet = await sovereignChainBridgeContract.getRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
    });
});
