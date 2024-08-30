// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../interfaces/IPolygonZkEVMGlobalExitRootV2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../../interfaces/IPolygonZkEVMErrors.sol";
import "../interfaces/IPolygonZkEVMVEtrogErrors.sol";
import "../interfaces/IPolygonConsensusBase.sol";
import "../interfaces/IPolygonRollupBase.sol";
import "../interfaces/IPolygonZkEVMBridgeV2.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "./PolygonConstantsBase.sol";
import "../PolygonRollupManager.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract PolygonConsensusBase is
    Initializable,
    IPolygonConsensusBase,
    IPolygonZkEVMVEtrogErrors
{
    // POL token address
    IERC20Upgradeable public immutable pol;

    // Global Exit Root interface
    IPolygonZkEVMGlobalExitRootV2 public immutable globalExitRootManager;

    // PolygonZkEVM Bridge Address
    IPolygonZkEVMBridgeV2 public immutable bridgeAddress;

    // Rollup manager
    PolygonRollupManager public immutable rollupManager;

    // Address that will be able to adjust contract parameters
    address public admin;

    // This account will be able to accept the admin role
    address public pendingAdmin;

    // Trusted sequencer address
    address public trustedSequencer;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Current accumulate input hash
    bytes32 public lastAccInputHash;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForcedBatchData
    // hashedForcedBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 forcedGlobalExitRoot, unint64 forcedTimestamp, bytes32 forcedBlockHashL1)
    mapping(uint64 => bytes32) public forcedBatches;

    // Last forced batch
    uint64 public lastForceBatch;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Force batch timeout
    uint64 public forceBatchTimeout;

    // Indicates what address is able to do forced batches
    // If the address is set to 0, forced batches are open to everyone
    address public forceBatchAddress;

    // Token address that will be used to pay gas fees in this rollup. This variable it's just for read purposes
    address public gasTokenAddress;

    // Native network of the token address of the gas tokena address. This variable it's just for read purposes
    uint32 public gasTokenNetwork;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    /**
     * @dev Emitted when the admin updates the trusted sequencer address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when the admin updates the sequencer URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAdminRole(address newPendingAdmin);

    /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAdminRole(address newAdmin);

    // General parameters that will have in common all networks that deploys rollup manager

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    ) {
        globalExitRootManager = _globalExitRootManager;
        pol = _pol;
        bridgeAddress = _bridgeAddress;
        rollupManager = _rollupManager;

        // Disable initalizers on the implementation following the best practices
        _disableInitializers();
    }

    /**
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     */
    function initialize(
        address _admin,
        address sequencer,
        uint32, //networkID,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external virtual onlyRollupManager initializer {
        // Set initialize variables
        admin = _admin;
        trustedSequencer = sequencer;

        trustedSequencerURL = sequencerURL;
        networkName = _networkName;

        gasTokenAddress = _gasTokenAddress;
    }

    modifier onlyAdmin() {
        if (admin != msg.sender) {
            revert OnlyAdmin();
        }
        _;
    }

    modifier onlyRollupManager() {
        if (address(rollupManager) != msg.sender) {
            revert OnlyRollupManager();
        }
        _;
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequencer
     */
    function setTrustedSequencer(
        address newTrustedSequencer
    ) external onlyAdmin {
        trustedSequencer = newTrustedSequencer;

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the admin to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(
        string memory newTrustedSequencerURL
    ) external onlyAdmin {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
    }

    /**
     * @notice Starts the admin role transfer
     * This is a two step process, the pending admin must accepted to finalize the process
     * @param newPendingAdmin Address of the new pending admin
     */
    function transferAdminRole(address newPendingAdmin) external onlyAdmin {
        pendingAdmin = newPendingAdmin;
        emit TransferAdminRole(newPendingAdmin);
    }

    /**
     * @notice Allow the current pending admin to accept the admin role
     */
    function acceptAdminRole() external {
        if (pendingAdmin != msg.sender) {
            revert OnlyPendingAdmin();
        }

        admin = pendingAdmin;
        emit AcceptAdminRole(pendingAdmin);
    }
}
