// SPDX-License-Identifier: AGPL-3.0

//import "../PolygonZkEVMBridge.sol";

pragma solidity 0.8.23;

/**
 * Contract for compressing and decompressing claim data
 */
contract ClaimCompressor {
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // Leaf type asset
    uint8 private constant _LEAF_TYPE_ASSET = 0;

    // Leaf type message
    uint8 private constant _LEAF_TYPE_MESSAGE = 1;

    // Mainnet identifier
    uint32 private constant _MAINNET_NETWORK_ID = 0;

    //     // Bytes that will be added to the snark input for every rollup aggregated
    //     // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof
    //     // 32*8 REst constant parameters
    //     // 32 bytes position, 32 bytes length, + length bytes = metadata
    //     uint256 internal constant BYTES_PER_CLAIM =
    //         32*32 + 8*32 +

    //   bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
    //         uint32 index,
    //         bytes32 mainnetExitRoot,
    //         bytes32 rollupExitRoot,
    //         uint32 originNetwork,
    //         address originAddress,
    //         uint32 destinationNetwork,
    //         address destinationAddress,
    //         uint256 amount,
    //         bytes calldata metadata

    // PolygonZkEVMBridge address
    address public immutable bridgeAddress;

    // Mainnet identifier
    uint32 private immutable networkID;

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(address _bridgeAddress, uint32 _networkID) {
        bridgeAddress = _bridgeAddress;
        networkID = _networkID;
    }

    /**
     * @notice Foward all the claim parameters to compress them inside the contrat
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * param originNetwork Origin network
     * @param originAddress Origin address
     * param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadata Abi encoded metadata if any, empty otherwise
     * @param isMessage Bool indicating if it's a message
     */
    function compressClaimCall(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH][] calldata smtProof,
        uint32[] calldata index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        //uint32 calldata originNetwork,
        address[] calldata originAddress,
        //uint32[] calldata destinationNetwork,
        address[] calldata destinationAddress,
        uint256[] calldata amount,
        bytes[] calldata metadata,
        bool[] calldata isMessage
    ) public view returns (bytes memory) {
        // common parameters for all the claims
        bytes memory totalCompressedClaim = abi.encodePacked(
            smtProof[0],
            mainnetExitRoot,
            rollupExitRoot
        );

        // If the memory cost goes crazy, might need to do it in assembly D:
        for (uint256 i = 0; i < isMessage.length; i++) {
            // Byte array that will be returned

            // compare smt proof against the first one
            uint256 lastDifferentLevel = 0;
            for (uint256 j = 0; j < _DEPOSIT_CONTRACT_TREE_DEPTH; j++) {
                if (smtProof[i][j] != smtProof[0][j]) {
                    lastDifferentLevel = j;
                }
            }

            bytes memory smtProofCompressed;

            for (uint256 j = 0; j < lastDifferentLevel; j++) {
                smtProofCompressed = abi.encodePacked(
                    smtProofCompressed,
                    smtProof[0][i]
                );
            }

            bytes memory compressedClaimCall = abi.encodePacked(
                isMessage[i],
                uint8(lastDifferentLevel),
                smtProofCompressed,
                index[i],
                // mainnetExitRoot,
                // rollupExitRoot,
                // originNetwork, // for first version this is ok
                originAddress[i],
                // destinationNetwork
                destinationAddress[i],
                amount[i], // could compress to 128 bits
                uint32(metadata[i].length),
                metadata[i]
            );

            // Accumulate all claim calls
            totalCompressedClaim = abi.encodePacked(
                totalCompressedClaim,
                compressedClaimCall
            );
        }
        return totalCompressedClaim;
    }

    function decompressClaimCall(bytes calldata compressedClaimCalls) public {
        // // This pointer will be the current position to write on accumulateSnarkBytes
        // uint256 ptrCompressedClaimCall;
        // // Total length of the accumulateSnarkBytes, ByesPerRollup * rollupToVerify + 20 bytes (msg.sender)
        // uint256 totalSnarkLength = _SNARK_BYTES_PER_ROLLUP_AGGREGATED *
        //     verifyBatchesData.length +
        //     20;
        // // Use assembly to rever memory and get the memory pointer
        // assembly {
        //     // Set accumulateSnarkBytes to the next free memory space
        //     accumulateSnarkBytes := mload(0x40)
        //     // Reserve the memory: 32 bytes for the byte array length + 32 bytes extra for byte manipulation (0x40) +
        //     // the length of the input snark bytes
        //     mstore(0x40, add(add(accumulateSnarkBytes, 0x40), totalSnarkLength))
        //     // Set the length of the input bytes
        //     mstore(accumulateSnarkBytes, totalSnarkLength)
        //     // Set the pointer on the start of the actual byte array
        //     ptrAccumulateInputSnarkBytes := add(accumulateSnarkBytes, 0x20)
        // }
        // assembly {
        //     // store oldStateRoot
        //     mstore(ptr, oldStateRoot)
        //     ptr := add(ptr, 32)
        // }
    }
}
