// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

interface IPolygonDataAvailabilityProtocol {
    function verifyMessage(bytes32 hash, bytes memory dataAvailabilityMessage) external view;
}