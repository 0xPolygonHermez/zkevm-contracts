import { assertStorageUpgradeSafe } from '@openzeppelin/upgrades-core';

type StorageLayout = Parameters<typeof assertStorageUpgradeSafe>[0];

export type CompilerStorageLayout = Omit<StorageLayout, 'storage'> & {
    storage: Omit<StorageLayout['storage'][number], 'src'>[];
};

export function assertCompatibleStorage(original: CompilerStorageLayout, updated: CompilerStorageLayout) {
    // Raw solc layouts omit diagnostic source locations; preserve every slot and type while supplying them.
    const withSourceLocations = (layout: CompilerStorageLayout): StorageLayout => ({
        ...layout,
        storage: layout.storage.map((entry) => ({ ...entry, src: entry.contract })),
    });
    assertStorageUpgradeSafe(withSourceLocations(original), withSourceLocations(updated), false);
}
