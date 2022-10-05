// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;
import "../Bridge.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * Bridge that will be deployed on both networks Ethereum and Polygon zkEVM
 * Contract responsible to manage the token interactions with other networks
 */
contract BridgeMock is Bridge, OwnableUpgradeable {
    uint256 public maxEtherBridge;

    /**
     * @param _networkID networkID
     * @param _globalExitRootManager global exit root manager address
     */
    function initialize(
        uint32 _networkID,
        IGlobalExitRootManager _globalExitRootManager
    ) public override initializer {
        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        tokenImplementation = address(new TokenWrapped());
        __DepositContract_init();
        __Ownable_init();
        maxEtherBridge = 0.25 ether;
    }

    function setNetworkID(uint32 _networkID) public onlyOwner {
        networkID = _networkID;
    }

    function setMaxEtherBridge(uint256 _maxEtherBridge) public onlyOwner {
        maxEtherBridge = _maxEtherBridge;
    }

    /**
     * @notice Deposit add a new leaf to the merkle tree
     * @param token Token address, 0 address is reserved for ether
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param permitData Raw data of the call `permit` of the token
     */
    function bridge(
        address token,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata permitData
    ) public payable override {
        require(
            msg.value <= maxEtherBridge,
            "Bridge::bridge: Cannot bridge more than maxEtherBridge in internal testnet"
        );
        super.bridge(
            token,
            destinationNetwork,
            destinationAddress,
            amount,
            permitData
        );
    }
}
