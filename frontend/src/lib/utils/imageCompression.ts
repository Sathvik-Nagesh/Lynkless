/**
 * Image Compression Utility
 * Optimizes images before transfer to save bandwidth and speed up delivery.
 */

export const compressImage = async (file: File, quality = 0.7): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  
  // Don't compress small images or GIFs
  if (file.type === 'image/gif' || file.size < 500 * 1024) return file;

  // Bolt: Use ObjectURL instead of FileReader to avoid CPU-heavy Base64 encoding.
  // ObjectURL is O(1) memory pointer, while Base64 is O(N) copy that is 33% larger.
  const objectUrl = URL.createObjectURL(file);


  try {
    const img = new Image();
    img.src = objectUrl;

    // Bolt: Move image decoding off the main thread to prevent UI jank.
    // decode() returns a promise that resolves when the image is ready to be drawn.
    await img.decode();

    // Calculate new dimensions (max 1920x1080 bounding box roughly)
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      return file; // Fallback to original
    }

    ctx.drawImage(img, 0, 0, width, height);

    // Bolt: Revoke the ObjectURL as soon as the image is drawn to canvas to free memory.
    URL.revokeObjectURL(objectUrl);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        // Convert back to File
        const compressedFile = new File([blob], file.name, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        // Return the compressed file ONLY if it's actually smaller
        if (compressedFile.size < file.size) {
          resolve(compressedFile);
        } else {
          resolve(file);
        }
      }, 'image/jpeg', quality);
    });
  } catch (err) {
    // Bolt: Ensure ObjectURL is revoked even on error.
    URL.revokeObjectURL(objectUrl);
    console.warn('[ImageCompression] Optimization failed, using original file:', err);
    return file; // Fallback on error
  }
};
