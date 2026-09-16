fetch('https://files.catbox.moe/12zwya.mp4').then(res => {
  console.log('cors header:', res.headers.get('access-control-allow-origin'));
  console.log('all headers:', Object.fromEntries(res.headers.entries()));
});
