const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    MerkleTreeBridge,
    verifyMerkleProof,
    calculateLeafValue,
} = require('../../src/merkle-tree-bridge');

describe('Deposit Contract', () => {
    let deployer;

    let depositContractMock;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer] = await ethers.getSigners();

        // deploy bridgeMock
        const depositFactory = await ethers.getContractFactory('DepositContractMock');
        depositContractMock = await depositFactory.deploy();
        await depositContractMock.deployed();
    });

    it('should deposit and verify merkle proof', async () => {
        const originalNetwork = 0; // mainnet
        const tokenAddress = deployer.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await depositContractMock.deposit(tokenAddress, amount, destinationNetwork, destinationAddress);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        const rootSC = await depositContractMock.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
        expect(await depositContractMock.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);
    });

    it('should deposit and verify merkle proof with 2 leafs', async () => {
        const originalNetwork = 0; // mainnet
        const tokenAddress = deployer.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;

        await depositContractMock.deposit(tokenAddress, amount, destinationNetwork, destinationAddress);
        await depositContractMock.deposit(tokenAddress, amount, destinationNetwork, destinationAddress);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        const leafValue2 = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);

        merkleTree.add(leafValue);
        merkleTree.add(leafValue2);

        const rootSC = await depositContractMock.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
        expect(await depositContractMock.verifyMerkleProof(
            tokenAddress,
            amount,
            originalNetwork,
            destinationNetwork,
            destinationAddress,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);
    });

    it('should create a more exhaustive merkle tree test', async () => {

    });
});
