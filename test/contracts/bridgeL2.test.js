const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    MerkleTreeBridge,
} = require('../../src/bridge-merkle-tree/merkle-tree-bridge');
const {
    verifyMerkleProof,
    calculateLeafValue,
} = require('../../src/bridge-merkle-tree/utils-merkle-tree-bridge');

function calculateGlobalExitRoot(mainnetExitRoot, rollupExitRoot) {
    return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

describe('BridgeL2 Contract', () => {
    let deployer;

    let bridgeL2Contract;
    let tokenL2Contract;

    const tokenName = 'Matic Token';
    const tokenSymbol = 'MATIC';
    const tokenInitialBalance = ethers.utils.parseEther('20000000');
    const networkID = 1;
    const networkIDMainnet = 0;
    const addressMockTokenL1 = '0x0000000000000000000000000000000000001234';

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer] = await ethers.getSigners();

        // deploy bridgeMock
        const bridgeL2Factory = await ethers.getContractFactory('BridgeL2Mock');
        bridgeL2Contract = await bridgeL2Factory.deploy(networkID);
        await bridgeL2Contract.deployed();

        // deploy token
        const tokenL2 = await ethers.getContractFactory('ERC20PermitMock');
        tokenL2Contract = await tokenL2.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance,
        );
        await tokenL2Contract.deployed();
    });

    it('should check the constructor parameters', async () => {
        expect(await bridgeL2Contract.networkID()).to.be.equal(networkID);
        expect(await bridgeL2Contract.lastGlobalExitRootNum()).to.be.equal(0);
        expect(await bridgeL2Contract.getLastGlobalExitRoot()).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');
    });

    it('should bridge and verify merkle proof', async () => {
        const depositCount = await bridgeL2Contract.depositCount();
        const originalNetwork = networkID; // mainnet
        const tokenAddress = tokenL2Contract.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkIDMainnet;
        const destinationAddress = deployer.address;

        const balanceDeployer = await tokenL2Contract.balanceOf(deployer.address);
        const balanceBridge = await tokenL2Contract.balanceOf(bridgeL2Contract.address);

        // create a new deposit
        await expect(tokenL2Contract.approve(bridgeL2Contract.address, amount))
            .to.emit(tokenL2Contract, 'Approval')
            .withArgs(deployer.address, bridgeL2Contract.address, amount);

        await expect(bridgeL2Contract.bridge(tokenAddress, amount, destinationNetwork, destinationAddress))
            .to.emit(bridgeL2Contract, 'BridgeEvent')
            .withArgs(tokenAddress, amount, originalNetwork, destinationNetwork, destinationAddress, depositCount);

        expect(await tokenL2Contract.balanceOf(deployer.address)).to.be.equal(balanceDeployer.sub(amount));
        expect(await tokenL2Contract.balanceOf(bridgeL2Contract.address)).to.be.equal(balanceBridge.add(amount));

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        // check merkle root with SC
        const rootSC = await bridgeL2Contract.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
        expect(await bridgeL2Contract.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        expect(rootSC).to.be.equal(await bridgeL2Contract.lastLocalExitRoot());
    });

    it('should claim a bridge from L1', async () => {
        const originalNetwork = networkIDMainnet;
        const originalTokenAddress = addressMockTokenL1;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = networkID;
        const destinationAddress = deployer.address;

        // compute mainnet root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, originalTokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);
        const rootMainnetJS = merkleTree.getRoot();

        const localExitRoot = await bridgeL2Contract.lastLocalExitRoot();
        const computedGlobalExitRoot = calculateGlobalExitRoot(rootMainnetJS, localExitRoot);
        await bridgeL2Contract.setLastGlobalExitRoot(computedGlobalExitRoot);

        // check merkle proof
        const proof = merkleTree.getProofTreeByIndex(0);
        const index = 0;

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootMainnetJS)).to.be.equal(true);
        expect(await bridgeL2Contract.verifyMerkleProof(
            originalTokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootMainnetJS,
        )).to.be.equal(true);

        // withdraw
        const lastGlobalExitRootNum = await bridgeL2Contract.lastGlobalExitRootNum();

        // precalculate wrapped erc20 address
        const precalculateWrappedErc20 = await ethers.utils.getContractAddress(
            { from: bridgeL2Contract.address, nonce: (await ethers.provider.getTransactionCount(bridgeL2Contract.address)) },
        );

        await expect(bridgeL2Contract.claim(
            originalTokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            rootMainnetJS,
            localExitRoot,
        ))
            .to.emit(bridgeL2Contract, 'ClaimEvent')
            .withArgs(
                index,
                originalNetwork,
                originalTokenAddress,
                amount,
                destinationAddress,
            )
            .to.emit(bridgeL2Contract, 'NewWrappedToken')
            .withArgs(originalNetwork, originalTokenAddress, precalculateWrappedErc20);

        // Can't withdraw because nullifier
        await expect(bridgeL2Contract.claim(
            originalTokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            lastGlobalExitRootNum,
            rootMainnetJS,
            localExitRoot,
        )).to.be.revertedWith('Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW');
    });
});
