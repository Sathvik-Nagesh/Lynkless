interface FileSystemEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

interface FileSystemFileEntry extends FileSystemEntry {
  isFile: true;
  isDirectory: false;
  file(callback: (file: File) => void, errorCallback?: (error: unknown) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    callback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: unknown) => void
  ): void;
}

/**
 * Recursively traverses a FileSystemEntry and adds all found files to the result array.
 * Bolt: Using a shared array and push() provides O(N) performance, avoiding the O(N^2) overhead
 * and memory spikes caused by Array.prototype.concat in deep directory structures.
 */
async function traverseEntry(
  entry: FileSystemEntry,
  path: string,
  result: File[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file((file: File) => {
        // preserve directory structure in webkitRelativePath for zipper/display
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
        });
        result.push(file);
        resolve();
      });
    });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();

    // Bolt: readEntries() can return partial results according to spec.
    // We must call it repeatedly until it returns an empty array to ensure all files are captured.
    const readAllEntries = (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        let allEntries: FileSystemEntry[] = [];
        const read = () => {
          dirReader.readEntries((entries) => {
            if (entries.length > 0) {
              allEntries = allEntries.concat(entries);
              read();
            } else {
              resolve(allEntries);
            }
          }, (error) => reject(error));
        };
        read();
      });
    };

    const entries = await readAllEntries();
    for (const child of entries) {
      await traverseEntry(child, path + entry.name + '/', result);
    }
  }
}

/**
 * Processes a FileSystemEntry (from drag & drop) into a flat array of Files with relative paths.
 * Bolt: Optimized for large directory structures with O(N) traversal.
 */
export const processEntry = async (entry: unknown, path = ''): Promise<File[]> => {
  const result: File[] = [];
  await traverseEntry(entry as FileSystemEntry, path, result);
  return result;
};
