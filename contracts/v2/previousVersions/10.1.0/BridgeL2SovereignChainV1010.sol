// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../../interfaces/IBridgeL2SovereignChains.sol";
import "../../PolygonZkEVMBridgeV2.sol";
import "../../interfaces/IGlobalExitRootManagerL2SovereignChain.sol";

/**
 * Sovereign chains bridge that will be deployed on all Sovereign chains
 * Contract responsible to manage the token interactions with other networks
 * This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks
 */
contract BridgeL2SovereignChainV1010 is
    PolygonZkEVMBridgeV2,
    IBridgeL2SovereignChains
{
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;

    // Current bridge version
    string public constant BRIDGE_SOVEREIGN_VERSION = "v10.1.0";

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

    // Map to store wrappedAddresses that are not mintable
    mapping(bytes32 tokenInfoHash => uint256 amount) public localBalanceTree;

    /// @dev Deprecated in favor of _initializerVersion at PolygonZkEVMBridgeV2
    /// @custom:oz-renamed-from _initializerVersion
    uint8 private _initializerVersionLegacy;

    //  This account will be able to accept the emergencyBridgePauser role
    address public pendingEmergencyBridgePauser;

    // Emergency bridge unpauser address: can unpause the bridge, both bridges and claims
    address public emergencyBridgeUnpauser;

    //  This account will be able to accept the emergencyBridgeUnpauser role
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
     * @dev Emitted when the localBalanceTree amount is initialized
     */
    event SetInitialLocalBalanceTreeAmount(
        bytes32 tokenInfoHash,
        uint256 amount
    );

    /**
     * Disable initializers on the implementation following the best practices
     */
    constructor() PolygonZkEVMBridgeV2() {
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
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address _sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) public virtual getInitializedVersion reinitializer(3) {
        if (_initializerVersion != 0) {
            revert InvalidInitializeFunction();
        }

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

    /**
     * @notice Initialize function on contracts that has been already deployed
     * Allow to initialize the LocalBalanceTree with the initial balances
     * @param tokenInfoHash Array of tokenInfoHash
     * @param amount Array of amount
     * @param _emergencyBridgeUnpauser Address of the emergencyBridgeUnpauser role
     * @param _proxiedTokensManager Address of the proxiedTokensManager role
     */
    function initialize(
        bytes32[] calldata tokenInfoHash,
        uint256[] calldata amount,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) public getInitializedVersion reinitializer(3) {
        if (_initializerVersion == 0) {
            revert InvalidInitializeFunction();
        }

        if (tokenInfoHash.length != amount.length) {
            revert InputArraysLengthMismatch();
        }

        for (uint256 i = 0; i < tokenInfoHash.length; i++) {
            _setInitialLocalBalanceTreeAmount(tokenInfoHash[i], amount[i]);
        }

        // Set emergency bridge unpauser
        emergencyBridgeUnpauser = _emergencyBridgeUnpauser;
        emit AcceptEmergencyBridgeUnpauserRole(
            address(0),
            emergencyBridgeUnpauser
        );

        // set proxied tokens manager
        require(
            _proxiedTokensManager != address(this),
            BridgeAddressNotAllowed()
        );
        // It's not allowed proxiedTokensManager to be zero address.
        // If disabling token upgradability is required, add a not owned account like 0xffff...fffff
        require(_proxiedTokensManager != address(0), InvalidZeroAddress());

        proxiedTokensManager = _proxiedTokensManager;

        emit AcceptProxiedTokensManagerRole(address(0), proxiedTokensManager);

        // OZ contract already initialized
    }

    /**
     * @notice Set the initial local balance tree amount
     * @param tokenInfoHash Token info hash
     * @param amount Amount to set
     */
    function _setInitialLocalBalanceTreeAmount(
        bytes32 tokenInfoHash,
        uint256 amount
    ) internal {
        localBalanceTree[tokenInfoHash] = amount;

        emit SetInitialLocalBalanceTreeAmount(tokenInfoHash, amount);
    }

    /**
     * @notice Override the function to prevent the contract from being initialized with this initializer
     */
    function initialize(
        uint32, // _networkID
        address, //_gasTokenAddress
        uint32, //_gasTokenNetwork
        IBasePolygonZkEVMGlobalExitRoot, //_globalExitRootManager
        address, //_polygonRollupManager
        bytes memory //_gasTokenMetadata
    )
        external
        override(IPolygonZkEVMBridgeV2, PolygonZkEVMBridgeV2)
        initializer
    {
        revert InvalidInitializeFunction();
    }

    /**
     * @notice Override the function to prevent the usage, only allowed for L1 bridge, not sovereign chains
     */
    function initialize() public pure override(PolygonZkEVMBridgeV2) {
        revert InvalidInitializeFunction();
    }

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
            IGlobalExitRootManagerL2SovereignChain(
                address(globalExitRootManager)
            ).globalExitRootRemover() != msg.sender
        ) {
            revert OnlyGlobalExitRootRemover();
        }
        _;
    }

    /**
     * @notice Remap multiple wrapped tokens to a new sovereign token address
     * @dev This function is a "multi/batch call" to `setSovereignTokenAddress`
     * @param originNetworks Array of Origin networks
     * @param originTokenAddresses Origin token address, address of the token at the origin network.
     * @param sovereignTokenAddresses Array of Addresses of the sovereign wrapped token
     * @param isNotMintable Array of Flags to indicate if the wrapped token is not mintable
     */
    function setMultipleSovereignTokenAddress(
        uint32[] memory originNetworks,
        address[] memory originTokenAddresses,
        address[] memory sovereignTokenAddresses,
        bool[] memory isNotMintable
    ) external onlyBridgeManager {
        if (
            originNetworks.length != originTokenAddresses.length ||
            originNetworks.length != sovereignTokenAddresses.length ||
            originNetworks.length != isNotMintable.length
        ) {
            revert InputArraysLengthMismatch();
        }

        // Make multiple calls to setSovereignTokenAddress
        for (uint256 i = 0; i < sovereignTokenAddresses.length; i++) {
            _setSovereignTokenAddress(
                originNetworks[i],
                originTokenAddresses[i],
                sovereignTokenAddresses[i],
                isNotMintable[i]
            );
        }
    }

    /**
     * @notice Remap a wrapped token to a new sovereign token address
     * @dev This function is used to allow any existing token to be mapped with
     *      origin token.
     * @notice If this function is called multiple times for the same existingTokenAddress,
     * this will override the previous calls and only keep the last sovereignTokenAddress.
     * @notice The tokenInfoToWrappedToken mapping  value is replaced by the new sovereign address but it's not the case for the wrappedTokenToTokenInfo map where the value is added, this way user will always be able to withdraw their tokens
     * @notice The number of decimals between sovereign token and origin token is not checked, it doesn't affect the bridge functionality but the UI.
     * @notice  if you set multiple sovereign token addresses for the same pair of originNetwork/originTokenAddress, means you are remapping the same tokenInfoHash
     * to different sovereignTokenAddress so all those sovereignTokenAddresses will can bridge the mapped tokenInfoHash.
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, address of the token at the origin network
     * @param sovereignTokenAddress Address of the sovereign wrapped token
     * @param isNotMintable Flag to indicate if the wrapped token is not mintable
     */
    function _setSovereignTokenAddress(
        uint32 originNetwork,
        address originTokenAddress,
        address sovereignTokenAddress,
        bool isNotMintable
    ) internal {
        // origin and sovereign token address are not 0
        if (
            originTokenAddress == address(0) ||
            sovereignTokenAddress == address(0)
        ) {
            revert InvalidZeroAddress();
        }
        // originNetwork != current network, wrapped tokens are always from other networks
        if (originNetwork == networkID) {
            revert OriginNetworkInvalid();
        }
        // Check if the token is already mapped
        if (
            wrappedTokenToTokenInfo[sovereignTokenAddress].originTokenAddress !=
            address(0)
        ) {
            revert TokenAlreadyMapped();
        }

        // Compute token info hash
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );
        // Set the address of the wrapper
        tokenInfoToWrappedToken[tokenInfoHash] = sovereignTokenAddress;
        // Set the token info mapping
        // @note wrappedTokenToTokenInfo mapping is not overwritten while tokenInfoToWrappedToken it is
        wrappedTokenToTokenInfo[sovereignTokenAddress] = TokenInformation(
            originNetwork,
            originTokenAddress
        );
        wrappedAddressIsNotMintable[sovereignTokenAddress] = isNotMintable;
        emit SetSovereignTokenAddress(
            originNetwork,
            originTokenAddress,
            sovereignTokenAddress,
            isNotMintable
        );
    }

    /**
     * @notice Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens
     * @notice It also removes the token from the isNotMintable mapping
     * @notice Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping
     * @param legacySovereignTokenAddress Address of the sovereign wrapped token
     */
    function removeLegacySovereignTokenAddress(
        address legacySovereignTokenAddress
    ) external onlyBridgeManager {
        // Only allow to remove already remapped tokens
        TokenInformation memory tokenInfo = wrappedTokenToTokenInfo[
            legacySovereignTokenAddress
        ];
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(
                tokenInfo.originNetwork,
                tokenInfo.originTokenAddress
            )
        );

        if (
            tokenInfoToWrappedToken[tokenInfoHash] == address(0) ||
            tokenInfoToWrappedToken[tokenInfoHash] ==
            legacySovereignTokenAddress
        ) {
            revert TokenNotRemapped();
        }
        delete wrappedTokenToTokenInfo[legacySovereignTokenAddress];
        delete wrappedAddressIsNotMintable[legacySovereignTokenAddress];
        emit RemoveLegacySovereignTokenAddress(legacySovereignTokenAddress);
    }

    /**
     * @notice Set the custom wrapper for weth
     * @notice If this function is called multiple times this will override the previous calls and only keep the last WETHToken.
     * @notice WETH will not maintain legacy versions.Users easily should be able to unwrap the legacy WETH and unwrapp it with the new one.
     * @param sovereignWETHTokenAddress Address of the sovereign weth token
     * @param isNotMintable Flag to indicate if the wrapped token is not mintable
     */
    function setSovereignWETHAddress(
        address sovereignWETHTokenAddress,
        bool isNotMintable
    ) external onlyBridgeManager {
        _setSovereignWETHAddress(sovereignWETHTokenAddress, isNotMintable);
    }

    function _setSovereignWETHAddress(
        address sovereignWETHTokenAddress,
        bool isNotMintable
    ) internal {
        if (gasTokenAddress == address(0)) {
            revert WETHRemappingNotSupportedOnGasTokenNetworks();
        }
        WETHToken = ITokenWrappedBridgeUpgradeable(sovereignWETHTokenAddress);
        wrappedAddressIsNotMintable[sovereignWETHTokenAddress] = isNotMintable;
        emit SetSovereignWETHAddress(sovereignWETHTokenAddress, isNotMintable);
    }

    /**
     * @notice Migrates remapped token (legacy) to the new mapped token. If the token is mintable, it will be burnt and minted, otherwise it will be transferred
     * @param legacyTokenAddress Address of legacy token to migrate
     * @param amount Legacy token balance to migrate
     */
    function migrateLegacyToken(
        address legacyTokenAddress,
        uint256 amount,
        bytes calldata permitData
    ) external {
        // Use permit if any
        if (permitData.length != 0) {
            _permit(legacyTokenAddress, permitData);
        }

        // Get current wrapped token address
        TokenInformation memory legacyTokenInfo = wrappedTokenToTokenInfo[
            legacyTokenAddress
        ];
        if (legacyTokenInfo.originTokenAddress == address(0)) {
            revert TokenNotMapped();
        }

        // Check current token mapped is proposed updatedTokenAddress
        address currentTokenAddress = tokenInfoToWrappedToken[
            keccak256(
                abi.encodePacked(
                    legacyTokenInfo.originNetwork,
                    legacyTokenInfo.originTokenAddress
                )
            )
        ];

        if (currentTokenAddress == legacyTokenAddress) {
            revert TokenAlreadyUpdated();
        }

        // Proceed to migrate the token
        uint256 amountToClaim = _bridgeWrappedAsset(
            ITokenWrappedBridgeUpgradeable(legacyTokenAddress),
            amount
        );
        _claimWrappedAsset(
            ITokenWrappedBridgeUpgradeable(currentTokenAddress),
            msg.sender,
            amountToClaim
        );

        // Trigger event
        emit MigrateLegacyToken(
            msg.sender,
            legacyTokenAddress,
            currentTokenAddress,
            amountToClaim
        );
    }

    /**
     * @notice Unset multiple claims from the claimedBitmap
     * @dev This function is a "multi/batch call" to `unsetClaimedBitmap`
     * @param globalIndexes Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     */
    function unsetMultipleClaims(
        uint256[] memory globalIndexes
    ) external onlyGlobalExitRootRemover {
        for (uint256 i = 0; i < globalIndexes.length; i++) {
            uint256 globalIndex = globalIndexes[i];

            // Compute leaf index and sourceBridgeNetwork from global index
            uint32 leafIndex;
            uint32 sourceBridgeNetwork;

            // Get origin network from global index
            if (globalIndex & _GLOBAL_INDEX_MAINNET_FLAG != 0) {
                // The network is mainnet, therefore sourceBridgeNetwork is 0

                // Last 32 bits are leafIndex
                leafIndex = uint32(globalIndex);
            } else {
                // The network is a rollup, therefore sourceBridgeNetwork must be decoded
                uint32 indexRollup = uint32(globalIndex >> 32);
                sourceBridgeNetwork = indexRollup + 1;

                // Last 32 bits are leafIndex
                leafIndex = uint32(globalIndex);
            }

            // Unset the claim
            _unsetClaimedBitmap(leafIndex, sourceBridgeNetwork);

            // Update globalIndexHashChain
            unsetGlobalIndexHashChain = Hashes.efficientKeccak256(
                unsetGlobalIndexHashChain,
                bytes32(globalIndex)
            );

            emit UpdatedUnsetGlobalIndexHashChain(
                bytes32(globalIndex),
                unsetGlobalIndexHashChain
            );
        }
    }

    /**
     * @notice Function to deploy an upgradeable wrapped token without having to claim asset. It is used to upgrade legacy tokens to the new upgradeable token. After deploying the token it is remapped to be the new functional wtoken
     * @notice This function can only be called once for each originNetwork/originTokenAddress pair because it deploys a deterministic contract with create2
     * @dev WARNING: It's assumed the legacy token has not been remapped.
     * @param originNetwork Origin network of the token
     * @param originTokenAddress Origin token address, address of the token at the origin network.
     * @param isNotMintable Flag to indicate if the proxied wrapped token is not mintable
     */
    function deployWrappedTokenAndRemap(
        uint32 originNetwork,
        address originTokenAddress,
        bool isNotMintable
    ) external onlyBridgeManager {
        /// @dev Check the token is not native from this network is done at `_setSovereignTokenAddress`

        if (
            originTokenAddress == address(0) &&
            originNetwork == _MAINNET_NETWORK_ID
        ) {
            // Deploy weth only supported for chains with gas token where weth address is not zero
            /// @dev Check the chain is a gas token chain is done at `_setSovereignWETHAddress`
            // Deploy the proxied weth token
            address wrappedTokenProxy = address(
                _deployWrappedToken(
                    bytes32(0), // tokenInfoHash is 0 for weth
                    abi.encode(
                        WETHToken.name(),
                        WETHToken.symbol(),
                        WETHToken.decimals()
                    )
                )
            );

            // Remap the deployed wrapped token
            _setSovereignWETHAddress(wrappedTokenProxy, isNotMintable);
        } else {
            // Compute tokenInfoHash
            bytes32 tokenInfoHash = keccak256(
                abi.encodePacked(originNetwork, originTokenAddress)
            );
            ITokenWrappedBridgeUpgradeable wrappedToken = ITokenWrappedBridgeUpgradeable(
                    tokenInfoToWrappedToken[tokenInfoHash]
                );

            // Only allow to deploy a wrapped token if the token is mapped, meaning is a legacy (non upgradeable) wrapped token that will be updated to upgradeable version
            require(address(wrappedToken) != address(0), TokenNotMapped());

            // Deploy the wrapped token
            address wrappedTokenProxy = address(
                _deployWrappedToken(
                    tokenInfoHash,
                    abi.encode(
                        wrappedToken.name(),
                        wrappedToken.symbol(),
                        wrappedToken.decimals()
                    )
                )
            );

            // Remap the deployed wrapped token
            _setSovereignTokenAddress(
                originNetwork,
                originTokenAddress,
                wrappedTokenProxy,
                isNotMintable
            );
        }
    }

    /**
     * @notice Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase
     * @param _bridgeManager Bridge manager address
     */
    function setBridgeManager(
        address _bridgeManager
    ) external onlyBridgeManager {
        if (_bridgeManager == address(0)) {
            revert InvalidZeroAddress();
        }

        bridgeManager = _bridgeManager;

        emit SetBridgeManager(bridgeManager);
    }

    /////////////////////////////////////////
    //   EmergencyBridge      functions   //
    ///////////////////////////////////////

    /**
     * @notice Starts the emergencyBridgePauser role transfer
     * This is a two step process, the pending emergencyBridgePauser must accepted to finalize the process
     * @param newEmergencyBridgePauser Address of the new pending emergencyBridgePauser
     */
    function transferEmergencyBridgePauserRole(
        address newEmergencyBridgePauser
    ) external onlyEmergencyBridgePauser {
        pendingEmergencyBridgePauser = newEmergencyBridgePauser;

        emit TransferEmergencyBridgePauserRole(
            emergencyBridgePauser,
            newEmergencyBridgePauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgePauser to accept the emergencyBridgePauser role
     */
    function acceptEmergencyBridgePauserRole() external {
        require(
            pendingEmergencyBridgePauser == msg.sender,
            OnlyPendingEmergencyBridgePauser()
        );

        address oldEmergencyBridgePauser = emergencyBridgePauser;
        emergencyBridgePauser = pendingEmergencyBridgePauser;
        delete pendingEmergencyBridgePauser;

        emit AcceptEmergencyBridgePauserRole(
            oldEmergencyBridgePauser,
            emergencyBridgePauser
        );
    }

    /**
     * @notice Starts the emergencyBridgeUnpauser role transfer
     * This is a two step process, the pending emergencyBridgeUnpauser must accepted to finalize the process
     * @param newEmergencyBridgeUnpauser Address of the new pending emergencyBridgeUnpauser
     */
    function transferEmergencyBridgeUnpauserRole(
        address newEmergencyBridgeUnpauser
    ) external onlyEmergencyBridgeUnpauser {
        pendingEmergencyBridgeUnpauser = newEmergencyBridgeUnpauser;

        emit TransferEmergencyBridgeUnpauserRole(
            emergencyBridgeUnpauser,
            newEmergencyBridgeUnpauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgeUnpauser to accept the emergencyBridgeUnpauser role
     */
    function acceptEmergencyBridgeUnpauserRole() external {
        require(
            pendingEmergencyBridgeUnpauser == msg.sender,
            OnlyPendingEmergencyBridgeUnpauser()
        );

        address oldEmergencyBridgeUnpauser = emergencyBridgeUnpauser;
        emergencyBridgeUnpauser = pendingEmergencyBridgeUnpauser;
        delete pendingEmergencyBridgeUnpauser;

        emit AcceptEmergencyBridgePauserRole(
            oldEmergencyBridgeUnpauser,
            emergencyBridgeUnpauser
        );
    }

    ////////////////////////////
    //   Private functions   //
    ///////////////////////////

    /**
     * @notice Burn tokens from wrapped token to execute the bridge, if the token is not mintable it will be transferred
     * note This function has been extracted to be able to override it by other contracts like Bridge2SovereignChain
     * @param tokenWrapped Proxied Wrapped token to burnt
     * @param amount Amount of tokens
     * @return Amount of tokens that must be added to the leaf after the bridge operation
     * @dev in case of tokens with non-standard transfers behavior like fee-on-transfer tokens or Max-value amount transfers user balance tokens,
     * It is possible that the amount of tokens sent is different from the amount of tokens received, in those cases, the amount that should be
     * added to the leaf has to be the amount received by the bridge
     */
    function _bridgeWrappedAsset(
        ITokenWrappedBridgeUpgradeable tokenWrapped,
        uint256 amount
    ) internal override returns (uint256) {
        // The token is either (1) a correctly wrapped token from another network
        // or (2) wrapped with custom contract from origin network
        if (wrappedAddressIsNotMintable[address(tokenWrapped)]) {
            uint256 balanceBefore = tokenWrapped.balanceOf(address(this));

            // Don't use burn but transfer to bridge
            tokenWrapped.safeTransferFrom(msg.sender, address(this), amount);

            uint256 balanceAfter = tokenWrapped.balanceOf(address(this));

            return balanceAfter - balanceBefore;
        } else {
            // Burn tokens
            tokenWrapped.burn(msg.sender, amount);
            return amount;
        }
    }

    /**
     * @notice Mints tokens from wrapped token to proceed with the claim, if the token is not mintable it will be transferred
     * note This function has been extracted to be able to override it by other contracts like BridgeL2SovereignChain
     * @param tokenWrapped Proxied wrapped token to mint
     * @param destinationAddress Minted token receiver
     * @param amount Amount of tokens
     */
    function _claimWrappedAsset(
        ITokenWrappedBridgeUpgradeable tokenWrapped,
        address destinationAddress,
        uint256 amount
    ) internal override {
        if (destinationAddress == address(0)) {
            revert InvalidZeroAddress();
        }

        // If is not mintable transfer instead of mint
        if (wrappedAddressIsNotMintable[address(tokenWrapped)]) {
            // Transfer tokens
            tokenWrapped.safeTransfer(destinationAddress, amount);
        } else {
            // Claim tokens
            tokenWrapped.mint(destinationAddress, amount);
        }
    }

    /**
     * @notice unset a claim from the claimedBitmap
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function _unsetClaimedBitmap(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) private {
        uint256 globalIndex = uint256(leafIndex) +
            uint256(sourceBridgeNetwork) *
            _MAX_LEAFS_PER_NETWORK;
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = 1 << bitPos;
        uint256 flipped = claimedBitMap[wordPos] ^= mask;
        if (flipped & mask != 0) {
            revert ClaimNotSet();
        }
    }

    /**
     * @notice Function to check if an index is claimed or not
     * @dev function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function isClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) external view override returns (bool) {
        uint256 globalIndex = uint256(leafIndex) +
            uint256(sourceBridgeNetwork) *
            _MAX_LEAFS_PER_NETWORK;

        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = (1 << bitPos);
        return (claimedBitMap[wordPos] & mask) == mask;
    }

    /**
     * @notice Function to check that an index is not claimed and set it as claimed
     * @dev function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function _setAndCheckClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) internal override {
        uint256 globalIndex = uint256(leafIndex) +
            uint256(sourceBridgeNetwork) *
            _MAX_LEAFS_PER_NETWORK;
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = 1 << bitPos;
        uint256 flipped = claimedBitMap[wordPos] ^= mask;
        if (flipped & mask == 0) {
            revert AlreadyClaimed();
        }
    }

    // @note This function is not used in the current implementation. We overwrite it to improve deployed bytecode size
    function activateEmergencyState()
        external
        override(IPolygonZkEVMBridgeV2, PolygonZkEVMBridgeV2)
        onlyEmergencyBridgePauser
    {
        _activateEmergencyState();
    }

    function deactivateEmergencyState()
        external
        override(IPolygonZkEVMBridgeV2, PolygonZkEVMBridgeV2)
        onlyEmergencyBridgeUnpauser
    {
        _deactivateEmergencyState();
    }

    ///////////////////////////
    //// LocalBalanceTree /////
    ///////////////////////////

    /**
     * @notice Function to decrease the local balance tree
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address
     * @param amount Amount to decrease
     */
    function _decreaseLocalBalanceTree(
        uint32 originNetwork,
        address originTokenAddress,
        uint256 amount
    ) internal {
        // If the token is generated in this chain does not modify the Local Balance Tree
        if (originNetwork == networkID) {
            return;
        }

        // compute tokenInfoHash which identifies uniquely the token in the LocalBalanceTree
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );

        // revert due to an underflow explicitly
        // custom error added to not wait for the EVM to revert when subtracting from uint256
        if (amount > localBalanceTree[tokenInfoHash]) {
            revert LocalBalanceTreeUnderflow(
                originNetwork,
                originTokenAddress,
                amount,
                localBalanceTree[tokenInfoHash]
            );
        }

        // underflow is controlled by the previous error
        localBalanceTree[tokenInfoHash] -= amount;
    }

    /**
     * @notice Function to increase the local balance tree
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address
     * @param amount Amount to increase
     */
    function _increaseLocalBalanceTree(
        uint32 originNetwork,
        address originTokenAddress,
        uint256 amount
    ) internal {
        // If the token is generated in this chain does not modify the Local Balance Tree
        if (originNetwork == networkID) {
            return;
        }

        // compute tokenInfoHash which identifies uniquely the token in the LocalBalanceTree
        bytes32 tokenInfoHash = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );

        // revert due to an overflow explicitly
        // custom error added to not wait for the EVM to revert when adding above uint256
        if (amount > type(uint256).max - localBalanceTree[tokenInfoHash]) {
            revert LocalBalanceTreeOverflow(
                originNetwork,
                originTokenAddress,
                amount,
                localBalanceTree[tokenInfoHash]
            );
        }

        // overflows is controlled by the previous error
        localBalanceTree[tokenInfoHash] += amount;
    }

    /**
     * @notice Function to add a new leaf to the bridge merkle tree
     * @param leafType leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount Amount of tokens
     * @param metadataHash Metadata hash
     */
    function _addLeafBridge(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) internal override {
        super._addLeafBridge(
            leafType,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        if (leafType == _LEAF_TYPE_ASSET) {
            _decreaseLocalBalanceTree(originNetwork, originAddress, amount);
        }

        if (leafType == _LEAF_TYPE_MESSAGE) {
            _decreaseLocalBalanceTree(_MAINNET_NETWORK_ID, address(0), amount);
        }
    }

    /**
     * @notice Get leaf value and verify the merkle proof
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param leafType Leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadataHash Hash of the metadata
     */
    function _verifyLeafBridge(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) internal override {
        bytes32 leafValue = getLeafValue(
            leafType,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadataHash
        );

        _verifyLeaf(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            leafValue
        );

        // Update claimedGlobalIndexHashChain
        claimedGlobalIndexHashChain = Hashes.efficientKeccak256(
            claimedGlobalIndexHashChain,
            Hashes.efficientKeccak256(bytes32(globalIndex), leafValue)
        );

        emit UpdatedClaimedGlobalIndexHashChain(
            bytes32(globalIndex),
            claimedGlobalIndexHashChain
        );

        if (leafType == _LEAF_TYPE_ASSET) {
            _increaseLocalBalanceTree(originNetwork, originAddress, amount);
        }

        if (leafType == _LEAF_TYPE_MESSAGE) {
            _increaseLocalBalanceTree(_MAINNET_NETWORK_ID, address(0), amount);
        }
    }
}
