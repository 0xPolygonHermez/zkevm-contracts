// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.9;

import "../GlobalExitRootManagerL2.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks

 */
contract GlobalExitRootManagerL2Mock is GlobalExitRootManagerL2 {
    /**
     * @param _bridgeAddress Bridge contract address
     */
    constructor(address _bridgeAddress)
        GlobalExitRootManagerL2(_bridgeAddress)
    {}

    /**
     * @notice Set globalExitRoot
     * @param globalExitRoot New global exit root
     * @param blockNumber block number
     */
    function setLastGlobalExitRoot(bytes32 globalExitRoot, uint256 blockNumber)
        public
    {
        globalExitRootMap[blockNumber] = globalExitRoot;
    }

    /**
     * @notice Set rollup exit root
     * @param newRoot New rollup exit root
     */
    function setExitRoot(bytes32 newRoot) public {
        lastRollupExitRoot = newRoot;
    }
}
