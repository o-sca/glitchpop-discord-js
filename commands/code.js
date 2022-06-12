const { SlashCommandBuilder } = require('@discordjs/builders');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('code')
        .setDescription('Get invite code corresponding to user')
        .addStringOption(option => option.setName('input').setDescription("input your referral's code")),
    async execute(interaction) { 
        const referralCode = interaction.options.getString('input');
        return {
            commandName: 'code',
            code: referralCode,
            id: interaction.user.id 
        }
    }
}