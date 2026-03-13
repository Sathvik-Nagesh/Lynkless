export const processEntry = async (entry: any, path = ''): Promise<File[]> => {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file: File) => {
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
        });
        resolve([file]);
      });
    });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    return new Promise((resolve) => {
      dirReader.readEntries(async (entries: any[]) => {
        const files: File[] = [];
        for (const child of entries) {
          const childFiles = await processEntry(child, path + entry.name + '/');
          // Bolt: Using for...of with push is O(N) and avoids both the intermediate array
          // creation of concat() AND the stack-size limits of spread (...).
          for (const file of childFiles) {
            files.push(file);
          }
        }
        resolve(files);
      });
    });
  }
  return [];
};
