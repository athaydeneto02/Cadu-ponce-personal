async function check() {
  try {
    const res = await fetch('https://files.catbox.moe/12zwya.mp4', {
      headers: { Range: 'bytes=0-1000' }
    });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'));
    console.log('Content-Range:', res.headers.get('content-range'));
    const buf = await res.arrayBuffer();
    console.log('Bytes received:', buf.byteLength);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
check();
