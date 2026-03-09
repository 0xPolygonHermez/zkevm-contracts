// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseLegacyAgglayerGER.sol";

interface IAgglayerGER is IBaseLegacyAgglayerGER {
    function getLastGlobalExitRoot() external view returns (bytes32);

    function getRoot() external view returns (bytes32);

    function l1InfoRootMap(uint32 depositCount) external view returns (bytes32);
}
