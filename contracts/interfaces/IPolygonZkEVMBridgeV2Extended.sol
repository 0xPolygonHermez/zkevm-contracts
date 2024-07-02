// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBasePolygonZkEVMGlobalExitRoot.sol";

interface IPolygonZkEVMBridgeV2Extended {
    error AlreadyClaimed();
    error AmountDoesNotMatchMsgValue();
    error DestinationNetworkInvalid();
    error EtherTransferFailed();
    error FailedTokenWrappedDeployment();
    error GasTokenNetworkMustBeZeroOnEther();
    error GlobalExitRootInvalid();
    error InvalidSmtProof();
    error MerkleTreeFull();
    error MessageFailed();
    error MsgValueNotZero();
    error NativeTokenIsEther();
    error NoValueInMessagesOnGasTokenNetworks();
    error NotValidAmount();
    error NotValidOwner();
    error NotValidSignature();
    error NotValidSpender();
    error OnlyEmergencyState();
    error OnlyNotEmergencyState();
    error OnlyRollupManager();

    event BridgeEvent(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes metadata,
        uint32 depositCount
    );
    event ClaimEvent(
        uint256 globalIndex,
        uint32 originNetwork,
        address originAddress,
        address destinationAddress,
        uint256 amount
    );
    event EmergencyStateActivated();
    event EmergencyStateDeactivated();
    event Initialized(uint8 version);
    event NewWrappedToken(
        uint32 originNetwork,
        address originTokenAddress,
        address wrappedTokenAddress,
        bytes metadata
    );

    function BASE_INIT_BYTECODE_WRAPPED_TOKEN()
        external
        view
        returns (bytes memory);

    function WETHToken() external view returns (address);

    function activateEmergencyState() external;

    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) external payable;

    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable;

    function bridgeMessageWETH(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountWETH,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external;

    function calculateRoot(
        bytes32 leafHash,
        bytes32[32] calldata smtProof,
        uint32 index
    ) external pure returns (bytes32);

    function calculateTokenWrapperAddress(
        uint32 originNetwork,
        address originTokenAddress,
        address token
    ) external view returns (address);

    function claimAsset(
        bytes32[32] calldata smtProofLocalExitRoot,
        bytes32[32] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external;

    function claimMessage(
        bytes32[32] calldata smtProofLocalExitRoot,
        bytes32[32] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external;

    function claimedBitMap(uint256) external view returns (uint256);

    function deactivateEmergencyState() external;

    function depositCount() external view returns (uint256);

    function gasTokenAddress() external view returns (address);

    function gasTokenMetadata() external view returns (bytes memory);

    function gasTokenNetwork() external view returns (uint32);

    function getLeafValue(
        uint8 leafType,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes32 metadataHash
    ) external pure returns (bytes32);

    function getRoot() external view returns (bytes32);

    function getTokenMetadata(
        address token
    ) external view returns (bytes memory);

    function getTokenWrappedAddress(
        uint32 originNetwork,
        address originTokenAddress
    ) external view returns (address);

    function globalExitRootManager() external view returns (address);

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes calldata _gasTokenMetadata
    ) external;

    function isClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) external view returns (bool);

    function isEmergencyState() external view returns (bool);

    function lastUpdatedDepositCount() external view returns (uint32);

    function networkID() external view returns (uint32);

    function polygonRollupManager() external view returns (address);

    function precalculatedWrapperAddress(
        uint32 originNetwork,
        address originTokenAddress,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external view returns (address);

    function tokenInfoToWrappedToken(bytes32) external view returns (address);

    function updateGlobalExitRoot() external;

    function verifyMerkleProof(
        bytes32 leafHash,
        bytes32[32] calldata smtProof,
        uint32 index,
        bytes32 root
    ) external pure returns (bool);

    function wrappedTokenToTokenInfo(
        address destinationAddress
    ) external view returns (uint32, address);
}
