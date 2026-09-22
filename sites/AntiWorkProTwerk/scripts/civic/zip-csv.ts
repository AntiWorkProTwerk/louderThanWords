import { openPromise } from 'yauzl';
import { crc32 } from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';

export async function inspectZip(path: string) {
  const zip = await openPromise(path, {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  try {
    const entries: { name: string; size: number; compressed: number }[] = [];
    for await (const entry of zip.eachEntry())
      entries.push({
        name: entry.fileName,
        size: entry.uncompressedSize,
        compressed: entry.compressedSize,
      });
    return entries;
  } finally {
    zip.close();
  }
}

export async function scanZipCsv(
  path: string,
  memberName: string,
  onRecord: (row: Record<string, string>, rowNumber: number) => void,
  maxMember = 1_500_000_000,
  onProgress?: (rows: number) => void,
  dialect: { delimiter?: ',' | '\t'; quote?: false; allowEmpty?: boolean } = {},
) {
  const zip = await openPromise(path, {
    lazyEntries: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });
  let matches = 0,
    rows = 0,
    headers: string[] = [];
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== memberName) continue;
      if (++matches !== 1 || entry.uncompressedSize > maxMember || entry.isEncrypted())
        throw new Error('Unsafe or ambiguous ZIP CSV member');
      const stream = await zip.openReadStreamPromise(entry);
      let crc = 0,
        bytes = 0;
      const verifier = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > maxMember) return callback(new Error('ZIP CSV exceeds cap'));
          crc = crc32(chunk, crc);
          callback(null, chunk);
        },
      });
      const parser = parse({
        bom: true,
        delimiter: dialect.delimiter ?? ',',
        quote: dialect.quote === false ? false : '"',
        columns: (names: string[]) => {
          if (new Set(names).size !== names.length) throw new Error('Duplicate ZIP CSV columns');
          headers = names;
          return names;
        },
        skip_empty_lines: true,
        max_record_size: 100000,
      });
      const work = pipeline(stream, verifier, parser);
      // Attach rejection handling immediately while consuming the parser's readable side.
      const settled = work.then(
        () => null,
        (error) => error as Error,
      );
      try {
        for await (const row of parser) {
          rows++;
          if (rows % 1_000_000 === 0) onProgress?.(rows);
          onRecord(row, rows);
        }
        const error = await settled;
        if (error) throw error;
      } catch (error) {
        parser.destroy();
        stream.destroy();
        await settled;
        throw error;
      }
      if (crc !== entry.crc32 || bytes !== entry.uncompressedSize)
        throw new Error('ZIP CSV CRC/size mismatch');
    }
    if (matches !== 1 || !headers.length || (!rows && !dialect.allowEmpty))
      throw new Error('ZIP CSV missing or empty');
    return { rows, headers, member: memberName };
  } finally {
    zip.close();
  }
}
