// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.15;

interface IPolygonZkEVMBridge {
    /**
     * @dev Thrown when sender is not PolygonZkEVM address
     */
    error OnlyPolygonZkEVM();

    /**
     * @dev Thrown when destination network is invalid
     */
    error DestinationNetworkInvalid();

    /**
     * @dev Thrown when amount does not match msg.value
     */
    error AmountDoesNotMatchMsgValue();

    /**
     * @dev Thrown when bridging tokens and also sending value
     */
    error MsgValueNotZero();

    /**
     * @dev Thrown when the ether transfer on claimAsset fail
     */
    error EtherTransferFailed();

    /**
     * @dev Thrown when the message transactoin on claimMessage fail
     */
    error MessageFailed();

    /**
     * @dev Thrown when the global exit root does not exist
     */
    error GlobalExitRootInvalid();

    /**
     * @dev Thrown when a the smt proof does not match
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
     * @dev Thrown when the spender of permit does not this contract
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

    function bridgeAsset(
        address token,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata permitData
    ) external payable;

    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bytes calldata metadata
    ) external payable;

    function claimAsset(
        bytes32[32] calldata smtProof,
        uint32 index,
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
        bytes32[32] calldata smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external;

    function activateEmergencyState() external;

    function deactivateEmergencyState() external;
}
