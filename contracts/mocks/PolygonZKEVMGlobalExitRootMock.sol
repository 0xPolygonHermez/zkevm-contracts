// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "../PolygonZKEVMGlobalExitRoot.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks

 */
contract PolygonZKEVMGlobalExitRootMock is PolygonZKEVMGlobalExitRoot {
    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress PolygonZKEVM Bridge contract address
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

    /**
     * @notice Set last global exit root
     * @param timestamp timestamp
     */
    function setGlobalExitRoot(
        bytes32 globalExitRoot,
        uint256 timestamp
    ) public {
        globalExitRootMap[globalExitRoot] = timestamp;
    }
}
