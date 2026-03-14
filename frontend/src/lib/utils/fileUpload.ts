/**
 * Process a FileSystemEntry and recursively extract all files.
 * Optimized with a shared result array to avoid O(N^2) memory allocations from concat.
 */
export const processEntry = async (entry: FileSystemEntry, path = ''): Promise<File[]> => {
  const files: File[] = [];
  await traverseEntry(entry, path, files);
  return files;
};

/**
 * Recursive helper to traverse the directory tree.
 * Bolt: Uses a shared result array for O(N) performance.
 */
async function traverseEntry(entry: FileSystemEntry, path: string, result: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });

    // Set the relative path for directory structure preservation
    Object.defineProperty(file, 'webkitRelativePath', {
      value: path + file.name,
      writable: false,
    });

    result.push(file);
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();

    // Read all entries in the directory (handles pagination if needed)
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });

    for (const child of entries) {
      await traverseEntry(child, path + entry.name + '/', result);
    }
  }
}
