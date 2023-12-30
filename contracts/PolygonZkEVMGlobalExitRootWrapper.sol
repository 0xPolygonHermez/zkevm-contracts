// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "./interfaces/IPolygonZkEVMGlobalExitRoot.sol";
import "./inheritedMainContracts/PolygonZkEVMGlobalExitRoot.sol";

contract PolygonZkEVMGlobalExitRootWrapper is PolygonZkEVMGlobalExitRoot {
    /**
     * @param _rollupAddress Rollup contract address
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    function initialize(address _rollupAddress, address _bridgeAddress, bytes32 _lastMainnetExitRoot, bytes32 _lastRollupExitRoot) public override initializer {
        PolygonZkEVMGlobalExitRoot.initialize(_rollupAddress, _bridgeAddress, _lastMainnetExitRoot, _lastRollupExitRoot);
    }
}
    
