/**
 * The smallest model that proves a GPU backend works: one `MatMul` of a
 * square matrix by itself. Written out here as ONNX protobuf bytes rather than
 * shipped as a file, so detection needs nothing on disk and nothing
 * downloaded — the Separation Models are fetched on first use, and detection
 * runs at server start, long before that.
 *
 * Big enough that a real GPU visibly beats an integrated one on it, which is
 * how detection picks between DirectML's adapters; small enough to run in
 * milliseconds anywhere.
 */

export const PROBE_SIZE = 1024

function varint(value: number): number[] {
  const bytes: number[] = []
  let v = value
  while (v > 0x7F) {
    bytes.push((v & 0x7F) | 0x80)
    v = Math.floor(v / 128)
  }
  bytes.push(v)
  return bytes
}

/** A length-delimited field: a string, or an embedded message. */
function message(field: number, payload: number[]): number[] {
  return [...varint((field << 3) | 2), ...varint(payload.length), ...payload]
}

function text(field: number, value: string): number[] {
  return message(field, [...new TextEncoder().encode(value)])
}

function integer(field: number, value: number): number[] {
  return [...varint(field << 3), ...varint(value)]
}

/** `ValueInfoProto` for a float tensor of `dims`. */
function floatTensor(name: string, dims: number[]): number[] {
  const shape = dims.flatMap(dim => message(1, integer(1, dim)))
  const tensorType = [...integer(1, 1), ...message(2, shape)] // elem_type FLOAT, shape
  return [...text(1, name), ...message(2, message(1, tensorType))]
}

export function probeModelBytes(size = PROBE_SIZE): Uint8Array {
  const node = [...text(1, 'X'), ...text(1, 'X'), ...text(2, 'Y'), ...text(4, 'MatMul')]
  const graph = [
    ...message(1, node),
    ...text(2, 'akapela-probe'),
    ...message(11, floatTensor('X', [size, size])),
    ...message(12, floatTensor('Y', [size, size])),
  ]
  const model = [
    ...integer(1, 8), // ir_version
    ...text(2, 'akapela'),
    ...message(7, graph),
    ...message(8, [...text(1, ''), ...integer(2, 17)]), // opset_import: the default domain, opset 17
  ]
  return Uint8Array.from(model)
}
