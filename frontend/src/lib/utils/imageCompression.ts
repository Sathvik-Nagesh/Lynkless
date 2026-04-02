export const compressImage = async (file: File, quality = 0.7): Promise<File> => {
  if (!file.type.startsWith('image/')) return file;
  
  // Don't compress small images or GIFs
  if (file.type === 'image/gif' || file.size < 500 * 1024) return file;

  const url = URL.createObjectURL(file);

  try {
    const img = new Image();
    img.src = url;

    // Bolt: Use img.decode() to decode off-main-thread and improve UI responsiveness.
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
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, width, height);

    // Bolt: Wrap toBlob in a promise for clean async/await flow.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );

    if (!blob) return file;

    // Convert back to File
    const compressedFile = new File([blob], file.name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    // Return the compressed file ONLY if it's actually smaller
    return compressedFile.size < file.size ? compressedFile : file;
  } catch (err) {
    console.warn('[ImageCompression] Optimization failed, using original:', err);
    return file;
  } finally {
    // Bolt: Always revoke object URL to prevent memory leaks.
    URL.revokeObjectURL(url);
  }
};
