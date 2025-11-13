// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;
import "../../PolygonZkEVMGlobalExitRootL2.sol";
import "../lib/Hashes.sol";
import "../../v2/interfaces/IGlobalExitRootManagerL2SovereignChain.sol";
import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract GlobalExitRootManagerL2SovereignChain is
    PolygonZkEVMGlobalExitRootL2,
    IGlobalExitRootManagerL2SovereignChain,
    Initializable
{
    // Current contract version
    string public constant GER_SOVEREIGN_VERSION = "al-v0.3.0";

    // globalExitRootUpdater address
    address public globalExitRootUpdater;

    // globalExitRootRemover address
    // In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim, go back and the execution would be correctly proved.
    address public globalExitRootRemover;

    // Inserted GER counter
    /// @custom:oz-renamed-from insertedGERCount
    uint256 internal _legacyInsertedGERCount;

    // Value of the global exit roots hash chain after last insertion
    bytes32 public insertedGERHashChain;

    // Value of the removed global exit roots hash chain after last removal
    bytes32 public removedGERHashChain;

    // This account will be able to accept globalExitRootUpdater role
    address public pendingGlobalExitRootUpdater;

    // This account will be able to accept globalExitRootRemover role
    address public pendingGlobalExitRootRemover;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private __gap;

    /**
     * @dev Emitted when a new global exit root is inserted and added to the hash chain
     */
    event UpdateHashChainValue(
        bytes32 indexed newGlobalExitRoot,
        bytes32 indexed newHashChainValue
    );

    /**
     * @dev Emitted when the global exit root is removed and added to the removal hash chain
     */
    event UpdateRemovalHashChainValue(
        bytes32 indexed removedGlobalExitRoot,
        bytes32 indexed newRemovalHashChainValue
    );

    /**
     * @dev Emitted when the GlobalExitRootUpdater starts the two-step transfer role setting a new pending GlobalExitRootUpdater.
     * @param currentGlobalExitRootUpdater The current GlobalExitRootUpdater.
     * @param pendingGlobalExitRootUpdater The new pending GlobalExitRootUpdater.
     */
    event TransferGlobalExitRootUpdater(
        address currentGlobalExitRootUpdater,
        address pendingGlobalExitRootUpdater
    );

    /**
     * @dev Emitted when the GlobalExitRootRemover starts the two-step transfer role setting a new pending GlobalExitRootRemover.
     * @param currentGlobalExitRootRemover The current GlobalExitRootUpdater.
     * @param pendingGlobalExitRootRemover The new pending GlobalExitRootUpdater.
     */
    event TransferGlobalExitRootRemover(
        address currentGlobalExitRootRemover,
        address pendingGlobalExitRootRemover
    );

    /**
     * @dev Emitted when the pending GlobalExitRootUpdater accepts the GlobalExitRootUpdater role.
     * @param oldGlobalExitRootUpdater The previous GlobalExitRootUpdater.
     * @param newGlobalExitRootUpdater The new GlobalExitRootUpdater.
     */
    event AcceptGlobalExitRootUpdater(
        address oldGlobalExitRootUpdater,
        address newGlobalExitRootUpdater
    );

    /**
     * @dev Emitted when the pending GlobalExitRootRemover accepts the GlobalExitRootRemover role.
     * @param oldGlobalExitRootRemover The previous GlobalExitRootRemover.
     * @param newGlobalExitRootRemover The new GlobalExitRootRemover.
     */
    event AcceptGlobalExitRootRemover(
        address oldGlobalExitRootRemover,
        address newGlobalExitRootRemover
    );

    /**
     * @param _bridgeAddress PolygonZkEVMBridge contract address
     */
    constructor(
        address _bridgeAddress
    ) PolygonZkEVMGlobalExitRootL2(_bridgeAddress) {
        _disableInitializers();
    }

    /**
     * @notice Initialize contract
     * Note this initialize function is exactly the same as the last version, therefore no modifications needed
     * @param _globalExitRootUpdater setting the globalExitRootUpdater.
     * @param _globalExitRootRemover In case of initializing a chain with Full execution proofs, this address should be set to zero, otherwise, some malicious sequencer could insert invalid global exit roots, claim and go back and the execution would be correctly proved.
     */
    function initialize(
        address _globalExitRootUpdater,
        address _globalExitRootRemover
    ) external virtual initializer {
        /// @dev _globalExitRootRemover can be set to zero if the chain doesn't want to have this feature
        if (_globalExitRootUpdater == address(0)) {
            revert InvalidZeroAddress();
        }

        // set globalExitRootUpdater
        globalExitRootUpdater = _globalExitRootUpdater;
        emit AcceptGlobalExitRootUpdater(address(0), globalExitRootUpdater);

        // set globalExitRootRemover
        globalExitRootRemover = _globalExitRootRemover;
        emit AcceptGlobalExitRootRemover(address(0), globalExitRootRemover);
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
     * @dev After inserting the new global exit root, the hash chain value is updated.
     *      A hash chain is being used to make optimized proof generations of GERs.
     * @param _newRoot new global exit root to insert
     */
    function insertGlobalExitRoot(
        bytes32 _newRoot
    ) external onlyGlobalExitRootUpdater {
        // do not insert GER if already set
        if (globalExitRootMap[_newRoot] == 0) {
            globalExitRootMap[_newRoot] = block.timestamp;
            // Update hash chain value
            insertedGERHashChain = Hashes.efficientKeccak256(
                insertedGERHashChain,
                _newRoot
            );

            // Emit update event
            emit UpdateHashChainValue(_newRoot, insertedGERHashChain);
        } else {
            revert GlobalExitRootAlreadySet();
        }
    }

    /**
     * @notice Remove global exit roots
     * @dev After removing a global exit root, the removal hash chain value is updated.
     *      A hash chain is being used to make optimized proof generations of removed GERs.
     * @param gersToRemove Array of gers to remove
     */
    function removeGlobalExitRoots(
        bytes32[] calldata gersToRemove
    ) external onlyGlobalExitRootRemover {
        // @dev A memory variable is used to reduce sload/sstore operations while looping
        bytes32 nextRemovalHashChainValue = removedGERHashChain;
        for (uint256 i = 0; i < gersToRemove.length; i++) {
            // Check if the GER exists
            bytes32 gerToRemove = gersToRemove[i];
            if (globalExitRootMap[gerToRemove] == 0) {
                revert GlobalExitRootNotFound();
            }
            // Encode new removed GERs to generate the nextRemovalHashChainValue
            nextRemovalHashChainValue = Hashes.efficientKeccak256(
                nextRemovalHashChainValue,
                gerToRemove
            );

            // Remove the GER from the map
            delete globalExitRootMap[gerToRemove];

            // Emit the removal event
            emit UpdateRemovalHashChainValue(
                gerToRemove,
                nextRemovalHashChainValue
            );
        }
        // Update the removedGERHashChain
        removedGERHashChain = nextRemovalHashChainValue;
    }

    ///////////////////////////////////
    //   Role transfer functions    //
    /////////////////////////////////

    /**
     * @notice Starts the globalExitRootUpdater role transfer
     * This is a two step process, the pending globalExitRootUpdater must accepted to finalize the process
     * @param _newGlobalExitRootUpdater Address of the new globalExitRootUpdater
     */
    function transferGlobalExitRootUpdater(
        address _newGlobalExitRootUpdater
    ) external onlyGlobalExitRootUpdater {
        if (_newGlobalExitRootUpdater == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingGlobalExitRootUpdater = _newGlobalExitRootUpdater;

        emit TransferGlobalExitRootUpdater(
            globalExitRootUpdater,
            _newGlobalExitRootUpdater
        );
    }

    /**
     * @notice Allow the current pending globalExitRootUpdater to accept the globalExitRootUpdater role
     */
    function acceptGlobalExitRootUpdater() external {
        if (msg.sender != pendingGlobalExitRootUpdater) {
            revert OnlyPendingGlobalExitRootUpdater();
        }

        address oldGlobalExitRootUpdater = globalExitRootUpdater;
        globalExitRootUpdater = pendingGlobalExitRootUpdater;
        pendingGlobalExitRootUpdater = address(0);

        emit AcceptGlobalExitRootUpdater(
            oldGlobalExitRootUpdater,
            globalExitRootUpdater
        );
    }

    /**
     * @notice Start the globalExitRootRemover role transfer in a two-step process
     * @param _newGlobalExitRootRemover new pending globalExitRootRemover address
     */
    function transferGlobalExitRootRemover(
        address _newGlobalExitRootRemover
    ) external onlyGlobalExitRootRemover {
        pendingGlobalExitRootRemover = _newGlobalExitRootRemover;

        emit TransferGlobalExitRootRemover(
            globalExitRootRemover,
            _newGlobalExitRootRemover
        );
    }

    /**
     * @notice Allow the current pending globalExitRootRemover to accept the globalExitRootRemover role
     */
    function acceptGlobalExitRootRemover() external {
        if (msg.sender != pendingGlobalExitRootRemover) {
            revert OnlyPendingGlobalExitRootRemover();
        }

        address oldGlobalExitRootRemover = globalExitRootRemover;
        globalExitRootRemover = pendingGlobalExitRootRemover;
        pendingGlobalExitRootRemover = address(0);

        emit AcceptGlobalExitRootRemover(
            oldGlobalExitRootRemover,
            globalExitRootRemover
        );
    }
}
