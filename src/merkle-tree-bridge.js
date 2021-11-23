const { ethers } = require('hardhat');
const { expect } = require('chai');
const {
    generateZeroHashes,
} = require('./utils-merkle-tree-bridge');

class MerkleTreeBridge {
    constructor(height) {
        expect(height).to.be.greaterThan(1);
        this.height = height;
        this.zeroHashes = generateZeroHashes(height);
        const tree = [];
        for (let i = 0; i <= height; i++) {
            tree.push([]);
        }
        this.tree = tree;
        this.dirty = false;
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
                parent[j / 2] = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [leftNode, rightNode]);
            }
        }
        this.dirty = false;
    }

    getProofTreeByIndex(index) {
        if (this.dirty) this.calcBranches();
        const proof = [];
        let currentIndex = index;
        for (let i = 0; i < this.height; i++) {
            currentIndex = currentIndex % 2 === 1 ? currentIndex - 1 : currentIndex + 1;
            if (currentIndex < this.tree[i].length) proof.push(this.tree[i][currentIndex]);
            else proof.push(this.zeroHashes[i]);
            currentIndex /= 2;
        }
        return proof;
    }

    getProofTreeByValue(value) {
        const index = this.tree[0].indexOf(value);
        return this.getProofTreeByIndex(index);
    }

    getRoot() {
        if (this.tree[0][0] === undefined) {
            // No leafs in the tree, calculate root with all leafs to 0
            return ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [this.zeroHashes[this.height - 1], this.zeroHashes[this.height - 1]]);
        }
        if (this.dirty) this.calcBranches();
        return this.tree[this.height][0];
    }
}

module.exports = {
    MerkleTreeBridge,
};
