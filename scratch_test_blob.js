async function test() {
  const url = 'https://files.catbox.moe/12zwya.mp4';
  const start = Date.now();
  const res = await fetch(url);
  const blob = await res.blob();
  console.log('Downloaded size:', blob.size, 'type:', blob.type, 'in', Date.now() - start, 'ms');
}
test();
