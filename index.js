const DiscordBot = require('./src/discord-bot.js');
require('./src/deploy-commands.js');


(async () => {
    const discord = new DiscordBot
    discord.init();
})();