const e = require('electron/main');
console.log('app type:', typeof e.app);
if (e.app) {
  console.log('app.whenReady:', typeof e.app.whenReady);
  e.app.whenReady().then(() => {
    console.log('APP IS READY!');
    console.log('app.getName():', e.app.getName());
    e.app.quit();
  });
} else {
  console.log('app is undefined - checking all keys:', Object.keys(e).slice(0,10).join(', ') || 'EMPTY');
  process.exit(1);
}
