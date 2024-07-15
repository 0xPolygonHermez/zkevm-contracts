// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "../../lib/PolygonConsensusBase.sol";

abstract contract PolygonConsensusContract is
    PolygonConsensusBase
{

    function getConsensusHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(trustedSequencer));
    }

}
