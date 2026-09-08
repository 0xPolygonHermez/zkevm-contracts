pragma solidity 0.8.28;

import "./AgglayerBridgeL2Storage.sol";

/// @dev Runs against bridge proxy storage via delegatecall, never as a standalone bridge.
contract AgglayerBridgeL2Module is AgglayerBridgeL2Storage {
    address private immutable self = address(this);

    error OnlyDelegateCall();

    constructor() {
        _disableInitializers();
    }

    modifier onlyDelegateCall() {
        // Direct-call protection is separate from each operation's authorization checks.
        require(address(this) != self, OnlyDelegateCall());
        _;
    }

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
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot;
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot;
        uint256 globalIndex;
        bytes32 mainnetExitRoot;
        bytes32 rollupExitRoot;
        uint8 leafType;
        uint32 originNetwork;
        address originAddress;
        uint32 destinationNetwork;
        address destinationAddress;
        uint256 amount;
        bytes metadata;
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
    ) external onlyDelegateCall onlyBridgeManager {
        if (
            originNetworks.length != originTokenAddresses.length ||
            originNetworks.length != sovereignTokenAddresses.length ||
            originNetworks.length != isNotMintable.length
        ) {
            revert IAgglayerBridgeL2.InputArraysLengthMismatch();
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
     * @notice Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens
     * @notice It also removes the token from the isNotMintable mapping
     * @notice Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping
     * @param legacySovereignTokenAddress Address of the sovereign wrapped token
     */
    function removeLegacySovereignTokenAddress(
        address legacySovereignTokenAddress
    ) external onlyDelegateCall onlyBridgeManager {
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
            revert IAgglayerBridgeL2.TokenNotRemapped();
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
    ) external onlyDelegateCall onlyBridgeManager {
        _setSovereignWETHAddress(sovereignWETHTokenAddress, isNotMintable);
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
    ) external onlyDelegateCall onlyGlobalExitRootRemover {
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
     * @notice Set multiple claims from the claimedBitmap
     * @dev This function is a "multi/batch call" to `_setAndCheckClaimed`
     * @param globalIndexes Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     */
    function setMultipleClaims(
        uint256[] memory globalIndexes
    ) external onlyDelegateCall onlyGlobalExitRootRemover {
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
            _setSovereignClaimedBitmap(leafIndex, sourceBridgeNetwork);

            emit SetClaim(bytes32(globalIndex));
        }
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
    ) external onlyDelegateCall onlyGlobalExitRootRemover ifEmergencyState {
        // Validate that new deposit count is less than current
        if (newDepositCount >= depositCount) {
            revert IAgglayerBridgeL2.InvalidDepositCount();
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
            revert IAgglayerBridge.InvalidSmtProof();
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
    ) external onlyDelegateCall onlyGlobalExitRootRemover ifEmergencyState {
        // Validate that newLeaves array is not empty
        if (newLeaves.length == 0) {
            revert IAgglayerBridgeL2.InvalidLeavesLength();
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
                revert IAgglayerBridgeL2.InvalidLeafType();
            }

            // Recovery intentionally bypasses L2 balance debits; LBT is restored separately.
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
            revert IAgglayerBridgeL2.InvalidExpectedLER();
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
    ) external onlyDelegateCall onlyGlobalExitRootRemover {
        for (uint256 i = 0; i < claims.length; ++i) {
            ClaimData calldata claim = claims[i];

            emit DetailedClaimEvent(
                claim.smtProofLocalExitRoot,
                claim.smtProofRollupExitRoot,
                claim.globalIndex,
                claim.mainnetExitRoot,
                claim.rollupExitRoot,
                claim.leafType,
                claim.originNetwork,
                claim.originAddress,
                claim.destinationNetwork,
                claim.destinationAddress,
                claim.amount,
                claim.metadata
            );
        }
    }

    /**
     * @notice Set local balance tree leaves to specific amounts
     * @dev Permissioned function by the GlobalExitRootRemover role
     * @param originNetworkArray The origin network of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @param originTokenAddressArray The origin address of the token, involved in the tokenInfoHash to generate the key to be set at localBalanceTree
     * @dev The key is generated as keccak256(abi.encodePacked(originNetwork, originTokenAddress))
     * @param amountArray The amount to set for the local balance tree leaf
     */
    function setLocalBalanceTree(
        uint32[] memory originNetworkArray,
        address[] memory originTokenAddressArray,
        uint256[] memory amountArray
    ) external onlyDelegateCall onlyGlobalExitRootRemover ifEmergencyState {
        if (
            originNetworkArray.length != originTokenAddressArray.length ||
            originNetworkArray.length != amountArray.length
        ) {
            revert IAgglayerBridgeL2.InputArraysLengthMismatch();
        }

        for (uint256 i = 0; i < originNetworkArray.length; i++) {
            _setLocalBalanceTree(
                originNetworkArray[i],
                originTokenAddressArray[i],
                amountArray[i]
            );
        }
    }

    /**
     * @notice Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase
     * @param _bridgeManager Bridge manager address
     */
    function setBridgeManager(
        address _bridgeManager
    ) external onlyDelegateCall onlyBridgeManager {
        if (_bridgeManager == address(0)) {
            revert IAgglayerBridge.InvalidZeroAddress();
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
    ) external onlyDelegateCall onlyEmergencyBridgePauser {
        pendingEmergencyBridgePauser = newEmergencyBridgePauser;

        emit TransferEmergencyBridgePauserRole(
            emergencyBridgePauser,
            newEmergencyBridgePauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgePauser to accept the emergencyBridgePauser role
     */
    function acceptEmergencyBridgePauserRole() external onlyDelegateCall {
        require(
            pendingEmergencyBridgePauser == msg.sender,
            IAgglayerBridgeL2.OnlyPendingEmergencyBridgePauser()
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
    ) external onlyDelegateCall onlyEmergencyBridgeUnpauser {
        pendingEmergencyBridgeUnpauser = newEmergencyBridgeUnpauser;

        emit TransferEmergencyBridgeUnpauserRole(
            emergencyBridgeUnpauser,
            newEmergencyBridgeUnpauser
        );
    }

    /**
     * @notice Allow the current pending emergencyBridgeUnpauser to accept the emergencyBridgeUnpauser role
     */
    function acceptEmergencyBridgeUnpauserRole() external onlyDelegateCall {
        require(
            pendingEmergencyBridgeUnpauser == msg.sender,
            IAgglayerBridgeL2.OnlyPendingEmergencyBridgeUnpauser()
        );

        address oldEmergencyBridgeUnpauser = emergencyBridgeUnpauser;
        emergencyBridgeUnpauser = pendingEmergencyBridgeUnpauser;
        delete pendingEmergencyBridgeUnpauser;

        emit AcceptEmergencyBridgeUnpauserRole(
            oldEmergencyBridgeUnpauser,
            emergencyBridgeUnpauser
        );
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
            revert IAgglayerBridgeL2.ClaimNotSet();
        }
    }
}
