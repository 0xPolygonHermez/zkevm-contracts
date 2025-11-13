// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;
import "../LegacyAgglayerGERL2.sol";
import "../lib/Hashes.sol";
import "../interfaces/IAgglayerGERL2.sol";
import "../interfaces/IVersion.sol";
import "../interfaces/IAgglayerBridgeL2.sol";
import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the exit roots for the Sovereign chains and global exit roots
 */
contract AgglayerGERL2 is
    LegacyAgglayerGERL2,
    IAgglayerGERL2,
    Initializable,
    IVersion
{
    // Current contract version
    string public constant GER_SOVEREIGN_VERSION = "v1.1.0";

    // Used for SMT proofs of deposit contracts
    // Merkle tree levels
    // Used in this contract to insert the LER and make a claim to the bridge contract directly
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    // globalExitRootUpdater address
    address public globalExitRootUpdater;

    // globalExitRootRemover address
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

    // Local exiy tree mapping. H(LER # networkID) => exist
    mapping(bytes32 => bool) public localExitRootMap;

    // Value of the local exit roots hash chain after last insertion
    bytes32 public insertedLERHashChain;

    // Value of the removed local exit roots hash chain after last removal
    bytes32 public removedLERHashChain;

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
     * @dev Emitted when a new local exit root is inserted and added to the hash chain
     */
    event UpdateLERHashChainValue(
        bytes32 indexed newLER,
        uint32 indexed networkID,
        bytes32 indexed newHashChainValue
    );

    /**
     * @dev Emitted when the local exit root is removed and added to the removal hash chain
     */
    event UpdateRemovalLERHashChainValue(
        bytes32 indexed removedLER,
        uint32 indexed networkID,
        bytes32 indexed newRemovalHashChainValue
    );

    /**
     * @dev Thrown when initializing calling a function with invalid arrays length
     */
    error InputArraysLengthMismatch();

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
    constructor(address _bridgeAddress) LegacyAgglayerGERL2(_bridgeAddress) {
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

    /**
     * @notice Insert a new local exit root
     * @param newLocalExitRoots array of new local exit roots to insert
     * @param networkIDs array of origin networks of LERs
     */
    function _insertLERs(
        bytes32[] memory newLocalExitRoots,
        uint32[] memory networkIDs
    ) internal {
        if (newLocalExitRoots.length != networkIDs.length) {
            revert InputArraysLengthMismatch();
        }
        bytes32 nextInsertedLERHashChain = insertedLERHashChain;
        // do not insert LER if already set
        for (uint256 i = 0; i < newLocalExitRoots.length; i++) {
            bytes32 keyLER = getHashLER(newLocalExitRoots[i], networkIDs[i]);
            if (localExitRootMap[keyLER] == false) {
                localExitRootMap[keyLER] = true;
                // Update hash chain value
                nextInsertedLERHashChain = Hashes.efficientKeccak256(
                    nextInsertedLERHashChain,
                    keyLER
                );

                // Emit update event
                emit UpdateLERHashChainValue(
                    newLocalExitRoots[i],
                    networkIDs[i],
                    nextInsertedLERHashChain
                );
            } else {
                revert LocalExitRootAlreadySet();
            }
        }
        // Update the insertedLERHashChain
        insertedLERHashChain = nextInsertedLERHashChain;
    }

    /**
     * @notice Insert multiple new local exit roots
     * @param newLER array new local exit root to insert
     * @param networkID array origin networks of LERs
     */
    function _insertLER(bytes32 newLER, uint32 networkID) internal {
        // Convert calldata to memory and call internal function
        bytes32[] memory _newLocalExitRoots = new bytes32[](1);
        _newLocalExitRoots[0] = newLER;
        uint32[] memory _networkIDs = new uint32[](1);
        _networkIDs[0] = networkID;
        _insertLERs(_newLocalExitRoots, _networkIDs);
    }

    /**
     * @notice Insert multiple new local exit roots
     * @param newLocalExitRoots array new local exit root to insert
     * @param networkIDs array origin networks of LERs
     */
    function insertLERs(
        bytes32[] calldata newLocalExitRoots,
        uint32[] calldata networkIDs
    ) public onlyGlobalExitRootUpdater {
        // Convert calldata to memory and call internal function
        bytes32[] memory _newLocalExitRoots = newLocalExitRoots;
        uint32[] memory _networkIDs = networkIDs;
        _insertLERs(_newLocalExitRoots, _networkIDs);
    }

    /**
     * @notice Remove local exit root
     * @param lersToRemove array local exit root to remove
     * @param networkIDs array origin networks of LERs to remove
     */
    function removeLERs(
        bytes32[] calldata lersToRemove,
        uint32[] calldata networkIDs
    ) public onlyGlobalExitRootRemover {
        if (lersToRemove.length != networkIDs.length) {
            revert InputArraysLengthMismatch();
        }
        bytes32 nextRemovalHashChainValue = removedLERHashChain;
        for (uint256 i = 0; i < lersToRemove.length; i++) {
            // Check if the LER exists
            bytes32 keyLERToRemove = getHashLER(lersToRemove[i], networkIDs[i]);
            if (localExitRootMap[keyLERToRemove] == false) {
                revert LocalExitRootNotFound();
            }
            // Encode new removed LERs to generate the nextRemovalHashChainValue
            nextRemovalHashChainValue = Hashes.efficientKeccak256(
                nextRemovalHashChainValue,
                keyLERToRemove
            );

            // Remove the LER from the map
            delete localExitRootMap[keyLERToRemove];

            // Emit removal event
            emit UpdateRemovalLERHashChainValue(
                lersToRemove[i],
                networkIDs[i],
                nextRemovalHashChainValue
            );
        }
        // Update the removedLERHashChain
        removedLERHashChain = nextRemovalHashChainValue;
    }

    /**
     * @notice Get the hash of a local exit root and its origin network
     * @param ler local exit root
     * @param networkID origin network ID of the local exit root
     * @return hash of the local exit root and its origin network
     */
    function getHashLER(
        bytes32 ler,
        uint32 networkID
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(ler, networkID));
    }

    /**
     * @notice Insert multiple LERs and claim multiple assets from LERs in a single transaction
     * @param networkID current network ID
     * @param smtProofLocalExitRoots array of SMT proofs of the local exit roots
     * @param globalIndexes array of global indexes
     * @param localExitRoot local exit root to be used for all claims
     * @param originNetworks array of origin networks
     * @param originTokenAddresses array of origin token addresses
     * @param destinationNetworks array of destination networks
     * @param destinationAddresses array of destination addresses
     * @param amounts array of amounts to claim
     * @param metadatas array of metadatas for each claim
     */
    function insertAndClaimsAssetFromLER(
        uint32 networkID,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH][] calldata smtProofLocalExitRoots,
        uint256[] calldata globalIndexes,
        bytes32 localExitRoot,
        uint32[] calldata originNetworks,
        address[] calldata originTokenAddresses,
        uint32[] calldata destinationNetworks,
        address[] calldata destinationAddresses,
        uint256[] calldata amounts,
        bytes[] calldata metadatas
    ) public virtual {
        if (
            smtProofLocalExitRoots.length != globalIndexes.length ||
            smtProofLocalExitRoots.length != originNetworks.length ||
            smtProofLocalExitRoots.length != originTokenAddresses.length ||
            smtProofLocalExitRoots.length != destinationNetworks.length ||
            smtProofLocalExitRoots.length != destinationAddresses.length ||
            smtProofLocalExitRoots.length != amounts.length ||
            smtProofLocalExitRoots.length != metadatas.length
        ) {
            revert InputArraysLengthMismatch();
        }

        _insertLER(localExitRoot, networkID);
        for (uint256 i = 0; i < smtProofLocalExitRoots.length; i++) {
            IAgglayerBridgeL2(address(bridgeAddress)).claimAssetFromLER(
                smtProofLocalExitRoots[i],
                globalIndexes[i],
                localExitRoot,
                originNetworks[i],
                originTokenAddresses[i],
                destinationNetworks[i],
                destinationAddresses[i],
                amounts[i],
                metadatas[i]
            );
        }
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

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure returns (string memory) {
        return GER_SOVEREIGN_VERSION;
    }

    /**
     * @notice Function to get if a local exit root exists for a given network
     * @param ler local exit root to check
     * @param networkID origin network ID of the local exit root
     * @return bool true if the local exit root exists, false otherwise
     */
    function existLER(
        bytes32 ler,
        uint32 networkID
    ) external view returns (bool) {
        bytes32 keyLER = keccak256(abi.encodePacked(ler, networkID));
        return localExitRootMap[keyLER];
    }
}
