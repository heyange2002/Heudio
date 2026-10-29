// Keep the upstream Node host separate: it supports MQTT QR login and stored sessions.
process.env.PORT ||= '3200';
process.env.AUTO_OPEN_EXPLORER = 'false';
require('@yakult-green-tea/qq-music-api');
const path = require('node:path');
process.env.QQ_AUTH_STATE_PATH ||= path.join(__dirname, '.auth-state/qq-device.json');
if (process.env.QQ_SESSION_SECRET) process.env.QQ_AUTH_SESSION_PATH ||= path.join(path.dirname(process.env.QQ_AUTH_STATE_PATH), 'qq-sessions.json');
