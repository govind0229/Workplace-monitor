const { exec } = require('child_process');

function notifyNative(title, message) {
    const script = `display notification "${message}" with title "WorkingHours" subtitle "${title}"`;
    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error(err);
        else console.log('Sent native notification via AppleScript');
    });
}
notifyNative('Test App', 'This should appear native');
