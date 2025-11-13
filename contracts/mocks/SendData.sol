// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;
import "../lib/DepositContract.sol";
import "hardhat/console.sol";

/**
 * This contract will be used as a helper for PolygonZkEVM tests
 */
contract SendData {
    /**
     * @notice Send data to destination
     * @param destination Destination
     * @param data Data
     */
    function sendData(address destination, bytes memory data) public {
        destination.call(data);
    }
}
