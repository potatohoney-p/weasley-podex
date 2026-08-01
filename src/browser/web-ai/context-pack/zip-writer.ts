import { promises as fs } from 'node:fs';
import { posix as pathPosix } from 'node:path';

export interface ZipTextEntry {
    name: string;
    content: string | Buffer;
}

interface PreparedZipEntry {
    name: string;
    data: Buffer;
    crc32: number;
    localHeaderOffset: number;
}

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc >>> 0;
}

export async function writeStoredZip(outputPath: string, entries: ZipTextEntry[]): Promise<void> {
    const prepared: PreparedZipEntry[] = [];
    const chunks: Buffer[] = [];
    let offset = 0;
    const { dosDate, dosTime } = toDosDateTime(new Date());

    for (const entry of entries) {
        const name = safeZipEntryName(entry.name);
        if (!name) continue;
        const data = Buffer.isBuffer(entry.content)
            ? entry.content
            : Buffer.from(entry.content, 'utf8');
        const nameBytes = Buffer.from(name, 'utf8');
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
        localHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
        localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
        localHeader.writeUInt16LE(ZIP_STORE_METHOD, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        const crc32Value = crc32(data);
        localHeader.writeUInt32LE(crc32Value, 14);
        localHeader.writeUInt32LE(data.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(nameBytes.length, 26);
        localHeader.writeUInt16LE(0, 28);
        chunks.push(localHeader, nameBytes, data);
        prepared.push({ name, data, crc32: crc32Value, localHeaderOffset: offset });
        offset += localHeader.length + nameBytes.length + data.length;
    }

    const centralDirectoryOffset = offset;
    for (const entry of prepared) {
        const nameBytes = Buffer.from(entry.name, 'utf8');
        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER, 0);
        centralHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
        centralHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 6);
        centralHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
        centralHeader.writeUInt16LE(ZIP_STORE_METHOD, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(entry.crc32, 16);
        centralHeader.writeUInt32LE(entry.data.length, 20);
        centralHeader.writeUInt32LE(entry.data.length, 24);
        centralHeader.writeUInt16LE(nameBytes.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);
        chunks.push(centralHeader, nameBytes);
        offset += centralHeader.length + nameBytes.length;
    }

    const centralDirectorySize = offset - centralDirectoryOffset;
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(prepared.length, 8);
    endRecord.writeUInt16LE(prepared.length, 10);
    endRecord.writeUInt32LE(centralDirectorySize, 12);
    endRecord.writeUInt32LE(centralDirectoryOffset, 16);
    endRecord.writeUInt16LE(0, 20);
    chunks.push(endRecord);

    await fs.writeFile(outputPath, Buffer.concat(chunks));
}

export function safeZipEntryName(entryName: string): string | null {
    const raw = String(entryName || '').replace(/\\/g, '/');
    const normalized = pathPosix.normalize(raw);
    if (
        raw.split('/').includes('..') ||
        normalized === '.' ||
        normalized === '..' ||
        normalized.startsWith('../') ||
        pathPosix.isAbsolute(normalized) ||
        /^[A-Za-z]:(?:\/|$)/.test(normalized)
    ) {
        return null;
    }
    return normalized;
}

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { dosDate: number; dosTime: number } {
    const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);
    return {
        dosDate: ((year - 1980) << 9) | (month << 5) | day,
        dosTime: (hours << 11) | (minutes << 5) | seconds,
    };
}
