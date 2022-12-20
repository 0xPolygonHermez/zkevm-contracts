// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;
import "../PolygonZkEVMBridge.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * PolygonZkEVMBridge that will be deployed on both networks Ethereum and Polygon zkEVM
 * Contract responsible to manage the token interactions with other networks
 */
contract PolygonZkEVMBridgeMock is PolygonZkEVMBridge, OwnableUpgradeable {
    uint256 public maxEtherBridge;

    /**
     * @param _networkID networkID
     * @param _globalExitRootManager global exit root manager address
     */
    function initialize(
        uint32 _networkID,
        IPolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonZkEVMaddress
    ) public override initializer {
        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        polygonZkEVMaddress = _polygonZkEVMaddress;

        maxEtherBridge = 0.25 ether;

        // Initialize OZ contracts
        __Ownable_init_unchained();
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
    function bridgeAsset(
        address token,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata permitData
    ) public payable override {
        require(
            msg.value <= maxEtherBridge,
            "PolygonZkEVMBridge::bridgeAsset: Cannot bridge more than maxEtherBridge"
        );
        super.bridgeAsset(
            token,
            destinationNetwork,
            destinationAddress,
            amount,
            permitData
        );
    }
}
