// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

/**
 * @title Signature Decoder
 * @dev Imported from https://github.com/safe-fndn/safe-smart-account/blob/v1.5.0/contracts/common/SignatureDecoder.sol
 *      Same functionality with extended comments.
 * @notice Decodes encoded packed signatures bytes.
 * @author Richard Meissner - @rmeissner
 */
abstract contract SignatureDecoder {
    /**
     * @notice Extract signature components from concatenated signatures
     * @dev Uses assembly for gas-efficient memory access
     *      Signature format: tightly packed (r, s, v) where:
     *      - r: 32 bytes (signature component)
     *      - s: 32 bytes (signature component)
     *      - v: 1 byte (recovery id, typically 27 or 28)
     * @param _signatures Concatenated signatures bytes
     * @param _index Index of the signature to extract (0-based)
     * @return v The recovery id (27 or 28)
     * @return r The r component of the signature
     * @return s The s component of the signature
     */
    function _splitSignature(
        bytes memory _signatures,
        uint256 _index
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        /// @solidity memory-safe-assembly
        assembly {
            // Calculate offset: each signature is 0x41 (65) bytes
            let offset := mul(0x41, _index)
            
            // Load r (first 32 bytes of signature)
            // add 0x20 to skip the length prefix of the bytes array
            r := mload(add(_signatures, add(0x20, offset)))
            
            // Load s (next 32 bytes of signature, offset by 0x40/64 bytes)
            s := mload(add(_signatures, add(0x40, offset)))
            
            // Load v (last byte of signature, offset by 0x60/96 bytes)
            // byte(0, ...) extracts the first byte
            v := byte(0, mload(add(_signatures, add(0x60, offset))))
        }
    }
}