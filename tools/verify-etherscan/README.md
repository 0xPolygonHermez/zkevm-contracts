# Verify etherscan
This is just an example of the `arguments.js` file to provide in etherscan verification command using hardhat.
- Copy example file:
```
cp arguments.js.example arguments.js
```
- Update arguments.js
- Run hardhat command:
```
npx hardhat verify --constructor-args tools/verify-etherscan/arguments.js ${address} --network ${network-name}
```