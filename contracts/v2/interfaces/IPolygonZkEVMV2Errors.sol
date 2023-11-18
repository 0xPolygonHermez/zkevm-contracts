// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../../interfaces/IPolygonZkEVMErrors.sol";

interface IPolygonZkEVMV2Errors is IPolygonZkEVMErrors {
    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error OnlyRollupManager();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error NotEnoughPOLAmount();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error InvalidInitializeTransaction();

    /**
     * @dev Thrown when the caller is not the trusted sequencer
     */
    error GasTokenNetworkMustBeZeroOnEther();

    /**
     * @dev Thrown when the try to initialize with a gas token with huge metadata
     */
    error HugeTokenMetadataNotSupported();
}
