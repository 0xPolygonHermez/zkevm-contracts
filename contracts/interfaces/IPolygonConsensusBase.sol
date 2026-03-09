// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonConsensusBase {
    /**
     * @dev Thrown when trying to set the admin to the zero address
     */
    error AdminCannotBeZeroAddress();

    function initialize(
        address _admin,
        address sequencer,
        uint32 networkID,
        address gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external;

    function admin() external view returns (address);
}
