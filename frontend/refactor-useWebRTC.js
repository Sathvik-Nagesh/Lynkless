const fs = require('fs');
const path = require('path');

const hookPath = path.join(__dirname, 'src', 'hooks', 'useWebRTC.ts');
let content = fs.readFileSync(hookPath, 'utf8');

// 1. Remove imports of singletons
content = content.replace(
  /import \{\n  getWebRTCManager,\n  getFileTransferManager,\n  getChatManager,\n\} from '@\/lib\/webrtc';\n/g,
  "import { useEngine } from '@/context/EngineContext';\n"
);

// Fallback if imported from connection/fileTransfer/chat
content = content.replace(
  /import \{ getWebRTCManager \} from '\.\.\/lib\/webrtc\/connection';\n/g,
  ""
);
content = content.replace(
  /import \{ getFileTransferManager \} from '\.\.\/lib\/webrtc\/fileTransfer';\n/g,
  ""
);
content = content.replace(
  /import \{ getChatManager \} from '\.\.\/lib\/webrtc\/chat';\n/g,
  ""
);

content = content.replace(
  "import { getWebRTCManager, getFileTransferManager, getChatManager } from '@/lib/webrtc';",
  "import { useEngine } from '@/context/EngineContext';"
);


// 2. Replace the refs with useEngine
content = content.replace(
  "  const webrtcRef = useRef(getWebRTCManager());\n  const fileTransferRef = useRef(getFileTransferManager());\n  const chatRef = useRef(getChatManager());",
  "  const engine = useEngine();\n  const webrtcRef = useRef(engine.webrtc);\n  const fileTransferRef = useRef(engine.fileTransfer);\n  const chatRef = useRef(engine.chat);"
);

fs.writeFileSync(hookPath, content);
console.log('Successfully refactored useWebRTC.ts');
