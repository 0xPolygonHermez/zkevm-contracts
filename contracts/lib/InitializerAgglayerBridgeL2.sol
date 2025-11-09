// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../interfaces/IAgglayerBridgeL2.sol";
import "../AgglayerBridge.sol";
import "../interfaces/IAgglayerGERL2.sol";
import "../interfaces/IInitializerAgglayerBridgeL2.sol";

/**
 * @title InitializerAgglayerBridgeL2
 * @notice This contract is used ONLY for initialization of AgglayerBridgeL2 via delegatecall
 * @dev This contract inherits from AgglayerBridge to maintain storage layout compatibility
 * @dev All functions except initialize() are overridden to revert to minimize bytecode size
 * @dev Storage variables are duplicated from AgglayerBridgeL2 to ensure proper delegatecall behavior
 * @dev This contract is deployed separately and called via fallback in AgglayerBridgeL2
 */
contract InitializerAgglayerBridgeL2 is
    AgglayerBridge,
    IAgglayerBridgeL2,
    IInitializerAgglayerBridgeL2
{
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;
    // address used to permission the initialization of the contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable deployer;

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
     * @notice Mapping to track phantom claims that have been executed
     * @dev Maps the leaf value hash to the number of phantom claims executed for that leaf
     * When a phantom claim is made, this counter is incremented
     * When a regular claim is made, if a phantom claim exists, the counter is decremented
     * and no actual token transfer occurs (as tokens were already transferred via phantom claim)
     */
    mapping(bytes32 leafValue => uint256 phantomClaimCount)
        public phantomClaimMap;

    /**
     * @notice Mapping to track which leaf value corresponds to each phantom claimed global index
     * @dev Maps globalIndex to the leaf value that was phantom claimed
     * This main a protection for the message sender to not be able to claim the same globalIndex with different leaves (unless override is enabled)
     * This prevents the same globalIndex from being used for different leaves (unless override is enabled)
     * Ensures consistency between phantom claims and actual claims
     */
    mapping(uint256 globalIndex => bytes32 leafValue)
        public phantomGlobalIndexToLeaf;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[46] private __gap;

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
     * @param leafIndex Index of the leaf of the set claim in the Merkle tree
     * @param sourceNetwork Identifier of the source network of the claim (0 = Ethereum).
     */
    event SetClaim(uint32 leafIndex, uint32 sourceNetwork);

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
     * @param mainnetExitRoot Mainnet exit root
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
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address indexed destinationAddress,
        uint256 amount,
        bytes metadata
    );

    /**
     * @dev Emitted when a phantom claim is executed
     * @notice This event indicates that assets have been transferred before the actual claim proof
     * @param globalIndex The global index of the claim
     * @param leafType Type of the leaf (0 for asset, 1 for message)
     * @param originNetwork Network ID where the tokens originated
     * @param originAddress Address of the origin token
     * @param destinationNetwork Network ID of the destination (this network)
     * @param destinationAddress Address receiving the tokens
     * @param amount Amount of tokens transferred
     * @param metadata Additional metadata for the claim (token info for wrapped tokens)
     */
    event PhantomClaim(
        uint256 globalIndex,
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes metadata
    );

    /**
     * Disable initializers on the implementation following the best practices
     * @dev the deployer is set to the contract creator and will be the only allowed to initialize the contract in a 2 steps process
     */
    constructor() AgglayerBridge() {
        deployer = msg.sender;
        _disableInitializers();
    }

    /**
     * @dev initializer function to set the initial values of the contract when the contract is deployed for the first time
     * @param _networkID networkID
     * @param _gasTokenAddress gas token address
     * @param _gasTokenNetwork gas token network
     * @param _globalExitRootManager global exit root manager address
     * @param _polygonRollupManager Rollup manager address
     * @notice The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
     * emergency state is not possible for the L2 deployment of the bridge in StateTransition chains, intentionally
     * @param _gasTokenMetadata Abi encoded gas token metadata
     * @param _bridgeManager bridge manager address
     * @param _sovereignWETHAddress sovereign WETH address
     * @param _sovereignWETHAddressIsNotMintable Flag to indicate if the wrapped ETH is not mintable
     * @param _emergencyBridgePauser emergency bridge pauser address, allowed to be zero if the chain wants to disable the feature to stop the bridge
     * @param _emergencyBridgeUnpauser emergency bridge unpauser address, allowed to be zero if the chain wants to disable the feature to unpause the bridge
     * @param _proxiedTokensManager address of the proxied tokens manager
     */
    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBaseLegacyAgglayerGER _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address _sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) public virtual reinitializer(3) {
        // only the deployer can initialize the contract.
        /// @dev the complexity of the initializes makes it very complex to deploy a proxy and
        /// @dev initialize the contract in an atomic transaction, so we need to permission the function to avoid frontrunning attacks
        require(msg.sender == deployer, OnlyDeployer());

        require(
            address(_globalExitRootManager) != address(0),
            InvalidZeroAddress()
        );

        // Network ID must be different from 0 for sovereign chains
        require(_networkID != 0, InvalidZeroNetworkID());

        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        polygonRollupManager = _polygonRollupManager;
        bridgeManager = _bridgeManager;
        emergencyBridgePauser = _emergencyBridgePauser;
        emit AcceptEmergencyBridgePauserRole(address(0), emergencyBridgePauser);
        emergencyBridgeUnpauser = _emergencyBridgeUnpauser;
        emit AcceptEmergencyBridgeUnpauserRole(
            address(0),
            emergencyBridgeUnpauser
        );

        // Set proxied tokens manager
        require(
            _proxiedTokensManager != address(this),
            BridgeAddressNotAllowed()
        );

        // It's not allowed proxiedTokensManager to be zero address. If disabling token upgradability is required, add a not owned account like 0xffff...fffff
        require(_proxiedTokensManager != address(0), InvalidZeroAddress());

        proxiedTokensManager = _proxiedTokensManager;

        emit AcceptProxiedTokensManagerRole(address(0), proxiedTokensManager);

        // Set gas token
        if (_gasTokenAddress == address(0)) {
            // Gas token will be ether
            if (_gasTokenNetwork != 0) {
                revert GasTokenNetworkMustBeZeroOnEther();
            }
            // Health check for sovereign WETH address
            if (
                _sovereignWETHAddress != address(0) ||
                _sovereignWETHAddressIsNotMintable
            ) {
                revert InvalidSovereignWETHAddressParams();
            }
            // WETHToken, gasTokenAddress and gasTokenNetwork will be 0
            // gasTokenMetadata will be empty
        } else {
            // Gas token will be an erc20
            gasTokenAddress = _gasTokenAddress;
            gasTokenNetwork = _gasTokenNetwork;
            gasTokenMetadata = _gasTokenMetadata;

            // Set sovereign weth token or create new if not provided
            if (_sovereignWETHAddress == address(0)) {
                // Health check for sovereign WETH address is mintable
                if (_sovereignWETHAddressIsNotMintable == true) {
                    revert InvalidSovereignWETHAddressParams();
                }
                // Create a wrapped token for WETH, with salt == 0
                WETHToken = _deployWrappedToken(
                    0, // salt
                    abi.encode("Wrapped Ether", "WETH", 18)
                );
            } else {
                WETHToken = ITokenWrappedBridgeUpgradeable(
                    _sovereignWETHAddress
                );
                wrappedAddressIsNotMintable[
                    _sovereignWETHAddress
                ] = _sovereignWETHAddressIsNotMintable;
            }
        }

        // Initialize OZ contracts
        __ReentrancyGuard_init();
    }

    ///////////////////////////////////////////////////////////////
    // OVERRIDE ALL INHERITED FUNCTIONS TO REVERT - BYTECODE OPTIMIZATION
    ///////////////////////////////////////////////////////////////

    /**
     * @notice Override bridgeAsset to revert - not supported in initializer
     */
    function bridgeAsset(
        uint32,
        address,
        uint256,
        address,
        bool,
        bytes calldata
    ) public payable override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override bridgeMessage to revert - not supported in initializer
     */
    function bridgeMessage(
        uint32,
        address,
        bool,
        bytes calldata
    ) external payable override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override bridgeMessageWETH to revert - not supported in initializer
     */
    function bridgeMessageWETH(
        uint32,
        address,
        uint256,
        bool,
        bytes calldata
    ) external override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override claimAsset to revert - not supported in initializer
     */
    function claimAsset(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        uint256,
        bytes32,
        bytes32,
        uint32,
        address,
        uint32,
        address,
        uint256,
        bytes calldata
    ) public override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override claimMessage to revert - not supported in initializer
     */
    function claimMessage(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        uint256,
        bytes32,
        bytes32,
        uint32,
        address,
        uint32,
        address,
        uint256,
        bytes calldata
    ) external override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getTokenWrappedAddress to revert - not supported in initializer
     */
    function getTokenWrappedAddress(
        uint32,
        address
    ) external view override(AgglayerBridge) returns (address) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override activateEmergencyState to revert - not supported in initializer
     */
    function activateEmergencyState()
        external
        override(AgglayerBridge, IAgglayerBridge)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override deactivateEmergencyState to revert - not supported in initializer
     */
    function deactivateEmergencyState()
        external
        override(AgglayerBridge, IAgglayerBridge)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override transferProxiedTokensManagerRole to revert - not supported in initializer
     */
    function transferProxiedTokensManagerRole(
        address
    ) external override(AgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override acceptProxiedTokensManagerRole to revert - not supported in initializer
     */
    function acceptProxiedTokensManagerRole()
        external
        override(AgglayerBridge)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override updateGlobalExitRoot to revert - not supported in initializer
     */
    function updateGlobalExitRoot()
        external
        override(AgglayerBridge, IAgglayerBridge)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override isClaimed to revert - not supported in initializer
     */
    function isClaimed(
        uint32,
        uint32
    ) public view override(AgglayerBridge) returns (bool) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getProxiedTokensManager to revert - not supported in initializer
     */
    function getProxiedTokensManager()
        external
        view
        override(AgglayerBridge, IAgglayerBridge)
        returns (address)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getWrappedTokenBridgeImplementation to revert - not supported in initializer
     */
    function getWrappedTokenBridgeImplementation()
        external
        view
        override(AgglayerBridge, IAgglayerBridge)
        returns (address)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getTokenMetadata to revert - not supported in initializer
     */
    function getTokenMetadata(
        address
    )
        external
        view
        override(AgglayerBridge, IAgglayerBridge)
        returns (bytes memory)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override INIT_BYTECODE_TRANSPARENT_PROXY to revert - not supported in initializer
     */
    function INIT_BYTECODE_TRANSPARENT_PROXY()
        public
        view
        override(AgglayerBridge)
        returns (bytes memory)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override computeTokenProxyAddress to revert - not supported in initializer
     */
    function computeTokenProxyAddress(
        uint32,
        address
    ) public view override(AgglayerBridge) returns (address) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override version to revert - not supported in initializer
     */
    function version()
        external
        pure
        override(AgglayerBridge)
        returns (string memory)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getLeafValue to revert - not supported in initializer
     */
    function getLeafValue(
        uint8,
        uint32,
        address,
        uint32,
        address,
        uint256,
        bytes32
    ) public pure override(DepositContractV2) returns (bytes32) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getRoot to revert - not supported in initializer
     */
    function getRoot()
        public
        view
        override(DepositContractBase)
        returns (bytes32)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override verifyMerkleProof to revert - not supported in initializer
     */
    function verifyMerkleProof(
        bytes32,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        uint32,
        bytes32
    ) public pure override(DepositContractBase) returns (bool) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override calculateRoot to revert - not supported in initializer
     */
    function calculateRoot(
        bytes32,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        uint32
    ) public pure override(DepositContractBase) returns (bytes32) {
        revert NonSupportedFunction();
    }

    ///////////////////////////////////////////////////////////////
    // NOTE: Public state variable getters CANNOT be overridden
    // The following variables from parent contracts will work as normal getters:
    // - depositCount, isEmergencyState, networkID, globalExitRootManager
    // - lastUpdatedDepositCount, claimedBitMap, tokenInfoToWrappedToken
    // - wrappedTokenToTokenInfo, polygonRollupManager, gasTokenAddress
    // - gasTokenNetwork, gasTokenMetadata, WETHToken, pendingProxiedTokensManager
    // - bridgeLib
    // These cannot be overridden in Solidity without the parent marking them as virtual
    ///////////////////////////////////////////////////////////////
}
