const { ethers } = require('hardhat');

function generateZeroHashes(height) {
    const zeroHashes = [];
    zeroHashes.push(ethers.constants.HashZero);
    for (let i = 1; i < height; i++) {
        zeroHashes.push(ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [zeroHashes[i - 1], zeroHashes[i - 1]]));
    }
    return zeroHashes;
}

function verifyMerkleProof(leaf, smtProof, index, root) {
    let value = leaf;
    for (let i = 0; i < smtProof.length; i++) {
        if (Math.floor(index / 2 ** i) % 2 !== 0) {
            value = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [smtProof[i], value]);
        } else {
            value = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [value, smtProof[i]]);
        }
    }
    return value === root;
}

function calculateLeafValue(currentNetwork, tokenAddress, amount, destinationNetwork, destinationAddress) {
    return ethers.utils.solidityKeccak256(['uint32', 'address', 'uint256', 'uint32', 'address'], [currentNetwork, tokenAddress, amount, destinationNetwork, destinationAddress]);
}

module.exports = {
    generateZeroHashes,
    verifyMerkleProof,
    calculateLeafValue,
};
