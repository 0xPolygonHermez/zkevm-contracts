// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";

interface IPolygonZkEVMGlobalExitRootV2 is IBasePolygonZkEVMGlobalExitRoot {
    function getLastGlobalExitRoot() external view returns (bytes32);

    function getRoot() external view returns (bytes32);
}
