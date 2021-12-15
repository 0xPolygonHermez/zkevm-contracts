// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "../BridgeL2.sol";

/**
 * Contract responsible for managing the state and the updates of it of the L2 Hermez network.
 * There will be sequencer, wich are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract BridgeL2Mock is BridgeL2 {
    /**
     * @param _networkID Rollup contract address
     */
    constructor(uint32 _networkID) BridgeL2(_networkID) {}

    /**
     * @notice Set last global exit root
     * @param globalExitRoot New global exit root
     */
    function setLastGlobalExitRoot(bytes32 globalExitRoot) public {
        globalExitRootMap[lastGlobalExitRootNum] = globalExitRoot;
    }
}
