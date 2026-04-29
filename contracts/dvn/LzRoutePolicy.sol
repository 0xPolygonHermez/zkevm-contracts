// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @notice Configuration record that binds an AggLayer bridge route to a
 *         LayerZero OFT route.  Contains only type declarations — no logic.
 */
struct LzRoutePolicy {
    /// @notice AggLayer network ID of the source chain.
    uint32 sourceBridgeNetwork;
    /// @notice AggLayer network ID of the destination chain.
    uint32 destinationBridgeNetwork;
    /// @notice LayerZero endpoint ID of the source chain.
    uint32 peerSrcEid;
    /// @notice LayerZero endpoint ID of the destination chain.
    uint32 peerDstEid;
    /// @notice Source OFT contract address.
    address srcOFT;
    /// @notice Destination OFT receiver contract address.
    address dstOFTReceiver;
    /// @notice Token address on the source chain.
    address tokenSrc;
    /// @notice Token address on the destination chain.
    address tokenDst;
}
