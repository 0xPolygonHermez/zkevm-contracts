const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    getLeafValue,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('PolygonZKEVMBridge Mock Contract', () => {
    let deployer;
    let rollup;

    let polygonZKEVMGlobalExitRoot;
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
        const PolygonZKEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZKEVMGlobalExitRoot');
        polygonZKEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZKEVMGlobalExitRootFactory, [], { initializer: false });

        // deploy PolygonZKEVMBridge
        const polygonZKEVMBridgeFactory = await ethers.getContractFactory('PolygonZKEVMBridgeMock');
        polygonZKEVMBridgeContract = await upgrades.deployProxy(polygonZKEVMBridgeFactory, [], { initializer: false });

        await polygonZKEVMGlobalExitRoot.initialize(rollup.address, polygonZKEVMBridgeContract.address);
        await polygonZKEVMBridgeContract.initialize(networkIDMainnet, polygonZKEVMGlobalExitRoot.address, polygonZKEVMAddress);

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory('ERC20PermitMock');
        tokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        await tokenContract.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await polygonZKEVMBridgeContract.globalExitRootManager()).to.be.equal(polygonZKEVMGlobalExitRoot.address);
        expect(await polygonZKEVMBridgeContract.networkID()).to.be.equal(networkIDMainnet);
    });

    it('should PolygonZKEVMBridge and verify merkle proof', async () => {
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

        const rollupExitRoot = await polygonZKEVMGlobalExitRoot.lastRollupExitRoot();

        // create a new deposit
        await expect(tokenContract.approve(polygonZKEVMBridgeContract.address, amount))
            .to.emit(tokenContract, 'Approval')
            .withArgs(deployer.address, polygonZKEVMBridgeContract.address, amount);

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
            .to.emit(polygonZKEVMBridgeContract, 'BridgeEvent')
            .withArgs(originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(polygonZKEVMGlobalExitRoot, 'UpdateGlobalExitRoot')
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
        expect(computedGlobalExitRoot).to.be.equal(await polygonZKEVMGlobalExitRoot.getLastGlobalExitRoot());
    });

    it('shouldnt be able to PolygonZKEVMBridge more thna 0.25e ehters', async () => {
        // Add a claim leaf to rollup exit tree
        const tokenAddress = ethers.constants.AddressZero; // ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        await expect(polygonZKEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            ethers.utils.parseEther('10'),
            { value: ethers.utils.parseEther('10') },
        )).to.be.revertedWith('PolygonZKEVMBridge::bridgeAsset: Cannot bridge more than maxEtherBridge');

        await polygonZKEVMBridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            ethers.utils.parseEther('0.25'),
            '0x',
            { value: ethers.utils.parseEther('0.25') },
        );
    });
});
