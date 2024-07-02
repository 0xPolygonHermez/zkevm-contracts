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
        // Copy the ignored contracts to the original file name
        var renamedFiles: string[] = [];
        IGNORED_CONTRACTS.forEach((contract) => {
            var sourceFilePath = path.join(contract);
            var renamedContract = contract.replace(".ignored", "");
            var destinationFilePath = path.join(renamedContract);
            renamedFiles.push(destinationFilePath);
            console.log(`Copying ${sourceFilePath} to ${destinationFilePath}`);
            copyFile(sourceFilePath, destinationFilePath);
        });

        // Run the original compile task
        if (runSuper.isDefined) {
            await runSuper();
        }

        // Delete the copied ignored after the compilation
        // Note: Check the artifacts folder to see if the ignored contracts are compiled
        renamedFiles.forEach((file) => {
            console.log(`Deleting ${file}`);
            deleteFile(file);
        });
    }
);

/**
 * Copy a file from sourcePath to destinationPath
 * @param sourcePath
 * @param destinationPath
 */
async function copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
        await fs.copyFile(sourcePath, destinationPath);
        console.log(`Successfully copied ${sourcePath} to ${destinationPath}`);
    } catch (error) {
        console.error(`Failed to copy file: ${error}`);
    }
}

/**
 * Delete a file from the file system
 * @param filePath
 */
async function deleteFile(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
        console.log(`Successfully deleted ${filePath}`);
    } catch (error) {
        console.error(`Failed to delete file: ${error}`);
    }
}
