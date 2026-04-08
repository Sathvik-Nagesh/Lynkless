import { zip } from 'fflate';

/**
 * Creates a ZIP archive from an array of files.
 * Bolt: Optimized with Promise.all and file.arrayBuffer() for parallelized, zero-copy file reading.
 * This replaces the legacy FileReader and manual counter, reducing execution time and improving readability.
 */
export const createZipFromFiles = async (files: File[], zipName = 'Archive.zip'): Promise<File> => {
  const zippedFiles: Record<string, Uint8Array> = {};

  // Bolt: Read all files in parallel using modern Promise-based API.
  await Promise.all(
    files.map(async (file) => {
      // Preserve directory structure if available via webkitRelativePath
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const buffer = await file.arrayBuffer();
      zippedFiles[path] = new Uint8Array(buffer);
    })
  );

  return new Promise((resolve, reject) => {
    // Bolt: Perform compression using fflate.
    zip(zippedFiles, { level: 6 }, (err, zippedData) => {
      if (err) {
        reject(err);
      } else {
        // Bolt: Wrap zippedData in Uint8Array to satisfy TypeScript BlobPart constraints
        // and ensure compatibility with SharedArrayBuffer subtypes in the Next.js build environment.
        const zipFile = new File([new Uint8Array(zippedData)], zipName, {
          type: 'application/zip',
          lastModified: Date.now()
        });
        resolve(zipFile);
      }
    });
  });
};
