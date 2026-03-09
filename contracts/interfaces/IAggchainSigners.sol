// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @title IAggchainSigners
 * @notice Interface for multisig signer management functionality
 * @dev This interface is implemented by both AggchainBase contracts and AgglayerGateway,
 *      providing a unified way to manage signers for consensus verification.
 *      Implementations may use local storage or delegate to a gateway contract.
 */
interface IAggchainSigners {
    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Struct to hold signer information
     * @param addr The address of the signer
     * @param url The URL associated with the signer
     */
    struct SignerInfo {
        address addr;
        string url;
    }

    /**
     * @notice Struct to hold information for removing a signer
     * @param addr The address of the signer to remove
     * @param index The index of the signer in the aggchainSigners array
     */
    struct RemoveSignerInfo {
        address addr;
        uint256 index;
    }

    /**
     * @notice Emitted when signers and threshold are updated in a batch operation.
     * @param aggchainSigners The updated array of signer addresses.
     * @param newThreshold The new threshold value.
     * @param newAggchainMultisigHash The new hash of the aggchainMultisig configuration.
     */
    event SignersAndThresholdUpdated(
        address[] aggchainSigners,
        uint256 newThreshold,
        bytes32 newAggchainMultisigHash
    );

    ////////////////////////////////////////////////////////////
    //                    View Functions                      //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) external view returns (bool);

    /**
     * @notice Get the minimum number of signatures required for consensus
     * @dev Returns the threshold value for multisig validation
     * @return threshold Minimum number of signatures required
     */
    function getThreshold() external view returns (uint256);

    /**
     * @notice Get the total number of registered signers
     * @dev Returns the count of active signers in the multisig
     * @return count Total number of aggchainSigners currently registered
     */
    function getAggchainSignersCount() external view returns (uint256);

    /**
     * @notice Get all registered signer addresses
     * @dev Returns the complete list of active signers
     * @return signers Array containing all signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory);

    /**
     * @notice Returns the hash of current multisig configuration
     * @dev Computed as keccak256(abi.encodePacked(threshold, aggchainSigners)).
     *      Used by aggchain contracts for efficient consensus verification.
     * @return multisigHash The current aggchainMultisigHash for validation
     */
    function getAggchainMultisigHash() external view returns (bytes32);

    /**
     * @notice Get detailed information for all registered signers
     * @dev Returns both addresses and associated URLs/endpoints for each signer
     * @return signerInfos Array of SignerInfo structs containing complete signer details
     */
    function getAggchainSignerInfos()
        external
        view
        returns (SignerInfo[] memory);
}
