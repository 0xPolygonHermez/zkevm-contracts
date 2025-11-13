// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

import "./IPolygonConsensusBase.sol";

interface IPolygonRollupBase is IPolygonConsensusBase {
    function onVerifyBatches(
        uint64 lastVerifiedBatch,
        bytes32 newStateRoot,
        address aggregator
    ) external;

    function rollbackBatches(
        uint64 targetBatch,
        bytes32 accInputHashToRollback
    ) external;
}
