// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;
import "./IPolygonZkEVMBaseBridge.sol";

interface IPolygonZkEVMBridgeL2 is IPolygonZkEVMBaseBridge {
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

    function bridgeMessageWETH(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountWETH,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external;
}
