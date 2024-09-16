// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "contracts/interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import "contracts/interfaces/IBridgeMessageReceiver.sol";
import "contracts/interfaces/IPolygonZkEVMBridgeV2.sol";
import "contracts/lib/DepositContractV2.sol";
import "contracts/lib/EmergencyManager.sol";
import "contracts/lib/GlobalExitRootLib.sol";
import "contracts/lib/TokenWrapped.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * PolygonZkEVMBridge that will be deployed on Ethereum and all Polygon rollups
 * Contract responsible to manage the token interactions with other networks
 */
contract PolygonZkEVMBridgeV2 is
    DepositContractV2,
    EmergencyManager,
    IPolygonZkEVMBridgeV2
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Wrapped Token information struct
    struct TokenInformation {
        uint32 originNetwork;
        address originTokenAddress;
    }

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,bool,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;

    // Mainnet identifier
    uint32 private constant _MAINNET_NETWORK_ID = 0;

    // ZkEVM identifier
    uint32 private constant _ZKEVM_NETWORK_ID = 1;

    // Leaf type asset
    uint8 private constant _LEAF_TYPE_ASSET = 0;

    // Leaf type message
    uint8 private constant _LEAF_TYPE_MESSAGE = 1;

    // Nullifier offset
    uint256 private constant _MAX_LEAFS_PER_NETWORK = 2 ** 32;

    // Indicate where's the mainnet flag bit in the global index
    uint256 private constant _GLOBAL_INDEX_MAINNET_FLAG = 2 ** 64;

    // Init code of the erc20 wrapped token, to deploy a wrapped token the constructor parameters must be appended
    bytes public constant BASE_INIT_BYTECODE_WRAPPED_TOKEN =
        hex"6101006040523480156200001257600080fd5b5060405162001b6638038062001b6683398101604081905262000035916200028d565b82826003620000458382620003a1565b506004620000548282620003a1565b50503360c0525060ff811660e052466080819052620000739062000080565b60a052506200046d915050565b60007f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f620000ad6200012e565b805160209182012060408051808201825260018152603160f81b90840152805192830193909352918101919091527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc66060820152608081018390523060a082015260c001604051602081830303815290604052805190602001209050919050565b6060600380546200013f9062000312565b80601f01602080910402602001604051908101604052809291908181526020018280546200016d9062000312565b8015620001be5780601f106200019257610100808354040283529160200191620001be565b820191906000526020600020905b815481529060010190602001808311620001a057829003601f168201915b5050505050905090565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620001f057600080fd5b81516001600160401b03808211156200020d576200020d620001c8565b604051601f8301601f19908116603f01168101908282118183101715620002385762000238620001c8565b816040528381526020925086838588010111156200025557600080fd5b600091505b838210156200027957858201830151818301840152908201906200025a565b600093810190920192909252949350505050565b600080600060608486031215620002a357600080fd5b83516001600160401b0380821115620002bb57600080fd5b620002c987838801620001de565b94506020860151915080821115620002e057600080fd5b50620002ef86828701620001de565b925050604084015160ff811681146200030757600080fd5b809150509250925092565b600181811c908216806200032757607f821691505b6020821081036200034857634e487b7160e01b600052602260045260246000fd5b50919050565b601f8211156200039c57600081815260208120601f850160051c81016020861015620003775750805b601f850160051c820191505b81811015620003985782815560010162000383565b5050505b505050565b81516001600160401b03811115620003bd57620003bd620001c8565b620003d581620003ce845462000312565b846200034e565b602080601f8311600181146200040d5760008415620003f45750858301515b600019600386901b1c1916600185901b17855562000398565b600085815260208120601f198616915b828110156200043e578886015182559484019460019091019084016200041d565b50858210156200045d5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b60805160a05160c05160e0516116aa620004bc6000396000610237015260008181610307015281816105c001526106a70152600061053a015260008181610379015261050401526116aa6000f3fe608060405234801561001057600080fd5b50600436106101775760003560e01c806370a08231116100d8578063a457c2d71161008c578063d505accf11610066578063d505accf1461039b578063dd62ed3e146103ae578063ffa1ad74146103f457600080fd5b8063a457c2d71461034e578063a9059cbb14610361578063cd0d00961461037457600080fd5b806395d89b41116100bd57806395d89b41146102e75780639dc29fac146102ef578063a3c573eb1461030257600080fd5b806370a08231146102915780637ecebe00146102c757600080fd5b806330adf81f1161012f5780633644e515116101145780633644e51514610261578063395093511461026957806340c10f191461027c57600080fd5b806330adf81f14610209578063313ce5671461023057600080fd5b806318160ddd1161016057806318160ddd146101bd57806320606b70146101cf57806323b872dd146101f657600080fd5b806306fdde031461017c578063095ea7b31461019a575b600080fd5b610184610430565b60405161019191906113e4565b60405180910390f35b6101ad6101a8366004611479565b6104c2565b6040519015158152602001610191565b6002545b604051908152602001610191565b6101c17f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f81565b6101ad6102043660046114a3565b6104dc565b6101c17f6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c981565b60405160ff7f0000000000000000000000000000000000000000000000000000000000000000168152602001610191565b6101c1610500565b6101ad610277366004611479565b61055c565b61028f61028a366004611479565b6105a8565b005b6101c161029f3660046114df565b73ffffffffffffffffffffffffffffffffffffffff1660009081526020819052604090205490565b6101c16102d53660046114df565b60056020526000908152604090205481565b610184610680565b61028f6102fd366004611479565b61068f565b6103297f000000000000000000000000000000000000000000000000000000000000000081565b60405173ffffffffffffffffffffffffffffffffffffffff9091168152602001610191565b6101ad61035c366004611479565b61075e565b6101ad61036f366004611479565b61082f565b6101c17f000000000000000000000000000000000000000000000000000000000000000081565b61028f6103a9366004611501565b61083d565b6101c16103bc366004611574565b73ffffffffffffffffffffffffffffffffffffffff918216600090815260016020908152604080832093909416825291909152205490565b6101846040518060400160405280600181526020017f310000000000000000000000000000000000000000000000000000000000000081525081565b60606003805461043f906115a7565b80601f016020809104026020016040519081016040528092919081815260200182805461046b906115a7565b80156104b85780601f1061048d576101008083540402835291602001916104b8565b820191906000526020600020905b81548152906001019060200180831161049b57829003601f168201915b5050505050905090565b6000336104d0818585610b73565b60019150505b92915050565b6000336104ea858285610d27565b6104f5858585610dfe565b506001949350505050565b60007f00000000000000000000000000000000000000000000000000000000000000004614610537576105324661106d565b905090565b507f000000000000000000000000000000000000000000000000000000000000000090565b33600081815260016020908152604080832073ffffffffffffffffffffffffffffffffffffffff871684529091528120549091906104d090829086906105a3908790611629565b610b73565b3373ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001614610672576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152603060248201527f546f6b656e577261707065643a3a6f6e6c794272696467653a204e6f7420506f60448201527f6c79676f6e5a6b45564d4272696467650000000000000000000000000000000060648201526084015b60405180910390fd5b61067c8282611135565b5050565b60606004805461043f906115a7565b3373ffffffffffffffffffffffffffffffffffffffff7f00000000000000000000000000000000000000000000000000000000000000001614610754576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152603060248201527f546f6b656e577261707065643a3a6f6e6c794272696467653a204e6f7420506f60448201527f6c79676f6e5a6b45564d427269646765000000000000000000000000000000006064820152608401610669565b61067c8282611228565b33600081815260016020908152604080832073ffffffffffffffffffffffffffffffffffffffff8716845290915281205490919083811015610822576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602560248201527f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f7760448201527f207a65726f0000000000000000000000000000000000000000000000000000006064820152608401610669565b6104f58286868403610b73565b6000336104d0818585610dfe565b834211156108cc576040517f08c379a0000000000000000000000000000000000000000000000000000000008152602060048201526024808201527f546f6b656e577261707065643a3a7065726d69743a204578706972656420706560448201527f726d6974000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff8716600090815260056020526040812080547f6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9918a918a918a9190866109268361163c565b9091555060408051602081019690965273ffffffffffffffffffffffffffffffffffffffff94851690860152929091166060840152608083015260a082015260c0810186905260e0016040516020818303038152906040528051906020012090506000610991610500565b6040517f19010000000000000000000000000000000000000000000000000000000000006020820152602281019190915260428101839052606201604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181528282528051602091820120600080855291840180845281905260ff89169284019290925260608301879052608083018690529092509060019060a0016020604051602081039080840390855afa158015610a55573d6000803e3d6000fd5b50506040517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0015191505073ffffffffffffffffffffffffffffffffffffffff811615801590610ad057508973ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff16145b610b5c576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602760248201527f546f6b656e577261707065643a3a7065726d69743a20496e76616c696420736960448201527f676e6174757265000000000000000000000000000000000000000000000000006064820152608401610669565b610b678a8a8a610b73565b50505050505050505050565b73ffffffffffffffffffffffffffffffffffffffff8316610c15576040517f08c379a0000000000000000000000000000000000000000000000000000000008152602060048201526024808201527f45524332303a20617070726f76652066726f6d20746865207a65726f2061646460448201527f72657373000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff8216610cb8576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602260248201527f45524332303a20617070726f766520746f20746865207a65726f20616464726560448201527f73730000000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff83811660008181526001602090815260408083209487168084529482529182902085905590518481527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92591015b60405180910390a3505050565b73ffffffffffffffffffffffffffffffffffffffff8381166000908152600160209081526040808320938616835292905220547fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8114610df85781811015610deb576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601d60248201527f45524332303a20696e73756666696369656e7420616c6c6f77616e63650000006044820152606401610669565b610df88484848403610b73565b50505050565b73ffffffffffffffffffffffffffffffffffffffff8316610ea1576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602560248201527f45524332303a207472616e736665722066726f6d20746865207a65726f20616460448201527f64726573730000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff8216610f44576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602360248201527f45524332303a207472616e7366657220746f20746865207a65726f206164647260448201527f65737300000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff831660009081526020819052604090205481811015610ffa576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602660248201527f45524332303a207472616e7366657220616d6f756e742065786365656473206260448201527f616c616e636500000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff848116600081815260208181526040808320878703905593871680835291849020805487019055925185815290927fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a3610df8565b60007f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f611098610430565b8051602091820120604080518082018252600181527f310000000000000000000000000000000000000000000000000000000000000090840152805192830193909352918101919091527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc66060820152608081018390523060a082015260c001604051602081830303815290604052805190602001209050919050565b73ffffffffffffffffffffffffffffffffffffffff82166111b2576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601f60248201527f45524332303a206d696e7420746f20746865207a65726f2061646472657373006044820152606401610669565b80600260008282546111c49190611629565b909155505073ffffffffffffffffffffffffffffffffffffffff8216600081815260208181526040808320805486019055518481527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a35050565b73ffffffffffffffffffffffffffffffffffffffff82166112cb576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602160248201527f45524332303a206275726e2066726f6d20746865207a65726f2061646472657360448201527f73000000000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff821660009081526020819052604090205481811015611381576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152602260248201527f45524332303a206275726e20616d6f756e7420657863656564732062616c616e60448201527f63650000000000000000000000000000000000000000000000000000000000006064820152608401610669565b73ffffffffffffffffffffffffffffffffffffffff83166000818152602081815260408083208686039055600280548790039055518581529192917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9101610d1a565b600060208083528351808285015260005b81811015611411578581018301518582016040015282016113f5565b5060006040828601015260407fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f8301168501019250505092915050565b803573ffffffffffffffffffffffffffffffffffffffff8116811461147457600080fd5b919050565b6000806040838503121561148c57600080fd5b61149583611450565b946020939093013593505050565b6000806000606084860312156114b857600080fd5b6114c184611450565b92506114cf60208501611450565b9150604084013590509250925092565b6000602082840312156114f157600080fd5b6114fa82611450565b9392505050565b600080600080600080600060e0888a03121561151c57600080fd5b61152588611450565b965061153360208901611450565b95506040880135945060608801359350608088013560ff8116811461155757600080fd5b9699959850939692959460a0840135945060c09093013592915050565b6000806040838503121561158757600080fd5b61159083611450565b915061159e60208401611450565b90509250929050565b600181811c908216806115bb57607f821691505b6020821081036115f4577f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b50919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b808201808211156104d6576104d66115fa565b60007fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff820361166d5761166d6115fa565b506001019056fea26469706673582212208d88fee561cff7120d381c345cfc534cef8229a272dc5809d4bbb685ad67141164736f6c63430008110033";

    // Network identifier
    uint32 public networkID;

    // Global Exit Root address
    IBasePolygonZkEVMGlobalExitRoot public globalExitRootManager;

    // Last updated deposit count to the global exit root manager
    uint32 public lastUpdatedDepositCount;

    // Leaf index --> claimed bit map
    mapping(uint256 => uint256) public claimedBitMap;

    // keccak256(OriginNetwork || tokenAddress) --> Wrapped token address
    mapping(bytes32 => address) public tokenInfoToWrappedToken;

    // Wrapped token Address --> Origin token information
    mapping(address => TokenInformation) public wrappedTokenToTokenInfo;

    // Rollup manager address, previously PolygonZkEVM
    /// @custom:oz-renamed-from polygonZkEVMaddress
    address public polygonRollupManager;

    // Native address
    address public gasTokenAddress;

    // Native address
    uint32 public gasTokenNetwork;

    // Gas token metadata
    bytes public gasTokenMetadata;

    // WETH address
    TokenWrapped public WETHToken;

    /**
     * @dev Emitted when bridge assets or messages to another network
     */
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

    /**
     * @dev Emitted when a claim is done from another network
     */
    event ClaimEvent(
        uint256 globalIndex,
        uint32 originNetwork,
        address originAddress,
        address destinationAddress,
        uint256 amount
    );

    /**
     * @dev Emitted when a new wrapped token is created
     */
    event NewWrappedToken(
        uint32 originNetwork,
        address originTokenAddress,
        address wrappedTokenAddress,
        bytes metadata
    );

    /**
     * Disable initalizers on the implementation following the best practices
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @param _networkID networkID
     * @param _gasTokenAddress gas token address
     * @param _gasTokenNetwork gas token network
     * @param _globalExitRootManager global exit root manager address
     * @param _polygonRollupManager polygonZkEVM address
     * @notice The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
     * emergency state is not possible for the L2 deployment of the bridge, intentionally
     * @param _gasTokenMetadata Abi encoded gas token metadata
     */
    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata
    ) external virtual initializer {
        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        polygonRollupManager = _polygonRollupManager;

        // Set gas token
        if (_gasTokenAddress == address(0)) {
            // Gas token will be ether
            if (_gasTokenNetwork != 0) {
                revert GasTokenNetworkMustBeZeroOnEther();
            }
            // WETHToken, gasTokenAddress and gasTokenNetwork will be 0
            // gasTokenMetadata will be empty
        } else {
            // Gas token will be an erc20
            gasTokenAddress = _gasTokenAddress;
            gasTokenNetwork = _gasTokenNetwork;
            gasTokenMetadata = _gasTokenMetadata;

            // Create a wrapped token for WETH, with salt == 0
            WETHToken = _deployWrappedToken(
                0, // salt
                abi.encode("Wrapped Ether", "WETH", 18)
            );
        }

        // Initialize OZ contracts
        __ReentrancyGuard_init();
    }

    modifier onlyRollupManager() {
        if (polygonRollupManager != msg.sender) {
            revert OnlyRollupManager();
        }
        _;
    }

    /**
     * @notice Deposit add a new leaf to the merkle tree
     * note If this function is called with a reentrant token, it would be possible to `claimTokens` in the same call
     * Reducing the supply of tokens on this contract, and actually locking tokens in the contract.
     * Therefore we recommend to third parties bridges that if they do implement reentrant call of `beforeTransfer` of some reentrant tokens
     * do not call any external address in that case
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param token Token address, 0 address is reserved for ether
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param permitData Raw data of the call `permit` of the token
     */
    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) public payable virtual ifNotEmergencyState nonReentrant {
        if (destinationNetwork == networkID) {
            revert DestinationNetworkInvalid();
        }

        address originTokenAddress;
        uint32 originNetwork;
        bytes memory metadata;
        uint256 leafAmount = amount;

        if (token == address(0)) {
            // Check gas token transfer
            if (msg.value != amount) {
                revert AmountDoesNotMatchMsgValue();
            }

            // Set gas token parameters
            originNetwork = gasTokenNetwork;
            originTokenAddress = gasTokenAddress;
            metadata = gasTokenMetadata;
        } else {
            // Check msg.value is 0 if tokens are bridged
            if (msg.value != 0) {
                revert MsgValueNotZero();
            }

            // Check if it's WETH, this only applies on L2 networks with gasTokens
            // In case ether is the native token, WETHToken will be 0, and the address 0 is already checked
            if (token == address(WETHToken)) {
                // Burn tokens
                TokenWrapped(token).burn(msg.sender, amount);

                // Both origin network and originTokenAddress will be 0
                // Metadata will be empty
            } else {
                TokenInformation memory tokenInfo = wrappedTokenToTokenInfo[
                    token
                ];

                if (tokenInfo.originTokenAddress != address(0)) {
                    // The token is a wrapped token from another network

                    // Burn tokens
                    TokenWrapped(token).burn(msg.sender, amount);

                    originTokenAddress = tokenInfo.originTokenAddress;
                    originNetwork = tokenInfo.originNetwork;
                } else {
                    // Use permit if any
                    if (permitData.length != 0) {
                        _permit(token, amount, permitData);
                    }

                    // In order to support fee tokens check the amount received, not the transferred
                    uint256 balanceBefore = IERC20Upgradeable(token).balanceOf(
                        address(this)
                    );
                    IERC20Upgradeable(token).safeTransferFrom(
                        msg.sender,
                        address(this),
                        amount
                    );
                    uint256 balanceAfter = IERC20Upgradeable(token).balanceOf(
                        address(this)
                    );

                    // Override leafAmount with the received amount
                    leafAmount = balanceAfter - balanceBefore;

                    originTokenAddress = token;
                    originNetwork = networkID;
                }
                // Encode metadata
                metadata = getTokenMetadata(token);
            }
        }

        emit BridgeEvent(
            _LEAF_TYPE_ASSET,
            originNetwork,
            originTokenAddress,
            destinationNetwork,
            destinationAddress,
            leafAmount,
            metadata,
            uint32(depositCount)
        );

        _addLeaf(
            getLeafValue(
                _LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                destinationNetwork,
                destinationAddress,
                leafAmount,
                keccak256(metadata)
            )
        );

        // Update the new root to the global exit root manager if set by the user
        if (forceUpdateGlobalExitRoot) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Bridge message and send ETH value
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external payable ifNotEmergencyState {
        // If exist a gas token, only allow call this function without value
        if (msg.value != 0 && address(WETHToken) != address(0)) {
            revert NoValueInMessagesOnGasTokenNetworks();
        }

        _bridgeMessage(
            destinationNetwork,
            destinationAddress,
            msg.value,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }

    /**
     * @notice Bridge message and send ETH value
     * note User/UI must be aware of the existing/available networks when choosing the destination network
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amountWETH Amount of WETH tokens
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function bridgeMessageWETH(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountWETH,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) external ifNotEmergencyState {
        // If native token is ether, disable this function
        if (address(WETHToken) == address(0)) {
            revert NativeTokenIsEther();
        }

        // Burn wETH tokens
        WETHToken.burn(msg.sender, amountWETH);

        _bridgeMessage(
            destinationNetwork,
            destinationAddress,
            amountWETH,
            forceUpdateGlobalExitRoot,
            metadata
        );
    }

    /**
     * @notice Bridge message and send ETH value
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amountEther Amount of ether along with the message
     * @param forceUpdateGlobalExitRoot Indicates if the new global exit root is updated or not
     * @param metadata Message metadata
     */
    function _bridgeMessage(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amountEther,
        bool forceUpdateGlobalExitRoot,
        bytes calldata metadata
    ) internal {
        if (destinationNetwork == networkID) {
            revert DestinationNetworkInvalid();
        }

        emit BridgeEvent(
            _LEAF_TYPE_MESSAGE,
            networkID,
            msg.sender,
            destinationNetwork,
            destinationAddress,
            amountEther,
            metadata,
            uint32(depositCount)
        );

        _addLeaf(
            getLeafValue(
                _LEAF_TYPE_MESSAGE,
                networkID,
                msg.sender,
                destinationNetwork,
                destinationAddress,
                amountEther,
                keccak256(metadata)
            )
        );

        // Update the new root to the global exit root manager if set by the user
        if (forceUpdateGlobalExitRoot) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Verify merkle proof and withdraw tokens/ether
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the network exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * note that only the rollup index will be used only in case the mainnet flag is 0
     * note that global index do not assert the unused bits to 0.
     * This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract
     * to avoid possible synch attacks
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originTokenAddress  Origin token address, 0 address is reserved for ether
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount Amount of tokens
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimAsset(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originTokenAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external ifNotEmergencyState {
        // Destination network must be this networkID
        if (destinationNetwork != networkID) {
            revert DestinationNetworkInvalid();
        }

        // Verify leaf exist and it does not have been claimed
        _verifyLeaf(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            getLeafValue(
                _LEAF_TYPE_ASSET,
                originNetwork,
                originTokenAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                keccak256(metadata)
            )
        );

        // Transfer funds
        if (originTokenAddress == address(0)) {
            if (address(WETHToken) == address(0)) {
                // Ether is the native token
                /* solhint-disable avoid-low-level-calls */
                (bool success, ) = destinationAddress.call{value: amount}(
                    new bytes(0)
                );
                if (!success) {
                    revert EtherTransferFailed();
                }
            } else {
                // Claim wETH
                WETHToken.mint(destinationAddress, amount);
            }
        } else {
            // Check if it's gas token
            if (
                originTokenAddress == gasTokenAddress &&
                gasTokenNetwork == originNetwork
            ) {
                // Transfer gas token
                /* solhint-disable avoid-low-level-calls */
                (bool success, ) = destinationAddress.call{value: amount}(
                    new bytes(0)
                );
                if (!success) {
                    revert EtherTransferFailed();
                }
            } else {
                // Transfer tokens
                if (originNetwork == networkID) {
                    // The token is an ERC20 from this network
                    IERC20Upgradeable(originTokenAddress).safeTransfer(
                        destinationAddress,
                        amount
                    );
                } else {
                    // The tokens is not from this network
                    // Create a wrapper for the token if not exist yet
                    bytes32 tokenInfoHash = keccak256(
                        abi.encodePacked(originNetwork, originTokenAddress)
                    );
                    address wrappedToken = tokenInfoToWrappedToken[
                        tokenInfoHash
                    ];

                    if (wrappedToken == address(0)) {
                        // Get ERC20 metadata

                        // Create a new wrapped erc20 using create2
                        TokenWrapped newWrappedToken = _deployWrappedToken(
                            tokenInfoHash,
                            metadata
                        );

                        // Mint tokens for the destination address
                        newWrappedToken.mint(destinationAddress, amount);

                        // Create mappings
                        tokenInfoToWrappedToken[tokenInfoHash] = address(
                            newWrappedToken
                        );

                        wrappedTokenToTokenInfo[
                            address(newWrappedToken)
                        ] = TokenInformation(originNetwork, originTokenAddress);

                        emit NewWrappedToken(
                            originNetwork,
                            originTokenAddress,
                            address(newWrappedToken),
                            metadata
                        );
                    } else {
                        // Use the existing wrapped erc20
                        TokenWrapped(wrappedToken).mint(
                            destinationAddress,
                            amount
                        );
                    }
                }
            }
        }

        emit ClaimEvent(
            globalIndex,
            originNetwork,
            originTokenAddress,
            destinationAddress,
            amount
        );
    }

    /**
     * @notice Verify merkle proof and execute message
     * If the receiving address is an EOA, the call will result as a success
     * Which means that the amount of ether will be transferred correctly, but the message
     * will not trigger any execution
     * @param smtProofLocalExitRoot Smt proof to proof the leaf against the exit root
     * @param smtProofRollupExitRoot Smt proof to proof the rollupLocalExitRoot against the rollups exit root
     * @param globalIndex Global index is defined as:
     * | 191 bits |    1 bit     |   32 bits   |     32 bits    |
     * |    0     |  mainnetFlag | rollupIndex | localRootIndex |
     * note that only the rollup index will be used only in case the mainnet flag is 0
     * note that global index do not assert the unused bits to 0.
     * This means that when synching the events, the globalIndex must be decoded the same way that in the Smart contract
     * to avoid possible synch attacks
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param originNetwork Origin network
     * @param originAddress Origin address
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     * @param amount message value
     * @param metadata Abi encoded metadata if any, empty otherwise
     */
    function claimMessage(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        uint32 originNetwork,
        address originAddress,
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        bytes calldata metadata
    ) external ifNotEmergencyState {
        // Destination network must be this networkID
        if (destinationNetwork != networkID) {
            revert DestinationNetworkInvalid();
        }

        // Verify leaf exist and it does not have been claimed
        _verifyLeaf(
            smtProofLocalExitRoot,
            smtProofRollupExitRoot,
            globalIndex,
            mainnetExitRoot,
            rollupExitRoot,
            getLeafValue(
                _LEAF_TYPE_MESSAGE,
                originNetwork,
                originAddress,
                destinationNetwork,
                destinationAddress,
                amount,
                keccak256(metadata)
            )
        );

        // Execute message
        bool success;
        if (address(WETHToken) == address(0)) {
            // Native token is ether
            // Transfer ether
            /* solhint-disable avoid-low-level-calls */
            (success, ) = destinationAddress.call{value: amount}(
                abi.encodeCall(
                    IBridgeMessageReceiver.onMessageReceived,
                    (originAddress, originNetwork, metadata)
                )
            );
        } else {
            // Mint wETH tokens
            WETHToken.mint(destinationAddress, amount);

            // Execute message
            /* solhint-disable avoid-low-level-calls */
            (success, ) = destinationAddress.call(
                abi.encodeCall(
                    IBridgeMessageReceiver.onMessageReceived,
                    (originAddress, originNetwork, metadata)
                )
            );
        }

        if (!success) {
            revert MessageFailed();
        }

        emit ClaimEvent(
            globalIndex,
            originNetwork,
            originAddress,
            destinationAddress,
            amount
        );
    }

    /**
     * @notice Returns the precalculated address of a wrapper using the token information
     * Note Updating the metadata of a token is not supported.
     * Since the metadata has relevance in the address deployed, this function will not return a valid
     * wrapped address if the metadata provided is not the original one.
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     * @param name Name of the token
     * @param symbol Symbol of the token
     * @param decimals Decimals of the token
     */
    function precalculatedWrapperAddress(
        uint32 originNetwork,
        address originTokenAddress,
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public view returns (address) {
        bytes32 salt = keccak256(
            abi.encodePacked(originNetwork, originTokenAddress)
        );

        bytes32 hashCreate2 = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(
                    abi.encodePacked(
                        BASE_INIT_BYTECODE_WRAPPED_TOKEN,
                        abi.encode(name, symbol, decimals)
                    )
                )
            )
        );

        // Last 20 bytes of hash to address
        return address(uint160(uint256(hashCreate2)));
    }

    /**
     * @notice Returns the address of a wrapper using the token information if already exist
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     */
    function getTokenWrappedAddress(
        uint32 originNetwork,
        address originTokenAddress
    ) external view returns (address) {
        return
            tokenInfoToWrappedToken[
                keccak256(abi.encodePacked(originNetwork, originTokenAddress))
            ];
    }

    /**
     * @notice Function to activate the emergency state
     " Only can be called by the Polygon ZK-EVM in extreme situations
     */
    function activateEmergencyState() external onlyRollupManager {
        _activateEmergencyState();
    }

    /**
     * @notice Function to deactivate the emergency state
     " Only can be called by the Polygon ZK-EVM
     */
    function deactivateEmergencyState() external onlyRollupManager {
        _deactivateEmergencyState();
    }

    /**
     * @notice Verify leaf and checks that it has not been claimed
     * @param smtProofLocalExitRoot Smt proof
     * @param smtProofRollupExitRoot Smt proof
     * @param globalIndex Index of the leaf
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     * @param leafValue leaf value
     */
    function _verifyLeaf(
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofLocalExitRoot,
        bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata smtProofRollupExitRoot,
        uint256 globalIndex,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot,
        bytes32 leafValue
    ) internal {
        // Check blockhash where the global exit root was set
        // Note that previusly timestamps were setted, since in only checked if != 0 it's ok
        uint256 blockHashGlobalExitRoot = globalExitRootManager
            .globalExitRootMap(
                GlobalExitRootLib.calculateGlobalExitRoot(
                    mainnetExitRoot,
                    rollupExitRoot
                )
            );

        // check that this global exit root exist
        if (blockHashGlobalExitRoot == 0) {
            revert GlobalExitRootInvalid();
        }

        uint32 leafIndex;
        uint32 sourceBridgeNetwork;

        // Get origin network from global index
        if (globalIndex & _GLOBAL_INDEX_MAINNET_FLAG != 0) {
            // the network is mainnet, therefore sourceBridgeNetwork is 0

            // Last 32 bits are leafIndex
            leafIndex = uint32(globalIndex);

            if (
                !verifyMerkleProof(
                    leafValue,
                    smtProofLocalExitRoot,
                    leafIndex,
                    mainnetExitRoot
                )
            ) {
                revert InvalidSmtProof();
            }
        } else {
            // the network is a rollup, therefore sourceBridgeNetwork must be decoded
            uint32 indexRollup = uint32(globalIndex >> 32);
            sourceBridgeNetwork = indexRollup + 1;

            // Last 32 bits are leafIndex
            leafIndex = uint32(globalIndex);

            // Verify merkle proof agains rollup exit root
            if (
                !verifyMerkleProof(
                    calculateRoot(leafValue, smtProofLocalExitRoot, leafIndex),
                    smtProofRollupExitRoot,
                    indexRollup,
                    rollupExitRoot
                )
            ) {
                revert InvalidSmtProof();
            }
        }

        // Set and check nullifier
        _setAndCheckClaimed(leafIndex, sourceBridgeNetwork);
    }

    /**
     * @notice Function to check if an index is claimed or not
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function isClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) external view returns (bool) {
        uint256 globalIndex;

        // For consistency with the previous setted nullifiers
        if (
            networkID == _MAINNET_NETWORK_ID &&
            sourceBridgeNetwork == _ZKEVM_NETWORK_ID
        ) {
            globalIndex = uint256(leafIndex);
        } else {
            globalIndex =
                uint256(leafIndex) +
                uint256(sourceBridgeNetwork) *
                _MAX_LEAFS_PER_NETWORK;
        }
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = (1 << bitPos);
        return (claimedBitMap[wordPos] & mask) == mask;
    }

    /**
     * @notice Function to check that an index is not claimed and set it as claimed
     * @param leafIndex Index
     * @param sourceBridgeNetwork Origin network
     */
    function _setAndCheckClaimed(
        uint32 leafIndex,
        uint32 sourceBridgeNetwork
    ) private {
        uint256 globalIndex;

        // For consistency with the previous setted nullifiers
        if (
            networkID == _MAINNET_NETWORK_ID &&
            sourceBridgeNetwork == _ZKEVM_NETWORK_ID
        ) {
            globalIndex = uint256(leafIndex);
        } else {
            globalIndex =
                uint256(leafIndex) +
                uint256(sourceBridgeNetwork) *
                _MAX_LEAFS_PER_NETWORK;
        }
        (uint256 wordPos, uint256 bitPos) = _bitmapPositions(globalIndex);
        uint256 mask = 1 << bitPos;
        uint256 flipped = claimedBitMap[wordPos] ^= mask;
        if (flipped & mask == 0) {
            revert AlreadyClaimed();
        }
    }

    /**
     * @notice Function to update the globalExitRoot if the last deposit is not submitted
     */
    function updateGlobalExitRoot() external {
        if (lastUpdatedDepositCount < depositCount) {
            _updateGlobalExitRoot();
        }
    }

    /**
     * @notice Function to update the globalExitRoot
     */
    function _updateGlobalExitRoot() internal {
        lastUpdatedDepositCount = uint32(depositCount);
        globalExitRootManager.updateExitRoot(getRoot());
    }

    /**
     * @notice Function decode an index into a wordPos and bitPos
     * @param index Index
     */
    function _bitmapPositions(
        uint256 index
    ) private pure returns (uint256 wordPos, uint256 bitPos) {
        wordPos = uint248(index >> 8);
        bitPos = uint8(index);
    }

    /**
     * @notice Function to call token permit method of extended ERC20
     + @param token ERC20 token address
     * @param amount Quantity that is expected to be allowed
     * @param permitData Raw data of the call `permit` of the token
     */
    function _permit(
        address token,
        uint256 amount,
        bytes calldata permitData
    ) internal {
        bytes4 sig = bytes4(permitData[:4]);
        if (sig == _PERMIT_SIGNATURE) {
            (
                address owner,
                address spender,
                uint256 value,
                uint256 deadline,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );
            if (owner != msg.sender) {
                revert NotValidOwner();
            }
            if (spender != address(this)) {
                revert NotValidSpender();
            }

            if (value != amount) {
                revert NotValidAmount();
            }

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smartcontract call
            /* solhint-disable avoid-low-level-calls */
            address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE,
                    owner,
                    spender,
                    value,
                    deadline,
                    v,
                    r,
                    s
                )
            );
        } else {
            if (sig != _PERMIT_SIGNATURE_DAI) {
                revert NotValidSignature();
            }

            (
                address holder,
                address spender,
                uint256 nonce,
                uint256 expiry,
                bool allowed,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        bool,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );

            if (holder != msg.sender) {
                revert NotValidOwner();
            }

            if (spender != address(this)) {
                revert NotValidSpender();
            }

            // we call without checking the result, in case it fails and he doesn't have enough balance
            // the following transferFrom should be fail. This prevents DoS attacks from using a signature
            // before the smartcontract call
            /* solhint-disable avoid-low-level-calls */
            address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE_DAI,
                    holder,
                    spender,
                    nonce,
                    expiry,
                    allowed,
                    v,
                    r,
                    s
                )
            );
        }
    }

    /**
     * @notice Internal function that uses create2 to deploy the wrapped tokens
     * @param salt Salt used in create2 params,
     * tokenInfoHash will be used as salt for all wrappeds except for bridge native WETH, that will be bytes32(0)
     * @param constructorArgs Encoded constructor args for the wrapped token
     */
    function _deployWrappedToken(
        bytes32 salt,
        bytes memory constructorArgs
    ) internal returns (TokenWrapped newWrappedToken) {
        bytes memory initBytecode = abi.encodePacked(
            BASE_INIT_BYTECODE_WRAPPED_TOKEN,
            constructorArgs
        );

        /// @solidity memory-safe-assembly
        assembly {
            newWrappedToken := create2(
                0,
                add(initBytecode, 0x20),
                mload(initBytecode),
                salt
            )
        }
        if (address(newWrappedToken) == address(0))
            revert FailedTokenWrappedDeployment();
    }

    // Helpers to safely get the metadata from a token, inspired by https://github.com/traderjoe-xyz/joe-core/blob/main/contracts/MasterChefJoeV3.sol#L55-L95

    /**
     * @notice Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string
     * @param token The address of the ERC-20 token contract
     */
    function _safeSymbol(address token) internal view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20MetadataUpgradeable.symbol, ())
        );
        return success ? _returnDataToString(data) : "NO_SYMBOL";
    }

    /**
     * @notice  Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.
     * @param token The address of the ERC-20 token contract.
     */
    function _safeName(address token) internal view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20MetadataUpgradeable.name, ())
        );
        return success ? _returnDataToString(data) : "NO_NAME";
    }

    /**
     * @notice Provides a safe ERC20.decimals version which returns '18' as fallback value.
     * Note Tokens with (decimals > 255) are not supported
     * @param token The address of the ERC-20 token contract
     */
    function _safeDecimals(address token) internal view returns (uint8) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20MetadataUpgradeable.decimals, ())
        );
        return success && data.length == 32 ? abi.decode(data, (uint8)) : 18;
    }

    /**
     * @notice Function to convert returned data to string
     * returns 'NOT_VALID_ENCODING' as fallback value.
     * @param data returned data
     */
    function _returnDataToString(
        bytes memory data
    ) internal pure returns (string memory) {
        if (data.length >= 64) {
            return abi.decode(data, (string));
        } else if (data.length == 32) {
            // Since the strings on bytes32 are encoded left-right, check the first zero in the data
            uint256 nonZeroBytes;
            while (nonZeroBytes < 32 && data[nonZeroBytes] != 0) {
                nonZeroBytes++;
            }

            // If the first one is 0, we do not handle the encoding
            if (nonZeroBytes == 0) {
                return "NOT_VALID_ENCODING";
            }
            // Create a byte array with nonZeroBytes length
            bytes memory bytesArray = new bytes(nonZeroBytes);
            for (uint256 i = 0; i < nonZeroBytes; i++) {
                bytesArray[i] = data[i];
            }
            return string(bytesArray);
        } else {
            return "NOT_VALID_ENCODING";
        }
    }

    /**
     * @notice Returns the encoded token metadata
     * @param token Address of the token
     */

    function getTokenMetadata(
        address token
    ) public view returns (bytes memory) {
        return
            abi.encode(
                _safeName(token),
                _safeSymbol(token),
                _safeDecimals(token)
            );
    }

    /**
     * @notice Returns the precalculated address of a wrapper using the token address
     * Note Updating the metadata of a token is not supported.
     * Since the metadata has relevance in the address deployed, this function will not return a valid
     * wrapped address if the metadata provided is not the original one.
     * @param originNetwork Origin network
     * @param originTokenAddress Origin token address, 0 address is reserved for ether
     * @param token Address of the token to calculate the wrapper address
     */
    function calculateTokenWrapperAddress(
        uint32 originNetwork,
        address originTokenAddress,
        address token
    ) external view returns (address) {
        return
            precalculatedWrapperAddress(
                originNetwork,
                originTokenAddress,
                _safeName(token),
                _safeSymbol(token),
                _safeDecimals(token)
            );
    }
}
