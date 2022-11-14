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

describe('Bridge Mock Contract', () => {
    let deployer;
    let rollup;

    let globalExitRootManager;
    let bridgeContract;
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

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, rollup] = await ethers.getSigners();

        // deploy global exit root manager
        const globalExitRootManagerFactory = await ethers.getContractFactory('GlobalExitRootManager');
        globalExitRootManager = await upgrades.deployProxy(globalExitRootManagerFactory, [], { initializer: false });

        // deploy bridge
        const bridgeFactory = await ethers.getContractFactory('BridgeMock');
        bridgeContract = await upgrades.deployProxy(bridgeFactory, [], { initializer: false });

        await globalExitRootManager.initialize(rollup.address, bridgeContract.address);
        await bridgeContract.initialize(networkIDMainnet, globalExitRootManager.address);

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
        expect(await bridgeContract.globalExitRootManager()).to.be.equal(globalExitRootManager.address);
        expect(await bridgeContract.networkID()).to.be.equal(networkIDMainnet);

        // Smart contracts start with nonce = 1
        const calcualteImplAddr = await ethers.utils.getContractAddress(
            { from: bridgeContract.address, nonce: 1 },
        );
        expect(await bridgeContract.tokenImplementation()).to.be.equal(calcualteImplAddr);
    });

    it('should bridge and verify merkle proof', async () => {
        const depositCount = await bridgeContract.depositCount();
        const originNetwork = networkIDMainnet;
        const tokenAddress = tokenContract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        const metadata = metadataToken;
        const metadataHash = ethers.utils.solidityKeccak256(['bytes'], [metadata]);

        const balanceDeployer = await tokenContract.balanceOf(deployer.address);
        const balanceBridge = await tokenContract.balanceOf(bridgeContract.address);

        const rollupExitRoot = await globalExitRootManager.lastRollupExitRoot();
        const lastGlobalExitRootNum = await globalExitRootManager.lastGlobalExitRootNum();

        // create a new deposit
        await expect(tokenContract.approve(bridgeContract.address, amount))
            .to.emit(tokenContract, 'Approval')
            .withArgs(deployer.address, bridgeContract.address, amount);

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

        await expect(bridgeContract.bridgeAsset(tokenAddress, destinationNetwork, destinationAddress, amount, '0x'))
            .to.emit(bridgeContract, 'BridgeEvent')
            .withArgs(originNetwork, tokenAddress, destinationNetwork, destinationAddress, amount, metadata, depositCount)
            .to.emit(globalExitRootManager, 'UpdateGlobalExitRoot')
            .withArgs(lastGlobalExitRootNum + 1, rootJSMainnet, rollupExitRoot);

        expect(await tokenContract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenContract.balanceOf(bridgeContract.address)).to.be.equal(balanceBridge.add(amount));

        // check merkle root with SC
        const rootSCMainnet = await bridgeContract.getDepositRoot();
        expect(rootSCMainnet).to.be.equal(rootJSMainnet);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSCMainnet)).to.be.equal(true);
        expect(await bridgeContract.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSCMainnet,
        )).to.be.equal(true);

        const computedGlobalExitRoot = calculateGlobalExitRoot(rootJSMainnet, rollupExitRoot);
        expect(computedGlobalExitRoot).to.be.equal(await globalExitRootManager.getLastGlobalExitRoot());
    });

    it('shouldnt be able to bridge more thna 0.25e ehters', async () => {
        // Add a claim leaf to rollup exit tree
        const tokenAddress = ethers.constants.AddressZero; // ether
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDRollup;
        const destinationAddress = deployer.address;

        await expect(bridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            ethers.utils.parseEther('10'),
            { value: ethers.utils.parseEther('10') },
        )).to.be.revertedWith('Bridge::bridge: Cannot bridge more than maxEtherBridge in internal testnet');

        await bridgeContract.bridgeAsset(
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            ethers.utils.parseEther('0.25'),
            '0x',
            { value: ethers.utils.parseEther('0.25') },
        );
    });
});
