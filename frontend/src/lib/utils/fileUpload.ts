/**
 * FileSystem API Types for improved safety
 */
export interface FileSystemEntry {
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly name: string;
  readonly fullPath: string;
}

export interface FileSystemFileEntry extends FileSystemEntry {
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

export interface FileSystemDirectoryReader {
  readEntries(successCallback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: Error) => void): void;
}

export interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader(): FileSystemDirectoryReader;
}

/**
 * Process a FileSystemEntry (file or directory) recursively.
 * Bolt: Optimized with a shared results array to avoid O(N^2) concat operations
 * and a robust loop for readEntries to ensure all items are processed.
 */
export const processEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  const results: File[] = [];
  await traverseEntry(entry, '', results);
  return results;
};

/**
 * Recursive helper for directory traversal
 */
async function traverseEntry(entry: FileSystemEntry, path: string, results: File[]): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file((file: File) => {
        // Bolt: Use Object.defineProperty to set webkitRelativePath without cloning the file
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
          configurable: true
        });
        results.push(file);
        resolve();
      });
    });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const dirReader = dirEntry.createReader();

    // Bolt: readEntries must be called in a loop until it returns an empty array
    // to guarantee all directory contents are read (as per FileSystem API spec).
    const readAllEntries = async (): Promise<FileSystemEntry[]> => {
      return new Promise((resolve, reject) => {
        const allEntries: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries((entries) => {
            if (entries.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          }, (err) => {
            reject(err instanceof Error ? err : new Error(String(err)));
          });
        };
        readBatch();
      });
    };

    try {
      const entries = await readAllEntries();
      for (const child of entries) {
        await traverseEntry(child, path + entry.name + '/', results);
      }
    } catch (err) {
      console.error('[FileUpload] Failed to read directory:', entry.name, err);
    }
  }
}
