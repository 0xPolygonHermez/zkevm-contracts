# IEmergencyManager
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/c0e111af46ac2964bd5177034698d7e5e691f362/contracts/interfaces/IEmergencyManager.sol)


## Functions
### isEmergencyState

Returns whether the emergency state is active


```solidity
function isEmergencyState() external view returns (bool);
```

## Events
### EmergencyStateActivated
Emitted when emergency state is activated


```solidity
event EmergencyStateActivated();
```

### EmergencyStateDeactivated
Emitted when emergency state is deactivated


```solidity
event EmergencyStateDeactivated();
```

## Errors
### OnlyNotEmergencyState
Thrown when emergency state is active, and the function requires otherwise


```solidity
error OnlyNotEmergencyState();
```

### OnlyEmergencyState
Thrown when emergency state is not active, and the function requires otherwise


```solidity
error OnlyEmergencyState();
```

