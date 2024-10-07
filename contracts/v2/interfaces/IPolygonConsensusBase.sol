// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonConsensusBase {
    function initialize(
        address _admin,
        address sequencer,
        uint32 networkID,
        address gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName
    ) external;

    function admin() external returns (address);
}
