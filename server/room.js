const uuid = require('uuid/v4');
const formatters = require('./formatters');
const { default: User } = require('./user');
const { default: Game } = require('./game');
const { default: io } = require('./io');
const EventEmitter = require('events');

const rooms = {};
class Room {
    constructor(user) {
        // Assign ID. Try at most 100 tries before using a longer id.
        for (let i = 4; !this.id || this.id in rooms; i += 0.01)
            this.id = uuid().substring(0, i|0);
        rooms[this.id] = this;

        this.users = [];
        this.events = new EventEmitter();
        this.join(user);
    }

    join(user) {
        // Ensure a user is only in one room at once.
        if (user.room)
            if (user.room === this)
                return user.socket.emit('room:joined', formatters.room(this, user));
            else
                user.room.leave(user);

        user.room = this;
        this.users.push(user);
        io.to(this.id).emit('room:user:joined', formatters.user(user));
        user.socket.join(this.id);
        user.socket.on('room:start', () => this.startGame());
        user.socket.on('room:left', () => this.leave(user));
        user.socket.emit('room:joined', formatters.room(this, user));
        this.events.emit('user:joined', user);
    }

    leave(user) {
        delete user.room;
        this.users.remove(user);
        user.socket.leave(this.id);
        user.socket.removeAllListeners('room:start');
        user.socket.removeAllListeners('room:left');
        user.socket.emit('room:left', formatters.room(this, user));
        io.to(this.id).emit('room:user:left', formatters.user(user));
        this.events.emit('user:left', user);

        !this.users.length && this.close();
    }

    async close() {
        this.game && await this.game.close();
        delete rooms[this.id];
        io.to(this.id).emit('room:closed');
        this.events.emit('closed');
    }

    startGame() {
        this.game && this.game.close();
        this.game = new Game(this);
    }

    stopGame() {
        this.game.close();
        delete this.game;
    }
}

function setup() {
    io.on('connect', socket => {
        let user;

        function transferEvents(otherSocket) {
            // Join the rooms that the socket was in.
            socket.join(
                Object.keys(otherSocket.rooms).filter(id =>
                    id !== otherSocket.id));
            // Transfer all that the socket was listening.
            otherSocket.eventNames()
            .filter(eventName =>
                eventName !== 'room:create' &&
                eventName !== 'room:join')
            .forEach(eventName =>
                otherSocket.rawListeners(eventName).forEach(listener =>
                    socket.on(eventName, listener)));
            otherSocket.removeAllListeners();
        }

        socket.on('room:create', ({ name }) => {
            if (!name)
                return socket.emit('register:error', 'Le nom est requis');
            user = new User(name)
            user.socket = socket;
            new Room(user);
        });

        socket.on('room:join', ({ name, room: id }) => {
            const room = rooms[id];
            if (!room)
                return socket.emit('register:error', "La salle n'existe pas");
            if (!name)
                return socket.emit('register:error', 'Le nom est requis');
            const existing = room.users.find(user => user.name === name);
            user = existing || new User(name);
            if (existing) {
                user = existing;
                transferEvents(user.socket);
                user.socket.emit('register:error', 'La connection a été reprise sur un autre appareil');
            }
            user.socket = socket;
            room.join(user)
        });
    });
}

module.exports = { rooms, setup, default: Room };
