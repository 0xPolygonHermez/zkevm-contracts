// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @title AssignJobParam
 * @notice Parameters passed by LayerZero to the DVN when assigning a job.
 */
struct AssignJobParam {
    uint32 dstEid;
    bytes packetHeader;
    bytes32 payloadHash;
    uint64 confirmations;
    address sender;
}

/**
 * @title ILayerZeroDVN
 * @notice Minimal DVN interface required by LayerZero v2 (local copy — LayerZero is not a
 *         configured Soldeer dependency in this repository).
 */
interface ILayerZeroDVN {
    function assignJob(AssignJobParam calldata _param, bytes calldata _options) external payable returns (uint256 fee);
}
