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
     * @dev Thrown when trying to remove a token mapping that has not been mapped before
     */
    error TokenNotMapped();

    /**
     * @dev Thrown when trying to migrate a token and both legacy and updated addresses are the same
     */
    error MigrationAddressesAreTheSame();

    /**
     * @dev Thrown when trying to migrate a token and legacy and updated token info are different
     */
    error MigrationTokenInfoAreDifferent();

    /**
     * @dev Thrown when trying to migrate a token proposed updated token address is not the current mapped token address
     */
    error InvalidUpdatedAddress();

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address sovereignWETHAddress,
        bool __sovereignWETHAddressIsNotMintable
    ) external;
}
