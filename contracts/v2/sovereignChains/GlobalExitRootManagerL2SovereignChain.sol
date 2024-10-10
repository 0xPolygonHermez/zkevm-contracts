// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "../../PolygonZkEVMGlobalExitRootL2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// WARNING: not audited

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is
    PolygonZkEVMGlobalExitRootL2,
    Initializable
{
    // aggOracleAddress address
    address public aggOracleAddress;

    // Inserted GER counter
    uint256 public insertedGERCount;

    /**
     * @dev Emitted when a new global exit root is inserted
     */
    event InsertGlobalExitRoot(bytes32 indexed newGlobalExitRoot);

    /**
     * @dev Emitted when the last global exit root is removed
     */
    event RemoveLastGlobalExitRoot(bytes32 indexed removedGlobalExitRoot);

    modifier onlyAggOracleOrCoinbase() {
        // Only allowed to be called by aggOracle or coinbase if aggOracle is zero
        if (
            (aggOracleAddress == address(0) && block.coinbase != msg.sender) ||
            (aggOracleAddress != address(0) && aggOracleAddress != msg.sender)
        ) {
            revert OnlyAggOracleOrCoinbase();
        }
        _;
    }

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2(_bridgeAddress) {
        _disableInitializers();
    }

    /**
     * @notice Initialize contract setting the aggOracleAddress
     */
    function initialize(
        address _aggOracleAddress
    ) external virtual initializer {
        // set aggOracleAddress
        aggOracleAddress = _aggOracleAddress;
    }

    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root to insert
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyAggOracleOrCoinbase {
        // do not insert GER if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = ++insertedGERCount;
            emit InsertGlobalExitRoot(_newRoot);
        } else {
            revert GlobalExitRootAlreadySet();
        }
    }

    /**
     * @notice Remove last global exit roots
     * @param gersToRemove Array of gers to remove in inserted order where first element of the array is the last inserted
     */
    function removeLastGlobalExitRoots(
        bytes32[] calldata gersToRemove
    ) external onlyAggOracleOrCoinbase {
        // Can't remove if not enough roots have been inserted
        if (gersToRemove.length > insertedGERCount) {
            revert NotEnoughGlobalExitRootsInserted();
        }
        // Iterate through the array of roots to remove them one by one
        for (uint256 i = 0; i < gersToRemove.length; i++) {
            bytes32 rootToRemove = gersToRemove[i];

            // Check that the root to remove is the last inserted
            uint256 lastInsertedIndex = globalExitRootMap[rootToRemove];
            if (lastInsertedIndex != insertedGERCount) {
                revert NotLastInsertedGlobalExitRoot();
            }

            // Remove from the mapping
            delete globalExitRootMap[rootToRemove]; // Delete from the mapping
            // Decrement the counter
            insertedGERCount--;

            // Emit the removal event
            emit RemoveLastGlobalExitRoot(rootToRemove);
        }
    }
}
