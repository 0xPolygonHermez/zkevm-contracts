/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { MTBridge, mtBridgeUtils } from '@0xpolygonhermez/zkevm-commonjs';
import { GlobalExitRootManagerL2SovereignChain, BridgeL2SovereignChain } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const MerkleTreeBridge = MTBridge;
const { getLeafValue } = mtBridgeUtils;

const pathOutput = path.join(__dirname, './output.json');

// eslint-disable-next-line @typescript-eslint/naming-convention
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint64'],
        [newGlobalExitRoot, lastBlockHash, timestamp],
    );
}

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [mainnetExitRoot, rollupExitRoot]);
}

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    }
    return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
}

function simulateGERWithEtherClaims(destinationAddress: any) {
    const networkIDMainnet = 0;
    const LEAF_TYPE_ASSET = 0;

    // Add a claim leaf to rollup exit tree
    const originNetwork = networkIDMainnet;
    const tokenAddress = ethers.ZeroAddress; // ether
    const amount = 1;
    const destinationNetwork = networkIDMainnet;

    const metadata = '0x'; // since is ether does not have metadata
    const metadataHash = ethers.solidityPackedKeccak256(['bytes'], [metadata]);

    // compute root merkle tree in Js
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    const leafValue = getLeafValue(
        LEAF_TYPE_ASSET,
        originNetwork,
        tokenAddress,
        destinationNetwork,
        destinationAddress,
        amount,
        metadataHash,
    );

    // Add couple leafs
    merkleTree.add(leafValue);
    merkleTree.add(leafValue);

    const rootJSRollup = merkleTree.getRoot();
    const merkleTreeRollup = new MerkleTreeBridge(height);
    merkleTreeRollup.add(rootJSRollup);
    const rollupRoot = merkleTreeRollup.getRoot();

    const mainnetExitRoot = ethers.ZeroHash;
    const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupRoot);

    const output = {} as any;

    // Modified: Include mainnetExitRoot and rollupRoot in both claims
    output.computedGlobalExitRoot = computedGlobalExitRoot;
    output.claims = [
        {
            originNetwork,
            tokenAddress,
            amount,
            destinationNetwork,
            destinationAddress,
            metadata,
            proofLocal: merkleTree.getProofTreeByIndex(0),
            proofRollup: merkleTreeRollup.getProofTreeByIndex(0),
            globalIndex: computeGlobalIndex(0, 0, false),
            mainnetExitRoot,
            rollupRoot,
            leafValue,
        },
        {
            originNetwork,
            tokenAddress,
            amount,
            destinationNetwork,
            destinationAddress,
            metadata,
            proofLocal: merkleTree.getProofTreeByIndex(1),
            proofRollup: merkleTreeRollup.getProofTreeByIndex(0),
            globalIndex: computeGlobalIndex(1, 0, false),
            mainnetExitRoot,
            rollupRoot,
            leafValue,
        },
    ];
    return output;
}

async function main() {
    // Load provider
    const currentProvider = ethers.provider;

    // Load deployer
    const deployer = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(process.env.MNEMONIC as string),
        "m/44'/60'/0'/0/0",
    ).connect(currentProvider);

    console.log('deploying with: ', deployer.address);

    // Load initialZkEVMDeployerOwner

    // deploy bridge
    // deploy PolygonZkEVMBridge
    const BridgeL2SovereignChainFactory = await ethers.getContractFactory('BridgeL2SovereignChain');
    const sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
        initializer: false,
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    })) as unknown as BridgeL2SovereignChain;

    // deploy global exit root manager
    const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory(
        'GlobalExitRootManagerL2SovereignChain',
    );
    const sovereignChainGlobalExitRootContract = (await upgrades.deployProxy(
        GlobalExitRootManagerL2SovereignChainFactory,
        [deployer.address, deployer.address], // Initializer params
        {
            initializer: 'initialize', // initializer function name
            constructorArgs: [sovereignChainBridgeContract.target], // Constructor arguments
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        },
    )) as unknown as GlobalExitRootManagerL2SovereignChain;

    console.log('#######################\n');
    console.log(`Sovereign bridge L2: ${sovereignChainGlobalExitRootContract.target}`);

    console.log('you can verify the new impl address with:');
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${sovereignChainGlobalExitRootContract.target} --network ${process.env.HARDHAT_NETWORK}\n`,
    );
    console.log('Copy the following constructor arguments on: upgrade/arguments.js \n', [
        sovereignChainBridgeContract.target,
    ]);

    // intialize the bridge
    await sovereignChainBridgeContract.initialize(
        0,
        ethers.ZeroAddress, // zero for ether
        0, // zero for ether
        sovereignChainGlobalExitRootContract.target,
        ethers.ZeroAddress,
        '0x',
        deployer.address,
        ethers.ZeroAddress,
        false,
    );

    const output = {} as any;
    const receiptDeployment = await (await sovereignChainGlobalExitRootContract.deploymentTransaction())?.wait();

    // insert some gers
    const simulateGERs = simulateGERWithEtherClaims(deployer.address);
    const gerToInsert = [ethers.hexlify(ethers.randomBytes(32)), simulateGERs.computedGlobalExitRoot];
    const globalExitRoots: any[] = [];

    // simulate l1 info tree
    const height = 32;
    const merkleTreeL1InfoTree = new MerkleTreeBridge(height);

    for (let i = 0; i < gerToInsert.length; i++) {
        const ger = gerToInsert[i];

        // insert GER
        console.log('inserting GER: ', ger);
        await (await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(ger)).wait();

        // Simulate l1 info tree
        const block = await ethers.provider.getBlock('latest');
        globalExitRoots.push({
            globalExitRoot: ger,
            blockHash: block?.hash,
            timestamp: block?.timestamp,
        });
        const leafValue = calculateGlobalExitRootLeaf(ger, block?.hash, block?.timestamp);
        merkleTreeL1InfoTree.add(leafValue);
    }

    // compute proofs
    for (let i = 0; i < globalExitRoots.length; i++) {
        const proof = merkleTreeL1InfoTree.getProofTreeByIndex(i);
        globalExitRoots[i].proof = proof;
    }

    // Insert and remove a GER
    const removedGERs: any[] = [];
    for (let i = 0; i < 1; i++) {
        const ger = ethers.hexlify(ethers.randomBytes(32));

        // insert GER
        console.log('inserting GER: ', ger);
        await (await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(ger)).wait();

        // Simulate l1 info tree
        const block = await ethers.provider.getBlock('latest');
        globalExitRoots.push({
            globalExitRoot: ger,
            blockHash: block?.hash,
            timestamp: block?.timestamp,
        });

        // Remove ger
        console.log('removing GER: ', ger);
        await (await sovereignChainGlobalExitRootContract.removeGlobalExitRoots([ger])).wait();
        removedGERs.push(ger);
    }

    // make a bridge transaction to udpate the local exit root
    console.log('making a bridge transaction to update the local exit root');
    const amount = 10;
    await (
        await sovereignChainBridgeContract.bridgeAsset(1, deployer.address, amount, ethers.ZeroAddress, true, '0x', {
            value: amount,
        })
    ).wait();

    // make claim transaction
    const claimedGlobalIndexes: any[] = [];
    const claimedLeafs: any[] = [];

    console.log('making a claim transaction');
    for (let i = 0; i < simulateGERs.claims.length; i++) {
        const claim = simulateGERs.claims[i];
        await (
            await sovereignChainBridgeContract.claimAsset(
                claim.proofLocal,
                claim.proofRollup,
                claim.globalIndex,
                claim.mainnetExitRoot,
                claim.rollupRoot,
                claim.originNetwork,
                claim.tokenAddress,
                claim.destinationNetwork,
                claim.destinationAddress,
                claim.amount,
                claim.metadata,
            )
        ).wait();

        claimedGlobalIndexes.push(claim.globalIndex);
        claimedLeafs.push(claim.leafValue);
    }

    // claim undo
    const undoClaimReceipt = await (
        await sovereignChainBridgeContract.unsetMultipleClaims([simulateGERs.claims[0].globalIndex])
    ).wait();
    const unclaimedGlobalIndexes = [simulateGERs.claims[0].globalIndex];

    output.initialBlockNumber = receiptDeployment?.blockNumber;
    output.finalBlockNumber = undoClaimReceipt?.blockNumber;
    output.gerSovereignAddress = sovereignChainGlobalExitRootContract.target;
    output.globalExitRoots = globalExitRoots;
    output.localExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
    output.l1InfoRoot = merkleTreeL1InfoTree.getRoot();
    output.chainId = Number((await currentProvider.getNetwork()).chainId);
    output.removedGERs = removedGERs;
    output.claimedGlobalIndexes = claimedGlobalIndexes;
    output.unclaimedGlobalIndexes = unclaimedGlobalIndexes;
    output.claimedLeafs = claimedLeafs;

    fs.writeFileSync(pathOutput, JSON.stringify(output, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
