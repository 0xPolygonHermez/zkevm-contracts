// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

import "../PolygonZkEVMGlobalExitRoot.sol";

/**
 * Contract responsible for managing the exit roots across multiple networks

 */
contract PolygonZkEVMGlobalExitRootMock is PolygonZkEVMGlobalExitRoot {
    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress PolygonZkEVM Bridge contract address
     */
    constructor(
        address _rollupAddress,
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRoot(_rollupAddress, _bridgeAddress) {}

    /**
     * @notice Set last global exit root
     * @param blockHash blockHash
     */
    function setLastGlobalExitRoot(uint256 blockHash) public {
        globalExitRootMap[getLastGlobalExitRoot()] = blockHash;
    }

    /**
     * @notice Set last global exit root
     * @param blockHash blockHash
     */
    function setGlobalExitRoot(
        bytes32 globalExitRoot,
        uint256 blockHash
    ) public {
        globalExitRootMap[globalExitRoot] = blockHash;
    }
}
