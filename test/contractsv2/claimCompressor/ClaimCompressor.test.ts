import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    VerifierRollupHelperMock,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRoot,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMV2,
    PolygonRollupBase,
    TokenWrapped,
    ClaimCompressor,
    BridgeReceiverMock,
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;
import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";
import {deploy} from "@openzeppelin/hardhat-upgrades/dist/utils";
import {parse} from "yargs";

describe("Claim Compressor Contract", () => {
    upgrades.silenceWarnings();

    let claimCompressor: ClaimCompressor;
    let bridgeReceiverMock: BridgeReceiverMock;
    let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
    let polTokenContract: ERC20PermitMock;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    const networkID = 1;

    const tokenName = "Matic Token";
    const tokenSymbol = "MATIC";
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther("20000000");
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "uint8"],
        [tokenName, tokenSymbol, decimals]
    );
    const networkIDMainnet = 0;
    const networkIDRollup = 1;

    const LEAF_TYPE_ASSET = 0;
    const LEAF_TYPE_MESSAGE = 1;

    let deployer: any;
    let rollupManager: any;
    let acc1: any;
    let bridge: any;

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, rollupManager, acc1, bridge] = await ethers.getSigners();

        // deploy receiver
        const BridgeReceiverFactory = await ethers.getContractFactory("BridgeReceiverMock");
        bridgeReceiverMock = await BridgeReceiverFactory.deploy();
        await bridgeReceiverMock.waitForDeployment();

        // deploy global exit root manager
        const ClaimCompressorFactory = await ethers.getContractFactory("ClaimCompressor");
        claimCompressor = await ClaimCompressorFactory.deploy(bridgeReceiverMock.target, networkID);
        await claimCompressor.waitForDeployment();

        // Deploy bridge contracts
        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = (await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as PolygonZkEVMBridgeV2;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            polygonZkEVMBridgeContract.target
        );

        await polygonZkEVMBridgeContract.initialize(
            networkID,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            "0x"
        );

        // deploy token
        const maticTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        polTokenContract = await maticTokenFactory.deploy(
            tokenName,
            tokenSymbol,
            deployer.address,
            tokenInitialBalance
        );
    });

    it("should check random values", async () => {
        const BridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const totalLeafsMerkleTree = 20;

        const leafs = [];
        for (let i = 0; i < totalLeafsMerkleTree; i++) {
            // Create a random merkle tree
            const originNetwork = ethers.hexlify(ethers.randomBytes(4));
            const tokenAddress = ethers.hexlify(ethers.randomBytes(20));
            const amount = ethers.parseEther("10");
            const destinationNetwork = networkID; // fixed by contract
            const destinationAddress = ethers.hexlify(ethers.randomBytes(20));
            const metadata = ethers.hexlify(ethers.randomBytes(Math.floor(Math.random() * 1000)));
            const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);
            const leafType = Math.floor(Math.random() * 2);
            const leafValue = getLeafValue(
                leafType,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash
            );
            merkleTreeLocal.add(leafValue);
            leafs.push({
                leafType,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            });
        }

        const mainnetExitRoot = merkleTreeLocal.getRoot();
        const rollupExitRoot = ethers.hexlify(ethers.randomBytes(32));

        // Mock rollup root, not necessary now
        const randomIndex = 10;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(randomIndex);

        // Compute calldatas
        for (let i = 1; i < totalLeafsMerkleTree; i++) {
            const sequenceForcedStructs = [] as any;

            for (let j = 0; j < i; j++) {
                const index = j;
                const currentLeaf = leafs[j];
                const proofLocal = merkleTreeLocal.getProofTreeByIndex(j);

                const sequenceForced = {
                    smtProofRollupExitRoot: proofLocal,
                    smtProofLocalExitRoot: proofLocal,
                    globalIndex: index,
                    originNetwork: currentLeaf.originNetwork,
                    originAddress: currentLeaf.tokenAddress,
                    destinationAddress: currentLeaf.destinationAddress,
                    amount: currentLeaf.amount,
                    metadata: currentLeaf.metadata,
                    isMessage: currentLeaf.leafType,
                } as any;

                sequenceForcedStructs.push(sequenceForced);
            }

            const compressedMultipleBytes = await claimCompressor.compressClaimCall(
                mainnetExitRoot,
                rollupExitRoot,
                sequenceForcedStructs
            );

            // ASsert correctness
            const receipt = await (await claimCompressor.sendCompressedClaims(compressedMultipleBytes)).wait();
            for (let k = 0; k < receipt?.logs.length; k++) {
                const currentLog = receipt?.logs[k];
                const currenSequenceForcedStructs = sequenceForcedStructs[k];

                const decodeFunctionName = currenSequenceForcedStructs.isMessage ? "claimMessage" : "claimAsset";

                const encodedCall = BridgeFactory.interface.encodeFunctionData(decodeFunctionName, [
                    currenSequenceForcedStructs.smtProofLocalExitRoot,
                    proofLocal,
                    currenSequenceForcedStructs.globalIndex,
                    mainnetExitRoot,
                    rollupExitRoot,
                    currenSequenceForcedStructs.originNetwork,
                    currenSequenceForcedStructs.originAddress,
                    networkID, // constant
                    currenSequenceForcedStructs.destinationAddress,
                    currenSequenceForcedStructs.amount,
                    currenSequenceForcedStructs.metadata,
                ]);

                const parsedLog = bridgeReceiverMock.interface.parseLog(currentLog);
                expect(parsedLog?.args.smtProofLocalExitRoot).to.be.deep.equal(
                    currenSequenceForcedStructs.smtProofLocalExitRoot
                );
                expect(parsedLog?.args.smtProofRollupExitRoot).to.be.deep.equal(
                    currenSequenceForcedStructs.smtProofRollupExitRoot
                );
                expect(parsedLog?.args.globalIndex).to.be.equal(currenSequenceForcedStructs.globalIndex);
                expect(parsedLog?.args.mainnetExitRoot).to.be.equal(mainnetExitRoot);
                expect(parsedLog?.args.rollupExitRoot).to.be.equal(rollupExitRoot);
                expect(parsedLog?.args.originNetwork).to.be.equal(currenSequenceForcedStructs.originNetwork);
                expect(parsedLog?.args.originTokenAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.originAddress
                );
                expect(parsedLog?.args.destinationNetwork).to.be.equal(networkID);
                expect(parsedLog?.args.destinationAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.destinationAddress
                );
                expect(parsedLog?.args.amount).to.be.equal(currenSequenceForcedStructs.amount);
                expect(parsedLog?.args.metadata).to.be.equal(currenSequenceForcedStructs.metadata);
            }
        }
    });

    it("should test against bridge", async () => {
        const BridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");

        const ClaimCompressorFactory = await ethers.getContractFactory("ClaimCompressor");
        const realClaimCompressor = await ClaimCompressorFactory.deploy(polygonZkEVMBridgeContract.target, networkID);
        await realClaimCompressor.waitForDeployment();

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);

        const totalLeafsMerkleTree = 10;

        const leafs = [];
        for (let i = 0; i < totalLeafsMerkleTree; i++) {
            // Create a random merkle tree
            const leafType = Math.floor(Math.random() * 2);
            const originNetwork = ethers.hexlify(ethers.randomBytes(4));
            const tokenAddress = ethers.hexlify(ethers.randomBytes(20));
            const amount = leafType == 0 ? ethers.hexlify(ethers.randomBytes(32)) : 0;
            const destinationNetwork = networkID; // fixed by contract
            const destinationAddress = ethers.hexlify(ethers.randomBytes(20));
            const metadata = metadataToken;
            const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

            const leafValue = getLeafValue(
                leafType,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadataHash
            );
            merkleTreeLocal.add(leafValue);
            leafs.push({
                leafType,
                originNetwork,
                tokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                metadata,
            });
        }

        const rollupExitRoot = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        const mainnetExitRoot = merkleTreeLocal.getRoot();

        // add rollup Merkle root
        await ethers.provider.send("hardhat_impersonateAccount", [polygonZkEVMBridgeContract.target]);
        const bridgemoCK = await ethers.getSigner(polygonZkEVMBridgeContract.target as any);

        await expect(polygonZkEVMGlobalExitRoot.connect(bridgemoCK).updateExitRoot(mainnetExitRoot, {gasPrice: 0}))
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateGlobalExitRoot")
            .withArgs(mainnetExitRoot, rollupExitRoot);

        // check roots
        const rollupExitRootSC = await polygonZkEVMGlobalExitRoot.lastRollupExitRoot();
        expect(rollupExitRootSC).to.be.equal(rollupExitRoot);
        const mainnetExitRootSC = await polygonZkEVMGlobalExitRoot.lastMainnetExitRoot();
        expect(mainnetExitRootSC).to.be.equal(mainnetExitRoot);
        const computedGlobalExitRoot = calculateGlobalExitRoot(mainnetExitRoot, rollupExitRootSC);
        expect(computedGlobalExitRoot).to.be.equal(await polygonZkEVMGlobalExitRoot.getLastGlobalExitRoot());

        // Merkle proof local
        const proofLocalFirst = merkleTreeLocal.getProofTreeByIndex(0);

        const snapshot = await takeSnapshot();

        // Compute calldatas
        for (let i = 1; i < totalLeafsMerkleTree; i++) {
            await snapshot.restore();

            const sequenceForcedStructs = [] as any;

            for (let j = 0; j < i; j++) {
                const index = j;
                const currentLeaf = leafs[j];
                const proofLocal = merkleTreeLocal.getProofTreeByIndex(j);

                const globalIndex = computeGlobalIndex(index, 0, true);

                const sequenceForced = {
                    smtProofRollupExitRoot: proofLocal,
                    smtProofLocalExitRoot: proofLocal,
                    globalIndex: globalIndex,
                    originNetwork: currentLeaf.originNetwork,
                    originAddress: currentLeaf.tokenAddress,
                    destinationAddress: currentLeaf.destinationAddress,
                    amount: currentLeaf.amount,
                    metadata: currentLeaf.metadata,
                    isMessage: currentLeaf.leafType,
                } as any;

                sequenceForcedStructs.push(sequenceForced);

                if (currentLeaf.leafType == 0) {
                    await polygonZkEVMBridgeContract.claimAsset.estimateGas(
                        proofLocal,
                        proofLocalFirst,
                        globalIndex,
                        mainnetExitRoot,
                        rollupExitRootSC,
                        currentLeaf.originNetwork,
                        currentLeaf.tokenAddress,
                        networkID,
                        currentLeaf.destinationAddress,
                        currentLeaf.amount,
                        currentLeaf.metadata
                    );
                } else {
                    await polygonZkEVMBridgeContract.claimMessage.estimateGas(
                        proofLocal,
                        proofLocalFirst,
                        globalIndex,
                        mainnetExitRoot,
                        rollupExitRootSC,
                        currentLeaf.originNetwork,
                        currentLeaf.tokenAddress,
                        networkID,
                        currentLeaf.destinationAddress,
                        currentLeaf.amount,
                        currentLeaf.metadata
                    );
                }
            }

            const compressedMultipleBytes = await realClaimCompressor.compressClaimCall(
                mainnetExitRoot,
                rollupExitRootSC,
                sequenceForcedStructs
            );

            // ASsert correctness
            const receipt = await (await realClaimCompressor.sendCompressedClaims(compressedMultipleBytes)).wait();

            console.log({
                numClaims: i,
                gasUsed: receipt?.gasUsed,
            });

            let currentSequenceForcedStructs = 0;
            for (let k = 0; k < receipt?.logs.length; k++) {
                const currentLog = receipt?.logs[k];
                if (currentLog?.address != polygonZkEVMBridgeContract.target) {
                    continue;
                } else {
                    const parsedLog = BridgeFactory.interface.parseLog(currentLog);
                    if (parsedLog.name == "NewWrappedToken") {
                        continue;
                    }
                }
                const currenSequenceForcedStructs = sequenceForcedStructs[currentSequenceForcedStructs];

                const parsedLog = BridgeFactory.interface.parseLog(currentLog);

                expect(parsedLog?.args.globalIndex).to.be.deep.equal(currenSequenceForcedStructs.globalIndex);
                expect(parsedLog?.args.originNetwork).to.be.equal(currenSequenceForcedStructs.originNetwork);
                expect(parsedLog?.args.originAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.originAddress
                );
                expect(parsedLog?.args.destinationAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.destinationAddress
                );
                expect(parsedLog?.args.amount).to.be.equal(currenSequenceForcedStructs.amount);
                currentSequenceForcedStructs++;
            }

            expect(currentSequenceForcedStructs).to.be.equal(sequenceForcedStructs.length);
        }
    }).timeout(1000000);
    it("should check Compression", async () => {
        const BridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");

        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.hexlify(ethers.randomBytes(20));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkID;
        const destinationAddress = acc1.address;
        const metadata = metadataToken;
        const metadataHash = ethers.solidityPackedKeccak256(["bytes"], [metadata]);

        // compute root merkle tree in Js
        const height = 32;
        const merkleTreeLocal = new MerkleTreeBridge(height);
        const leafValue = getLeafValue(
            LEAF_TYPE_ASSET,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );
        for (let i = 0; i < 8; i++) {
            merkleTreeLocal.add(leafValue);
        }

        const mainnetExitRoot = merkleTreeLocal.getRoot();

        const index = 0;
        const proofLocal = merkleTreeLocal.getProofTreeByIndex(index);

        const indexRandom = 3;

        const proofZeroes = new Array(32).fill(ethers.ZeroHash);
        const encodedCall = BridgeFactory.interface.encodeFunctionData("claimAsset", [
            proofLocal,
            proofZeroes,
            indexRandom,
            mainnetExitRoot,
            ethers.ZeroHash,
            originNetwork,
            tokenAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata,
        ]);

        const newWallet = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase("test test test test test test test test test test test junk"),
            `m/44'/60'/0'/0/0`
        );

        const tx = {
            data: encodedCall,
            to: bridge.address,
            nonce: 1,
            gasLimit: 200000,
            gasPrice: ethers.parseUnits("10", "gwei"),
            chainId: 5,
        };

        const txSigned = await newWallet.signTransaction(tx);

        // Get claim tx bytes calldata
        const customSignedTx = processorUtils.rawTxToCustomRawTx(txSigned);

        // Compute calldatas
        for (let i = 1; i < 20; i++) {
            const sequenceForcedStructs = [] as any;

            for (let j = 0; j < i; j++) {
                const index = i;
                const proofLocal = merkleTreeLocal.getProofTreeByIndex(i);

                const sequenceForced = {
                    smtProofLocalExitRoot: proofLocal,
                    smtProofRollupExitRoot: proofZeroes,
                    globalIndex: index,
                    originNetwork: originNetwork,
                    originAddress: tokenAddress,
                    destinationAddress: destinationAddress,
                    amount: amount,
                    metadata: metadata,
                    isMessage: false,
                } as any;

                sequenceForcedStructs.push(sequenceForced);
            }

            const compressedMultipleBytes = await claimCompressor.compressClaimCall(
                mainnetExitRoot,
                ethers.ZeroHash,
                sequenceForcedStructs
            );

            // ASsert correctness
            let lastSmtRollupCopied = new Array(32).fill(ethers.ZeroHash); // TODO could be set to zero hashes

            const receipt = await (await claimCompressor.sendCompressedClaims(compressedMultipleBytes)).wait();
            for (let k = 0; k < receipt?.logs.length; k++) {
                const currentLog = receipt?.logs[k];
                const currenSequenceForcedStructs = sequenceForcedStructs[k];

                const decodeFunctionName = currenSequenceForcedStructs.isMessage ? "claimMessage" : "claimAsset";

                const encodedCall = BridgeFactory.interface.encodeFunctionData(decodeFunctionName, [
                    currenSequenceForcedStructs.smtProofLocalExitRoot,
                    proofLocal,
                    currenSequenceForcedStructs.globalIndex,
                    mainnetExitRoot,
                    ethers.ZeroHash,
                    currenSequenceForcedStructs.originNetwork,
                    currenSequenceForcedStructs.originAddress,
                    destinationNetwork, // constant
                    currenSequenceForcedStructs.destinationAddress,
                    currenSequenceForcedStructs.amount,
                    currenSequenceForcedStructs.metadata,
                ]);

                const parsedLog = bridgeReceiverMock.interface.parseLog(currentLog);
                //expect(parsedLog?.args[0]).to.be.equal(encodedCall);

                expect(parsedLog?.args.smtProofLocalExitRoot).to.be.deep.equal(
                    currenSequenceForcedStructs.smtProofLocalExitRoot
                );

                let isZeroArray = true;

                for (const element of parsedLog?.args.smtProofRollupExitRoot) {
                    if (element != ethers.ZeroHash) {
                        isZeroArray = false;
                    }
                }

                if (isZeroArray) {
                    expect(parsedLog?.args.smtProofRollupExitRoot).to.be.deep.equal(lastSmtRollupCopied);
                } else {
                    expect(parsedLog?.args.smtProofRollupExitRoot).to.be.deep.equal(
                        currenSequenceForcedStructs.smtProofRollupExitRoot
                    );
                    lastSmtRollupCopied = currenSequenceForcedStructs.smtProofRollupExitRoot;
                }

                expect(parsedLog?.args.globalIndex).to.be.equal(currenSequenceForcedStructs.globalIndex);
                expect(parsedLog?.args.mainnetExitRoot).to.be.equal(mainnetExitRoot);
                expect(parsedLog?.args.rollupExitRoot).to.be.equal(ethers.ZeroHash);
                expect(parsedLog?.args.originNetwork).to.be.equal(currenSequenceForcedStructs.originNetwork);
                expect(parsedLog?.args.originTokenAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.originAddress
                );
                expect(parsedLog?.args.destinationNetwork).to.be.equal(networkID);
                expect(parsedLog?.args.destinationAddress.toLowerCase()).to.be.equal(
                    currenSequenceForcedStructs.destinationAddress.toLowerCase()
                );
                expect(parsedLog?.args.amount).to.be.equal(currenSequenceForcedStructs.amount);
                expect(parsedLog?.args.metadata).to.be.equal(currenSequenceForcedStructs.metadata);
            }

            const txCompressedMultiple = {
                data: compressedMultipleBytes,
                to: bridge.address,
                nonce: 1,
                gasLimit: 200000,
                gasPrice: ethers.parseUnits("10", "gwei"),
                chainId: 5,
            };

            const txCompressedMultipleSigned = await newWallet.signTransaction(txCompressedMultiple);
            const customtxCompressedMultipleSigned = processorUtils.rawTxToCustomRawTx(txCompressedMultipleSigned);

            const customSignedCost = calculateCallDataCost(customSignedTx);
            const customCompressedMultipleCost = calculateCallDataCost(customtxCompressedMultipleSigned);

            console.log({
                numClaims: i,
                gasUsed: receipt?.gasUsed,
                dataClaimCall: encodedCall.length * i,
                dataCompressedCall: compressedMultipleBytes.length,
                ratioData: compressedMultipleBytes.length / (encodedCall.length * i),
                dataTotalTxClaimCall: (customSignedTx.length / 2) * i,
                costCalldataTxClaimCall: customSignedCost * i,
                dataTotalTxCompressedCall: customtxCompressedMultipleSigned.length / 2,
                calldataCostTxCompressed: customCompressedMultipleCost,
                ratioTxData: customtxCompressedMultipleSigned.length / (customSignedTx.length * i),
                ratioTxDataCost: customCompressedMultipleCost / (customSignedCost * i),
            });
        }
    });
});

function calculateCallDataCost(calldataBytes: string): number {
    const bytesArray = ethers.getBytes(calldataBytes);
    let totalCost = 0;
    for (const bytes of bytesArray) {
        if (bytes == 0) {
            totalCost += 4;
        } else {
            totalCost += 16;
        }
    }

    return totalCost;
}

function calculateGlobalExitRoot(mainnetExitRoot: any, rollupExitRoot: any) {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [mainnetExitRoot, rollupExitRoot]);
}
const _GLOBAL_INDEX_MAINNET_FLAG = 2n ** 64n;

function computeGlobalIndex(indexLocal: any, indexRollup: any, isMainnet: Boolean) {
    if (isMainnet === true) {
        return BigInt(indexLocal) + _GLOBAL_INDEX_MAINNET_FLAG;
    } else {
        return BigInt(indexLocal) + BigInt(indexRollup) * 2n ** 32n;
    }
}
