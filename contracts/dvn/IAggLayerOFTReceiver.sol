// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @notice Local copy of the LayerZero Origin struct.
 * Defined locally to avoid adding LayerZero as a build dependency.
 * Source: ILayerZeroEndpointV2.sol in LayerZero-v2 repo.
 */
struct Origin {
    uint32 srcEid;
    bytes32 sender;
    uint64 nonce;
}

/**
 * @notice Mirrors the claimAsset parameters of AgglayerBridge exactly.
 * Field order MUST match claimAsset argument order — used for abi.decode.
 */
struct AggLayerClaim {
    bytes32[32] smtProofLocalExitRoot;
    bytes32[32] smtProofRollupExitRoot;
    uint256 globalIndex;
    bytes32 mainnetExitRoot;
    bytes32 rollupExitRoot;
    uint32 originNetwork;
    address originTokenAddress;
    uint32 destinationNetwork;
    address destinationAddress;
    uint256 amount;
    bytes metadata;
}

/**
 * @title IAggLayerOFTReceiver
 * @notice Interface for the destination-side OFT receiver that integrates
 *         AggLayer bridge claims with LayerZero OFT message delivery.
 *
 * PoC simplification 3: refundExpiredReservation is intentionally omitted.
 */
interface IAggLayerOFTReceiver {
    /**
     * @notice Submits a bridge claim and, on success, reserves the OFT
     *         delivery slot identified by the LayerZero origin + guid.
     * @param origin    LayerZero origin metadata (srcEid, sender, nonce).
     * @param guid      LayerZero globally unique message identifier.
     * @param message   Raw LayerZero OFT message payload.
     * @param claim     AggLayer bridge claim parameters.
     */
    function claimAndReserve(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim
    ) external;

    /**
     * @notice Reserves the OFT delivery slot after an AggLayer bridge claim
     *         has already been processed externally.
     * @param origin    LayerZero origin metadata (srcEid, sender, nonce).
     * @param guid      LayerZero globally unique message identifier.
     * @param message   Raw LayerZero OFT message payload.
     * @param claim     AggLayer bridge claim parameters.
     */
    function reserveAfterClaim(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        AggLayerClaim calldata claim
    ) external;
}
