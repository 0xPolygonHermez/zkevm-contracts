// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import {Origin, AggLayerClaim} from "./IAggLayerOFTReceiver.sol";

/**
 * @title IAggLayerDVNCoordinator
 * @notice Interface for the DVN coordinator that combines an AggLayer bridge
 *         claim with a LayerZero ULN packet verification in a single call.
 */
interface IAggLayerDVNCoordinator {
    /**
     * @notice Claims an AggLayer bridge deposit and, on success, calls
     *         IReceiveUlnE2.verify to confirm the LayerZero packet.
     * @param origin        LayerZero origin metadata (srcEid, sender, nonce).
     * @param guid          LayerZero globally unique message identifier.
     * @param message       Raw LayerZero OFT message payload.
     * @param claim         AggLayer bridge claim parameters.
     * @param packetHeader  Serialised LayerZero packet header (passed to verify).
     * @param payloadHash   Hash of the LayerZero packet payload.
     * @param confirmations Number of block confirmations required by the ULN.
     */
    function claimAndVerify(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim,
        bytes calldata packetHeader,
        bytes32 payloadHash,
        uint64 confirmations
    ) external;
}
