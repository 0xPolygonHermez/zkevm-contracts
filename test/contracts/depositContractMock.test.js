const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
    MerkleTreeBridge,
} = require('../../src/merkle-tree-bridge');
const {
    verifyMerkleProof,
    calculateLeafValue,
} = require('../../src/utils-merkle-tree-bridge');

describe('Deposit Contract', () => {
    let deployer;
    let acc2;
    let depositContractMock;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, acc2] = await ethers.getSigners();

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
        // Different deposits will be created and verified one by one
        // Deposit 1
        let originalNetwork = 0; // mainnet
        let tokenAddress = deployer.address;
        let amount = ethers.utils.parseEther('10');
        let destinationNetwork = 1;
        let destinationAddress = deployer.address;

        await depositContractMock.deposit(tokenAddress, amount, destinationNetwork, destinationAddress);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        let leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        let rootSC = await depositContractMock.getDepositRoot();
        let rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        let index = 0;
        let proof = merkleTree.getProofTreeByIndex(index);

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

        // Deposit 2 - different address and amount
        originalNetwork = 0; // mainnet
        tokenAddress = deployer.address;
        amount = ethers.utils.parseEther('1');
        destinationNetwork = 1;
        destinationAddress = acc2.address;

        await depositContractMock.connect(acc2).deposit(tokenAddress, amount, destinationNetwork, destinationAddress);

        // compute root merkle tree in Js
        leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        rootSC = await depositContractMock.getDepositRoot();
        rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        index += 1;
        proof = merkleTree.getProofTreeByIndex(index);

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

        // Deposit 3 - deposit ether
        originalNetwork = 0; // mainnet
        tokenAddress = ethers.constants.AddressZero; // ether
        amount = ethers.utils.parseEther('100');
        destinationNetwork = 1;
        destinationAddress = acc2.address;
        await depositContractMock.connect(acc2).deposit(tokenAddress, amount, destinationNetwork, destinationAddress);

        // compute root merkle tree in Js
        leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        merkleTree.add(leafValue);

        rootSC = await depositContractMock.getDepositRoot();
        rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        index += 1;
        proof = merkleTree.getProofTreeByIndex(index);

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

        // Deposit lots of transactions
        const txCount = 100;
        const depositCount = Number(await depositContractMock.depositCount());
        amount = ethers.utils.parseEther('0.01');
        leafValue = calculateLeafValue(originalNetwork, tokenAddress, amount, destinationNetwork, destinationAddress);
        const results = [];
        for (let i = 0; i < txCount; i++) {
            const p = depositContractMock.connect(acc2).deposit(tokenAddress, amount, destinationNetwork, destinationAddress).then(() => {
                merkleTree.add(leafValue);
            });
            results.push(p);
        }
        await Promise.all(results);
        // Check roots
        rootSC = await depositContractMock.getDepositRoot();
        rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // Check merkle proof
        // Check random index from the ones generated in the loop
        const promises = [];
        for (let i = 0; i < 10; i++) {
            index = Math.floor(Math.random() * (txCount - depositCount) + depositCount);
            proof = merkleTree.getProofTreeByIndex(index);

            // verify merkle proof
            expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
            const p = depositContractMock.verifyMerkleProof(
                tokenAddress,
                amount,
                originalNetwork,
                destinationNetwork,
                destinationAddress,
                proof,
                index,
                rootSC,
            ).then((res) => {
                expect(res).to.be.equal(true);
            });
            promises.push(p);
        }

        await Promise.all(promises);
    });
});
