# IPolygonConsensusBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/112a010b7c8b14335e5fe1a9bffc11bd2459df05/contracts/v2/interfaces/IPolygonConsensusBase.sol)


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

