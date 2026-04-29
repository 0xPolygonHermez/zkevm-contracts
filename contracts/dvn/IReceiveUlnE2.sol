// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @title IReceiveUlnE2
 * @notice Local copy of the LayerZero ReceiveULN E2 (v2) verify interface.
 *         Defined locally to avoid adding LayerZero as a build dependency.
 *         Source: ReceiveUln302.sol in LayerZero-v2 repo.
 */
interface IReceiveUlnE2 {
    /**
     * @notice Called by a DVN to confirm that a packet has been verified.
     * @param _packetHeader  Serialised 81-byte LayerZero packet header.
     * @param _payloadHash   keccak256 hash of the packet payload.
     * @param _confirmations Number of block confirmations the DVN attests to.
     */
    function verify(
        bytes calldata _packetHeader,
        bytes32 _payloadHash,
        uint64 _confirmations
    ) external;
}
