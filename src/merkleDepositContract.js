const { ethers } = require("hardhat");
const { expect } = require("chai");


class MerkleTree {
  constructor(height) {
    expect(height).to.be.greaterThan(1)
    this.height = height;
    this.zeroHashes = generateZeroHashes(height);
    const tree = []
    for (let i = 0; i <= height; i++) {
      tree.push([]);
    }
    this.tree = tree;
    this.dirty = false;
    this.index
  }

  add(leaf) {
    this.dirty = true;
    this.tree[0].push(leaf);
  }

  calcBranches() {
    for (let i = 0; i < this.height; i++) {
      const parent = this.tree[i + 1];
      const child = this.tree[i];
      for (let j = 0; j < child.length; j += 2) {
        const leftNode = child[j];
        const rightNode = (j + 1 < child.length) ? child[j + 1] : this.zeroHashes[i];
        parent[j / 2] = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [leftNode, rightNode])
      }
    }
    this.dirty = false;
  }

  getProofTreeByIndex(index) {
    if (this.dirty) this.calcBranches();
    const proof = [];
    let currentIndex = index;
    for (let i = 0; i < this.height; i++) {
      currentIndex = currentIndex % 2 == 1 ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < this.tree[i].length) proof.push(this.tree[i][currentIndex]);
      else proof.push(this.zeroHashes[i]);
      currentIndex /= 2;
    }
    return proof;
  }

  getProofTreeByValue(value) {
    const index = this.tree[0].indexOf(value);
    return getProofTreeByIndex(index);
  }

  getRoot() {
    if (this.dirty) this.calcBranches();
    return this.tree[this.height][0];
  }
}

function generateZeroHashes(height) {
  const zeroHashes = [];
  zeroHashes.push(ethers.constants.HashZero);
  for (let i = 1; i < height; i++) {
    zeroHashes.push(ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [zeroHashes[i - 1], zeroHashes[i - 1]]));
  }
  return zeroHashes;
}

function verifyMerkleProof(leaf, smtProof, index, root) {
  let value = leaf;
  for (let i = 0; i < smtProof.length; i++) {
    if (Math.floor(index / Math.pow(2, i)) % 2 != 0) {
      value = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [smtProof[i], value]);
    } else {
      value = ethers.utils.solidityKeccak256(["bytes32", "bytes32"], [value, smtProof[i]]);
    }
  }
  return value == root;
}


function calculateLeafValue(currentNetwork, tokenAddress, amount, destinationNetwork, destinationAddress) {
  return ethers.utils.solidityKeccak256(["uint32", "address", "uint256", "uint32", "address"], [currentNetwork, tokenAddress, amount, destinationNetwork, destinationAddress]);
}

module.exports = {
  MerkleTree,
  generateZeroHashes,
  verifyMerkleProof,
  calculateLeafValue
};
