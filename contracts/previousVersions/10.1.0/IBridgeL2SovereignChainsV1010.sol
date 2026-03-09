// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../../interfaces/IBaseLegacyAgglayerGER.sol";
import "./IPolygonZkEVMBridgeV2V1010.sol";

interface IBridgeL2SovereignChainsV1010 is IPolygonZkEVMBridgeV2V1010 {
    /**
     * @dev Thrown when the origin network is invalid
     */
    error OriginNetworkInvalid();

    /**
     * @dev Thrown when sender is not the bridge manager
     * @notice Bridge manager can set custom mapping for any token
     */
    error OnlyBridgeManager();

    /**
     * @dev Thrown when trying to remove a token mapping that has not been updated by a new one
     */
    error TokenNotMapped();

    /**
     * @dev Thrown when trying to migrate a legacy token that is already the current token
     */
    error TokenAlreadyUpdated();

    /**
     * @dev Thrown when initializing sovereign bridge with invalid sovereign WETH token params
     */
    error InvalidSovereignWETHAddressParams();

    /**
     * @dev Thrown when initializing calling a function with invalid arrays length
     */
    error InputArraysLengthMismatch();

    /**
     * @dev Thrown when trying to map a token that is already mapped
     */
    error TokenAlreadyMapped();

    /**
     * @dev Thrown when trying to remove a legacy mapped token that has nor previously been remapped
     */
    error TokenNotRemapped();

    /**
     * @dev Thrown when trying to set a custom wrapper for weth on a gas token network
     */
    error WETHRemappingNotSupportedOnGasTokenNetworks();
    /**
     * @dev Thrown when trying to unset a not setted claim
     */
    error ClaimNotSet();

    /**
     * @dev Thrown when trying to activate emergency state in a not allowed bridge context (e.g. sovereign chains)
     */
    error EmergencyStateNotAllowed();

    /**
     * @dev Thrown when trying to initialize a sovereign bridge with a zero network ID, reserved for mainnet
     */
    error InvalidZeroNetworkID();

    /**
     * @dev Thrown when an invalid deposit count is provided for LET operations
     */
    error InvalidDepositCount();

    /**
     * @dev Thrown when the leaves array length doesn't match the expected deposit count
     */
    error InvalidLeavesLength();

    /**
     * @dev Thrown when the expected root doesn't match the computed root
     */
    error InvalidExpectedRoot();

    /**
     * @dev Thrown when the subtree frontier doesn't match the parent tree structure
     */
    error InvalidSubtreeFrontier();

    /**
     * @dev Thrown when trying set a LFT leaf with same origin network thank chain network ID
     */
    error InvalidLBTLeaf();

    /**
     @dev Thrown when trying to substract more rather than available balance
     */
    error LocalBalanceTreeUnderflow(
        uint32 originNetwork,
        address originTokenAddress,
        uint256 amount,
        uint256 localBalanceTreeAmount
    );

    /**
     @dev Thrown when trying to add an amount over the maximum allowed balance
     */
    error LocalBalanceTreeOverflow(
        uint32 originNetwork,
        address originTokenAddress,
        uint256 amount,
        uint256 localBalanceTreeAmount
    );

    /**
     * @dev Thrown when the caller is not the globalExitRootRemover
     */
    error OnlyGlobalExitRootRemover();

    /**
     * @dev Thrown when the caller is not the emergencyBridgePauser address
     */
    error OnlyEmergencyBridgePauser();

    /**
     * @dev Thrown when trying to call a function that only the pending bridge pauser can call.
     */
    error OnlyPendingEmergencyBridgePauser();

    /**
     * @dev Thrown when the caller is not the emergencyBridgeUnpauser address
     */
    error OnlyEmergencyBridgeUnpauser();

    /**
     * @dev Thrown when trying to call a function that only pending bridge unpauser can call.
     */
    error OnlyPendingEmergencyBridgeUnpauser();

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBaseLegacyAgglayerGER _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable,
        address _emergencyBridgePauser,
        address _emergencyBridgeUnpauser,
        address _proxiedTokensManager
    ) external;
}
