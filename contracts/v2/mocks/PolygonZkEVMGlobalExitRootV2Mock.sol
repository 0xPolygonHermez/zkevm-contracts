// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../PolygonZkEVMGlobalExitRootV2.sol";

/**
 * PolygonRollupManager mock
 */
contract PolygonZkEVMGlobalExitRootV2Mock is PolygonZkEVMGlobalExitRootV2 {
    /**
     * @param _rollupManager Rollup manager contract address
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _rollupManager,
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootV2(_rollupManager, _bridgeAddress) {}

    function injectGER(bytes32 _root, uint32 depositCount) external {
        globalExitRootMap[_root] = block.timestamp;
        l1InfoRootMap[depositCount] = _root;
    }
}