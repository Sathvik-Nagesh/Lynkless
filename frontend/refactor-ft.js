const fs = require('fs');
const path = require('path');

const fileTransferPath = path.join(__dirname, 'src', 'lib', 'webrtc', 'fileTransfer.ts');
let content = fs.readFileSync(fileTransferPath, 'utf8');

// 1. Update imports
content = content.replace(
  "import { getWebRTCManager } from './connection';",
  "import { WebRTCManager } from './connection';"
);

// 2. Remove private webrtc = getWebRTCManager();
content = content.replace(
  "class FileTransferManager {\n  private webrtc = getWebRTCManager();",
  "export class FileTransferManager {"
);

// 3. Update constructor
content = content.replace(
  "constructor() {",
  "constructor(private webrtc: WebRTCManager) {"
);

// 4. Remove singleton
const singletonRegex = /\/\/ Singleton instance\nlet fileTransferManager: FileTransferManager \| null = null;\n\nexport function getFileTransferManager\(\): FileTransferManager \{\n  if \(\!fileTransferManager\) \{\n    fileTransferManager = new FileTransferManager\(\);\n  \}\n  return fileTransferManager;\n\}/g;
content = content.replace(singletonRegex, '');

fs.writeFileSync(fileTransferPath, content);
console.log('Successfully refactored fileTransfer.ts');
