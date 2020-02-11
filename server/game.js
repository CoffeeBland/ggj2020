const uuid = require('uuid/v4');
const fs = require('fs');
const io = require('./io').default;
const peeps = new Promise((res, rej) =>
    fs.readdir('client/assets/peeps', (err, files) =>
        err ?
            rej(err) :
            res(files.map(file => file.replace('.png', '')))));

const widths = process.env.WIDTHS.split(' ').map(n => Number.parseInt(n));
const parts = process.env.PARTS.split(' ');
const heights = parts.map(part => Number.parseInt(process.env[`${part}_height`]));

const formatters = require('./formatters');

const conf = {
    timerDelay: 300,
    prompt: {
        duration: 3 * 1000
    },
    choice: {
        choices: 6
    },
    end: {
        duration: 30 * 1000
    }
};

const states = {};

states.prompt = {
    async enter() {
        this.parts = parts;
        this.widths = widths;
        this.heights = heights;
        this.peeps = await peeps;
        this.prompt = new Array(this.parts.length)
            .fill(Math.random() * this.peeps.length|0);
        this.startTimer(
            () => this.transition(states.choice),
            conf.prompt.duration);
        io.to(this.room.id).emit('game:update', formatters.game.prompt(this));
    }
};

states.choice = {
    async enter() {
        this.checkChoices = () =>
            this.room.users.every(({ choices, choice }) =>
                !choices || choice) &&
            this.transition(states.vote);

        this.room.users.forEach(user => {
            user.choices =  new Array(this.parts.length)
                .fill()
                .map((_, part_i) => this.peeps
                    .map((_, i) => i)
                    .filter(i => this.prompt[part_i] !== i)
                    .shuffle()
                    .slice(0, conf.choice.choices));
            user.socket.emit('game:update', formatters.game.choices(this, user));
            user.socket.on('game:choice', choice => {
                if (!user.choices || !choice.every((n, i) => 0 <= n && n < user.choices[i].length))
                    return;
                user.choice = choice;
                this.checkChoices();
            });
        });
    },
    cleanupUser(user) {
        delete user.choices;
        delete user.choice;
        user.socket.removeAllListeners('game:choice');
    }
};

states.vote = {
    enter() {
        this.matches = this.room.users
            .filter(({ choice }) => choice)
            .map(({ name, choices, choice }) => ({
                name,
                choice: choice.map((choice, part_i) => choices[part_i][choice]),
                positive: [],
                negative: [],
            }));

        this.checkVotes = () => (
            this.room.users.every(user =>
                user.votes &&
                this.matches.every((_, i) =>
                    user.votes[i])) &&
            this.transition(states.end));

        this.room.users.forEach(user => {
            user.socket.emit('game:update', formatters.game.matches(this, user));
            user.socket.on('game:vote', ({ index: i, vote }) => {
                if (!this.matches[i])
                    return;
                user.votes || (user.votes = []);
                user.votes[i] = vote ? 1 : -1;
                this.matches[i].positive.remove(user);
                this.matches[i].negative.remove(user);
                this.matches[i][vote ? 'positive' : 'negative'].push(user);
                user.socket.emit('game:update', formatters.game.matches(this, user));
                this.checkVotes();
            });
        });
    },
    cleanupUser(user) {
        delete user.votes;
        user.socket.removeAllListeners('game:vote');
    }
};

states.end = {
    enter() {
        this.matches.sort((lhs, rhs) =>
            (rhs.positive.length - rhs.negative.length) -
            (lhs.positive.length - lhs.negative.length));
        this.match = this.matches[0];
        this.startTimer(() => this.room.stopGame(), conf.end.duration);
        io.to(this.room.id).emit('game:update', formatters.game.match(this));
    }
};

states.result = {};

Object.keys(states).forEach(key => states[key].name = key);

class Game {
    constructor(room) {
        this.id = uuid();
        this.cleanupUser = this.cleanupUser.bind(this);

        this.room = room;
        this.room.events.on('user:left', this.cleanupUser);
        this.transition(states.prompt);
    }

    startTimer(cb, dur) {
        this.transitionTime = Date.now() + dur + conf.timerDelay;
        this.durationTotal = dur;
        const notify = () =>
            io.to(this.room.id).emit('game:update', formatters.game.duration(this));
        notify();
        this.intervalId = setInterval(notify, 100);
        this.timeoutId = setTimeout(cb, dur + conf.timerDelay * 2);
    }

    stopTimer() {
        delete this.transitionTime;
        delete this.durationTotal;
        clearTimeout(this.timeoutId);
        clearInterval(this.intervalId);
    }

    async transition(state) {
        if (this.state)
            this.state && this.state.exit && await this.state.exit.call(this);
        this.stopTimer();
        this.state = state;
        this.state.enter && await this.state.enter.call(this);
        io.to(this.room.id).emit('game:update', formatters.game.state(this));
    }

    async close() {
        this.state && this.state.exit && await this.state.exit.call(this);
        this.room.users.forEach(this.cleanupUser);
        this.room.events.removeListener('user:left', this.cleanupUser);
        this.stopTimer();
        io.to(this.room.id).emit('game:closed');
    }

    cleanupUser(user) {
        Object.values(states)
        .filter(state => state.cleanupUser)
        .forEach(state => state.cleanupUser.call(this, user));
    }
}

module.exports = { default: Game };
