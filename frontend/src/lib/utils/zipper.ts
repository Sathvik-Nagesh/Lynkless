import { zip } from 'fflate';

/**
 * Creates a ZIP archive from a list of files.
 * Bolt: Optimized using parallel file reading and memory-efficient buffer handling.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  // Bolt: Use Promise.all() and file.arrayBuffer() for parallel, non-blocking file reading.
  // This is significantly faster than sequential FileReader operations.
  const fileData = await Promise.all(
    files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      // Bolt: Use type assertion instead of 'any' to preserve type safety while accessing webkitRelativePath
      const path = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return { path, buffer: new Uint8Array(buffer) };
    })
  );

  const zippedFiles: Record<string, Uint8Array> = {};
  fileData.forEach(({ path, buffer }) => {
    zippedFiles[path] = buffer;
  });

  return new Promise((resolve, reject) => {
    // Bolt: ZIP with level 6 compression (good balance of speed vs ratio)
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Bolt: Pass the underlying buffer directly to the File constructor.
      // Using zippedData.buffer ensures we pass a single contiguous BlobPart.
      // Cast to BlobPart[] for compatibility with TypeScript when SharedArrayBuffer is present in scope.
      const zipFile = new File([zippedData.buffer as BlobPart], zipName, {
        type: 'application/zip',
        lastModified: Date.now()
      });
      resolve(zipFile);
    });
  });
};
