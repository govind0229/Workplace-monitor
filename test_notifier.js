const notifier = require('node-notifier');
console.log('Sending notification...');
try {
    notifier.notify({
        title: 'Test',
        message: 'Hello'
    }, (err, response) => {
        if (err) {
            console.error('Notification error:', err);
        } else {
            console.log('Notification sent:', response);
        }
    });
} catch (e) {
    console.error('Caught error:', e);
}
console.log('Finished script');
