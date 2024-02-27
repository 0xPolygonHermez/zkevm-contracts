const fs = require('fs')
const path = require('path')

const compileContracts = {}
const pathToCompiledContracts = path.join(__dirname, './compiled-contracts')

function exportCompileContracts(pathDir) {
    fs.readdirSync(pathDir).forEach(file => {
        const fullName = path.join(pathDir, file)
        const pathInfo = path.parse(fullName);

        if (pathInfo.ext === '.json') {
            compileContracts[pathInfo.name] = require(fullName);
        }
    })
}

exportCompileContracts(pathToCompiledContracts);

module.exports = compileContracts;
