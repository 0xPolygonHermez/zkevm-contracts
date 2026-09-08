pragma solidity ^0.8.20;

interface IAgglayerBridgeState {
    function wrappedTokenToTokenInfo(
        address destinationAddress
    ) external view returns (uint32, address);
}
