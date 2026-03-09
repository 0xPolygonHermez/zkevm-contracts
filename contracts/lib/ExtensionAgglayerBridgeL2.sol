// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../interfaces/IAgglayerBridgeL2.sol";
import "../sovereignChains/AgglayerBridgeL2.sol";
import "../interfaces/IAgglayerGERL2.sol";
import "../interfaces/IInitializerAgglayerBridgeL2.sol";

/**
 * @title ExtensionAgglayerBridgeL2
 * @notice This contract is used as an extension of AgglayerBridgeL2 via delegatecall to extend bytecode
 * currently NOT used
 * @dev This contract inherits from AgglayerBridge to maintain storage layout compatibility
 * @dev All functions except initialize() are overridden to revert to minimize bytecode size
 * @dev Storage variables are duplicated from AgglayerBridgeL2 to ensure proper delegatecall behavior
 * @dev This contract is deployed separately and called via fallback in AgglayerBridgeL2
 */
contract ExtensionAgglayerBridgeL2 is
    AgglayerBridgeL2,
    IInitializerAgglayerBridgeL2
{
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;
    // address used to permission the initialization of the contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable deployer;

    /**
     * Disable initializers on the implementation following the best practices
     * @dev the deployer is set to the contract creator and will be the only allowed to initialize the contract in a 2 steps process
     */
    constructor() AgglayerBridgeL2() {
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
    ) public override(AgglayerBridgeL2) reinitializer(3) {
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
    ) external pure override(AgglayerBridge, IAgglayerBridge) {
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
    ) public pure override(AgglayerBridge, IAgglayerBridge) {
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
    ) external pure override(AgglayerBridge, IAgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getTokenWrappedAddress to revert - not supported in initializer
     */
    function getTokenWrappedAddress(
        uint32,
        address
    ) external pure override(AgglayerBridge) returns (address) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override activateEmergencyState to revert - not supported in initializer
     */
    function activateEmergencyState() external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override deactivateEmergencyState to revert - not supported in initializer
     */
    function deactivateEmergencyState()
        external
        pure
        override(AgglayerBridgeL2)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override transferProxiedTokensManagerRole to revert - not supported in initializer
     */
    function transferProxiedTokensManagerRole(
        address
    ) external pure override(AgglayerBridge) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override acceptProxiedTokensManagerRole to revert - not supported in initializer
     */
    function acceptProxiedTokensManagerRole()
        external
        pure
        override(AgglayerBridge)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override updateGlobalExitRoot to revert - not supported in initializer
     */
    function updateGlobalExitRoot()
        external
        pure
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
    ) public pure override(AgglayerBridgeL2) returns (bool) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getProxiedTokensManager to revert - not supported in initializer
     */
    function getProxiedTokensManager()
        external
        pure
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
        pure
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
        pure
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
        pure
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
    ) public pure override(AgglayerBridge) returns (address) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override version to revert - not supported in initializer
     */
    function version()
        external
        pure
        virtual
        override(AgglayerBridgeL2)
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
    ) internal pure override(DepositContractV2) returns (bytes32) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override getRoot to revert - not supported in initializer
     */
    function getRoot()
        public
        pure
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
    ) internal pure override(DepositContractBase) returns (bool) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override calculateRoot to revert - not supported in initializer
     */
    function calculateRoot(
        bytes32,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        uint32
    ) internal pure override(DepositContractBase) returns (bytes32) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override setMultipleSovereignTokenAddress to revert - not supported in initializer
     */
    function setMultipleSovereignTokenAddress(
        uint32[] memory,
        address[] memory,
        address[] memory,
        bool[] memory
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override removeLegacySovereignTokenAddress to revert - not supported in initializer
     */
    function removeLegacySovereignTokenAddress(
        address
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override setSovereignWETHAddress to revert - not supported in initializer
     */
    function setSovereignWETHAddress(
        address,
        bool
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override migrateLegacyToken to revert - not supported in initializer
     */
    function migrateLegacyToken(
        address,
        uint256,
        bytes calldata
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override unsetMultipleClaims to revert - not supported in initializer
     */
    function unsetMultipleClaims(
        uint256[] memory
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override setMultipleClaims to revert - not supported in initializer
     */
    function setMultipleClaims(
        uint256[] memory
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override backwardLET to revert - not supported in initializer
     */
    function backwardLET(
        uint256,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata,
        bytes32,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override forwardLET to revert - not supported in initializer
     */
    function forwardLET(
        AgglayerBridgeL2.LeafData[] calldata,
        bytes32
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override forceEmitDetailedClaimEvent to revert - not supported in initializer
     */
    function forceEmitDetailedClaimEvent(
        AgglayerBridgeL2.ClaimData[] calldata
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override setLocalBalanceTree to revert - not supported in initializer
     */
    function setLocalBalanceTree(
        uint32[] memory,
        address[] memory,
        uint256[] memory
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override deployWrappedTokenAndRemap to revert - not supported in initializer
     */
    function deployWrappedTokenAndRemap(
        uint32,
        address,
        bool
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override setBridgeManager to revert - not supported in initializer
     */
    function setBridgeManager(
        address
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override transferEmergencyBridgePauserRole to revert - not supported in initializer
     */
    function transferEmergencyBridgePauserRole(
        address
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override acceptEmergencyBridgePauserRole to revert - not supported in initializer
     */
    function acceptEmergencyBridgePauserRole()
        external
        pure
        override(AgglayerBridgeL2)
    {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override transferEmergencyBridgeUnpauserRole to revert - not supported in initializer
     */
    function transferEmergencyBridgeUnpauserRole(
        address
    ) external pure override(AgglayerBridgeL2) {
        revert NonSupportedFunction();
    }

    /**
     * @notice Override acceptEmergencyBridgeUnpauserRole to revert - not supported in initializer
     */
    function acceptEmergencyBridgeUnpauserRole()
        external
        pure
        override(AgglayerBridgeL2)
    {
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
