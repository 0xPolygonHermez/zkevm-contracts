# IPolygonConsensusBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IPolygonConsensusBase.sol)


## Functions
### initialize


```solidity
function initialize(
    address _admin,
    address sequencer,
    uint32 networkID,
    address gasTokenAddress,
    string memory sequencerURL,
    string memory _networkName
) external;
```

### admin


```solidity
function admin() external view returns (address);
```

## Errors
### AdminCannotBeZeroAddress
Thrown when trying to set the admin to the zero address


```solidity
error AdminCannotBeZeroAddress();
```

