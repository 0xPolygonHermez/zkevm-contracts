// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;
import "./AgglayerBridgeL2Base.sol";
import "../interfaces/IAgglayerBridgeL2.sol";
/**
 * Sovereign chains bridge that will be deployed on all Sovereign chains
 * Contract responsible to manage the token interactions with other networks
 * This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks
 */
contract AgglayerBridgeL2 is AgglayerBridgeL2Base, IAgglayerBridgeL2 {
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;
    // address used to permission the initialization of the contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address private immutable deployer;
    // address used to delegate calls to helper contract
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    address public immutable bridgeL2Helper;

    /**
     * Disable initializers on the implementation following the best practices
     * @dev the deployer is set to the contract creator and will be the only allowed to initialize the contract in a 2 steps process
     */
    constructor(address _bridgeL2Helper) AgglayerBridge() {
        deployer = msg.sender;
        bridgeL2Helper = _bridgeL2Helper;
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
    ) public reinitializer(3) {
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

    /**
     * @notice Override the function to prevent the contract from being initialized with this initializer
     */
    function initialize(
        uint32, // _networkID
        address, //_gasTokenAddress
        uint32, //_gasTokenNetwork
        IBaseLegacyAgglayerGER, //_globalExitRootManager
        address, //_polygonRollupManager
        bytes memory //_gasTokenMetadata
    ) external override(IAgglayerBridge, AgglayerBridge) initializer {
        revert InvalidInitializeFunction();
    }

    /// @custom:oz-upgrades-unsafe-allow delegatecall
    function _delegateToHelper() internal {
        address helper = bridgeL2Helper;
        assembly {
            // copy calldata
            calldatacopy(0, 0, calldatasize())

            // delegatecall to the function implementation (bridgeL2Helper)
            let result := delegatecall(gas(), helper, 0, calldatasize(), 0, 0)

            // copy returndata
            returndatacopy(0, 0, returndatasize())

            // revert or return depending on result
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    //////////////////////////////////////////////////////////////////////
    /// Functions that use the functions implemented by AgglayerBridge ///
    //////////////////////////////////////////////////////////////////////
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
    ) external virtual onlyBridgeManager {
        _delegateToHelper();
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
        _delegateToHelper();
    }

    /**
     * @notice Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens
     * @notice It also removes the token from the isNotMintable mapping
     * @notice Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping
     * @param legacySovereignTokenAddress Address of the sovereign wrapped token
     */
    function removeLegacySovereignTokenAddress(
        address legacySovereignTokenAddress
    ) external virtual onlyBridgeManager {
        _delegateToHelper();
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
    ) external virtual onlyBridgeManager {
        _delegateToHelper();
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
    ) external virtual {
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
     * @dev This function is a "multi/batch call" to `_unsetClaimedBitmap`
     * @param globalIndexes Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     */
    function unsetMultipleClaims(
        uint256[] memory globalIndexes
    ) external virtual onlyGlobalExitRootRemover {
        _delegateToHelper();
    }

    /**
     * @notice Set multiple claims from the claimedBitmap
     * @dev This function is a "multi/batch call" to `_setAndCheckClaimed`
     * @param globalIndexes Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     */
    function setMultipleClaims(
        uint256[] memory globalIndexes
    ) external virtual onlyGlobalExitRootRemover {
        _delegateToHelper();
    }

    /**
     * @notice Move the LET backward to a previous state with a lower deposit count
     * @dev Permissioned function by the GlobalExitRootRemover role
     * @dev Validates that the new tree state is a valid subtree of the current tree
     * @dev Security Note: The `newFrontier` parameter is technically derivable from `newDepositCount` and `proof`,
     *      but is intentionally required as a dual verification mechanism. This forces callers to demonstrate
     *      complete understanding of the Merkle tree structure and acts as a safeguard against incorrect
     *      proof construction. The redundancy provides security-by-design for this critical emergency function.
     * @param newDepositCount The new deposit count (must be less than current)
     * @param newFrontier The frontier of the subtree at newDepositCount
     * @param nextLeaf The leaf that comes immediately after the last leaf of the subset.
     * This is the leaf at position `newDepositCount` in the current tree.
     * For example: if the subset has 5 leaves (positions 0,1,2,3,4), then nextLeaf
     * is the actual leaf stored at position 5 in the current (larger) tree.
     * This leaf must exist in the current tree and serves as proof that the subset
     * is indeed contained within the current tree structure.
     * @param proof Merkle proof showing nextLeaf exists at position newDepositCount in current tree
     */
    function backwardLET(
        uint256 newDepositCount,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata newFrontier,
        bytes32 nextLeaf,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata proof
    ) external virtual onlyGlobalExitRootRemover ifEmergencyState {
        // Validate that new deposit count is less than current
        if (newDepositCount >= depositCount) {
            revert InvalidDepositCount();
        }

        // 1. Verify that nextLeaf exists at position newDepositCount in current tree.
        // NextLeaf is the leaf that comes immediately after the last leaf of the subset
        // If the subset has 5 leaves (positions 0,1,2,3,4), nextLeaf is the actual
        // leaf stored at position 5 in the current (larger) tree
        /// @dev This check is a must because new frontier must match with proof siblings at subtree inclusion verification.
        if (
            !verifyMerkleProof(
                nextLeaf,
                proof,
                uint32(newDepositCount),
                getRoot()
            )
        ) {
            revert InvalidSmtProof();
        }

        // 2. Verify that newFrontier is a valid subtree frontier by checking it matches
        // the Merkle proof siblings at appropriate heights
        // NOTE: This function reverts with specific errors:
        // - SubtreeFrontierMismatch: when frontier elements don't match proof siblings
        // - NonZeroValueForUnusedFrontier: when unused frontier positions are not zero
        _checkValidSubtreeFrontier(newDepositCount, newFrontier, proof);

        // Store previous values before rollback
        uint256 previousDepositCount = depositCount;
        bytes32 previousRoot = getRoot();

        // Rollback tree to the new LER
        for (uint256 i = 0; i < _DEPOSIT_CONTRACT_TREE_DEPTH; i++) {
            _branch[i] = newFrontier[i];
        }

        depositCount = newDepositCount;

        // Update LER
        bytes32 newLER = getRoot();
        globalExitRootManager.updateExitRoot(newLER);

        // emit event
        emit BackwardLET(
            previousDepositCount,
            previousRoot,
            newDepositCount,
            newLER
        );
    }

    /**
     * @notice Move the LET forward by adding new leaves in bulk
     * @dev Permissioned function by the GlobalExitRootRemover role
     * @dev Adds new leaves incrementally using structured data and validates against expected root as health check
     * @param newLeaves Array of leaf data to add to the current tree
     * @param expectedLER The expected root after adding all new leaves (health check)
     */
    function forwardLET(
        LeafData[] calldata newLeaves,
        bytes32 expectedLER
    ) external virtual onlyGlobalExitRootRemover ifEmergencyState {
        // Validate that newLeaves array is not empty
        if (newLeaves.length == 0) {
            revert InvalidLeavesLength();
        }

        // Store previous values before adding leaves
        uint256 previousDepositCount = depositCount;
        bytes32 previousRoot = getRoot();

        // Add each new leaf incrementally using the _addLeafBridge function
        // _addLeafBridge automatically handles depositCount increment and MAX_DEPOSIT_COUNT validation
        for (uint256 i = 0; i < newLeaves.length; i++) {
            LeafData memory leaf = newLeaves[i];

            // Validate leafType is either _LEAF_TYPE_ASSET or _LEAF_TYPE_MESSAGE
            if (
                leaf.leafType != _LEAF_TYPE_ASSET &&
                leaf.leafType != _LEAF_TYPE_MESSAGE
            ) {
                revert InvalidLeafType();
            }

            super._addLeafBridge(
                leaf.leafType,
                leaf.originNetwork,
                leaf.originAddress,
                leaf.destinationNetwork,
                leaf.destinationAddress,
                leaf.amount,
                keccak256(leaf.metadata)
            );
        }

        // Health check: verify the final root matches the expected LER
        bytes32 computedRoot = getRoot();
        if (computedRoot != expectedLER) {
            revert InvalidExpectedLER();
        }

        // Update GER
        globalExitRootManager.updateExitRoot(computedRoot);

        // emit event with the new deposit count
        emit ForwardLET(
            previousDepositCount,
            previousRoot,
            depositCount,
            computedRoot,
            abi.encode(newLeaves)
        );
    }

    /**
     * @notice Force emit detailed claim events for already processed claims
     * @dev This function is useful for replaying historical claims to emit DetailedClaimEvent.
     * It does not verify the information, call parameters must be checked offchain
     * @dev Only callable by GlobalExitRootRemover role for security
     * @param claims Array of claim data to emit events for
     */
    function forceEmitDetailedClaimEvent(
        ClaimData[] calldata claims
    ) external virtual onlyGlobalExitRootRemover {
        _delegateToHelper();
    }

    /**
     * @notice Set local balance tree leaves to specific amounts
     * @dev Permissioned function by the GlobalExitRootRemover role
     * @param originNetwork The origin network of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @param originTokenAddress The origin address of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @dev The key is generated as keccak256(abi.encodePacked(originNetwork, originTokenAddress))
     * @param amount The amount to set for the local balance tree leaf
     */
    function setLocalBalanceTree(
        uint32[] memory originNetwork,
        address[] memory originTokenAddress,
        uint256[] memory amount
    ) external virtual onlyGlobalExitRootRemover ifEmergencyState {
        _delegateToHelper();
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
    ) external virtual onlyBridgeManager {
        _delegateToHelper();
    }

    /**
     * @notice Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase
     * @param _bridgeManager Bridge manager address
     */
    function setBridgeManager(
        address _bridgeManager
    ) external virtual onlyBridgeManager {
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
    ) external virtual onlyEmergencyBridgePauser {
        _delegateToHelper();
    }

    /**
     * @notice Allow the current pending emergencyBridgePauser to accept the emergencyBridgePauser role
     */
    function acceptEmergencyBridgePauserRole() external virtual {
        _delegateToHelper();
    }

    /**
     * @notice Starts the emergencyBridgeUnpauser role transfer
     * This is a two step process, the pending emergencyBridgeUnpauser must accepted to finalize the process
     * @param newEmergencyBridgeUnpauser Address of the new pending emergencyBridgeUnpauser
     */
    function transferEmergencyBridgeUnpauserRole(
        address newEmergencyBridgeUnpauser
    ) external virtual onlyEmergencyBridgeUnpauser {
        _delegateToHelper();
    }

    /**
     * @notice Allow the current pending emergencyBridgeUnpauser to accept the emergencyBridgeUnpauser role
     */
    function acceptEmergencyBridgeUnpauserRole() external virtual {
        _delegateToHelper();
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
     * note This function has been extracted to be able to override it by other contracts like AgglayerBridgeL2
     * @param tokenWrapped Proxied wrapped token to mint
     * @param destinationAddress Minted token receiver
     * @param amount Amount of tokens
     */
    function _claimWrappedAsset(
        ITokenWrappedBridgeUpgradeable tokenWrapped,
        address destinationAddress,
        uint256 amount
    ) internal override {
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
     * @notice Function to check if an index is claimed or not
     * @dev function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function isClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) public view virtual override returns (bool) {
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
        virtual
        override(IAgglayerBridge, AgglayerBridge)
        onlyEmergencyBridgePauser
    {
        _activateEmergencyState();
    }

    function deactivateEmergencyState()
        external
        virtual
        override(IAgglayerBridge, AgglayerBridge)
        onlyEmergencyBridgeUnpauser
    {
        _deactivateEmergencyState();
    }

    /**
     * @notice Function to claim a message from a Local Exit Root (LER)
     * @dev This function allows users to claim messages that were sent via the bridge and recorded in a Local Exit Root.
     *      It verifies the provided Merkle proof against the specified LER and ensures the claim has not been previously made.
     * @dev Security Modifiers:
     *      - ifNotEmergencyState: Prevents claims during emergency state
     *      - nonReentrant: Prevents reentrancy attacks during token transfers
     * @param smtProofLocalExitRoot Smt proof to prove the leaf against the local exit root
     * @param globalIndex Global index is defined as:
     *        | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     *        |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * @param localExitRoot Local exit root to verify the proof against
     * @param originNetwork Origin network
     * @param originTokenAddress Origin address
     * @param destinationNetwork Destination network
     * @param destinationAddress Destination address
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     * @dev Emits ClaimEvent & DetailedClaimEvent upon successful claim
     */
    function claimAssetFromLER(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        uint256 globalIndex,
        bytes32 localExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) public virtual ifNotEmergencyState nonReentrant {
        LeafData memory leafData = LeafData({
            leafType: _LEAF_TYPE_ASSET,
            originNetwork: originNetwork,
            originAddress: originTokenAddress,
            destinationNetwork: destinationNetwork,
            destinationAddress: destinationAddress,
            amount: amount,
            metadata: metadata
        });
        _processClaimLER(
            smtProofLocalExitRoot,
            globalIndex,
            localExitRoot,
            leafData,
            metadata
        );
    }

    /**
     * @notice Function to claim messages from Local Exit Roots (LER)
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the network exit root
     * @param globalIndex Global index is defined as:
     *        | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     *        |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * @param localExitRoot Local exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination (must be this networkID)
     * @param destinationAddress Address destination
     * @param amount Amount of tokens to claim
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimMessageFromLER(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        uint256 globalIndex,
        bytes32 localExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) public virtual ifNotEmergencyState nonReentrant {
        LeafData memory leafData = LeafData({
            leafType: _LEAF_TYPE_MESSAGE,
            originNetwork: originNetwork,
            originAddress: originAddress,
            destinationNetwork: destinationNetwork,
            destinationAddress: destinationAddress,
            amount: amount,
            metadata: metadata
        });
        _processClaimLER(
            smtProofLocalExitRoot,
            globalIndex,
            localExitRoot,
            leafData,
            metadata
        );
    }

    /**
     * @dev Internal helper to process asset claim from LER
     */
    function _processClaimLER(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint256 globalIndex,
        bytes32 localExitRoot,
        LeafData memory leafData,
        bytes calldata metadata
    ) internal {
        // Validate and decode global index
        (
            uint32 leafIndex,
            ,
            uint32 sourceBridgeNetwork
        ) = _validateAndDecodeGlobalIndex(globalIndex);

        // Verify if LER exists
        bool existLER = IAgglayerGERL2(address(globalExitRootManager)).existLER(
            localExitRoot,
            sourceBridgeNetwork
        );

        // check that this local exit root exists
        if (existLER == false) {
            revert LocalExitRootInvalid();
        }

        // Build leaf data
        bytes32 leafValue = _getLeafValue(leafData);

        // Verify merkle proof against rollup exit root
        if (!verifyMerkleProof(leafValue, smtProof, leafIndex, localExitRoot)) {
            revert InvalidSmtProof();
        }

        // Update claimedGlobalIndexHashChain
        claimedGlobalIndexHashChain = Hashes.efficientKeccak256(
            claimedGlobalIndexHashChain,
            Hashes.efficientKeccak256(bytes32(globalIndex), leafValue)
        );

        emit UpdatedClaimedGlobalIndexHashChain(
            bytes32(globalIndex),
            claimedGlobalIndexHashChain
        );

        // Update Local Balance Tree
        _increaseLocalBalanceTree(
            leafData.originNetwork,
            leafData.originAddress,
            leafData.amount
        );

        // Set and check nullifier
        _setAndCheckClaimed(leafIndex, sourceBridgeNetwork);

        // Emit detailed event with empty root for asset claim
        _emitClaimEvents(smtProof, globalIndex, localExitRoot, leafData);

        if (leafData.leafType == _LEAF_TYPE_ASSET) {
            // Transfer funds
            _transferFundsClaim(
                leafData.originNetwork,
                leafData.originAddress,
                leafData.destinationAddress,
                leafData.amount,
                metadata
            );
        }

        if (leafData.leafType == _LEAF_TYPE_MESSAGE) {
            // Execute message
            _executeMessage(
                leafData.originNetwork,
                leafData.originAddress,
                leafData.destinationAddress,
                leafData.amount,
                metadata
            );
        }
    }

    function _getLeafValue(
        LeafData memory leafData
    ) internal pure returns (bytes32) {
        return
            getLeafValue(
                leafData.leafType,
                leafData.originNetwork,
                leafData.originAddress,
                leafData.destinationNetwork,
                leafData.destinationAddress,
                leafData.amount,
                keccak256(leafData.metadata)
            );
    }

    /**
     * @dev Helper to emit detailed claim event for LER claims (stack too deep helper)
     */
    function _emitClaimEvents(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProof,
        uint256 globalIndex,
        bytes32 localExitRoot,
        LeafData memory leafData
    ) internal {
        // Events
        emit ClaimEvent(
            globalIndex,
            leafData.originNetwork,
            leafData.originAddress,
            leafData.destinationAddress,
            leafData.amount
        );

        // Empty proof and empty root to reuse DetailedClaimEvent structure
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] memory emptyProof;
        bytes32 emptyRoot = bytes32(0);

        emit DetailedClaimEvent(
            smtProof,
            emptyProof,
            globalIndex,
            localExitRoot,
            emptyRoot,
            leafData.leafType,
            leafData.originNetwork,
            leafData.originAddress,
            leafData.destinationNetwork,
            leafData.destinationAddress,
            leafData.amount,
            leafData.metadata
        );
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
     * @param localExitRoot Local exit root
     * @param rollupExitRoot Rollup exit root
     * @param leafType Leaf type
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadata Raw metadata bytes
     */
    function _verifyLeafAndSetNullifier(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 localExitRoot,
        bytes32 rollupExitRoot,
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes memory metadata
    ) internal override {
        // Emit detailed claim event with all parameters for better traceability on L2
        // This event is emitted before verification to avoid stack too deep errors
        // It's cheaper to emit on L2 than L1, providing full claim details for indexers
        emit DetailedClaimEvent(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            localExitRoot,
            rollupExitRoot,
            leafType,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );

        bytes32 leafValue = getLeafValue(
            leafType,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            keccak256(metadata)
        );

        (uint32 leafIndex, uint32 sourceBridgeNetwork) = _verifyLeaf(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            localExitRoot,
            rollupExitRoot,
            leafValue
        );

        // Set and check nullifier
        _setAndCheckClaimed(leafIndex, sourceBridgeNetwork);

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

    /**
     * @notice Function to retrieve the current version of the contract.
     * @return version of the contract.
     */
    function version() external pure virtual override returns (string memory) {
        return BRIDGE_SOVEREIGN_VERSION;
    }
}
