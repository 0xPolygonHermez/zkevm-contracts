// SPDX-License-Identifier: AGPL-3.0

import "../PolygonZkEVMBridgeV2.sol";
import "hardhat/console.sol";

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

    // Indicate where's the mainnet flag bit in the global index
    uint256 private constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;

    bytes4 private constant _CLAIM_ASSET_SIGNATURE =
        PolygonZkEVMBridgeV2.claimAsset.selector;

    bytes4 private constant _CLAIM_MESSAGE_SIGNATURE =
        PolygonZkEVMBridgeV2.claimMessage.selector;

    // Bytes that will be added to the snark input for every rollup aggregated
    // 4 bytes signature
    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot
    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot
    // 32*8 Rest constant parameters
    // 32 bytes position, 32 bytes length, + length bytes = 4 + 32*32*2 + 32*8 + 32*2 + length metadata = totalLen
    uint256 internal constant _CONSTANT_BYTES_PER_CLAIM =
        4 + 32 * 32 * 2 + 8 * 32 + 32 * 2;

    // Bytes len of arrays of 32 positions, of 32 bytes bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]
    uint256 internal constant _BYTE_LEN_CONSTANT_ARRAYS = 32 * 32;

    // The following parameters are constant in the encoded compressed claim call
    // smtProofLocalExitRoots[0],
    // smtProofRollupExitRoots,
    // mainnetExitRoot,
    // rollupExitRoot
    uint256 internal constant _CONSTANT_VARIABLES_LENGTH = 32 * 32 * 2 + 32 * 2;

    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot
    // 32*32 bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot
    // 32*8 Rest constant parameters
    // 32 bytes position
    uint256 internal constant _METADATA_OFSSET = 32 * 32 * 2 + 8 * 32 + 32;

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
    struct CompressClaimCallData {
        bytes32[32] smtProofLocalExitRoot;
        uint256 globalIndex;
        uint32 originNetwork;
        address originAddress;
        address destinationAddress;
        uint256 amount;
        bytes metadata;
        bool isMessage;
    }

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
     * @param smtProofRollupExitRoot Smt proof
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param compressClaimCalldata compress claim calldata
     **/
    function compressClaimCall(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        CompressClaimCallData[] calldata compressClaimCalldata
    ) external pure returns (bytes memory) {
        // common parameters for all the claims
        bytes memory totalCompressedClaim = abi.encodePacked(
            compressClaimCalldata[0].smtProofLocalExitRoot,
            smtProofRollupExitRoot, // coudl be encoded like (uint8 len, first len [])
            mainnetExitRoot,
            rollupExitRoot
        );

        // If the memory cost goes crazy, might need to do it in assembly D:
        for (uint256 i = 0; i < compressClaimCalldata.length; i++) {
            // Byte array that will be returned
            CompressClaimCallData
                memory currentCompressClaimCalldata = compressClaimCalldata[i];
            // compare smt proof against the first one
            uint256 lastDifferentLevel = 0;
            for (uint256 j = 0; j < _DEPOSIT_CONTRACT_TREE_DEPTH; j++) {
                if (
                    currentCompressClaimCalldata.smtProofLocalExitRoot[j] !=
                    compressClaimCalldata[0].smtProofLocalExitRoot[j]
                ) {
                    lastDifferentLevel = j;
                }
            }

            bytes memory smtProofCompressed;

            for (uint256 j = 0; j < lastDifferentLevel; j++) {
                smtProofCompressed = abi.encodePacked(
                    smtProofCompressed,
                    currentCompressClaimCalldata.smtProofLocalExitRoot[i]
                );
            }

            bytes memory compressedClaimCall = abi.encodePacked(
                uint8(currentCompressClaimCalldata.isMessage ? 1 : 0), // define byte with all small values TODO
                uint8(lastDifferentLevel),
                smtProofCompressed,
                uint8(currentCompressClaimCalldata.globalIndex >> 64), // define byte with all small values TODO
                //bool(globalIndex & _GLOBAL_INDEX_MAINNET_FLAG != 0), // get isMainnet bool
                uint64(currentCompressClaimCalldata.globalIndex),
                // mainnetExitRoot,
                // rollupExitRoot,
                currentCompressClaimCalldata.originNetwork,
                currentCompressClaimCalldata.originAddress,
                // destinationNetwork
                currentCompressClaimCalldata.destinationAddress,
                currentCompressClaimCalldata.amount, // could compress to 128 bits
                uint32(currentCompressClaimCalldata.metadata.length),
                currentCompressClaimCalldata.metadata
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
        // smtProofRollupExitRoot  bytes32[32]
        // mainnetExitRoot  bytes32
        // rollupExitRoot   bytes32

        // Load "dynamic" constant and immutables since are not accesible from assembly
        uint256 destinationNetwork = _networkID;
        address bridgeAddress = _bridgeAddress;

        uint256 claimAssetSignature = uint32(_CLAIM_ASSET_SIGNATURE);
        uint256 claimMessageSignature = uint32(_CLAIM_MESSAGE_SIGNATURE);

        // no need to be memory-safe, since the rest of the function will happen on assembly ¿?
        assembly {
            // Get the last free memory pointer ( i might use 0 aswell)
            // let freeMemPointer := mload(0x40)

            // no need to reserve memory since the rest of the funcion will happen on assembly
            let compressedClaimCallsOffset := compressedClaimCalls.offset
            let compressedClaimCallsLen := compressedClaimCalls.length

            // THe final calldata should be something like:
            // Calldata claimMessage /claimAsset
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
            //     uint8(isMessage[i] ? 1 : 0), // define byte with all small values TODO
            //     uint8(lastDifferentLevel),
            //     smtProofCompressed,
            //     uint8(globalIndex[i] >> 64), // define byte with all small values TODO
            //     uint64(globalIndex[i]),
            //     originNetwork[i],
            //     originAddress[i],
            //     destinationAddress[i],
            //     amount[i], // could compress to 128 bits
            //     uint32(metadata[i].length),
            //     metadata[i]
            // ]

            // Write the constant parameters for all claims in this call

            // Copy smtProofLocalExitRoot
            calldatacopy(
                4, // Memory offset, signature = 4 bytes
                compressedClaimCallsOffset, // calldata offset
                _BYTE_LEN_CONSTANT_ARRAYS // Copy smtProofRollupExitRoot len
            )

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
            mstore(add(4, mul(69, 32)), destinationNetwork)

            // Copy metadata offset
            // Memory offset, signature + smtProofLocalExitRoot + smtProofRollupExitRoot +
            // globalIndex + mainnetExitRoot + rollupExitRoot + originNetwork + originAddress +
            //destinationNetwork + destinationAddress + amount = 72 * 32 bytes + 4 bytes
            mstore(add(4, mul(72, 32)), _METADATA_OFSSET)

            // Skip constant parameters

            // smtProofLocalExitRoots[0],
            // smtProofRollupExitRoots,
            // mainnetExitRoot,
            // rollupExitRoot
            let currentCalldataPointer := add(
                compressedClaimCallsOffset,
                _CONSTANT_VARIABLES_LENGTH
            )

            for {
                // initialization block, empty
            } lt(
                currentCalldataPointer,
                add(compressedClaimCallsOffset, compressedClaimCallsLen)
            ) {
                // after iteration block, empty
            } {
                // loop block, non empty ;)

                // Read uint8 isMessageBool
                switch shr(248, calldataload(currentCalldataPointer))
                case 0 {
                    // Write asset signature
                    mstore8(3, claimAssetSignature)
                    mstore8(2, shr(8, claimAssetSignature))
                    mstore8(1, shr(16, claimAssetSignature))
                    mstore8(0, shr(24, claimAssetSignature))
                }
                case 1 {
                    mstore8(3, claimMessageSignature)
                    mstore8(2, shr(8, claimMessageSignature))
                    mstore8(1, shr(16, claimMessageSignature))
                    mstore8(0, shr(24, claimMessageSignature))
                }

                // Add 1 byte of isMessage TODO
                currentCalldataPointer := add(currentCalldataPointer, 1)

                // Mem pointer where the current data must be written
                let memPointer := 4

                // load lastDifferentLevel
                let smtProofBytesToCopy := mul(
                    shr(
                        248, // 256 - 8(lastDifferentLevel) = 248
                        calldataload(currentCalldataPointer)
                    ),
                    32
                )

                // Add 1 byte of lastDifferentLevel
                currentCalldataPointer := add(currentCalldataPointer, 1)

                calldatacopy(
                    4, // Memory offset = 4 bytes
                    currentCalldataPointer, // calldata offset
                    smtProofBytesToCopy // Copy smtProofBytesToCopy len
                )

                // Add smtProofBytesToCopy bits of smtProofCompressed
                currentCalldataPointer := add(
                    currentCalldataPointer,
                    smtProofBytesToCopy
                )
                // mem pointer, add smtProofLocalExitRoot(current) + smtProofRollupExitRoot(constant)
                memPointer := add(memPointer, mul(32, 64))

                // Copy global index
                //     bool(globalIndex[i] & _GLOBAL_INDEX_MAINNET_FLAG != 0), // get isMainnet bool
                //     uint64(globalIndex[i]),

                // Since we cannot copy 65 bits, copy first mainnet flag

                // global exit root --> first 23 bytes to 0
                // | 191 bits |    1 bit     |   32 bits   |     32 bits    |
                // |  mainnetFlag | rollupIndex | localRootIndex |
                mstore8(
                    add(memPointer, 23), // 23 bytes globalIndex Offset
                    shr(255, calldataload(currentCalldataPointer))
                )

                // Add 1 bytes of uint8(globalIndex[i] >> 64
                currentCalldataPointer := add(currentCalldataPointer, 1)

                // Copy the next 64 bytes for the uint64(globalIndex[i]),
                calldatacopy(
                    add(memPointer, 24), // 24 bytes globalIndex Offset
                    currentCalldataPointer, // calldata offset
                    8 // Copy uint64(globalIndex[i])
                )
                currentCalldataPointer := add(currentCalldataPointer, 8)

                // mem pointer, add globalIndex(current) + mainnetExitRoot(constant) + rollupExitRoot(constant) = 32*3 bytes
                memPointer := add(memPointer, 96)

                // Copy the next 4 bytes for the originNetwork[i]
                calldatacopy(
                    add(memPointer, 28), //  28 uint32 offset
                    currentCalldataPointer, // calldata offset
                    4 // Copy originNetwork[i]
                )
                currentCalldataPointer := add(currentCalldataPointer, 4)

                // mem pointer, add originNetwork(current)
                memPointer := add(memPointer, 32)

                // Copy the next 20 bytes for the originAddress[i]
                calldatacopy(
                    add(memPointer, 12), // 12 address offset
                    currentCalldataPointer, // calldata offset
                    20 // Copy originAddress[i]
                )
                currentCalldataPointer := add(currentCalldataPointer, 20)

                // mem pointer, add originAddress(current) + destinationNetwork (constant)
                memPointer := add(memPointer, 64)

                //     amount[i], // could compress to 128 bits
                //     uint32(metadata[i].length),
                //     metadata[i]

                // Copy the next 20 bytes for the destinationAddress[i]
                calldatacopy(
                    add(memPointer, 12), // 12 address offset
                    currentCalldataPointer, // calldata offset
                    20 // Copy destinationAddress[i]
                )
                currentCalldataPointer := add(currentCalldataPointer, 20)

                // mem pointer, add destinationAddress(current)
                memPointer := add(memPointer, 32)

                // Copy the next 32 bytes for the amount[i]
                calldatacopy(
                    memPointer, // 0 uint256 offset
                    currentCalldataPointer, // calldata offset
                    32 // Copy amount[i]
                )
                currentCalldataPointer := add(currentCalldataPointer, 32)

                // mem pointer, add amount(current), add metadataOffset (constant)
                memPointer := add(memPointer, 64)

                // Copy the next 4 bytes for the uint32(metadata[i].length)

                // load metadataLen
                let metadataLen := shr(
                    224, // 256 - 32(uint32(metadata[i].length)) = 224
                    calldataload(currentCalldataPointer)
                )

                mstore(memPointer, metadataLen)

                currentCalldataPointer := add(currentCalldataPointer, 4)

                // mem pointer, add metadata len
                memPointer := add(memPointer, 32)

                // Write metadata

                // Copy the next metadataLen bytes for themetadata
                calldatacopy(
                    memPointer, //  mem offset
                    currentCalldataPointer, // calldata offset
                    metadataLen // Copy metadataLen bytes
                )

                currentCalldataPointer := add(
                    currentCalldataPointer,
                    metadataLen
                )

                memPointer := add(memPointer, metadataLen)

                // clean mem
                mstore(memPointer, 0)

                // len args should be a multiple of 32 bytes
                let totalLenCall := add(
                    _CONSTANT_BYTES_PER_CLAIM,
                    add(metadataLen, mod(metadataLen, 32))
                )

                // SHould i limit the gas TODO or the call
                let success := call(
                    gas(), // gas
                    bridgeAddress, // address
                    0, // value
                    0, // args offset
                    totalLenCall, // argsSize
                    0, // retOffset
                    0 // retSize
                )
            }
        }
    }
}
