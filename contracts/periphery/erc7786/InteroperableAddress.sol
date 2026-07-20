// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

/**
 * @title InteroperableAddress
 * @notice Minimal library to format and parse ERC-7930 v1 Interoperable Addresses
 * for the eip155 (EVM) namespace.
 * See https://eips.ethereum.org/EIPS/eip-7930
 *
 * Binary format (version 1):
 * | Version (2B) | ChainType (2B) | ChainReferenceLength (1B) | ChainReference | AddressLength (1B) | Address |
 *
 * For the eip155 namespace (ChainType 0x0000), the chain reference is the chain id
 * encoded as a minimal-length big-endian unsigned integer, and the address is the
 * 20-byte EVM address.
 */
library InteroperableAddress {
    /// @dev ERC-7930 version 1
    bytes2 internal constant VERSION_V1 = 0x0001;

    /// @dev CAIP-350 eip155 (EVM) namespace
    bytes2 internal constant CHAIN_TYPE_EIP155 = 0x0000;

    /**
     * @dev The provided bytes are not a canonical ERC-7930 v1 eip155 interoperable address
     */
    error InvalidEvmV1InteroperableAddress();

    /**
     * @notice Formats a chainId + EVM address pair as an ERC-7930 v1 eip155 interoperable address
     * @param chainId EIP-155 chain id
     * @param addr EVM address
     */
    function formatEvmV1(
        uint256 chainId,
        address addr
    ) internal pure returns (bytes memory) {
        bytes memory chainReference = _toMinimalBigEndian(chainId);
        return
            abi.encodePacked(
                VERSION_V1,
                CHAIN_TYPE_EIP155,
                uint8(chainReference.length),
                chainReference,
                uint8(20),
                addr
            );
    }

    /**
     * @notice Parses an ERC-7930 v1 eip155 interoperable address into a chainId + EVM address pair
     * @dev Reverts if the input is not canonical: version must be 1, chain type must be
     * eip155, the chain reference must be a minimal-length big-endian integer (no leading
     * zeros, max 32 bytes) and the address must be exactly 20 bytes. A zero-length chain
     * reference is rejected since messages need an explicit destination chain.
     * @param interoperableAddress The ERC-7930 encoded address
     * @return chainId EIP-155 chain id
     * @return addr EVM address
     */
    function parseEvmV1(
        bytes memory interoperableAddress
    ) internal pure returns (uint256 chainId, address addr) {
        // Minimum length: 2 (version) + 2 (chain type) + 1 (chain ref length)
        // + 1 (chain ref, at least 1 byte) + 1 (address length) + 20 (address)
        if (interoperableAddress.length < 27) {
            revert InvalidEvmV1InteroperableAddress();
        }

        if (
            bytes2(_readBytes32(interoperableAddress, 0)) != VERSION_V1 ||
            bytes2(_readBytes32(interoperableAddress, 2)) != CHAIN_TYPE_EIP155
        ) {
            revert InvalidEvmV1InteroperableAddress();
        }

        uint256 chainReferenceLength = uint8(interoperableAddress[4]);
        if (chainReferenceLength == 0 || chainReferenceLength > 32) {
            revert InvalidEvmV1InteroperableAddress();
        }

        // Enforce canonical (minimal-length big-endian) chain reference encoding
        if (chainReferenceLength > 1 && interoperableAddress[5] == 0) {
            revert InvalidEvmV1InteroperableAddress();
        }

        // Check exact total length and a 20-byte address field
        if (
            interoperableAddress.length != 26 + chainReferenceLength ||
            uint8(interoperableAddress[5 + chainReferenceLength]) != 20
        ) {
            revert InvalidEvmV1InteroperableAddress();
        }

        chainId =
            uint256(_readBytes32(interoperableAddress, 5)) >>
            (8 * (32 - chainReferenceLength));

        addr = address(
            bytes20(
                _readBytes32(interoperableAddress, 6 + chainReferenceLength)
            )
        );
    }

    /**
     * @dev Encodes an unsigned integer as a minimal-length big-endian byte array.
     * Returns a single zero byte for value 0 (a chain reference is always present).
     */
    function _toMinimalBigEndian(
        uint256 value
    ) private pure returns (bytes memory) {
        uint256 length = 1;
        uint256 tmp = value;
        while (tmp > 0xff) {
            length++;
            tmp >>= 8;
        }
        bytes memory result = new bytes(length);
        for (uint256 i = length; i > 0; i--) {
            result[i - 1] = bytes1(uint8(value));
            value >>= 8;
        }
        return result;
    }

    /**
     * @dev Reads 32 bytes from a bytes array starting at `offset` (data may be shorter,
     * remaining bytes are dirty memory past the array and must be masked by the caller).
     */
    function _readBytes32(
        bytes memory data,
        uint256 offset
    ) private pure returns (bytes32 result) {
        /* solhint-disable no-inline-assembly */
        assembly {
            result := mload(add(add(data, 0x20), offset))
        }
        /* solhint-enable no-inline-assembly */
    }
}
