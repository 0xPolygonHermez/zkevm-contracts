// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "./PolygonZkEVMGlobalExitRootL2Pessimistic.sol";
import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChainPessimistic is
    PolygonZkEVMGlobalExitRootL2Pessimistic,
    Initializable
{
    // globalExitRootUpdater address
    address public globalExitRootUpdater;

    // globalExitRootRemover address
    // In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim, go back and the execution would be correctly proved.
    address public globalExitRootRemover;

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

    /**
     * @dev Emitted when the globalExitRootUpdater is set
     */
    event SetGlobalExitRootUpdater(address indexed newGlobalExitRootUpdater);

    /**
     * @dev Emitted when the globalExitRootRemover is set
     */
    event SetGlobalExitRootRemover(address indexed newGlobalExitRootRemover);

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2Pessimistic(_bridgeAddress) {
        _disableInitializers();
    }

    /**
     * @notice Initialize contract
     * @param _globalExitRootUpdater setting the globalExitRootUpdater.
     * @param _globalExitRootRemover In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim and go back and the execution would be correctly proved.
     */
    function initialize(
        address _globalExitRootUpdater,
        address _globalExitRootRemover
    ) external virtual initializer {
        // set globalExitRootUpdater
        globalExitRootUpdater = _globalExitRootUpdater;
        // set globalExitRootRemover
        globalExitRootRemover = _globalExitRootRemover;
    }

    modifier onlyGlobalExitRootUpdater() {
        // Only allowed to be called by GlobalExitRootUpdater or coinbase if GlobalExitRootUpdater is zero
        if (globalExitRootUpdater == address(0)) {
            if (block.coinbase != msg.sender) {
                revert OnlyGlobalExitRootUpdater();
            }
        } else {
            if (globalExitRootUpdater != msg.sender) {
                revert OnlyGlobalExitRootUpdater();
            }
        }
        _;
    }

    modifier onlyGlobalExitRootRemover() {
        // Only allowed to be called by GlobalExitRootRemover
        if (globalExitRootRemover != msg.sender) {
            revert OnlyGlobalExitRootRemover();
        }
        _;
    }
    /**
     * @notice Insert a new global exit root
     * @param _newRoot new global exit root to insert
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyGlobalExitRootUpdater {
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
    ) external onlyGlobalExitRootRemover {
        uint256 insertedGERCountCache = insertedGERCount;
        // Can't remove if not enough roots have been inserted
        if (gersToRemove.length > insertedGERCountCache) {
            revert NotEnoughGlobalExitRootsInserted();
        }
        // Iterate through the array of roots to remove them one by one
        for (uint256 i = 0; i < gersToRemove.length; i++) {
            bytes32 rootToRemove = gersToRemove[i];

            // Check that the root to remove is the last inserted
            uint256 lastInsertedIndex = globalExitRootMap[rootToRemove];
            if (lastInsertedIndex != insertedGERCountCache) {
                revert NotLastInsertedGlobalExitRoot();
            }

            // Remove from the mapping
            delete globalExitRootMap[rootToRemove];
            // Decrement the counter
            insertedGERCountCache--;

            // Emit the removal event
            emit RemoveLastGlobalExitRoot(rootToRemove);
        }
        // Update the counter
        insertedGERCount = insertedGERCountCache;
    }

    /**
     * @notice Set the globalExitRootUpdater
     * @param _globalExitRootUpdater new globalExitRootUpdater address
     */
    function setGlobalExitRootUpdater(
        address _globalExitRootUpdater
    ) external onlyGlobalExitRootUpdater {
        globalExitRootUpdater = _globalExitRootUpdater;
        emit SetGlobalExitRootUpdater(_globalExitRootUpdater);
    }

    /**
     * @notice Set the globalExitRootRemover
     * @param _globalExitRootRemover new globalExitRootRemover address
     */
    function setGlobalExitRootRemover(
        address _globalExitRootRemover
    ) external onlyGlobalExitRootRemover {
        globalExitRootRemover = _globalExitRootRemover;
        emit SetGlobalExitRootRemover(_globalExitRootRemover);
    }
}
