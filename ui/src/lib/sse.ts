/**
 * Minimal Server-Sent Events reader over a fetch body (EventSource cannot send an Authorization
 * header). Calls onData with each event's data; resolves when the stream ends. An event the stream
 * ended in the middle of is dropped, as browsers do.
 */
export async function readSSE(body: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const handleLine = (line: string) => {
    if (line === '') {
      if (dataLines.length > 0) onData(dataLines.join('\n'))
      dataLines = []
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    // Comments (":..."), retry and other fields carry nothing we use.
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, newline).replace(/\r$/, ''))
      buffer = buffer.slice(newline + 1)
    }
  }
}
