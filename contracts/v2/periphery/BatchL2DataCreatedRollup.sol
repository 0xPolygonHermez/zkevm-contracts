// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "../lib/PolygonRollupBaseEtrog.sol";

// This contract is only used for a specific tool: zkevm-contracts/tools/batchL2DataCreatedRollup.
// This contract is part of the zkevm-contracts/contracts/v2/lib/PolygonRollupBaseEtrog.sol contract.
contract BatchL2DataCreatedRollup {
    uint8 public constant INITIALIZE_TX_BRIDGE_LIST_LEN_LEN = 0xf9;
    bytes public constant INITIALIZE_TX_BRIDGE_PARAMS = hex"80808401c9c38094";
    uint16 public constant INITIALIZE_TX_CONSTANT_BYTES = 32;
    bytes public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS =
        hex"80b9";
    uint16 public constant INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA = 31;
    uint8 public constant INITIALIZE_TX_DATA_LEN_EMPTY_METADATA = 228;
    bytes
        public constant INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA =
        hex"80b8";

    uint8 public constant SIGNATURE_INITIALIZE_TX_V = 27;
    bytes32 public constant SIGNATURE_INITIALIZE_TX_R =
        0x00000000000000000000000000000000000000000000000000000005ca1ab1e0;
    bytes32 public constant SIGNATURE_INITIALIZE_TX_S =
        0x000000000000000000000000000000000000000000000000000000005ca1ab1e;
    bytes1 public constant INITIALIZE_TX_EFFECTIVE_PERCENTAGE = 0xFF;
    IBasePolygonZkEVMGlobalExitRoot
        public constant GLOBAL_EXIT_ROOT_MANAGER_L2 =
        IBasePolygonZkEVMGlobalExitRoot(
            0xa40D5f56745a118D0906a34E69aeC8C0Db1cB8fA
        );

    /**
     * @notice Generate Initialize transaction for hte bridge on L2
     * @param networkID Indicates the network identifier that will be used in the bridge
     * @param bridgeAddress Indicates the bridge address
     * @param _gasTokenAddress Indicates the token address that will be used to pay gas fees in the new rollup
     * @param _gasTokenNetwork Indicates the native network of the token address
     * @param _gasTokenMetadata Abi encoded gas token metadata
     */
    function generateInitializeTransaction(
        uint32 networkID,
        address bridgeAddress,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        bytes memory _gasTokenMetadata
    ) public view returns (bytes memory) {
        bytes memory initializeBrigeData = abi.encodeCall(
            IPolygonZkEVMBridgeV2.initialize,
            (
                networkID,
                _gasTokenAddress,
                _gasTokenNetwork,
                GLOBAL_EXIT_ROOT_MANAGER_L2,
                address(0), // Rollup manager on L2 does not exist
                _gasTokenMetadata
            )
        );

        bytes memory bytesToSign;
        uint16 initializeBrigeDataLen = uint16(initializeBrigeData.length);

        if (_gasTokenMetadata.length == 0) {
            bytesToSign = abi.encodePacked(
                INITIALIZE_TX_BRIDGE_LIST_LEN_LEN,
                initializeBrigeDataLen +
                    INITIALIZE_TX_CONSTANT_BYTES_EMPTY_METADATA, // do not support more than 2 bytes of length, intended to revert on overflow
                INITIALIZE_TX_BRIDGE_PARAMS,
                bridgeAddress,
                INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS_EMPTY_METADATA,
                INITIALIZE_TX_DATA_LEN_EMPTY_METADATA,
                initializeBrigeData
            );
        } else {
            bytesToSign = abi.encodePacked(
                INITIALIZE_TX_BRIDGE_LIST_LEN_LEN,
                initializeBrigeDataLen + INITIALIZE_TX_CONSTANT_BYTES, // do not support more than 2 bytes of length, intended to revert on overflow
                INITIALIZE_TX_BRIDGE_PARAMS,
                bridgeAddress,
                INITIALIZE_TX_BRIDGE_PARAMS_AFTER_BRIDGE_ADDRESS,
                initializeBrigeDataLen,
                initializeBrigeData
            );
        }

        // Sanity check that the ecrecover will work
        // Should never happen that giving a valid signature, ecrecover "breaks"
        address signer = ecrecover(
            keccak256(bytesToSign),
            SIGNATURE_INITIALIZE_TX_V,
            SIGNATURE_INITIALIZE_TX_R,
            SIGNATURE_INITIALIZE_TX_S
        );

        bytes memory transaction = abi.encodePacked(
            bytesToSign,
            SIGNATURE_INITIALIZE_TX_R,
            SIGNATURE_INITIALIZE_TX_S,
            SIGNATURE_INITIALIZE_TX_V,
            INITIALIZE_TX_EFFECTIVE_PERCENTAGE
        );

        return transaction;
    }
}
