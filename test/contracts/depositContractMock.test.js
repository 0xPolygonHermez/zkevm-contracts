const { expect } = require('chai');
const { ethers } = require('hardhat');
const MerkleTreeBridge = require('@0xpolygonhermez/zkevm-commonjs').MTBridge;
const {
    verifyMerkleProof,
    getLeafValue,
} = require('@0xpolygonhermez/zkevm-commonjs').mtBridgeUtils;

describe('Deposit Contract', () => {
    let deployer;
    let acc2;
    let depositContractMock;

    const LEAF_TYPE_ASSET = 0;
    const MESSAGE_TYPE_ASSET = 1;

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, acc2] = await ethers.getSigners();

        // deploy deposit contract mock
        const depositFactory = await ethers.getContractFactory('DepositContractMock');
        depositContractMock = await depositFactory.deploy();
        await depositContractMock.deployed();
    });

    it('should deposit and verify merkle proof', async () => {
        const originNetwork = 0;
        const tokenAddress = deployer.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;
        const metadataHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await depositContractMock.deposit(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValueJs = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const leafValueSC = await depositContractMock.getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        expect(leafValueJs).to.be.equal(leafValueSC);

        merkleTree.add(leafValueJs);

        const rootSC = await depositContractMock.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(leafValueJs, proof, index, rootSC)).to.be.equal(true);

        expect(await depositContractMock.verifyMerkleProof(
            leafValueJs,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);
    });

    it('should deposit and verify merkle proof with 2 leafs', async () => {
        const originNetwork = 0;
        const tokenAddress = deployer.address;
        const amount = ethers.utils.parseEther('10');
        const destinationNetwork = 1;
        const destinationAddress = deployer.address;
        const metadataHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await depositContractMock.deposit(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        await depositContractMock.deposit(
            MESSAGE_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        const leafValueJs = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const leafValueJs2 = getLeafValue(
            MESSAGE_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const leafValueSC = await depositContractMock.getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const leafValueSC2 = await depositContractMock.getLeafValue(
            MESSAGE_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        expect(leafValueJs).to.be.equal(leafValueSC);
        expect(leafValueJs2).to.be.equal(leafValueSC2);

        merkleTree.add(leafValueJs);
        merkleTree.add(leafValueJs2);

        const rootSC = await depositContractMock.getDepositRoot();
        const rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        const index = 0;
        const proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(leafValueJs, proof, index, rootSC)).to.be.equal(true);
        expect(await depositContractMock.verifyMerkleProof(
            leafValueJs,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);
    });

    it('should create a more exhaustive merkle tree test', async () => {
        /*
         * Different deposits will be created and verified one by one
         * Deposit 1
         */
        let originNetwork = 0; // mainnet
        let tokenAddress = deployer.address;
        let amount = ethers.utils.parseEther('10');
        let destinationNetwork = 1;
        let destinationAddress = deployer.address;
        let metadataHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await depositContractMock.deposit(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // compute root merkle tree in Js
        const height = 32;
        const merkleTree = new MerkleTreeBridge(height);
        let leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const leafValueSC = await depositContractMock.getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        expect(leafValue).to.be.equal(leafValueSC);

        merkleTree.add(leafValue);

        let rootSC = await depositContractMock.getDepositRoot();
        let rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        // check merkle proof
        let index = 0;
        let proof = merkleTree.getProofTreeByIndex(index);

        // verify merkle proof
        expect(verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);
        expect(await depositContractMock.verifyMerkleProof(
            leafValue,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        // Deposit 2 - different address and amount
        originNetwork = 0;
        tokenAddress = deployer.address;
        amount = ethers.utils.parseEther('1');
        destinationNetwork = 1;
        destinationAddress = acc2.address;
        metadataHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await depositContractMock.connect(acc2).deposit(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // compute root merkle tree in Js
        leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
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
            leafValue,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        // Deposit 3 - deposit ether
        originNetwork = 0;
        tokenAddress = ethers.constants.AddressZero; // ether
        amount = ethers.utils.parseEther('100');
        destinationNetwork = 1;
        destinationAddress = acc2.address;
        metadataHash = ethers.utils.hexlify(ethers.utils.randomBytes(32));

        await depositContractMock.connect(acc2).deposit(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );

        // compute root merkle tree in Js
        leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
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
            leafValue,
            proof,
            index,
            rootSC,
        )).to.be.equal(true);

        // Deposit lots of transactions
        const txCount = 100;
        const depositCount = Number(await depositContractMock.depositCount());
        amount = ethers.utils.parseEther('0.01');
        leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash,
        );
        const results = [];
        for (let i = 0; i < txCount; i++) {
            const p = depositContractMock.connect(acc2).deposit(
                LEAF_TYPE_ASSET,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash,
            ).then(() => {
                merkleTree.add(leafValue);
            });
            results.push(p);
        }
        await Promise.all(results);
        // Check roots
        rootSC = await depositContractMock.getDepositRoot();
        rootJS = merkleTree.getRoot();

        expect(rootSC).to.be.equal(rootJS);

        /*
         * Check merkle proof
         * Check random index from the ones generated in the loop
         */
        const promises = [];
        for (let i = 0; i < 10; i++) {
            index = Math.floor(Math.random() * (txCount - depositCount) + depositCount);
            proof = merkleTree.getProofTreeByIndex(index);

            // verify merkle proof
            expect(verifyMerkleProof(leafValue, proof, index, rootSC)).to.be.equal(true);
            const p = depositContractMock.verifyMerkleProof(
                leafValue,
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
