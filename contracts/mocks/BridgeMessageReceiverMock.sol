// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "../interfaces/IBridgeMessageReceiver.sol";
import "../AgglayerBridge.sol";

contract BridgeMessageReceiverMock is IBridgeMessageReceiver {
    uint256 internal constant _DEPOSIT_CONTRACT_TREE_DEPTH = 32;

    event MessageReceived(address destinationAddress);
    event UpdateParameters();

    AgglayerBridge public immutable bridgeAddress;
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofLocalExitRoot;
    bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] smtProofRollupExitRoot;
    uint256 globalIndex;
    bytes32 mainnetExitRoot;
    bytes32 rollupExitRoot;
    uint32 originNetwork;
    address originAddress;
    uint32 destinationNetwork;
    address destinationAddress;
    uint256 amount;
    bytes metadata;

    constructor(AgglayerBridge _bridgeAddress) {
        bridgeAddress = _bridgeAddress;
    }

    function updateParameters(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata msmtProofRollupExitRoot,
        uint256 mglobalIndex,
        bytes32 mmainnetExitRoot,
        bytes32 mrollupExitRoot,
        uint32 moriginNetwork,
        address moriginAddress,
        uint32 mdestinationNetwork,
        address mdestinationAddress,
        uint256 mamount,
        bytes calldata mmetadata
    ) public {
        smtProofLocalExitRoot = msmtProofLocalExitRoot;
        smtProofRollupExitRoot = msmtProofRollupExitRoot;
        globalIndex = mglobalIndex;
        mainnetExitRoot = mmainnetExitRoot;
        rollupExitRoot = mrollupExitRoot;
        originNetwork = moriginNetwork;
        originAddress = moriginAddress;
        destinationNetwork = mdestinationNetwork;
        destinationAddress = mdestinationAddress;
        amount = mamount;
        metadata = mmetadata;

        emit UpdateParameters();
    }

    /// @inheritdoc IBridgeMessageReceiver
    function onMessageReceived(
        address originAddress,
        uint32 originNetwork,
        bytes memory data
    ) external payable {
        bridgeAddress.claimMessage(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            originNetwork,
            originAddress,
            destinationNetwork,
            destinationAddress,
            amount,
            metadata
        );
    }

    function testClaim(
        bytes memory claimData1,
        bytes memory bridgeAsset,
        bytes memory claimData2
    ) external payable {
        (
            bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] memory smtProofLocalExitRoot1,
            bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]
                memory smtProofRollupExitRoot1,
            uint256 globalIndex1,
            bytes32 mainnetExitRoot1,
            bytes32 rollupExitRoot1,
            uint32 originNetwork1,
            address originAddress1,
            uint32 destinationNetwork1,
            address destinationAddress1,
            uint256 amount1,
            bytes memory metadata1
        ) = abi.decode(
                claimData1,
                (
                    bytes32[32],
                    bytes32[32],
                    uint256,
                    bytes32,
                    bytes32,
                    uint32,
                    address,
                    uint32,
                    address,
                    uint256,
                    bytes
                )
            );
        // claimMessage destinationAddress == this contract
        bridgeAddress.claimMessage(
            smtProofLocalExitRoot1,
            smtProofRollupExitRoot1,
            globalIndex1,
            mainnetExitRoot1,
            rollupExitRoot1,
            originNetwork1,
            originAddress1,
            destinationNetwork1,
            destinationAddress1,
            amount1,
            metadata1
        );
        // revert with "DestinationNetworkInvalid"
        (bool success, ) = address(bridgeAddress).call(
            abi.encodeCall(
                AgglayerBridge.claimMessage,
                (
                    smtProofLocalExitRoot1,
                    smtProofRollupExitRoot1,
                    globalIndex1,
                    mainnetExitRoot1,
                    rollupExitRoot1,
                    originNetwork1,
                    originAddress1,
                    1000,
                    destinationAddress1,
                    amount1,
                    metadata1
                )
            )
        );

        require(success == false, "DestinationNetworkInvalid");

        // bridgeAsset
        (
            uint32 destinationNetwork3,
            address destinationAddress3,
            uint256 amount3,
            address token3,
            bool forceUpdateGlobalExitRoot3,
            bytes memory permitData3
        ) = abi.decode(
                bridgeAsset,
                (uint32, address, uint256, address, bool, bytes)
            );

        (bool success2, ) = address(bridgeAddress).call{value: msg.value}(
            abi.encodeCall(
                AgglayerBridge.bridgeAsset,
                (
                    destinationNetwork3,
                    destinationAddress3,
                    amount3,
                    token3,
                    forceUpdateGlobalExitRoot3,
                    permitData3
                )
            )
        );

        require(success2 == true);

        uint32 callInfo = bridgeAddress.networkID();

        // claimMessage destinationAddress == EOA
        (
            bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] memory smtProofLocalExitRoot2,
            bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH]
                memory smtProofRollupExitRoot2,
            uint256 globalIndex2,
            bytes32 mainnetExitRoot2,
            bytes32 rollupExitRoot2,
            uint32 originNetwork2,
            address originAddress2,
            uint32 destinationNetwork2,
            address destinationAddress2,
            uint256 amount2,
            bytes memory metadata2
        ) = abi.decode(
                claimData2,
                (
                    bytes32[32],
                    bytes32[32],
                    uint256,
                    bytes32,
                    bytes32,
                    uint32,
                    address,
                    uint32,
                    address,
                    uint256,
                    bytes
                )
            );

        bridgeAddress.claimMessage(
            smtProofLocalExitRoot2,
            smtProofRollupExitRoot2,
            globalIndex2,
            mainnetExitRoot2,
            rollupExitRoot2,
            originNetwork2,
            originAddress2,
            destinationNetwork2,
            destinationAddress2,
            amount2,
            metadata2
        );
    }
}
