// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonZkEVMV2Errors {
    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error OnlyRollupManager();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error NotEnoughfeeTokenAmount();
}
