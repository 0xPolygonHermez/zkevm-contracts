// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../PolygonZkEVM.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet enviroment
 */
contract PolygonZkEVMTestnetClearStorage is PolygonZkEVM {
    // Indicates the current version
    uint256 public version;

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    /**
     * @notice Clear previous storage
     */
    function clearStorage() public {
        forceBatchTimeout = 5 days;
        isForcedBatchDisallowed = true;
        assembly {
            sstore(version.slot, 0)
            sstore(add(version.slot,1), 0)
            sstore(add(version.slot,2), 0)
        }
    }
}
