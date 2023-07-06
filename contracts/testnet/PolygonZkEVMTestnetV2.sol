// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../PolygonZkEVMWrapper.sol";

/**
 * Contract responsible for managing the state and the updates of the L2 network
 * This contract will NOT BE USED IN PRODUCTION, will be used only in testnet enviroment
 */
contract PolygonZkEVMTestnetV2 is PolygonZkEVMWrapper {
    // Indicates the current version
    uint256 public version;

    /**
     * @dev Thrown when try to update version when it's already updated
     */
    error VersionAlreadyUpdated();

    /**
     * @notice Update version of the zkEVM
     * @param _versionString New version string
     */
    function updateVersion(string memory _versionString) public {
        if (version != 1) {
            revert VersionAlreadyUpdated();
        }
        version++;

        emit UpdateZkEVMVersion(lastVerifiedBatch, forkID, _versionString);
    }
}
