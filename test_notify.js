const notifier = require('node-notifier');

notifier.notify({
  title: 'Test Notification',
  message: 'This is a test to see if permissions are requested.',
  sound: true,
  wait: true
}, function (err, response, metadata) {
  if (err) console.error("Error:", err);
  console.log("Response:", response);
  console.log("Metadata:", metadata);
});
