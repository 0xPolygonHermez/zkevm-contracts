// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";

interface IGlobalExitRootManagerL2SovereignChain is
    IBasePolygonZkEVMGlobalExitRoot
{
    /**
     * @notice Get the globalExitRootUpdater address
     * This variable is exposed to be used by a BridgeL2Sovereign modifier
     */
    function globalExitRootRemover() external view returns (address);
}
