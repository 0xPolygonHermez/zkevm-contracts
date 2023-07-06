// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.17;

import "./IPolygonZkEVMGlobalExitRoot.sol";
import "./IVerifierRollup.sol";

interface IPolygonZkEVM {

    /**
     * @notice Struct to call initialize, this saves gas because pack the parameters and avoid stack too deep errors.
     * @param admin Admin address
     * @param trustedSequencer Trusted sequencer address
     * @param pendingStateTimeout Pending state timeout
     * @param trustedAggregator Trusted aggregator
     * @param trustedAggregatorTimeout Trusted aggregator timeout
     */
    struct InitializePackedParameters {
        address admin;
        address trustedSequencer;
        uint64 pendingStateTimeout;
        address trustedAggregator;
        uint64 trustedAggregatorTimeout;
    }

    function chainID() external view returns (uint64);
    function forkID() external view returns (uint64);
    function globalExitRootManager() external view returns (IPolygonZkEVMGlobalExitRoot);
    function rollupVerifier() external view returns (IVerifierRollup);
    function verifyBatchTimeTarget() external view returns (uint64);
    function multiplierBatchFee() external view returns (uint16);
    function batchFee() external view returns (uint256);
    function forceBatchTimeout() external view returns (uint64);
    function lastVerifiedBatch() external view returns (uint64);
    function batchNumToStateRoot(uint64) external view returns (bytes32);
    function trustedSequencerURL() external view returns (string calldata);
    function networkName() external view returns(string calldata);
    function admin() external view returns(address);
    function trustedSequencer() external view returns(address);
    function pendingStateTimeout() external view returns(uint64);
    function trustedAggregator() external view returns(address);
    function trustedAggregatorTimeout() external view returns(uint64);
}