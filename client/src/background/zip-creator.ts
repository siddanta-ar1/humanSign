/**
 * Minimal ZIP file creator for service workers.
 * Creates a valid ZIP archive without external dependencies.
 */

interface ZipEntry {
    name: string;
    content: string;
}

/**
 * Create a ZIP file containing the given entries.
 * Returns a base64-encoded ZIP file.
 */
export function createZip(entries: ZipEntry[]): string {
    const localFileHeaders: Uint8Array[] = [];
    const centralDirectoryHeaders: Uint8Array[] = [];
    let offset = 0;

    const textEncoder = new TextEncoder();

    for (const entry of entries) {
        const nameBytes = textEncoder.encode(entry.name);
        const contentBytes = textEncoder.encode(entry.content);

        // CRC32 calculation
        const crc = crc32(contentBytes);

        // Local file header
        const localHeader = new Uint8Array(30 + nameBytes.length + contentBytes.length);
        const localView = new DataView(localHeader.buffer);

        // Local file header signature
        localView.setUint32(0, 0x04034b50, true);
        // Version needed to extract
        localView.setUint16(4, 20, true);
        // General purpose bit flag
        localView.setUint16(6, 0, true);
        // Compression method (0 = stored)
        localView.setUint16(8, 0, true);
        // File last modification time
        localView.setUint16(10, 0, true);
        // File last modification date
        localView.setUint16(12, 0, true);
        // CRC-32
        localView.setUint32(14, crc, true);
        // Compressed size
        localView.setUint32(18, contentBytes.length, true);
        // Uncompressed size
        localView.setUint32(22, contentBytes.length, true);
        // File name length
        localView.setUint16(26, nameBytes.length, true);
        // Extra field length
        localView.setUint16(28, 0, true);
        // File name
        localHeader.set(nameBytes, 30);
        // File content
        localHeader.set(contentBytes, 30 + nameBytes.length);

        localFileHeaders.push(localHeader);

        // Central directory header
        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);

        // Central directory file header signature
        centralView.setUint32(0, 0x02014b50, true);
        // Version made by
        centralView.setUint16(4, 20, true);
        // Version needed to extract
        centralView.setUint16(6, 20, true);
        // General purpose bit flag
        centralView.setUint16(8, 0, true);
        // Compression method
        centralView.setUint16(10, 0, true);
        // File last modification time
        centralView.setUint16(12, 0, true);
        // File last modification date
        centralView.setUint16(14, 0, true);
        // CRC-32
        centralView.setUint32(16, crc, true);
        // Compressed size
        centralView.setUint32(20, contentBytes.length, true);
        // Uncompressed size
        centralView.setUint32(24, contentBytes.length, true);
        // File name length
        centralView.setUint16(28, nameBytes.length, true);
        // Extra field length
        centralView.setUint16(30, 0, true);
        // File comment length
        centralView.setUint16(32, 0, true);
        // Disk number start
        centralView.setUint16(34, 0, true);
        // Internal file attributes
        centralView.setUint16(36, 0, true);
        // External file attributes
        centralView.setUint32(38, 0, true);
        // Relative offset of local header
        centralView.setUint32(42, offset, true);
        // File name
        centralHeader.set(nameBytes, 46);

        centralDirectoryHeaders.push(centralHeader);
        offset += localHeader.length;
    }

    // Calculate total sizes
    const centralDirectorySize = centralDirectoryHeaders.reduce((sum, h) => sum + h.length, 0);
    const centralDirectoryOffset = offset;

    // End of central directory record
    const endOfCentralDir = new Uint8Array(22);
    const endView = new DataView(endOfCentralDir.buffer);

    // End of central directory signature
    endView.setUint32(0, 0x06054b50, true);
    // Number of this disk
    endView.setUint16(4, 0, true);
    // Disk where central directory starts
    endView.setUint16(6, 0, true);
    // Number of central directory records on this disk
    endView.setUint16(8, entries.length, true);
    // Total number of central directory records
    endView.setUint16(10, entries.length, true);
    // Size of central directory
    endView.setUint32(12, centralDirectorySize, true);
    // Offset of start of central directory
    endView.setUint32(16, centralDirectoryOffset, true);
    // Comment length
    endView.setUint16(20, 0, true);

    // Combine all parts
    const totalLength = offset + centralDirectorySize + 22;
    const zipData = new Uint8Array(totalLength);
    let pos = 0;

    for (const header of localFileHeaders) {
        zipData.set(header, pos);
        pos += header.length;
    }
    for (const header of centralDirectoryHeaders) {
        zipData.set(header, pos);
        pos += header.length;
    }
    zipData.set(endOfCentralDir, pos);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < zipData.length; i++) {
        binary += String.fromCharCode(zipData[i]);
    }
    return btoa(binary);
}

/**
 * CRC32 calculation for ZIP file integrity.
 */
function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    const table = getCRC32Table();

    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table: Uint32Array | null = null;

function getCRC32Table(): Uint32Array {
    if (crc32Table) return crc32Table;

    crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }
    return crc32Table;
}
