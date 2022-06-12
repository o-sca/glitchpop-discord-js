const { Client, Intents, MessageEmbed, Collection, MessageSelectMenu, MessageActionRow, MessageButton } = require("discord.js");
const FireStore = require('./firestore.js');
const fs = require('node:fs');
const wait = require("timers/promises").setTimeout;
require('dotenv').config();


class DiscordBot extends FireStore {
    constructor() {
        super();
        this.botToken = process.env.botToken;
        this.client = new Client({
            intents: [
                Intents.FLAGS.GUILDS, 
                Intents.FLAGS.GUILD_MESSAGES,
                Intents.FLAGS.GUILD_MEMBERS,
            ]
        });
    }

    async init() {
        await this.initFireStore();
        await this.initCommands();
        this.client.login(this.botToken);
        this.client.on('ready', async bot => {
            console.log('Logged into:', bot.user.tag)
            await wait(1000);
            const configData = await this.fetchConfig()
            this.projectName = configData.projectName;
            this.twitterHandle = configData.twitterHandle;
            this.twitterLink = configData.twitterLink;
            this.logo = configData.logo;
            this.banner = configData.banner;
            this.verifiedRole = configData.verifiedRole;
            this.commandsChannelID = configData.commandsChannelID;
            this.onMemberJoin()
            this.onCommands()
            this.onButton()
            this.onSelectMenu()
        })
    }

    async initCommands() {
        this.client.commands = new Collection();
        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(`../commands/${file}`);
            this.client.commands.set(command.data.name, command);
        }
    }

    async onMemberJoin() {
        this.client.on('guildMemberAdd', async member => {
            console.log(member.user)
        })
    }

    async onCommands() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isCommand() || interaction.channel.id !== this.commandsChannelID) return;
            const command = this.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                 // temp fix on the firestore fuctions not being able to be invoked from the commands stored in /commands/
                let response = await command.execute(interaction);
                switch (response.commandName) {
                    case 'code':
                        if (response.code === null) return await this.getCode(response, interaction);
                        return await this.submitCode(response, interaction);
                    case 'invites':
                        let userInfo = await this.fetchUserInfo(response)
                        return interaction.reply({ content: `You currently have ${userInfo.points} invites`, ephemeral: true });
                }  
            } catch (error) {
                console.error(error);
                return await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        })
    }

    async onButton() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isButton()) return;
            if (interaction.customId === 'verifyBtn' && !interaction.member.roles.cache.find(role => role.id === this.verifiedRole)) {
                let userInfo = await this.fetchUserInfo(interaction.user)
                if (userInfo.suspect) return;
                
                const thread = await this.createThread(interaction.user);

                return await interaction.reply({ 
                    content: `head over to #${thread} to finish the verification process`, 
                    ephemeral: true 
                });
            }
        });
    }

    async onSelectMenu() {
        this.client.on('interactionCreate', async interaction => {
            if (!interaction.isSelectMenu()) return;
            if (interaction.customId === 'verify') {
                const correctFruit = interaction.message.embeds[0].description.split('**')[1].split('**')[0];
                const userResponse = interaction.values[0];
                if (correctFruit !== userResponse) interaction.reply({ content: 'Incorrect answer! deleting thread'});
                else await this.addRole(interaction);
                await wait(2000);
                return await this.deleteThread(interaction.message.channelId);
            }
        })
    }

    async verifyEmbed() {
        const channel = this.client.channels.cache.get(process.env.verifyChannelID);
        const embedMsg = new MessageEmbed()
            .setColor('#E27396')
            .setTitle(`Welcome to the ${this.projectName}'s Server!`)
            .setFooter({ text: this.twitterHandle , iconURL: this.logo})
            .setImage(this.banner)
            .setDescription('Click on the `VERIFY` button to get started on the verification process!')
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('verifyBtn')
                    .setLabel('Verify')
                    .setStyle('PRIMARY')
            )
        channel.send({ embeds: [embedMsg], components: [row] })
    }

    async submitCode(response, interaction) {
        let userInfo = await this.fetchUserInfo(response);
        if (userInfo.suspect || userInfo.codeUsed) return;

        let referralInfo = await this.fetchUserInfo(response, 'code');
        if (referralInfo.code === userInfo.code) return;

        await this.addPoints(referralInfo);
        await this.toggleCodeUsed(userInfo);
        return await interaction.reply({
            content: `code submitted successfully!`,
            ephemeral: true
        })
    }

    async getCode(response, interaction) {
        let userInfo = await this.fetchUserInfo(response);
        const embedMsg = new MessageEmbed()
            .setTitle(`Invite Code`)
            .setFooter({ text: this.twitterHandle , iconURL: this.logo})
            .setDescription(`<@!${response.id}>'s Invite Code:${userInfo.code}\nPlease follow the video below to learn how to utilise your code!`)
            .setImage('https://cdn-images-1.medium.com/max/1600/1*NJ2hoWHVBB3YrI07Xxu02A.gif')
        return await interaction.reply({ 
            content: userInfo.code.toString(), 
            embeds: [embedMsg], 
            ephemeral: true 
        });
    }

    async sendVerifyOptions(threadID) {
        const emojiOptions = populateVerifyChoices(emojiObject);
        const channel = this.client.channels.cache.get(threadID);
        const embedMsg = new MessageEmbed()
            .setTitle("Verify Here")
            .setFooter({ text: this.twitterHandle , iconURL: this.logo})
            .setDescription(`
    NOTE: this thread will close in 10 minutes if inactive
    you will have 1 attempt to get the correct answer
    if failed to answer correctly, you will be kicked from the server


    Choose the correct fruit emoji to get verified!

    The fruit of question: **${emojiOptions[1]['value']}**!
            `)
        const row = new MessageActionRow()
            .addComponents(
                new MessageSelectMenu()
                    .setCustomId('verify')
                    .setPlaceholder('Select the correct fruit emoji with the label shown above')
                    .addOptions(emojiOptions[0])
            );
        channel.send({ embeds: [embedMsg], components: [row], ephemeral: true })
    }

    async createThread(memberObject) {
        try {
            const channel = this.client.channels.cache.get(process.env.verifyChannelID);
            const thread = await channel.threads.create({
                name: `${memberObject.username}${memberObject.discriminator}-verification`,
                type: 'GUILD_PRIVATE_THREAD' || 'GUILD_PUBLIC_THREAD',
                autoArchiveDuration: 60,
                reason: 'verification part 2'
            })
            await thread.members.add(memberObject.id);
            await this.sendVerifyOptions(thread.id);
            console.log(thread.name, 'thread created!')
            return thread.name;
        } catch (e) {
            console.log(e)
            return
        }
    }

    async deleteThread(channelId) {
        try {
            const channel = this.client.channels.cache.get(process.env.verifyChannelID);
            const thread = channel.threads.cache.find(t => t.id === channelId)
            return await thread.delete();
        } catch (e) {
            console.log(e)
            return
        }
    }

    async addRole(interaction) {
        try{
            const role = interaction.member.guild.roles.cache.find(role => role.id === this.verifiedRole)
            const member = interaction.guild.members.cache.get(interaction.user.id)
            member.roles.add(role).then(async response => {
                if (response._roles.includes(this.verifiedRole)) {
                    return await interaction.reply({ content: `Verification passed! <@&${this.verifiedRole}> role added!`})
                }
            })
        } catch (e) {
            console.log(e)
            return await interaction.reply({ content: `Unexpected error` })
        }
        
    }
};


module.exports = DiscordBot;


const emojiObject = {
    "🍎": "Apple",
    "🍐": "Pear",
    "🍊": "Orange",
    "🍋": "Lemon",
    "🍌": "Banana",
    "🍉": "Watermelon",
    "🍇": "Grapes",
    "🍓": "Strawberry",
    "🍑": "Peach",
    "🥭": "Mango",
    "🍍": "Pineapple",
}

function getRandom(tempArray) {
    return tempArray[Math.floor(Math.random() * tempArray.length)];
};

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

function getRandomKeyPair(obj) {
    var keys = Object.keys(obj);
    const correctKey = getRandom(keys);
    const correctValue = obj[correctKey];
    return {
        label: correctKey,
        value: correctValue
    };
};

function populateVerifyChoices(obj) {
    var tempArray = [];
    const correctPair = getRandomKeyPair(obj);
    const keyArray = Object.keys(obj);
    // removes the correct pair key from keyArray
    keyArray.splice(keyArray.indexOf(correctPair.label), 1)

    for (let i = 0; i < 5; i++) {
        const randKey = getRandom(keyArray);
        const randValue = obj[randKey];
        tempArray.push({
            label: randKey,
            value: randValue
        })
        // removes the randomly selected key from the keyArray
        // this ensures no duplicates will be found
        keyArray.splice(keyArray.indexOf(randKey), 1)
    }
    // insert the correct key-value pair into the array
    tempArray.splice(getRandomInt(0, 5), 0, correctPair)
    return [tempArray, correctPair];
};