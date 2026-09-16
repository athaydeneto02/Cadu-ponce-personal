const start = Date.now();
fetch('https://files.catbox.moe/12zwya.mp4').then(res => {
  console.log('Headers received in', Date.now() - start, 'ms');
  return res.arrayBuffer();
}).then(buf => {
  console.log('Downloaded', buf.byteLength, 'bytes in', Date.now() - start, 'ms');
}).catch(err => {
  console.error('Error:', err);
});
