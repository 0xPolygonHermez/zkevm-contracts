const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree,
  generateZeroHashes,
  verifyMerkleProof,
  calculateLeafValue } = require("../../src/merkleDepositContract");

describe("Merkle Test", function () {

  it("Check merkle tree", async () => {
    const height = 32;
    const merkleTree = new MerkleTree(height);
    const leafValue = ethers.utils.formatBytes32String("1");
    merkleTree.add(leafValue);
    const root = merkleTree.getRoot()
    const proof = merkleTree.getProofTreeByIndex(0);
    const index = 0;
    const verification = verifyMerkleProof(leafValue, proof, index, root);
    expect(verification).to.be.true;
  });

  it("Check add 1 leaf to the merkle tree", async () => {
    const height = 32;
    const merkleTree = new MerkleTree(height);

    const leafValue = ethers.utils.formatBytes32String("123");
    merkleTree.add(leafValue);

    const root = merkleTree.getRoot()

    // verify root
    const zerHashesArray = merkleTree.zeroHashes;
    let currentNode = leafValue;
    for (let i = 0; i < height; i++) {
      currentNode = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [currentNode, zerHashesArray[i]]);
    }
    expect(currentNode).to.be.equal(root);

    // check merkle proof
    const proof = merkleTree.getProofTreeByIndex(0);
    const index = 0;
    const verification = verifyMerkleProof(leafValue, proof, index, root);
    expect(verification).to.be.true;
  });

  it("Check add 1 leaf to the merkle tree", async () => {
    const height = 32;
    const merkleTree = new MerkleTree(height);

    const leafValue = ethers.utils.formatBytes32String("123");
    const leafValue2 = ethers.utils.formatBytes32String("456");

    merkleTree.add(leafValue);
    merkleTree.add(leafValue2);

    const root = merkleTree.getRoot()

    // verify root;
    const zerHashesArray = merkleTree.zeroHashes;
    let currentNode = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [leafValue, leafValue2]);
    for (let i = 1; i < height; i++) {
      currentNode = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [currentNode, zerHashesArray[i]]);
    }
    expect(currentNode).to.be.equal(root);

    // check merkle proof
    const index = 0;
    const proof = merkleTree.getProofTreeByIndex(index);
    const verification = verifyMerkleProof(leafValue, proof, index, root);
    expect(verification).to.be.true;

    // check merkle proof
    const index2 = 1;
    const proof2 = merkleTree.getProofTreeByIndex(index2);
    const verification2 = verifyMerkleProof(leafValue2, proof2, index2, root);
    expect(verification2).to.be.true;

    // following merkle proofs are invalid
    expect(verifyMerkleProof(leafValue, proof2, index2, root)).to.be.false;
    expect(verifyMerkleProof(leafValue, proof2, index2, proof)).to.be.false;
    expect(verifyMerkleProof(leafValue, proof2, index2, proof)).to.be.false;
    expect(verifyMerkleProof(leafValue, proof2, index2 + 1, proof)).to.be.false;
  });

});
