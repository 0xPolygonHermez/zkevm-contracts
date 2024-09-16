// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../interfaces/IPolygonZkEVMGlobalExitRootV2.sol";

/**
 * Since the current contract of PolygonZkEVMGlobalExitRoot will be upgraded to a PolygonZkEVMGlobalExitRootV2, and it will implement
 * the DepositContractBase, this base is needed to preserve the previous storage slots
 */
abstract contract PolygonZkEVMGlobalExitRootBaseStorage is
    IPolygonZkEVMGlobalExitRootV2
{
    // Rollup root, contains all exit roots of all rollups
    bytes32 public lastRollupExitRoot;

    // Mainnet exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root: Root --> blockhash
    // Note that previously recoded global exit roots in previous versions, timestamp was recorded instead of blockhash
    mapping(bytes32 => uint256) public globalExitRootMap;
}
