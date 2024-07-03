import {task} from "hardhat/config";
import fs from "fs/promises";
import path from "path";

const IGNORED_CONTRACTS = [
    "contracts/PolygonZkEVMBridgeV2.sol.ignored",
    "contracts/outdated/mocks/DaiMock.sol.ignored",
    "contracts/outdated/mocks/Uni.sol.ignored",
];

/**
 * This task overrides the original compile task to allow compilation of ignored contracts
 */
task("compile", "Compiles the entire project, building all artifacts and build ignored contracts.").setAction(
    async (args, hre, runSuper) => {
        // Rename the ignored contracts to the original file name to allow compilation
        var renamedFiles: string[] = [];
        IGNORED_CONTRACTS.forEach((contract) => {
            var sourceFilePath = path.join(contract);
            var renamedContract = contract.replace(".ignored", "");
            var destinationFilePath = path.join(renamedContract);
            renamedFiles.push(destinationFilePath);
            renameFile(sourceFilePath, destinationFilePath);
        });

        // Run the original compile task
        if (runSuper.isDefined) {
            await runSuper();
        }

        // Revert the renaming of the ignored contracts
        // Note: Check the artifacts folder to see if the ignored contracts are compiled
        renamedFiles.forEach((file) => {
            var originalFilePath = file + ".ignored";
            renameFile(file, originalFilePath);
        });
    }
);

/**
 * Rename a file from sourcePath to destinationPath
 * @param sourcePath
 * @param destinationPath
 */
async function renameFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
        await fs.rename(sourcePath, destinationPath);
        console.log(`Successfully renamed from ${sourcePath} to ${destinationPath}`);
    } catch (error) {
        console.error(`Failed to rename file: ${error}`);
    }
}
