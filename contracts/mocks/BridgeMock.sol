// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;
import "../Bridge.sol";

/**
 * Bridge that will be deployed on both networks Ethereum and Polygon Hermez
 * Contract responsible to manage the token interactions with other networks
 */
contract BridgeMock is Bridge {
    /**
     * @param _networkID networkID
     * @param _globalExitRootManager global exit root manager address
     */
    constructor(
        uint32 _networkID,
        IGlobalExitRootManager _globalExitRootManager
    ) Bridge(_networkID, _globalExitRootManager) {}

    function setNetworkID(uint32 _networkID) public onlyOwner {
        networkID = _networkID;
    }
}
