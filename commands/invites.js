const { SlashCommandBuilder } = require('@discordjs/builders');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Get your current invite numbers'),
    async execute(interaction) { 
        return {
            commandName: 'invites',
            id: interaction.user.id 
        }
    }
}