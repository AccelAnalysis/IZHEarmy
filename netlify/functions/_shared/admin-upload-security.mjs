import { getStore } from '@netlify/blobs';
import { randomToken, sha256 } from './admin-crypto.mjs';

const QUARANTINE_STORE = 'izhe-upload-quarantine';
const IMAGE_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
const JPEG_METADATA_MARKERS = new Set([0xE1, 0xED, 0xFE]);
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED = 50 * 1024 * 1024;
const MAX_ZIP_RATIO = 100;

export const MEDIA_UPLOAD_TYPES = Object.freeze({
  'image/jpeg': { extensions: ['jpg', 'jpeg'], storageExtension: 'jpg', kind: 'image' },
  'image/png': { extensions: ['png'], storageExtension: 'png', kind: 'image' },
  'image/webp': { extensions: ['webp'], storageExtension: 'webp', kind: 'image' }
});

export const TEACHING_UPLOAD_TYPES = Object.freeze({
  ...MEDIA_UPLOAD_TYPES,
  'application/pdf': { extensions: ['pdf'], storageExtension: 'pdf', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extensions: ['pptx'], storageExtension: 'pptx', kind: 'office-presentation' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensions: ['docx'], storageExtension: 'docx', kind: 'office-document' },
  'text/plain': { extensions: ['txt'], storageExtension: 'txt', kind: 'text' },
  'audio/mpeg': { extensions: ['mp3'], storageExtension: 'mp3', kind: 'audio' },
  'audio/mp4': { extensions: ['m4a'], storageExtension: 'm4a', kind: 'audio' },
  'video/mp4': { extensions: ['mp4'], storageExtension: 'mp4', kind: 'video' }
});

function uploadError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

export function sanitizeDisplayFilename(value, max = 180) {
  const normalized = String(value || 'upload')
    .normalize('NFKC')
    .split(/[\\/]/)
    .at(-1)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^a-zA-Z0-9 ._()\-]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, max);
  return normalized || 'upload';
}

function extensionOf(filename) {
  const match = sanitizeDisplayFilename(filename).toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || '';
}

function assertFileLike(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.type !== 'string') {
    throw uploadError('Choose a file to upload.');
  }
}

function detectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(signature);
}

function detectJpeg(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
}

function detectWebp(buffer) {
  return buffer.length >= 16
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

function detectPdf(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function detectMp3(buffer) {
  if (buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return true;
  return buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0;
}

function mp4Brand(buffer) {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return '';
  return buffer.subarray(8, 12).toString('ascii');
}

function findZipEnd(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054B50) return offset;
  }
  return -1;
}

function inspectZip(buffer) {
  const endOffset = findZipEnd(buffer);
  if (endOffset < 0) throw uploadError('The Office document ZIP structure is invalid.');
  const entries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entries < 1 || entries > MAX_ZIP_ENTRIES || centralOffset + centralSize > buffer.length) {
    throw uploadError('The Office document ZIP directory is invalid or too large.');
  }
  const names = [];
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014B50) {
      throw uploadError('The Office document ZIP directory is malformed.');
    }
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > buffer.length) throw uploadError('The Office document ZIP directory is truncated.');
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (!name || name.includes('\0') || name.startsWith('/') || name.startsWith('\\') || name.split(/[\\/]/).includes('..')) {
      throw uploadError('The Office document contains an unsafe archive path.');
    }
    names.push(name);
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    offset = next;
  }
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED) throw uploadError('The Office document expands beyond the permitted size.');
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_ZIP_RATIO) {
    throw uploadError('The Office document has an unsafe compression ratio.');
  }
  if (names.some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))) {
    throw uploadError('Macro-enabled Office files are not allowed.');
  }
  if (!names.includes('[Content_Types].xml')) throw uploadError('The Office document is missing its content-type manifest.');
  return { names, entries, totalCompressed, totalUncompressed };
}

function detectOffice(buffer) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034B50) return null;
  const zip = inspectZip(buffer);
  if (zip.names.includes('word/document.xml')) {
    return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'office-document', zip };
  }
  if (zip.names.includes('ppt/presentation.xml')) {
    return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'office-presentation', zip };
  }
  throw uploadError('Only DOCX and PPTX Office packages are allowed.');
}

function detectText(buffer) {
  if (!buffer.length || buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function detectUploadType(buffer, declaredMime) {
  if (detectJpeg(buffer)) return { mime: 'image/jpeg', kind: 'image' };
  if (detectPng(buffer)) return { mime: 'image/png', kind: 'image' };
  if (detectWebp(buffer)) return { mime: 'image/webp', kind: 'image' };
  if (detectPdf(buffer)) return { mime: 'application/pdf', kind: 'document' };
  const office = detectOffice(buffer);
  if (office) return office;
  if (detectMp3(buffer)) return { mime: 'audio/mpeg', kind: 'audio' };
  const brand = mp4Brand(buffer);
  if (brand) {
    const audioBrand = /^(M4A |M4B |F4A |F4B )$/.test(brand);
    return { mime: audioBrand || declaredMime === 'audio/mp4' ? 'audio/mp4' : 'video/mp4', kind: audioBrand ? 'audio' : 'video', brand };
  }
  if (declaredMime === 'text/plain' && detectText(buffer)) return { mime: 'text/plain', kind: 'text' };
  throw uploadError('The file signature does not match an allowed upload type.');
}

function jpegDimensions(buffer) {
  const startOfFrame = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xFF) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xD9 || marker === 0xDA) break;
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw uploadError('The JPEG dimensions could not be verified.');
}

function pngDimensions(buffer) {
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') throw uploadError('The PNG header is invalid.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + size > buffer.length) break;
    if (type === 'VP8X' && size >= 10) {
      return { width: readUInt24LE(buffer, dataOffset + 4) + 1, height: readUInt24LE(buffer, dataOffset + 7) + 1 };
    }
    if (type === 'VP8 ' && size >= 10 && buffer[dataOffset + 3] === 0x9D && buffer[dataOffset + 4] === 0x01 && buffer[dataOffset + 5] === 0x2A) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3FFF,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3FFF
      };
    }
    if (type === 'VP8L' && size >= 5 && buffer[dataOffset] === 0x2F) {
      const b1 = buffer[dataOffset + 1];
      const b2 = buffer[dataOffset + 2];
      const b3 = buffer[dataOffset + 3];
      const b4 = buffer[dataOffset + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3F) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0F) << 10)
      };
    }
    offset = dataOffset + size + (size % 2);
  }
  throw uploadError('The WebP dimensions could not be verified.');
}

function imageDimensions(buffer, mime) {
  if (mime === 'image/jpeg') return jpegDimensions(buffer);
  if (mime === 'image/png') return pngDimensions(buffer);
  if (mime === 'image/webp') return webpDimensions(buffer);
  throw uploadError('Unsupported image type.');
}

function sanitizeJpeg(buffer) {
  const parts = [buffer.subarray(0, 2)];
  let offset = 2;
  let stripped = false;
  while (offset < buffer.length) {
    const segmentStart = offset;
    if (buffer[offset] !== 0xFF) throw uploadError('The JPEG segment structure is invalid.');
    while (offset < buffer.length && buffer[offset] === 0xFF) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xDA || marker === 0xD9) {
      parts.push(buffer.subarray(segmentStart));
      return { buffer: Buffer.concat(parts), metadataStripped: stripped };
    }
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      parts.push(buffer.subarray(segmentStart, offset));
      continue;
    }
    if (offset + 2 > buffer.length) throw uploadError('The JPEG segment structure is truncated.');
    const length = buffer.readUInt16BE(offset);
    const segmentEnd = offset + length;
    if (length < 2 || segmentEnd > buffer.length) throw uploadError('The JPEG segment length is invalid.');
    if (JPEG_METADATA_MARKERS.has(marker)) stripped = true;
    else parts.push(buffer.subarray(segmentStart, segmentEnd));
    offset = segmentEnd;
  }
  throw uploadError('The JPEG end marker is missing.');
}

function sanitizePng(buffer) {
  const parts = [buffer.subarray(0, 8)];
  let offset = 8;
  let stripped = false;
  let foundEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > buffer.length) throw uploadError('The PNG chunk structure is invalid.');
    if (IMAGE_METADATA_CHUNKS.has(type)) stripped = true;
    else parts.push(buffer.subarray(offset, end));
    offset = end;
    if (type === 'IEND') { foundEnd = true; break; }
  }
  if (!foundEnd) throw uploadError('The PNG end chunk is missing.');
  return { buffer: Buffer.concat(parts), metadataStripped: stripped };
}

function sanitizeWebp(buffer) {
  const chunks = [];
  let offset = 12;
  let stripped = false;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const end = dataOffset + size;
    const paddedEnd = end + (size % 2);
    if (paddedEnd > buffer.length) throw uploadError('The WebP chunk structure is invalid.');
    if (type === 'EXIF' || type === 'XMP ') {
      stripped = true;
    } else if (type === 'VP8X' && size >= 10) {
      const chunk = Buffer.from(buffer.subarray(offset, paddedEnd));
      chunk[8] &= ~0x0C;
      chunks.push(chunk);
    } else {
      chunks.push(buffer.subarray(offset, paddedEnd));
    }
    offset = paddedEnd;
  }
  if (!chunks.length) throw uploadError('The WebP image has no valid chunks.');
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return { buffer: Buffer.concat([header, body]), metadataStripped: stripped };
}

function sanitizeImage(buffer, mime) {
  if (mime === 'image/jpeg') return sanitizeJpeg(buffer);
  if (mime === 'image/png') return sanitizePng(buffer);
  if (mime === 'image/webp') return sanitizeWebp(buffer);
  return { buffer, metadataStripped: false };
}

function validatePdf(buffer) {
  const sample = buffer.toString('latin1');
  if (!/%%EOF\s*$/.test(sample.slice(-2_048))) throw uploadError('The PDF end marker is missing.');
  if (/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/i.test(sample)) {
    throw uploadError('PDFs with scripts, launch actions, embedded files, or rich media are not allowed.');
  }
}

async function scanUpload(buffer, metadata, { requireScanner = false } = {}) {
  const scannerUrl = String(process.env.IZHE_UPLOAD_SCANNER_URL || '').trim();
  if (!scannerUrl) {
    if (requireScanner) throw uploadError('Document malware scanning is required but not configured.', 503);
    return { status: 'not_configured', scannedAt: null };
  }
  let parsed;
  try { parsed = new URL(scannerUrl); } catch { throw uploadError('Upload malware scanning is misconfigured.', 503); }
  if (parsed.protocol !== 'https:') throw uploadError('Upload malware scanning requires HTTPS.', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(parsed, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-api-key': String(process.env.IZHE_UPLOAD_SCANNER_API_KEY || ''),
        'x-izhe-filename': metadata.filename,
        'x-izhe-content-type': metadata.contentType,
        'x-izhe-sha256': metadata.sha256
      },
      body: buffer,
      signal: controller.signal
    });
    if (!response.ok) throw uploadError('Upload malware scanning did not complete successfully.', 503);
    const result = await response.json().catch(() => null);
    if (!result || result.clean !== true) throw uploadError('The uploaded file did not pass malware scanning.', 422);
    return { status: 'clean', scannedAt: new Date().toISOString(), engine: String(result.engine || 'configured-scanner').slice(0, 80) };
  } catch (error) {
    if (error?.statusCode) throw error;
    throw uploadError('Upload malware scanning did not complete successfully.', 503);
  } finally {
    clearTimeout(timer);
  }
}

export function randomizedStorageId(extension, prefix = '') {
  const safePrefix = String(prefix || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return `${safePrefix ? `${safePrefix}-` : ''}${Date.now().toString(36)}-${randomToken(18)}.${extension}`;
}

export async function validateQuarantinedUpload(file, {
  allowedTypes,
  maxBytes = 5 * 1024 * 1024,
  maxWidth = 8_192,
  maxHeight = 8_192,
  maxPixels = 40_000_000,
  requireScannerForDocuments = process.env.IZHE_UPLOAD_REQUIRE_SCANNER_FOR_DOCUMENTS === 'true'
} = {}) {
  assertFileLike(file);
  if (!allowedTypes || typeof allowedTypes !== 'object') throw new Error('Allowed upload types are required.');
  if (file.size < 1 || file.size > maxBytes) throw uploadError(`Files must be ${Math.floor(maxBytes / 1024 / 1024)} MB or smaller.`);
  const filename = sanitizeDisplayFilename(file.name);
  const declaredMime = String(file.type || '').trim().toLowerCase();
  const originalExtension = extensionOf(filename);
  if (declaredMime === 'image/svg+xml' || originalExtension === 'svg') throw uploadError('SVG uploads are not allowed.');
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.byteLength !== file.size) throw uploadError('The uploaded file size could not be verified.');

  const quarantineId = `pending/${randomToken(24)}`;
  const quarantinedAt = new Date().toISOString();
  const quarantine = getStore(QUARANTINE_STORE);
  await quarantine.set(quarantineId, raw, {
    metadata: {
      filename,
      declaredMime,
      size: raw.byteLength,
      status: 'pending_validation',
      quarantinedAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    },
    onlyIfNew: true
  });

  try {
    const detected = detectUploadType(raw, declaredMime);
    const policy = allowedTypes[detected.mime];
    if (!policy) throw uploadError('The detected file type is not allowed in this upload context.');
    if (declaredMime !== detected.mime) throw uploadError('The declared file type does not match the file signature.');
    if (!policy.extensions.includes(originalExtension)) throw uploadError('The file extension does not match the detected file type.');

    let dimensions = null;
    let sanitized = { buffer: raw, metadataStripped: false };
    if (detected.kind === 'image') {
      dimensions = imageDimensions(raw, detected.mime);
      if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > maxWidth || dimensions.height > maxHeight) {
        throw uploadError(`Images may not exceed ${maxWidth} × ${maxHeight} pixels.`);
      }
      if (dimensions.width * dimensions.height > maxPixels) throw uploadError('The image contains too many pixels and may be unsafe to decode.');
      sanitized = sanitizeImage(raw, detected.mime);
    } else if (detected.mime === 'application/pdf') {
      validatePdf(raw);
    }

    const digest = sha256(sanitized.buffer, 'hex');
    const scan = await scanUpload(sanitized.buffer, {
      filename,
      contentType: detected.mime,
      sha256: digest
    }, {
      requireScanner: requireScannerForDocuments && detected.kind !== 'image' && detected.kind !== 'text'
    });
    return {
      buffer: sanitized.buffer,
      filename,
      originalExtension,
      contentType: detected.mime,
      storageExtension: policy.storageExtension,
      kind: detected.kind,
      size: sanitized.buffer.byteLength,
      originalSize: raw.byteLength,
      sha256: digest,
      dimensions,
      metadataStripped: sanitized.metadataStripped,
      archive: detected.zip ? {
        entries: detected.zip.entries,
        uncompressedBytes: detected.zip.totalUncompressed
      } : null,
      scan,
      validationStatus: 'validated',
      quarantinedAt,
      release: async () => quarantine.delete(quarantineId).catch(() => {})
    };
  } catch (error) {
    await quarantine.delete(quarantineId).catch(() => {});
    throw error;
  }
}
