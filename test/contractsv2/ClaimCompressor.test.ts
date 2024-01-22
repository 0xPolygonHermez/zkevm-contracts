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
} from "../../typechain-types";
import {takeSnapshot, time} from "@nomicfoundation/hardhat-network-helpers";
import {processorUtils, contractUtils, MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const {calculateSnarkInput, calculateAccInputHash, calculateBatchHashData} = contractUtils;
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;
import {MemDB, ZkEVMDB, getPoseidon, smtUtils, processorUtils} from "@0xpolygonhermez/zkevm-commonjs";

describe("PolygonZkEVMBridge Contract", () => {
    upgrades.silenceWarnings();

    let claimCompressor: ClaimCompressor;

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

        // deploy global exit root manager
        const ClaimCompressorFactory = await ethers.getContractFactory("ClaimCompressor");
        claimCompressor = await ClaimCompressorFactory.deploy(bridge.address, networkID);
        await claimCompressor.waitForDeployment();
    });

    it("should check Compression", async () => {
        const BridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridge");

        const originNetwork = networkIDMainnet;
        const tokenAddress = ethers.hexlify(ethers.randomBytes(20));
        const amount = ethers.parseEther("10");
        const destinationNetwork = networkIDMainnet;
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

        const encodedCall = BridgeFactory.interface.encodeFunctionData("claimAsset", [
            proofLocal,
            index,
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
            const proofs = [] as any;
            const indexes = [] as any;
            const tokenAddresses = [];
            const destinationAddresses = [];
            const amounts = [];
            const metadatas = [];
            const isClaimeds = [];

            for (let j = 0; j < i; j++) {
                const index = i;
                const proofLocal = merkleTreeLocal.getProofTreeByIndex(i);

                proofs.push(proofLocal);
                indexes.push(index);
                tokenAddresses.push(tokenAddress);
                destinationAddresses.push(destinationAddress);
                amounts.push(amount);
                metadatas.push(metadata);
                isClaimeds.push(false);
            }

            const compressedMultipleBytes = await claimCompressor.compressClaimCall(
                proofs,
                indexes,
                mainnetExitRoot,
                ethers.ZeroHash,
                tokenAddresses,
                destinationAddresses,
                amounts,
                metadatas,
                isClaimeds
            );

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
                dataClaimCall: encodedCall.length * i,
                dataCompressedCall: compressedMultipleBytes.length,
                ratioData: compressedMultipleBytes.length / (encodedCall.length * i),
                dataTotalTxClaimCall: customSignedTx.length * i,
                costCalldataTxClaimCall: customSignedCost * i,
                dataTotalTxCompressedCall: customtxCompressedMultipleSigned.length,
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
