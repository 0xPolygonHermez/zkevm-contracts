/* eslint-disable no-undef */
/* eslint-disable no-console */
const {
    MemDB, ZkEVMDB, getPoseidon, smtUtils, MTBridge, mtBridgeUtils,
} = require('@0xpolygonhermez/zkevm-commonjs');

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

async function calculateRoot(genesisJson) {
    const parsedGenesis = JSON.parse(genesisJson);

    const genesis = [];
    // eslint-disable-next-line no-restricted-syntax
    for (entry of parsedGenesis.genesis) {
        if (entry.contractName !== null) {
            genesis.push({
                contractName: entry.contractName,
                balance: BigInt(entry.balance),
                nonce: BigInt(entry.nonce),
                address: entry.address,
                bytecode: entry.bytecode,
                storage: entry.storage,
            });
        } else if (entry.accountName !== null) {
            genesis.push({
                accountName: entry.accountName,
                balance: BigInt(entry.balance),
                nonce: BigInt(entry.nonce),
                address: entry.address,
            });
        }
    }

    const poseidon = await getPoseidon();
    const { F } = poseidon;
    const db = new MemDB(F);
    const genesisRoot = [F.zero, F.zero, F.zero, F.zero];
    const accHashInput = [F.zero, F.zero, F.zero, F.zero];
    const defaultChainId = 1000;

    const zkEVMDB = await ZkEVMDB.newZkEVM(
        db,
        poseidon,
        genesisRoot,
        accHashInput,
        genesis,
        null,
        null,
        defaultChainId,
    );

    const root = smtUtils.h4toString(zkEVMDB.stateRoot);
    console.log(root);
    return root;
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
    case 'calculateRoot':
        return calculateRoot(...rest);
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
