interface FileSystemEntry {
  name: string;
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
 * Optimized directory traversal using FileSystem API.
 * Bolt: Uses O(N) traversal with shared array and proper readEntries loop.
 */
export const processEntry = async (entry: FileSystemEntry, path = ''): Promise<File[]> => {
  const files: File[] = [];

  const traverse = async (currentEntry: FileSystemEntry, currentPath: string) => {
    if (currentEntry.isFile) {
      const fileEntry = currentEntry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      Object.defineProperty(file, 'webkitRelativePath', {
        value: currentPath + file.name,
        writable: false,
      });
      files.push(file);
    } else if (currentEntry.isDirectory) {
      const dirEntry = currentEntry as FileSystemDirectoryEntry;
      const dirReader = dirEntry.createReader();

      const readAllEntries = async () => {
        const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
          dirReader.readEntries(resolve, reject);
        });

        if (entries.length > 0) {
          for (const child of entries) {
            await traverse(child, currentPath + dirEntry.name + '/');
          }
          // Read next batch (FileSystem API spec requires loop until empty)
          await readAllEntries();
        }
      };

      await readAllEntries();
    }
  };

  await traverse(entry, path);
  return files;
};
