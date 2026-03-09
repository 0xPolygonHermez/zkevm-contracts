// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseLegacyAgglayerGER.sol";

interface IPolygonZkEVMGlobalExitRoot is IBaseLegacyAgglayerGER {
    function getLastGlobalExitRoot() external view returns (bytes32);
}
