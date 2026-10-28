import { describe, it, expect } from 'vitest'
import { readSSE } from './sse'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      chunks.forEach((s) => c.enqueue(enc.encode(s)))
      c.close()
    },
  })
}

async function collect(...chunks: string[]) {
  const got: string[] = []
  await readSSE(streamOf(...chunks), (d) => got.push(d))
  return got
}

describe('readSSE', () => {
  it('emits the data of each event', async () => {
    expect(await collect('data: ping\n\ndata: two\n\n')).toEqual(['ping', 'two'])
  })

  it('ignores comments (keepalive) and retry fields', async () => {
    expect(await collect('retry: 5000\n\n: keepalive\n\ndata: ping\n\n')).toEqual(['ping'])
  })

  it('reassembles events split across chunks, even mid-line', async () => {
    expect(await collect('da', 'ta: pi', 'ng\n', '\ndata: x\n\n')).toEqual(['ping', 'x'])
  })

  it('handles CRLF line endings', async () => {
    expect(await collect('data: ping\r\n\r\n')).toEqual(['ping'])
  })

  it('joins multi-line data with newlines', async () => {
    expect(await collect('data: a\ndata: b\n\n')).toEqual(['a\nb'])
  })

  it('drops a trailing event that was never terminated', async () => {
    expect(await collect('data: ping\n\ndata: cut')).toEqual(['ping'])
  })
})
