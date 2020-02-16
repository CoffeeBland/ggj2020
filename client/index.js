import io from 'socket.io-client';

function $(name, opts = {}, ...children) {
    const el = document.createElement(name);
    Object.assign(el, opts);
    children.forEach(child => el.appendChild(child));
    return el;
}

const socket = window.socket = io();
const $register = document.querySelector('#register');
const $game = document.querySelector('#game');
const $timer = $game.querySelector('.timer');
const $timerCurrent = $timer.querySelector('.current');
const $prompt = $game.querySelector('.prompt');
const $choice = $game.querySelector('.choice');
const $match = $game.querySelector('.match');
const $propose = $game.querySelector('[name=propose]');

let shown;
function show(node) {
    if (shown) {
        shown.classList.remove('show');
        shown.dispatchEvent(new CustomEvent('hidden'));
    }
    node.classList.add('show');
    shown = node;
}

socket.on('connect', () => show($register));
socket.on('disconnect', () => alert("He's dead jim."));

$register.querySelectorAll('[type=submit]').forEach($submit =>
    $submit.addEventListener('click', e => {
        e.preventDefault();
        socket.emit('room:' + $submit.name,
            Array.from($register.elements)
            .filter(e => e.name && e.value)
            .reduce((obj, e) => (obj[e.name] = e.value, obj), {}));
    }));

$game.querySelector('[name=quit]').onclick = () => socket.emit('room:left');
$game.querySelector('[name=start]').onclick = () => socket.emit('room:start');

socket.on('register:error', msg => {
    show($register);
    $register.querySelector('.danger').innerText = msg;
});

class Game {
    constructor() {
        this.state = undefined;
        $propose.addEventListener('click',
            this.onProposeChoice = () =>
                socket.emit('game:choice', this.choice));
        $match.addEventListener('dragstart',
            this.$matchDragStart = e =>
                e.preventDefault());
        $match.addEventListener('mousedown',
            this.$matchMouseDown = ({ clientX }) =>
                this.mouseStart = clientX);
        $match.addEventListener('touchstart', this.$matchMouseDown);
        $match.addEventListener('mouseup',
            this.$matchMouseUp = ({ clientX }) =>
                socket.emit('game:vote', {
                    index: this.matchIndex,
                    vote: clientX > this.mouseStart
                }));
        $match.addEventListener('touchend', this.$matchMouseUp);
    }

    cleanup() {
        $game.querySelector('[name=menu-toggle]').checked = false;
        $prompt.innerHTML = '';
        $choice.innerHTML = '';
        $match.innerHTML = '';
        $propose.removeEventListener('click', this.onProposeChoice);
        $match.removeEventListener('dragstart', this.$matchDragStart);
        $match.removeEventListener('mousedown', this.$matchMouseDown);
        $match.removeEventListener('mouseup', this.$matchMouseUp);
        this.state = undefined;
    }

    get duration() { return this._duration; }
    set duration(duration) {
        this._duration = duration;
        $timerCurrent.style.width = `${100 * duration.current / duration.total}%`;
    }

    get parts() { return this._parts; }
    set parts(parts) {
        if (this._parts && parts.every((p, i) => p === this._parts[i]))
            return;
        this._parts = parts;

        this.$promptImgs && this.$promptImgs.forEach(i => i.remove());
        this.$promptImgs = parts.map(() => $prompt.appendChild($('img')));

        this.$choiceImgs && this.$choiceImgs.forEach(i => i.remove());
        this.$choiceImgs = parts.map((part, part_i) =>
            $choice.appendChild($('img', {
                ondragstart: e => e.preventDefault(),
                // TODO: This probably doesn't work.
                onmousedown: ({ clientX }) => this.mouseStart = clientX,
                ontouchstart: ({ touches }) => this.mouseStart = touches[0].clientX,
                onmouseup: ({ clientX }) =>
                    this.setPartChoice(
                        part_i,
                        this.choice[part_i] + Math.sign(clientX - this.mouseStart)),
                ontouchend: ({ changedTouches }) =>
                    this.setPartChoice(
                        part_i,
                        this.choice[part_i] + Math.sign(changedTouches[0].clientX - this.mouseStart)),
            })));

        this.$matchImgs && this.$matchImgs.forEach(i => i.remove());
        this.$matchImgs = parts.map(() => $match.appendChild($('img')));
    }

    get prompt() { return this._prompt; }
    set prompt(prompt) {
        this._prompt = prompt;
        prompt.forEach((prompt, part_i) =>
            this.setImgSrc(
                this.$promptImgs[part_i],
                this.peeps[prompt],
                this.parts[part_i]));
    }

    get choices() { return this._choices; }
    set choices(choices) {
        this._choices = choices;
        if (!this.choice)
            this.choice = new Array(choices.length).fill(0);
    }

    get choice() { return this._choice; }
    set choice(choice) {
        this._choice = choice;
        choice.forEach((choice, part_i) => this.setPartChoice(part_i, choice));
    }

    setPartChoice(part_i, choice) {
        const partChoices = this.choices[part_i];
        choice = (choice + partChoices.length) % partChoices.length;
        this.choice[part_i] = choice;
        this.setImgSrc(
            this.$choiceImgs[part_i],
            this.peeps[partChoices[choice]],
            this.parts[part_i]);
    }

    get matches() { return this._matches; }
    set matches(matches) {
        this._matches = matches;
        this.matchIndex = this._matches.findIndex(({ voted }) => !voted);
    }

    get matchIndex() { return this._matchIndex; }
    set matchIndex(index) {
        this._matchIndex = index;
        this.match = this.matches[index];
    }

    get match() { return this._match; }
    set match(match) {
        this._match = match;
        if (match)
            match.choice.forEach((peep_i, part_i) =>
                this.setImgSrc(
                    this.$matchImgs[part_i],
                    this.peeps[peep_i],
                    this.parts[part_i]));
        else
            this.$matchImgs.forEach($img => this.setImgSrc($img));
    }

    get state() { return this._state; }
    set state(state) {
        $game.classList.remove('lobby');
        this._state && $game.classList.remove(`state-${this._state}`);
        this._state = state;
        $game.classList.add(state ? `state-${state}` : 'lobby');
    }

    setImgSrc(img, peep, part) {
        //// TODO this is pretty dumb
        if (!peep || !part) {
            return img.classList.add('hidden');
        } else {
            img.classList.remove('hidden');
        }
        img.style.maxHeight = `${100 * this.heights[this.parts.indexOf(part)] / this.heights.reduce((a, b) => a + b, 0)}%`;
        img.srcset = this.widths
        .map((width, i) => `parts/${peep}-${part}-${width}.png ${width}w`)
        .join(', ');
    }
};

class Room {
    constructor() {
        this.$roomName = $game.querySelector('h2');
        this.$users = $game.querySelector('.users');
    }

    get id() { return this._id; }
    set id(id) {
        this._id = id;
        this.$roomName.innerText = id;
    }

    get users() { return this._users; }
    set users(users) {
        this._users = users;
        this.$users.innerHTML = '';
        users.forEach(({ name }) => this.$users.appendChild($('li', {}, document.createTextNode(name))));
    }

    userJoined(user) {
        this.users = [...this.users, user];
    }

    userLeft(user) {
        this.users = this.users.filter(u => u.name !== user.name);
    }
}

let game;
let room;

const updateGame = given => {
    if (!game || (given.id && given.id !== game.id)) {
        game && game.cleanup();
        game = new Game();
    }
    Object.assign(game, given);
};

$game.addEventListener('hidden', () => {
    game && game.cleanup();
    game = null;
});

socket.on('room:joined', ({ id, users, game: givenGame }) => {
    show($game);
    room = new Room();
    Object.assign(room, { id, users });
    updateGame(givenGame);
});
socket.on('room:left', () => show($register));

socket.on('room:user:joined', user => room.userJoined(user));
socket.on('room:user:left', user => room.userLeft(user));

socket.on('game:update', givenGame => updateGame(givenGame));
socket.on('game:closed', () => {
    game && game.cleanup();
    game = null;
});
