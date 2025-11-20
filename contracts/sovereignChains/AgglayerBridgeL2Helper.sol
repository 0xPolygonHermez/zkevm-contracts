// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "./AgglayerBridgeL2Base.sol";

/**
 * @title ExtensionAgglayerBridgeL2
 * @notice This contract is used as an extension of AgglayerBridgeL2 via delegatecall to extend bytecode
 * currently NOT used
 * @dev This contract inherits from AgglayerBridge to maintain storage layout compatibility
 * @dev All functions except initialize() are overridden to revert to minimize bytecode size
 * @dev Storage variables are duplicated from AgglayerBridgeL2 to ensure proper delegatecall behavior
 * @dev This contract is deployed separately and called via fallback in AgglayerBridgeL2
 */

contract AgglayerBridgeL2Helper is AgglayerBridgeL2Base {
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
    ) external virtual onlyBridgeManager {
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
    ) external virtual onlyBridgeManager {
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
     * @notice Set multiple claims from the claimedBitmap
     * @dev This function is a "multi/batch call" to `_setAndCheckClaimed`
     * @param globalIndexes Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     */
    function setMultipleClaims(
        uint256[] memory globalIndexes
    ) external virtual onlyGlobalExitRootRemover {
        for (uint256 i = 0; i < globalIndexes.length; i++) {
            uint256 globalIndex = globalIndexes[i];

            // Validate and decode global index using shared logic
            // second parameter: rollupIndex not used
            (
                uint32 leafIndex,
                ,
                uint32 sourceBridgeNetwork
            ) = _validateAndDecodeGlobalIndex(globalIndex);

            // Set the claim
            _setAndCheckClaimed(leafIndex, sourceBridgeNetwork);

            emit SetClaim(bytes32(globalIndex));
        }
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
        for (uint256 i = 0; i < globalIndexes.length; i++) {
            uint256 globalIndex = globalIndexes[i];

            // Validate and decode global index using shared logic
            // second parameter: rollupIndex not used
            (
                uint32 leafIndex,
                ,
                uint32 sourceBridgeNetwork
            ) = _validateAndDecodeGlobalIndex(globalIndex);

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
     * @notice Force emit detailed claim events for already processed claims
     * @dev This function is useful for replaying historical claims to emit DetailedClaimEvent.
     * It does not verify the information, call parameters must be checked offchain
     * @dev Only callable by GlobalExitRootRemover role for security
     * @param claims Array of claim data to emit events for
     */
    function forceEmitDetailedClaimEvent(
        ClaimData[] calldata claims
    ) external virtual onlyGlobalExitRootRemover {
        for (uint256 i = 0; i < claims.length; ++i) {
            ClaimData calldata claim = claims[i];

            emit DetailedClaimEvent(
                claim.lerData.smtProofLocalExitRoot,
                claim.smtProofRollupExitRoot,
                claim.lerData.globalIndex,
                claim.lerData.localExitRoot,
                claim.rollupExitRoot,
                claim.lerData.leafType,
                claim.lerData.originNetwork,
                claim.lerData.originAddress,
                claim.lerData.destinationNetwork,
                claim.lerData.destinationAddress,
                claim.lerData.amount,
                claim.lerData.metadata
            );
        }
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
        if (
            originNetwork.length != originTokenAddress.length ||
            originNetwork.length != amount.length
        ) {
            revert InputArraysLengthMismatch();
        }

        for (uint256 i = 0; i < originNetwork.length; i++) {
            // Ensures that only tokens from other networks are updated in the Local Balance Tree.
            if (originNetwork[i] == networkID) {
                revert InvalidLBTLeaf();
            }

            // Compute token info hash
            bytes32 tokenInfoHash = keccak256(
                abi.encodePacked(originNetwork[i], originTokenAddress[i])
            );
            // Set the local balance tree
            localBalanceTree[tokenInfoHash] = amount[i];

            // Emit event
            emit SetLocalBalanceTree(
                originNetwork[i],
                originTokenAddress[i],
                amount[i]
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
    ) external virtual onlyBridgeManager {
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
        pendingEmergencyBridgePauser = newEmergencyBridgePauser;

        emit TransferEmergencyBridgePauserRole(
            emergencyBridgePauser,
            newEmergencyBridgePauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgePauser to accept the emergencyBridgePauser role
     */
    function acceptEmergencyBridgePauserRole() external virtual {
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
    ) external virtual onlyEmergencyBridgeUnpauser {
        pendingEmergencyBridgeUnpauser = newEmergencyBridgeUnpauser;

        emit TransferEmergencyBridgeUnpauserRole(
            emergencyBridgeUnpauser,
            newEmergencyBridgeUnpauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgeUnpauser to accept the emergencyBridgeUnpauser role
     */
    function acceptEmergencyBridgeUnpauserRole() external virtual {
        require(
            pendingEmergencyBridgeUnpauser == msg.sender,
            OnlyPendingEmergencyBridgeUnpauser()
        );

        address oldEmergencyBridgeUnpauser = emergencyBridgeUnpauser;
        emergencyBridgeUnpauser = pendingEmergencyBridgeUnpauser;
        delete pendingEmergencyBridgeUnpauser;

        emit AcceptEmergencyBridgeUnpauserRole(
            oldEmergencyBridgeUnpauser,
            emergencyBridgeUnpauser
        );
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
