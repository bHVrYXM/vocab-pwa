/**
 * Minimal protobuf reader for the media map of newer .apkg files:
 *   message MediaEntries { repeated MediaEntry entries = 1; }
 *   message MediaEntry   { string name = 1; uint32 size = 2; bytes sha1 = 3;
 *                          optional uint32 legacy_zip_filename = 255; }
 */
export interface MediaEntry {
  name: string;
  /** Name of the entry inside the zip; defaults to the entry's index. */
  zipName: string;
}

export function decodeMediaEntries(buf: Uint8Array): MediaEntry[] {
  const out: MediaEntry[] = [];
  const r = new Reader(buf);
  while (!r.done()) {
    const [field, wire] = r.tag();
    if (field === 1 && wire === 2) {
      out.push(decodeEntry(r.bytes(), out.length));
    } else r.skip(wire);
  }
  return out;
}

function decodeEntry(buf: Uint8Array, index: number): MediaEntry {
  const r = new Reader(buf);
  let name = '';
  let legacy: number | undefined;
  while (!r.done()) {
    const [field, wire] = r.tag();
    if (field === 1 && wire === 2) name = new TextDecoder().decode(r.bytes());
    else if (field === 255 && wire === 0) legacy = r.varint();
    else r.skip(wire);
  }
  return { name, zipName: String(legacy ?? index) };
}

class Reader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}

  done() {
    return this.pos >= this.buf.length;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++];
      if (b === undefined) throw new Error('Truncated protobuf varint');
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  }

  tag(): [number, number] {
    const t = this.varint();
    return [Math.floor(t / 8), t & 7];
  }

  bytes(): Uint8Array {
    const len = this.varint();
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
}
