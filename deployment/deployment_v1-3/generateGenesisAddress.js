const fs = require('fs');
const path = require('path');

const deployParameters = require("./deploy_parameters.json");
const pathOutputJson = path.join(__dirname, './deploy_parameters.json');

const addressTable =
    `
    |                  Address                   |      Owner      |
    |:------------------------------------------:|:---------------:|
    | 0xA67CD3f603E42dcBF674ffBa511872Bd397EB895 |                 |
    | 0xbAe5deBDDf9381686ec18a8A2B99E09ADa982adf |                 |
    | 0xfcFC415D6D21660b90c0545CA0e91E68172B8650 |                 |
    | 0x999b52bE90FA59fCaEf59d7243FD874aF3E43E04 |                 |
    | 0x2536C2745Ac4A584656A830f7bdCd329c94e8F30 |                 |
    | 0x380ed8Bd696c78395Fb1961BDa42739D2f5242a1 |                 |
    | 0xd873F6DC68e3057e4B7da74c6b304d0eF0B484C7 |                 |
    | 0x1EA2EBB132aBD1157831feE038F31A39674b9992 |                 |
    | 0xb48cA794d49EeC406A5dD2c547717e37b5952a83 |                 |
    | 0xCF7A13951c6F804E334C39F2eD81D79317e65093 |                 |
    | 0x56b2118d90cCA76E4683EfECEEC35662372d64Cd |                 |
    | 0xd66d09242faa9b3beae711f89d8fff0946974a21 |                 |
    | 0x615031554479128d65f30Ffa721791D6441d9727 |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |
    |                                            |                 |    
`
// Get address array
let currentIndex = addressTable.indexOf("0x");;
const addressArray = [];
while (currentIndex != -1) {
    const currentAddres = addressTable.slice(currentIndex, currentIndex + 41) // 20bytes * 2 character/byte + 0x(2 characters) = 42 characters
    addressArray.push(currentAddres);
    currentIndex = addressTable.indexOf("0x", currentIndex + 1);
}

// Edit genesis array from file
const genesis = deployParameters.genesis;
const addressesGenesis = genesis.map(accountObject => accountObject.address)
console.log(addressesGenesis);

for (let i = 0; i < addressArray.length; i++) {
    const currentAddres = addressArray[i];
    if (!addressesGenesis.includes(currentAddres)) {
        const currentObject = { address: currentAddres };
        genesis.push(currentObject);
    }
}

fs.writeFileSync(pathOutputJson, JSON.stringify(deployParameters, null, 1));