// SPDX-License-Identifier: AGPL-3.0

import "../PolygonZkEVMBridgeV2.sol";

pragma solidity 0.8.20;

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

    bytes4 private constant _CLAIM_ASSET_SIGNATURE =
        PolygonZkEVMBridgeV2.claimAsset.selector;

    bytes4 private constant _CLAIM_MESSAGE_SIGNATURE =
        PolygonZkEVMBridgeV2.claimMessage.selector;

    // Bytes that will be added to the snark input for every rollup aggregated
    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot
    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot
    // 32*8 Rest constant parameters
    // 32 bytes position, 32 bytes length, + length bytes = 32*32*2 + 32*8 + 32*2 + length metadata = totalLen
    uint256 internal constant _CONSTANT_BYTES_PER_CLAIM =
        32 * 32 * 2 + 8 * 32 + 32 * 2;

    // Bytes len of arrays of 32 positions, of 32 bytes bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]
    uint256 internal constant _BYTE_LEN_CONSTANT_ARRAYS = 32 * 32;

    // The following parameters are constant in the encoded compressed claim call
    // smtProofLocalExitRoots[0],
    // smtProofRollupExitRoots,
    // mainnetExitRoot,
    // rollupExitRoot
    uint256 internal constant _CONSTANT_VARIABLES_LENGTH = 32 * 32 * 2 + 32 * 2;

    // function claimAsset(
    //     bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    //     bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    //     uint256 globalIndex,
    //     bytes32 mainnetExitRoot,
    //     bytes32 rollupExitRoot,
    //     uint32 originNetwork,
    //     address originTokenAddress,
    //     uint32 destinationNetwork,
    //     address destinationAddress,
    //     uint256 amount,
    //     bytes calldata metadata
    // )

    //   function claimMessage(
    //         bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
    //         bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
    //         uint256 globalIndex,
    //         bytes32 mainnetExitRoot,
    //         bytes32 rollupExitRoot,
    //         uint32 originNetwork,
    //         address originAddress,
    //         uint32 destinationNetwork,
    //         address destinationAddress,
    //         uint256 amount,
    //         bytes calldata metadata
    //     )

    // PolygonZkEVMBridge address
    address private immutable _bridgeAddress;

    // Mainnet identifier
    uint32 private immutable _networkID;

    /**
     * @param __bridgeAddress PolygonZkEVMBridge contract address
     * @param __networkID Network ID
     */
    constructor(address __bridgeAddress, uint32 __networkID) {
        _bridgeAddress = __bridgeAddress;
        _networkID = __networkID;
    }

    /**
     * @notice Foward all the claim parameters to compress them inside the contrat
     * @param smtProofLocalExitRoots Smt proof
     * @param smtProofRollupExitRoots Smt proof
     * @param globalIndex Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadata Abi encoded metadata if any, empty otherwise
     * @param isMessage Bool indicating if it's a message
     */
    function compressClaimCall(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoots,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH][] calldata smtProofLocalExitRoots, // struct
        uint256[] calldata globalIndex,
        uint32[] calldata originNetwork,
        address[] calldata originAddress,
        address[] calldata destinationAddress,
        uint256[] calldata amount,
        bytes[] calldata metadata,
        bool[] calldata isMessage
    ) external pure returns (bytes memory) {
        // common parameters for all the claims
        bytes memory totalCompressedClaim = abi.encodePacked(
            smtProofLocalExitRoots[0],
            smtProofRollupExitRoots,
            mainnetExitRoot,
            rollupExitRoot
        );

        // If the memory cost goes crazy, might need to do it in assembly D:
        for (uint256 i = 0; i < isMessage.length; i++) {
            // Byte array that will be returned

            // compare smt proof against the first one
            uint256 lastDifferentLevel = 0;
            for (uint256 j = 0; j < _DEPOSIT_CONTRACT_TREE_DEPTH; j++) {
                if (
                    smtProofLocalExitRoots[i][j] != smtProofLocalExitRoots[0][j]
                ) {
                    lastDifferentLevel = j;
                }
            }

            bytes memory smtProofCompressed;

            for (uint256 j = 0; j < lastDifferentLevel; j++) {
                smtProofCompressed = abi.encodePacked(
                    smtProofCompressed,
                    smtProofLocalExitRoots[0][i]
                );
            }

            bytes memory compressedClaimCall = abi.encodePacked(
                isMessage[i],
                uint8(lastDifferentLevel),
                smtProofCompressed,
                bytes1(bytes32(globalIndex[i] << 191)), // get the 65th bit, so 256 - 65 = 191
                uint64(globalIndex[i]),
                // mainnetExitRoot,
                // rollupExitRoot,
                originNetwork[i],
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

    function decompressClaimCall(bytes calldata compressedClaimCalls) external {
        // Starts with the common parameters for all the claims:

        // smtProofLocalExitRoots bytes32[32]
        // smtProofRollupExitRoots  bytes32[32]
        // mainnetExitRoot  bytes32
        // rollupExitRoot   bytes32

        // will copy them afterwards when needed, the idea will be to reacraete the call in assembly

        // // This pointer will be the current position to write on accumulateSnarkBytes
        // uint256 ptrCompressedClaimCall;
        // // Total length of the accumulateSnarkBytes, ByesPerRollup * rollupToVerify + 20 bytes (msg.sender)
        // uint256 totalSnarkLength = _SNARK_BYTES_PER_ROLLUP_AGGREGATED *
        //     verifyBatchesData.length +
        //     20;

        uint256 destinationAddress = _networkID;

        // no need to be memory-safe, since the rest of the function will happen on assembly ¿?
        assembly ("memory-safe") {
            // Get the last free memory pointer ( i might use 0 aswell)
            //let freeMemPointer := mload(0x40)

            // no need to reserve memory since the rest of the funcion will happen on assembly
            let compressedClaimCallsOffset := compressedClaimCalls.offset
            let compressedClaimCallsLen := compressedClaimCalls.length

            // Calldata claimMessage
            //   function claimMessage(
            //         bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
            //         bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot, --> constant
            //         uint256 globalIndex,
            //         bytes32 mainnetExitRoot,  --> constant
            //         bytes32 rollupExitRoot,  --> constant
            //         uint32 originNetwork,
            //         address originAddress,
            //         uint32 destinationNetwork,  --> constant
            //         address destinationAddress,
            //         uint256 amount,
            //         bytes calldata metadata
            //     )

            // Encoded compressed Data:

            // Constant parameters:
            // smtProofLocalExitRoots[0],
            // smtProofRollupExitRoots,
            // mainnetExitRoot,
            // rollupExitRoot

            // Parameters per claim tx
            // [
            //     isMessage[i],
            //     uint8(lastDifferentLevel),
            //     smtProofCompressed,
            //     bytes1(bytes32(globalIndex[i] << 191)), // get the 65th bit, so 256 - 65 = 191
            //     uint64(globalIndex[i]),
            //     originNetwork[i], // for first version this is ok
            //     originAddress[i],
            //     destinationAddress[i],
            //     amount[i], // could compress to 128 bits
            //     uint32(metadata[i].length),
            //     metadata[i]
            // ]
            // Write the constant parameters for all claims in this call

            // Copy smtProofRollupExitRoot
            calldatacopy(
                add(4, _BYTE_LEN_CONSTANT_ARRAYS), // Memory offset, signature + smtProofLocalExitRoot = 32 * 32 bytes + 4 bytes
                add(compressedClaimCallsOffset, _BYTE_LEN_CONSTANT_ARRAYS), // calldata offset
                _BYTE_LEN_CONSTANT_ARRAYS // Copy smtProofRollupExitRoot len
            )

            // Copy mainnetExitRoot
            calldatacopy(
                add(4, mul(65, 32)), // Memory offset, signature + smtProofLocalExitRoot + smtProofRollupExitRoot + globalIndex = 65 * 32 bytes + 4 bytes
                add(compressedClaimCallsOffset, mul(64, 32)), // calldata offset, smtProofLocalExitRoots[0] + smtProofRollupExitRoots = 64*32
                32 // Copy mainnetExitRoot len
            )

            // Copy rollupExitRoot
            calldatacopy(
                add(4, mul(66, 32)), // Memory offset, signature + smtProofLocalExitRoot + smtProofRollupExitRoot + globalIndex + mainnetExitRoot = 66 * 32 bytes + 4 bytes
                add(compressedClaimCallsOffset, mul(65, 32)), // calldata offset, smtProofLocalExitRoots[0] + smtProofRollupExitRoots + mainnetExitRoot = 65*32
                32 // Copy rollupExitRoot len
            )

            // Copy destinationAddress, since is constant, just use mstore

            // Memory offset, signature + smtProofLocalExitRoot + smtProofRollupExitRoot +
            // globalIndex + mainnetExitRoot + rollupExitRoot + originNetwork + originAddress = 69 * 32 bytes + 4 bytes
            mstore(add(4, mul(69, 32)), destinationAddress)

            // Skip constant parameters

            // smtProofLocalExitRoots[0],
            // smtProofRollupExitRoots,
            // mainnetExitRoot,
            // rollupExitRoot
            let currentCalldataPointer := _CONSTANT_VARIABLES_LENGTH

            for {
                // initialization block, empty
            } lt(currentCalldataPointer, compressedClaimCallsLen) {
                // after iteration block, empty
            } {
                // loop block, non empty ;)
                // x := add(x, mload(i))
                // i := add(i, 0x20)
            }

            // Set the pointer on the start of the actual byte array
            //ptrAccumulateInputSnarkBytes := add(accumulateSnarkBytes, 0x20)

            //call(gas(), bridgeAddress, 0, 0, add(_CONSTANT_BYTES_PER_CLAIM, metadataLen), 0, 0)
        }
        // gas
        // address
        // value
        // argsOffset
        // argsSize
        // retOffset
        // retSize
        // assembly {
        //     // store oldStateRoot
        //     mstore(ptr, oldStateRoot)
        //     ptr := add(ptr, 32)
        // }
    }
}
