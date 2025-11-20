// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../interfaces/IAgglayerBridgeL2Base.sol";
import "../AgglayerBridge.sol";
import "../interfaces/IAgglayerGERL2.sol";

/**
 * Sovereign chains bridge that will be deployed on all Sovereign chains
 * Contract responsible to manage the token interactions with other networks
 * This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks
 */
abstract contract AgglayerBridgeL2Base is
    AgglayerBridge,
    IAgglayerBridgeL2Base
{
    // Current bridge version
    string internal constant BRIDGE_SOVEREIGN_VERSION = "v1.3.0";

    // Struct to represent leaf data for forwardLET function
    struct LeafData {
        uint8 leafType;
        uint32 originNetwork;
        address originAddress;
        uint32 destinationNetwork;
        address destinationAddress;
        uint256 amount;
        bytes metadata;
    }

    /**
     * @notice Struct to represent claim data for forceEmitDetailedClaimEvent function
     * @dev Contains all parameters needed to verify and emit a DetailedClaimEvent
     */
    struct ClaimData {
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot;
        bytes32 rollupExitRoot;
        ClaimDataLER lerData;
    }

    struct ClaimDataLER {
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot;
        uint256 globalIndex;
        bytes32 localExitRoot;
        uint8 leafType;
        uint32 originNetwork;
        address originAddress;
        uint32 destinationNetwork;
        address destinationAddress;
        uint256 amount;
        bytes metadata;
    }

    // Map to store wrappedAddresses that are not mintable
    mapping(address wrappedAddress => bool isNotMintable)
        public wrappedAddressIsNotMintable;

    // Bridge manager address; can set custom mapping for any token. It's highly recommend to set a timelock at this address after bootstrapping phase
    address public bridgeManager;

    // Emergency bridge pauser address: can pause the bridge in case of emergency, both bridges and claims
    address public emergencyBridgePauser;

    // Claimed global index hash chain, updated for every bridge claim as follows
    // newClaimedGlobalIndexHashChain = Keccak256(oldClaimedGlobalIndexHashChain,bytes32(claimedGlobalIndex));
    bytes32 public claimedGlobalIndexHashChain;

    // Unset global index hash chain, updated every time the bridge manager unset a claim
    // This should be use only in edge-case/emergency circumstances
    // newUnsetGlobalIndexHashChain = Keccak256(oldUnsetGlobalIndexHashChain,bytes32(removedGlobalIndex));
    bytes32 public unsetGlobalIndexHashChain;

    // Local balance tree mapping
    mapping(bytes32 tokenInfoHash => uint256 amount) public localBalanceTree;

    /// @dev Deprecated in favor of _initializerVersion at AgglayerBridge
    /// @custom:oz-renamed-from _initializerVersion
    uint8 private _initializerVersionLegacy;

    //  This account will be able to accept the emergencyBridgePauser role
    address public pendingEmergencyBridgePauser;

    // Emergency bridge unpauser address: can unpause the bridge, both bridges and claims
    address public emergencyBridgeUnpauser;

    // This account will be able to accept the emergencyBridgeUnpauser role
    address public pendingEmergencyBridgeUnpauser;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[48] private __gap;

    /**
     * @dev Emitted when a bridge manager is updated
     */
    event SetBridgeManager(address bridgeManager);

    /**
     * @notice Emitted when the emergencyBridgePauser starts the two-step transfer role setting a new pending emergencyBridgePauser.
     * @param currentEmergencyBridgePauser The current emergencyBridgePauser.
     * @param newEmergencyBridgePauser The new pending emergencyBridgePauser.
     */
    event TransferEmergencyBridgePauserRole(
        address currentEmergencyBridgePauser,
        address newEmergencyBridgePauser
    );

    /**
     * @notice Emitted when the pending emergencyBridgePauser accepts the emergencyBridgePauser role.
     * @param oldEmergencyBridgePauser The previous emergencyBridgePauser.
     * @param newEmergencyBridgePauser The new emergencyBridgePauser.
     */
    event AcceptEmergencyBridgePauserRole(
        address oldEmergencyBridgePauser,
        address newEmergencyBridgePauser
    );

    /**
     * @notice Emitted when the emergencyBridgeUnpauser starts the two-step transfer role setting a new pending emergencyBridgeUnpauser.
     * @param currentEmergencyBridgeUnpauser The current emergencyBridgeUnpauser.
     * @param newEmergencyBridgeUnpauser The new pending emergencyBridgeUnpauser.
     */
    event TransferEmergencyBridgeUnpauserRole(
        address currentEmergencyBridgeUnpauser,
        address newEmergencyBridgeUnpauser
    );

    /**
     * @notice Emitted when the pending emergencyBridgeUnpauser accepts the emergencyBridgeUnpauser role.
     * @param oldEmergencyBridgeUnpauser The previous emergencyBridgeUnpauser.
     * @param newEmergencyBridgeUnpauser The new emergencyBridgeUnpauser.
     */
    event AcceptEmergencyBridgeUnpauserRole(
        address oldEmergencyBridgeUnpauser,
        address newEmergencyBridgeUnpauser
    );

    /**
     * @dev Emitted when a token address is remapped by a sovereign token address
     */
    event SetSovereignTokenAddress(
        uint32 originNetwork,
        address originTokenAddress,
        address sovereignTokenAddress,
        bool isNotMintable
    );

    /**
     * @dev Emitted when a legacy token is migrated to a new token
     */
    event MigrateLegacyToken(
        address sender,
        address legacyTokenAddress,
        address updatedTokenAddress,
        uint256 amount
    );

    /**
     * @dev Emitted when a remapped token is removed from mapping
     */
    event RemoveLegacySovereignTokenAddress(address sovereignTokenAddress);

    /**
     * @dev Emitted when a WETH address is remapped by a sovereign WETH address
     */
    event SetSovereignWETHAddress(
        address sovereignWETHTokenAddress,
        bool isNotMintable
    );

    /**
     * @dev Emitted when the claimed global index hash chain is updated (new claim)
     * @param claimedGlobalIndex Global index added to the hash chain
     * @param newClaimedGlobalIndexHashChain New global index hash chain value
     */
    event UpdatedClaimedGlobalIndexHashChain(
        bytes32 claimedGlobalIndex,
        bytes32 newClaimedGlobalIndexHashChain
    );

    /**
     * @dev Emitted when the unset global index hash chain is updated
     * @param unsetGlobalIndex Global index added to the hash chain
     * @param newUnsetGlobalIndexHashChain New global index hash chain value
     */
    event UpdatedUnsetGlobalIndexHashChain(
        bytes32 unsetGlobalIndex,
        bytes32 newUnsetGlobalIndexHashChain
    );

    /**
     * @dev Emitted when a claim is set
     * @param globalIndex Global index set
     */
    event SetClaim(bytes32 globalIndex);

    /**
     * @dev Emitted when local exit tree is moved backward
     * @param previousDepositCount The deposit count before moving backward
     * @param previousRoot The root of the local exit tree before moving backward
     * @param newDepositCount The resulting deposit count after moving backward
     * @param newRoot The resulting root of the local exit tree after moving backward
     */
    event BackwardLET(
        uint256 previousDepositCount,
        bytes32 previousRoot,
        uint256 newDepositCount,
        bytes32 newRoot
    );

    /**
     * @dev Emitted when local exit tree is moved forward
     * @param previousDepositCount The deposit count before moving forward
     * @param previousRoot The root of the local exit tree before moving forward
     * @param newDepositCount The resulting deposit count after moving forward
     * @param newRoot The resulting root of the local exit tree after moving forward
     * @param newLeaves The raw bytes of all new leaves added
     */
    event ForwardLET(
        uint256 previousDepositCount,
        bytes32 previousRoot,
        uint256 newDepositCount,
        bytes32 newRoot,
        bytes newLeaves
    );

    /**
     * @dev Emitted when local balance tree is updated
     * @param originNetwork The origin network of the set leaf
     * @param originTokenAddress The origin token address of the set leaf
     * @param newAmount The new amount set for this token
     */
    event SetLocalBalanceTree(
        uint32 indexed originNetwork,
        address indexed originTokenAddress,
        uint256 newAmount
    );

    /**
     * @dev Emitted when a claim is processed on L2 rollups for better gas efficiency
     * @dev This event can be emitted on rollups because gas costs are cheaper than on L1
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the network exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index of the claim
     * @param localExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    event DetailedClaimEvent(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot,
        uint256 indexed globalIndex,
        bytes32 localExitRoot,
        bytes32 rollupExitRoot,
        uint8 leafType,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address indexed destinationAddress,
        uint256 amount,
        bytes metadata
    );

    modifier onlyBridgeManager() {
        if (bridgeManager != msg.sender) {
            revert OnlyBridgeManager();
        }
        _;
    }

    modifier onlyEmergencyBridgePauser() {
        if (emergencyBridgePauser != msg.sender) {
            revert OnlyEmergencyBridgePauser();
        }
        _;
    }

    modifier onlyEmergencyBridgeUnpauser() {
        if (emergencyBridgeUnpauser != msg.sender) {
            revert OnlyEmergencyBridgeUnpauser();
        }
        _;
    }

    modifier onlyGlobalExitRootRemover() {
        // Only allowed to be called by GlobalExitRootRemover
        if (
            IAgglayerGERL2(address(globalExitRootManager))
                .globalExitRootRemover() != msg.sender
        ) {
            revert OnlyGlobalExitRootRemover();
        }
        _;
    }
}
