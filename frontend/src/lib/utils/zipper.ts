import { zip } from 'fflate';

/**
 * Creates a ZIP archive from an array of Files.
 * Bolt: Optimized with Promise.all() and file.arrayBuffer() for parallel reading.
 * Uses a zero-copy approach where possible and avoids legacy FileReader callbacks.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  const zippedFiles: Record<string, Uint8Array> = {};

  // Bolt: Read all files in parallel using the modern arrayBuffer() API.
  // This is significantly faster than sequential FileReader callbacks for large batches.
  await Promise.all(
    files.map(async (file) => {
      // Determine the path, fallback to just the file name.
      // Use type assertion to access non-standard webkitRelativePath safely.
      const path = (file as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const buffer = await file.arrayBuffer();
      zippedFiles[path] = new Uint8Array(buffer);
    })
  );

  return new Promise((resolve, reject) => {
    // Bolt: level 6 is a good balance between compression ratio and CPU usage.
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
      } else {
        // Bolt: Wrap zippedData in a new Uint8Array to ensure we only include
        // the actual zipped content. This avoids potential memory issues if
        // the underlying buffer is larger than the data view.
        const zipFile = new File([new Uint8Array(zippedData)], zipName, {
          type: 'application/zip',
          lastModified: Date.now()
        });
        resolve(zipFile);
      }
    });
  });
};
