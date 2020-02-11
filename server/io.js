module.exports.setup = function(server) {
    const io = module.exports.default = require('socket.io')(
        server,
        { serveClient: false });
};
