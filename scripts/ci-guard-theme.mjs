import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_PATTERNS = [
  /prefers-color-scheme\s*:\s*dark/i,
  /data-bs-theme\s*=\s*["']dark["']/i,
  /data-theme\s*=\s*["']dark["']/i
];

const SEARCH_DIRS = ['apps', 'packages'];
const EXTENSIONS = ['.html', '.css', '.scss', '.sass', '.js', '.jsx', '.ts', '.tsx', '.json'];

let violations = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  FORBIDDEN_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) {
      violations.push({ filePath, pattern: pattern.toString() });
    }
  });
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        walkDir(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.includes(ext)) {
        checkFile(fullPath);
      }
    }
  }
}

console.log('Running Innkeeper CI Light-Theme Guard...');
for (const dir of SEARCH_DIRS) {
  walkDir(path.resolve(dir));
}

if (violations.length > 0) {
  console.error('\x1b[31m[ERROR] CI Light-Theme Guard Failed! Dark mode references found:\x1b[0m');
  violations.forEach(v => console.error(`  - ${v.filePath} matched forbidden pattern ${v.pattern}`));
  process.exit(1);
} else {
  console.log('\x1b[32m[PASS] CI Light-Theme Guard: Strictly light theme verified.\x1b[0m');
}
