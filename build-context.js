const fs = require('fs');
const path = require('path');

const sourceDir = __dirname;
const destDir = path.join(__dirname, 'dist_build');

// Ensure destination exists and is empty
if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir);

console.log(`Building frontend context in ${destDir}...`);

// Helper to copy file
function copyFile(file) {
    const srcPath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);
    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file}`);
    }
}

// Helper to copy directory
function copyDir(dir) {
    const srcPath = path.join(sourceDir, dir);
    const destPath = path.join(destDir, dir);

    if (!fs.existsSync(srcPath)) return;

    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath);

    const entries = fs.readdirSync(srcPath, { withFileTypes: true });
    for (let entry of entries) {
        const fullSrcPath = path.join(srcPath, entry.name);
        const fullDestPath = path.join(destPath, entry.name);

        if (entry.isDirectory()) {
            // Recursively copy subdirectory
            const subDirDest = path.join(destPath, entry.name);
            if (!fs.existsSync(subDirDest)) fs.mkdirSync(subDirDest);

            // Simple recursive copy function for subdirectories
            const copyRecursive = (src, dest) => {
                const items = fs.readdirSync(src, { withFileTypes: true });
                for (let item of items) {
                    const s = path.join(src, item.name);
                    const d = path.join(dest, item.name);
                    if (item.isDirectory()) {
                        if (!fs.existsSync(d)) fs.mkdirSync(d);
                        copyRecursive(s, d);
                    } else {
                        fs.copyFileSync(s, d);
                    }
                }
            };
            copyRecursive(fullSrcPath, fullDestPath);

        } else {
            fs.copyFileSync(fullSrcPath, fullDestPath);
        }
    }
    console.log(`Copied directory ${dir}`);
}

// Execute copies
copyFile('index.html');
copyDir('public');
copyDir('src');

console.log('Build context prepared successfully.');
