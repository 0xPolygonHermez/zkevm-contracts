// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

interface IPolygonRollupBase {
    function initialize(
        address _admin,
        address _trustedSequencer,
        uint32 networkID,
        address gasTokenAddress,
        uint32 gasTokenNetwork,
        string memory _trustedSequencerURL,
        string memory _networkName
    ) external;

    function onVerifyBatches(
        uint64 lastVerifiedBatch,
        bytes32 newStateRoot,
        address aggregator
    ) external;
}
