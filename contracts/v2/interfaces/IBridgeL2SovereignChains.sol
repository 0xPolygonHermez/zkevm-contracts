// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import "./IPolygonZkEVMBridgeV2.sol";

interface IBridgeL2SovereignChains is IPolygonZkEVMBridgeV2 {
    /**
     * @dev Thrown when try to set a zero address to a non valid zero address field
     */
    error InvalidZeroAddress();

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
     * @dev Thrown when bridge manager address is invalid
     */
    error NotValidBridgeManager();

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
     * @dev Thrown when initializing sovereign bridge with invalid sovereign WETH token params
     */
    error InvalidInitializeFunction();

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable
    ) external;
}
