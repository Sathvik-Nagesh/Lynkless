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
        let files: File[] = [];
        for (const child of entries) {
          const childFiles = await processEntry(child, path + entry.name + '/');
          files = files.concat(childFiles);
        }
        resolve(files);
      });
    });
  }
  return [];
};
