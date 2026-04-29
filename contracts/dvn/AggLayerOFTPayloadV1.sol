// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @notice Wire format for the AggLayer OFT payload (version 1).
 */
struct AggLayerOFTPayloadV1 {
    bytes4 magic;
    uint16 version;
    bytes oftMessage;
    uint256 globalIndex;
}

/**
 * @title AggLayerOFTPayloadCodec
 * @notice Pure library for encoding and decoding AggLayerOFTPayloadV1 values.
 *         Magic bytes: "ALO1" (0x414c4f31).  Version: 1.
 *
 * All functions are internal pure — no state, no constructors.
 */
library AggLayerOFTPayloadCodec {
    bytes4 internal constant MAGIC = bytes4("ALO1");
    uint16 internal constant VERSION = 1;

    /// @notice Reverts when the decoded magic or version does not match.
    error InvalidMagicOrVersion(bytes4 gotMagic, uint16 gotVersion);

    /**
     * @notice Encodes an OFT message and globalIndex into the wire format.
     * @param oftMessage  The inner LayerZero OFT message bytes.
     * @param globalIndex The AggLayer bridge global deposit index.
     * @return            ABI-encoded AggLayerOFTPayloadV1.
     */
    function encode(
        bytes memory oftMessage,
        uint256 globalIndex
    ) internal pure returns (bytes memory) {
        // Flat 4-arg encoding — matches the Go codec's flat abi.Arguments layout.
        // abi.encode(struct) would add an outer offset word; abi.encode(f1,f2,f3,f4) does not.
        return abi.encode(MAGIC, VERSION, oftMessage, globalIndex);
    }

    /**
     * @notice Decodes wire-format bytes back into an AggLayerOFTPayloadV1.
     * @param payload  ABI-encoded bytes produced by {encode}.
     * @return         The decoded struct.
     * @dev Reverts with {InvalidMagicOrVersion} if magic != "ALO1" or version != 1.
     */
    function decode(
        bytes memory payload
    ) internal pure returns (AggLayerOFTPayloadV1 memory) {
        (bytes4 magic_, uint16 version_, bytes memory msg_, uint256 gi_) =
            abi.decode(payload, (bytes4, uint16, bytes, uint256));

        if (magic_ != MAGIC || version_ != VERSION) {
            revert InvalidMagicOrVersion(magic_, version_);
        }

        return AggLayerOFTPayloadV1({magic: magic_, version: version_, oftMessage: msg_, globalIndex: gi_});
    }
}
