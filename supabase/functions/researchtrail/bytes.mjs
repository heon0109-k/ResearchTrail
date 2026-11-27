// Count the actual stream even when a client omits or understates Content-Length.
export async function boundedBytes(message,limit) {
  if (!message.body || Number(message.headers.get('content-length')) > limit) return null;
  const reader = message.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bytes;
}
