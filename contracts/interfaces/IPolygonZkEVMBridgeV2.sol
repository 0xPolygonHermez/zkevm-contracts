// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBasePolygonZkEVMGlobalExitRoot.sol";

interface IPolygonZkEVMBridgeV2 {
    /**
     * @dev Thrown when the destination network is invalid
     */
    error DestinationNetworkInvalid();

    /**
     * @dev Thrown when the amount does not match msg.value
     */
    error AmountDoesNotMatchMsgValue();

    /**
     * @dev Thrown when user is bridging tokens and is also sending a value
     */
    error MsgValueNotZero();

    /**
     * @dev Thrown when the Ether transfer on claimAsset fails
     */
    error EtherTransferFailed();

    /**
     * @dev Thrown when the message transaction on claimMessage fails
     */
    error MessageFailed();

    /**
     * @dev Thrown when the global exit root does not exist
     */
    error GlobalExitRootInvalid();

    /**
     * @dev Thrown when the smt proof does not match
     */
    error InvalidSmtProof();

    /**
     * @dev Thrown when an index is already claimed
     */
    error AlreadyClaimed();

    /**
     * @dev Thrown when the owner of permit does not match the sender
     */
    error NotValidOwner();

    /**
     * @dev Thrown when the spender of the permit does not match this contract address
     */
    error NotValidSpender();

    /**
     * @dev Thrown when the amount of the permit does not match
     */
    error NotValidAmount();

    /**
     * @dev Thrown when the permit data contains an invalid signature
     */
    error NotValidSignature();

    /**
     * @dev Thrown when sender is not the rollup manager
     */
    error OnlyRollupManager();

    /**
     * @dev Thrown when the permit data contains an invalid signature
     */
    error NativeTokenIsEther();

    /**
     * @dev Thrown when the permit data contains an invalid signature
     */
    error NoValueInMessagesOnGasTokenNetworks();

    /**
     * @dev Thrown when the permit data contains an invalid signature
     */
    error GasTokenNetworkMustBeZeroOnEther();

    /**
     * @dev Thrown when the wrapped token deployment fails
     */
    error FailedTokenWrappedDeployment();

    function wrappedTokenToTokenInfo(
        address destinationAddress
    ) external view returns (uint32, address);

    function updateGlobalExitRoot() external;

    function activateEmergencyState() external;

    function deactivateEmergencyState() external;

    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) external payable;

    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable;

    function bridgeMessageWETH(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountWETH,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external;

    function claimAsset(
        bytes32[32] calldata smtProofLocalExitRoot,
        bytes32[32] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external;

    function claimMessage(
        bytes32[32] calldata smtProofLocalExitRoot,
        bytes32[32] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external;

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata
    ) external;

    function getTokenMetadata(
        address token
    ) external view returns (bytes memory);
}
