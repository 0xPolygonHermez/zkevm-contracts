const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    getLeafValue,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

const {
    createPermitSignature,
    ifacePermit,
    createPermitSignatureDaiType,
    ifacePermitDAI,
    createPermitSignatureUniType,
} = require('../../src/permit-helper');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('PolygonZKEVMBridge Contract Permit tests', () => {
    let deployer;
    let rollup;

    let globalExitRootManager;
    let polygonZKEVMBridgeContract;
    let tokenContract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const decimals = 18;
    const tokenInitialBalance = ethers.utils.parseEther('20000000');
    const metadataToken = ethers.utils.defaultAbiCoder.encode(
        ['string', 'string', 'uint8'],
        [tokenName, tokenSymbol, decimals],
    );

    const networkIDMainnet = 0;
    const networkIDRollup = 1;
    const LEAF_TYPE_ASSET = 0;

    const polygonZKEVMAddress = ethers.constants.AddressZero;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup] = await ethers.getSigners();

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });

        // deploy PolygonZKEVMBridge
        const polygonZKEVMBridgeFactory = await ethers.getContractFactory('PolygonZKEVMBridge');
        polygonZKEVMBridgeContract = await upgrades.deployProxy(polygonZKEVMBridgeFactory, [], { initializer: false });

        await globalExitRootManager.initialize(rollup.address, polygonZKEVMBridgeContract.address);
        await polygonZKEVMBridgeContract.initialize(networkIDMainnet, globalExitRootManager.address, polygonZKEVMAddress);

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('TokenWrapped');
        tokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            decimals,
        );
        await tokenContract.deployed();

        await tokenContract.mint(deployer.address, tokenInitialBalance);
    });

    it('should PolygonZKEVMBridge and with permit eip-2612 compilant', async () => {
        const depositCount = await polygonZKEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await tokenContract.balanceOf(deployer.address);
        const balanceBridge = await tokenContract.balanceOf(polygonZKEVMBridgeContract.address);

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();

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

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, '0x'))
            .to.be.revertedWith('ERC20: insufficient allowance');

        // user permit
        const nonce = await tokenContract.nonces(deployer.address);
        const deadline = ethers.constants.MaxUint256;
        const { chainId } = await ethers.provider.getNetwork();

        const { v, r, s } = await createPermitSignature(
            tokenContract,
            deployer,
            polygonZKEVMBridgeContract.address,
            amount,
            nonce,
            deadline,
            chainId,
        );

        const dataPermit = ifacePermit.encodeFunctionData('permit', [
            deployer.address,
            polygonZKEVMBridgeContract.address,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, dataPermit))
            .to.emit(polygonZKEVMBridgeContract, 'BridgeEvent')
            .withArgs(originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await tokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenContract.balanceOf(polygonZKEVMBridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await polygonZKEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZKEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });

    it('should PolygonZKEVMBridge with permit DAI type contracts', async () => {
        const { chainId } = await ethers.provider.getNetwork();
        const daiTokenFactory = await ethers.getContractFactory('Dai');
        const daiContract = await daiTokenFactory.deploy(
            chainId,
        );
        await daiContract.deployed();
        await daiContract.mint(deployer.address, ethers.utils.parseEther('100'));

        const depositCount = await polygonZKEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = daiContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.utils.defaultAbiCoder.encode(
            ['string', 'string', 'uint8'],
            [await daiContract.name(), await daiContract.symbol(), await daiContract.decimals()],
        );
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await daiContract.balanceOf(deployer.address);
        const balanceBridge = await daiContract.balanceOf(polygonZKEVMBridgeContract.address);

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();

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

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, '0x'))
            .to.be.revertedWith('Dai/insufficient-allowance');

        // user permit
        const nonce = await daiContract.nonces(deployer.address);
        const deadline = ethers.constants.MaxUint256;

        const { v, r, s } = await createPermitSignatureDaiType(
            daiContract,
            deployer,
            polygonZKEVMBridgeContract.address,
            nonce,
            deadline,
            chainId,
        );
        const dataPermit = ifacePermitDAI.encodeFunctionData('permit', [
            deployer.address,
            polygonZKEVMBridgeContract.address,
            nonce,
            deadline,
            true,
            v,
            r,
            s,
        ]);

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, dataPermit))
            .to.emit(polygonZKEVMBridgeContract, 'BridgeEvent')
            .withArgs(originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await daiContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await daiContract.balanceOf(polygonZKEVMBridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await polygonZKEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZKEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });

    it('should PolygonZKEVMBridge with permit UNI type contracts', async () => {
        const uniTokenFactory = await ethers.getContractFactory('Uni');
        const uniContract = await uniTokenFactory.deploy(
            deployer.address,
            deployer.address,
            (await ethers.provider.getBlock()).timestamp + 1,
        );
        await uniContract.deployed();
        await uniContract.mint(deployer.address, ethers.utils.parseEther('100'));

        const depositCount = await polygonZKEVMBridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = uniContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = ethers.utils.defaultAbiCoder.encode(
            ['string', 'string', 'uint8'],
            [await uniContract.name(), await uniContract.symbol(), await uniContract.decimals()],
        );
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await uniContract.balanceOf(deployer.address);
        const balanceBridge = await uniContract.balanceOf(polygonZKEVMBridgeContract.address);

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();

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

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, '0x'))
            .to.be.revertedWith('Uni::transferFrom: transfer amount exceeds spender allowance');

        // user permit
        const nonce = await uniContract.nonces(deployer.address);
        const deadline = ethers.constants.MaxUint256;
        const { chainId } = await ethers.provider.getNetwork();

        const { v, r, s } = await createPermitSignatureUniType(
            uniContract,
            deployer,
            polygonZKEVMBridgeContract.address,
            amount,
            nonce,
            deadline,
            chainId,
        );
        const dataPermit = ifacePermit.encodeFunctionData('permit', [
            deployer.address,
            polygonZKEVMBridgeContract.address,
            amount,
            deadline,
            v,
            r,
            s,
        ]);

        await expect(polygonZKEVMBridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, dataPermit))
            .to.emit(polygonZKEVMBridgeContract, 'BridgeEvent')
            .withArgs(originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(rootJSMainnet, rollupExitRoot);

        expect(await uniContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await uniContract.balanceOf(polygonZKEVMBridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await polygonZKEVMBridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await polygonZKEVMBridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });
});
