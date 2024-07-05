/* eslint-disable no-console */
const { MTBridge, mtBridgeUtils } = require('@0xpolygonhermez/zkevm-commonjs');

const { verifyMerkleProof } = mtBridgeUtils;

const LEAF_LENGTH = 32 * 2; // 32 bytes * 2 hex characters per byte

function decodeLeaves(leavesEncoded) {
    const leaves = [];
    const numberOfLeaves = leavesEncoded.length / LEAF_LENGTH;
    for (let i = 0; i < numberOfLeaves; i++) {
        leaves.push(`0x${leavesEncoded.slice(i * LEAF_LENGTH, (i + 1) * LEAF_LENGTH)}`);
    }
    return leaves;
}

function makeTreeAndGetRoot(height, encodedLeaves) {
    const leaves = decodeLeaves(encodedLeaves);
    const tree = new MTBridge(height);
    leaves.forEach((leaf) => tree.add(leaf));
    console.log(tree.getRoot());
    return tree.getRoot();
}

function makeTreeAndGetProofByIndex(height, encodedLeaves, index) {
    const leaves = decodeLeaves(encodedLeaves);
    index = parseInt(index, 10);
    const tree = new MTBridge(height);
    leaves.forEach((leaf) => tree.add(leaf));
    const proof = tree.getProofTreeByIndex(index);
    const proofBytesString = `0x${proof.reduce((acc, el) => acc + el.slice(2), '')}`;
    console.log(proofBytesString);
    return tree.getProofTreeByValue(index);
}

function makeTreeAndVerifyProof(height, encodedLeaves, index, root) {
    const leaves = decodeLeaves(encodedLeaves);
    index = parseInt(index, 10);
    const tree = new MTBridge(height);
    leaves.forEach((leaf) => tree.add(leaf));
    const proof = tree.getProofTreeByValue(index);
    console.log(verifyMerkleProof(leaves[index], proof, index, root));
    return verifyMerkleProof(leaves[index], proof, index, root);
}

function main(args) {
    const [command, ...rest] = args;
    switch (command) {
    case 'makeTreeAndGetRoot':
        return makeTreeAndGetRoot(...rest);
    case 'makeTreeAndGetProofByIndex':
        return makeTreeAndGetProofByIndex(...rest);
    case 'makeTreeAndVerifyProof':
        return makeTreeAndVerifyProof(...rest);
    default:
        throw new Error('Usage: zkevm-commonjs-wrapper.js <command> <args>');
    }
}

try {
    main(process.argv.slice(2));
} catch (e) {
    console.error(e);
    process.exit(1);
}
