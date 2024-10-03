// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../../PolygonZkEVMGlobalExitRootL2.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is PolygonZkEVMGlobalExitRootL2 {
    /**
     * @dev Emitted when a new global exit root is inserted
     */
    event InsertGlobalExitRoot(bytes32 indexed newGlobalExitRoot);

    // Injected GER counter
    uint256 public injectedGERCount;

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2(_bridgeAddress) {}

    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root
     */
    function insertGlobalExitRoot(bytes32 _newRoot) external {
        // Only allowed to be called by coinbase
        if (block.coinbase != msg.sender) {
            revert OnlyCoinbase();
        }
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = ++injectedGERCount;
            emit InsertGlobalExitRoot(_newRoot);
        } else {
            revert GlobalExitRootAlreadySet();
        }
    }

    function checkInjectedGERsAndReturnLER(
        uint256 previousInjectedGERCount,
        bytes32[] memory injectedGERs
    ) public view returns (bool success, bytes32 localExitRoot) {
        // save on cache las injecterGerCount
        uint256 cacheInjectedGERCount = injectedGERCount;

        // previous injected GER must be equal or less than the last one
        if (previousInjectedGERCount > cacheInjectedGERCount) {
            return (false, bytes32(0));
        }

        // Compute injected GERs in the blockSpawn
        uint256 injectedGERsNum = cacheInjectedGERCount -
            previousInjectedGERCount;

        uint256 currentInjectedGER = previousInjectedGERCount;

        for (uint256 i = 0; i < injectedGERsNum; i++) {
            // Point to the next GER
            currentInjectedGER++;

            // Assert that the GER exist and matches the proper count
            if (globalExitRootMap[injectedGERs[i]] != currentInjectedGER) {
                return (false, bytes32(0));
            }
        }

        if (currentInjectedGER == cacheInjectedGERCount) {
            return (true, lastRollupExitRoot);
        } else {
            return (false, bytes32(0));
        }
    }

    function checkGERsExistance(
        bytes32[] calldata globalExitRoots
    ) public view returns (bool success) {
        for (uint256 i = 0; i < globalExitRoots.length; i++) {
            if (globalExitRootMap[globalExitRoots[i]] == 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root
     */
    function insertGlobalExitRoot_cheat(bytes32 _newRoot) external {
        // do not update timestamp if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = ++injectedGERCount;
            emit InsertGlobalExitRoot(_newRoot);
        } else {
            revert GlobalExitRootAlreadySet();
        }
    }
}
