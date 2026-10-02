export class E2EEHelper {
  private static readonly METADATA_SIZE = 28; // 16 bytes salt + 12 bytes IV
  private static readonly MAX_E2EE_SIZE = 512 * 1024 * 1024; // 512MB safety cap

  // Derive a 256-bit AES-GCM key from a password
  private static async deriveKey(password: string, salt: Uint8Array, keyUsages: KeyUsage[]): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      keyUsages
    );
  }

  static async encryptFile(file: File, password?: string): Promise<File> {
    if (!password) return file;
    if (file.size > this.MAX_E2EE_SIZE) {
      throw new Error('E2EE is currently limited to files under 512MB for browser memory safety.');
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await this.deriveKey(password, salt, ["encrypt"]);
    const arrayBuffer = await file.arrayBuffer();
    
    // Encrypt the entire file
    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      arrayBuffer
    );

    // Bolt: Use zero-copy approach by passing an array of buffers to the File constructor.
    // This avoids creating a full copy of the encrypted data in a new Uint8Array.
    return new File([salt, iv, encryptedData], `${file.name}.encrypted`, { type: 'application/octet-stream' });
  }

  static async decryptFile(file: File, password?: string): Promise<File> {
    const encryptedRegex = /\.encrypted$/i;
    if (!password || !encryptedRegex.test(file.name)) return file;
    if (file.size > this.MAX_E2EE_SIZE + this.METADATA_SIZE) {
      throw new Error('Encrypted file is too large for in-memory decryption. Use smaller files for now.');
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength <= this.METADATA_SIZE) {
      throw new Error("Invalid encrypted file: too small");
    }

    // Bolt: Use zero-copy approach by creating a view on the existing buffer.
    const salt = new Uint8Array(arrayBuffer, 0, 16);
    const iv = new Uint8Array(arrayBuffer, 16, 12);
    const encryptedData = new Uint8Array(arrayBuffer, 28); // Zero-copy view

    const key = await this.deriveKey(password, salt, ["decrypt"]);
    
    try {
      const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encryptedData
      );

      // Remove .encrypted from filename (case-insensitive)
      const originalName = file.name.replace(encryptedRegex, '');
      
      // Attempt to preserve the file type if it was originally there
      // or default to octet-stream which is safer than empty string
      return new File([decryptedData], originalName, { 
        type: 'application/octet-stream',
        lastModified: file.lastModified 
      });
    } catch (e) {
      console.error(e);
      throw new Error("Decryption failed. Incorrect password?");
    }
  }
}
