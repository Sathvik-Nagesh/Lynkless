interface FileSystemEntry {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
}

interface FileSystemFileEntry extends FileSystemEntry {
  isFile: true;
  isDirectory: false;
  file(successCallback: (file: File) => void, errorCallback?: (error: unknown) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  isFile: false;
  isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(successCallback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: unknown) => void): void;
}

/**
 * Process a FileSystemEntry recursively to extract all files.
 * Bolt: Uses a recursive helper with shared result array and push() to achieve O(N) performance,
 * avoiding the O(N^2) complexity and memory overhead of Array.prototype.concat in a loop.
 */
export const processEntry = async (entry: unknown, path = ''): Promise<File[]> => {
  const allFiles: File[] = [];

  const traverse = async (currentEntry: unknown, currentPath: string): Promise<void> => {
    const entry = currentEntry as FileSystemEntry;
    if (entry.isFile) {
      const fileEntry = currentEntry as FileSystemFileEntry;
      return new Promise((resolve) => {
        fileEntry.file((file: File) => {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: currentPath + file.name,
            writable: false,
          });
          allFiles.push(file);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirEntry = currentEntry as FileSystemDirectoryEntry;
      const dirReader = dirEntry.createReader();

      return new Promise((resolve) => {
        dirReader.readEntries(async (entries: FileSystemEntry[]) => {
          // Process all entries in this directory sequentially to maintain order and control concurrency
          for (const child of entries) {
            await traverse(child, currentPath + dirEntry.name + '/');
          }
          resolve();
        });
      });
    }
  };

  await traverse(entry, path);
  return allFiles;
};
