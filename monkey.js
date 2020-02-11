Array.prototype.remove && console.warn('Overriding existing function!');
Array.prototype.remove = function remove(e) {
    const i = this.indexOf(e);
    if (i === -1)
        return false;
    this.splice(i, 1);
    return true;
}

Array.prototype.shuffle && console.warn('Overriding existing function!');
Array.prototype.shuffle = function shuffle() {
    for (var i = this.length; i--;) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = this[i];
        this[i] = this[j];
        this[j] = temp;
    }
    return this;
}

Math.clip && console.warn('Overriding existing function');
Math.clip = function clip(x, min, max) {
    return Math.min(max, Math.max(min, x));
}
