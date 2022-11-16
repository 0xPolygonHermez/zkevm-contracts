// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "../GlobalExitRootManager.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks

 */
contract GlobalExitRootManagerMock is GlobalExitRootManager {
    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress Bridge contract address
     */
    constructor(address _rollupAddress, address _bridgeAddress) {
        initialize(_rollupAddress, _bridgeAddress);
    }

    /**
     * @notice Set last global exit root
     * @param timestamp timestamp
     */
    function setLastGlobalExitRoot(uint256 timestamp) public {
        globalExitRootMap[getLastGlobalExitRoot()] = timestamp;
    }
}
