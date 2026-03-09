// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;
import "../AgglayerGER.sol";

/**
 * AgglayerManager mock
 */
contract AgglayerGERMock is AgglayerGER {
    /**
     * @param _rollupManager Rollup manager contract address
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _rollupManager,
        address _bridgeAddress
    ) AgglayerGER(_rollupManager, _bridgeAddress) {}

    function injectGER(bytes32 _root, uint32 depositCount) external {
        globalExitRootMap[_root] = block.timestamp;
        l1InfoRootMap[depositCount] = _root;
    }
}
