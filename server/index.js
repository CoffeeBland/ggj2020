// Load env
require('dotenv').config();

// Monkey patches
require('../monkey');

const app = require('express')();
const server = require('http').createServer(app);

// For dev, setup parcel for the client
if (process.env.NODE_ENV !== 'production') {
    console.log('Setting up parcel');
    const path = require('path');
    const Bundler = require('parcel-bundler');
    const bundler = new Bundler(path.resolve(__dirname, '../index.html'));
    app.use(bundler.middleware());
}

require('./io').setup(server);
require('./room').setup();

// Finalize setup
console.log('Listening on port:', process.env.SERVER_PORT || 1337);
server.listen(process.env.SERVER_PORT || 1337);
