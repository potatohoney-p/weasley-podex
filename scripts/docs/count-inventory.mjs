import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Count regular files without shell argument limits or following symlinks. */
export function countDirectory(root, { exclude = [], ignoreNames = [], countLines = false, optional = false } = {}) {
    const result = { files: 0, lines: 0, directories: 0 };
    let entries;
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch (error) {
        if (optional && error.code === 'ENOENT') return result;
        throw error;
    }
    function walk(directory, children, prefix = '') {
        for (const entry of children) {
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (exclude.includes(relative) || ignoreNames.includes(entry.name)) continue;
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (!prefix) result.directories += 1;
                walk(path, readdirSync(path, { withFileTypes: true }), relative);
            } else if (entry.isFile()) {
                result.files += 1;
                if (countLines) {
                    // Match wc -l: count LF bytes, including in binary assets;
                    // an unterminated final line does not add to the total.
                    for (const byte of readFileSync(path)) {
                        if (byte === 10) result.lines += 1;
                    }
                }
            }
        }
    }
    walk(root, entries);
    return result;
}

export function collectInventory(root) {
    const publicTree = countDirectory(join(root, 'public'), {
        exclude: ['dist', 'public/dist'], ignoreNames: ['.DS_Store'], countLines: true,
    });
    const source = countDirectory(join(root, 'src'));
    return {
        publicLines: publicTree.lines,
        publicFiles: publicTree.files,
        sourceFiles: source.files,
        sourceDirectories: source.directories,
        testFiles: countDirectory(join(root, 'tests')).files,
        commandFiles: countDirectory(join(root, 'bin/commands')).files,
        publicDistFiles: countDirectory(join(root, 'public/dist'), { optional: true }).files,
    };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const inventory = collectInventory(process.cwd());
    // Fixed field order consumed by structure/verify-counts.sh; never shell code.
    console.log([
        inventory.publicLines, inventory.publicFiles, inventory.sourceFiles,
        inventory.sourceDirectories, inventory.testFiles, inventory.commandFiles,
        inventory.publicDistFiles,
    ].join('\t'));
}
