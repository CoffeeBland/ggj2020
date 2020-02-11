const formatUser = module.exports.user =
    ({ name }) => ({ name });

const formatGameState =
    ({ state }) => ({ state: state.name });

const formatGamePrompt =
    ({ widths, heights, parts, peeps, prompt }) => ({
        widths,
        heights,
        parts,
        peeps,
        prompt
    });

const formatGameDuration =
    ({ durationTotal, transitionTime }) => ({
        duration: {
            current: Math.clip(transitionTime - Date.now(), 0, durationTotal),
            total: durationTotal,
        }
    });

const formatGameChoices =
    (game, { choices }) => ({ choices });

const formatGameMatches =
    ({ matches }, user) => ({
        matches: matches && matches.map(({ choice }, i) => ({
            choice,
            voted: user.votes && user.votes[i]
        }))
    });

const formatGameMatch =
    ({ match }) => ({
        match: match && {
            name: match.name,
            choice: match.choice
        }
    });

const formatGame = module.exports.game =
    (game, user) => ({
        id: game.id,
        ...formatGameState(game),
        ...formatGamePrompt(game),
        ...formatGameDuration(game),
        ...formatGameChoices(game, user),
        ...formatGameMatches(game, user),
        ...formatGameMatch(game),
    });

module.exports.game.state = formatGameState;
module.exports.game.prompt = formatGamePrompt;
module.exports.game.duration = formatGameDuration;
module.exports.game.choices = formatGameChoices;
module.exports.game.matches = formatGameMatches;
module.exports.game.match = formatGameMatch;

const formatRoom = module.exports.room =
    ({ id, users, game }, user) => ({
        id,
        users: users.map(formatUser),
        game: game && formatGame(game, user),
    });
