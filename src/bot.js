const fs = require('fs')
var config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'))

var instanceId = -1

async function sendMsg(text) {
    process.send({
        id: instanceId,
        message: text,
        error: undefined,
    })
}
async function sendError(text, err) {
    process.send({
        id: instanceId,
        message: text,
        error: err == undefined ? 'No message' : err.stack,
    })
}

process.on('message', (m) => {
    if (Object.keys(m)[0] == 'id') {
        instanceId = m.id

        sendMsg('ID received by instance.')

        init()
    }
})

function init() {
    config['instances'][instanceId]['statusUpdateTime'] =
        config['statusUpdateTime']
    config = config['instances'][instanceId]

    if (config['timezone'] == '')
        config['timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone

    client.login(config['discordBotToken'])
}

function parse(text) {
    return text == '' ? undefined : text
}

const { setTimeout } = require('timers/promises')
function Sleep(ms) {
    return setTimeout(ms)
}

let cancelTimeout = new AbortController()
async function SleepCanceable(ms) {
    try {
        await setTimeout(ms, undefined, { signal: cancelTimeout.signal })
    } catch (error) {
        if (error.name === 'AbortError') cancelTimeout = new AbortController()
    }
}

const {
    Client,
    EmbedBuilder,
    AttachmentBuilder,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js')
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

client.on('ready', async () => {
    sendMsg('Logged in as "' + client.user.tag + '".')

    while (instanceId < 0) {
        await Sleep(1000)
    }

    let statusChannel = client.channels.cache.get(
        config['serverStatusChannelId']
    )
    if (statusChannel == undefined) {
        sendError(
            "Channel by ID '" + config['serverStatusChannelId'] + "' not found."
        )
        process.exit(1)
    }

    let statusMessage = await getStatusMessage(statusChannel)
    if (statusMessage == undefined) {
        sendError("Couldn't retrieve or create status message.")
        process.exit(1)
    }

    startStatusMessage(statusMessage)

    generateGraph()
})

client.once('reconnecting', (c) => {
    sendMsg('Reconnecting...')
})

async function getStatusMessage(statusChannel) {
    let statusMessage = await getLastMessage(statusChannel)
    if (statusMessage != undefined) {
        return statusMessage
    }

    let embed = new EmbedBuilder()
    embed.setTitle('Starting up the panel...')
    embed.setColor('#ffff00')

    return await statusChannel.send({ embeds: [embed] }).then((sentMessage) => {
        return sentMessage
    })
}

function getLastMessage(statusChannel) {
    return statusChannel.messages
        .fetch({ limit: 20 })
        .then((messages) => {
            messages = messages.filter(
                (msg) => msg.author.id == client.user.id && !msg.system
            )

            return messages.first()
        })
        .catch(function () {
            return
        })
}

const dns = require('dns')
async function startStatusMessage(statusMessage) {
    while (true) {
        dns.resolve('www.discord.com', (err) => {
            if (err) {
                sendError('Lost connection to Discord.')
                process.exit(1)
            }
        })
        try {
            let row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh')
                    .setEmoji('🔄')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled()
            )
            if (config['steam_connect_button']) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('steamLink')
                        .setLabel('Connect')
                        .setStyle(ButtonStyle.Primary)
                )
            }
            if (config['server_playerlist'] == '1') {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('playerlist')
                        .setEmoji('📊')
                        .setLabel('Playerlist')
                        .setStyle(ButtonStyle.Success)
                )
            }

            let embed = await generateStatusEmbed()
            let file =
                config['server_enable_graph'] &&
                fs.existsSync(
                    __dirname + '/temp/graphs/graph_' + instanceId + '.png'
                )
                    ? [
                          new AttachmentBuilder(
                              __dirname +
                                  '/temp/graphs/graph_' +
                                  instanceId +
                                  '.png'
                          ),
                      ]
                    : []
            statusMessage
                .edit({
                    embeds: [embed],
                    components: [row],
                    files: file,
                })
                .then(() =>
                    setTimeout(20000).finally(() => {
                        row.components[0].setDisabled(false)
                        statusMessage.edit({ components: [row] })
                    })
                )
                .catch((error) => {
                    sendError("Couldn't edit embed message.", error)
                })
        } catch (error) {
            sendError("Couldn't edit embed message.", error)
        }

        await SleepCanceable(config['statusUpdateTime'] * 1000)
    }
}

client.on('interactionCreate', (interaction) => {
    if (!interaction.isButton()) return

    if (interaction.customId == 'steamLink')
        interaction.reply({
            content:
                'steam://connect/' +
                config['server_host'] +
                ':' +
                config['server_port'],
            ephemeral: true,
        })
    else if (interaction.customId == 'refresh') {
        interaction.deferUpdate()
        cancelTimeout.abort()
    } else if (interaction.customId == 'playerlist') {
        return gamedig
            .query({
                type: config['server_type'],
                host: config['server_host'],
                port: config['server_port'],

                maxAttempts: 1,
                socketTimeout: 1600,
                givenPortOnly: true,
            })
            .then((state) => {
                let embed = new EmbedBuilder()

                embed.setTitle(
                    'Playerlist (' +
                        state.players.length +
                        '/' +
                        state.maxplayers +
                        '):'
                )
                embed.setColor(config['server_color'])

                embed = getPlayerlist(state, embed, true)

                interaction.reply({ embeds: [embed], ephemeral: true })
            })
            .catch(() => {
                interaction.reply({
                    content:
                        "Coundn't retrieve playerlist, it's possible the server is offline.",
                    ephemeral: true,
                })
            })
    }
})

const gamedig = require('gamedig')
var tic = false
function generateStatusEmbed() {
    let embed = new EmbedBuilder()

    if (config['server_title'] != '')
        embed.setAuthor({
            name: config['server_title'],
            iconURL: parse(config['server_logo']),
            url: parse(config['server_url']),
        })

    tic = !tic
    let ticEmojy = tic ? '⚪' : '⚫'

    let currentTime = new Date()

    embed.setTimestamp(currentTime)

    let serverTimeString = currentTime.toLocaleString('ru', {
        timeZone: config['timezone'],
    })

    embed.setFooter({
        text:
            'Server time : ' +
            serverTimeString +
            '\n' +
            ticEmojy +
            ' ' +
            'Last updated',
    })

    return gamedig
        .query({
            type: config['server_type'],
            host: config['server_host'],
            port: config['server_port'],

            maxAttempts: 5,
            socketTimeout: 4000,
            attemptTimeout: 20000,
            givenPortOnly: true,
        })
        .then((state) => {
            embed.setColor(config['server_color'])

            let serverName = config['server_name']
            if (serverName == '') serverName = state.name

            for (let i = 0; i < serverName.length; i++) {
                if (serverName[i] == '^') {
                    serverName =
                        serverName.slice(0, i) + ' ' + serverName.slice(i + 2)
                } else if (serverName[i] == '█') {
                    serverName =
                        serverName.slice(0, i) + ' ' + serverName.slice(i + 1)
                } else if (serverName[i] == '�') {
                    serverName =
                        serverName.slice(0, i) + ' ' + serverName.slice(i + 2)
                }
            }

            embed.addFields({ name: 'Server name' + ' :', value: serverName })

            if (!config['minimal']) {
                embed.addFields(
                    {
                        name: 'Direct connect' + ' :',
                        value: '`' + state.connect + '`',
                        inline: true,
                    },
                    {
                        name: 'Gamemode' + ' :',
                        value:
                            config['server_gamemode'] == ''
                                ? config['server_type']
                                : config['server_gamemode'],
                        inline: true,
                    }
                )
                if (state.map == '') {
                    embed.addFields({
                        name: '\u200B',
                        value: '\u200B',
                        inline: true,
                    })
                } else {
                    embed.addFields({
                        name: 'Map' + ' :',
                        value: state.map,
                        inline: true,
                    })
                }
            }

            embed.addFields(
                {
                    name: 'Status' + ' :',
                    value: '✅ ' + 'Online',
                    inline: true,
                },
                {
                    name: 'Player count' + ' :',
                    value: state.players.length + '/' + state.maxplayers,
                    inline: true,
                },
                { name: '\u200B', value: '\u200B', inline: true }
            )

            // player list
            if (
                config['server_playerlist'] == '2' &&
                state.players.length > 0
            ) {
                embed = getPlayerlist(state, embed, false)
            }

            // set bot activity
            client.user.setActivity(
                '✅ Online: ' + state.players.length + '/' + state.maxplayers,
                { type: 'WATCHING' }
            )

            // add graph data
            graphDataPush(currentTime, state.players.length)

            // set graph image
            if (config['server_enable_graph']) {
                embed.setImage('attachment://graph_' + instanceId + '.png')
            }

            return embed
        })
        .catch(() => {
            sendError("Couldn't query the server")

            // set bot activity
            client.user.setActivity('❌ Offline.', { type: 'WATCHING' })

            // offline status message
            embed.setColor('#ff0000')
            embed.setTitle('❌ ' + 'Server offline' + '.')

            // add graph data
            graphDataPush(currentTime, 0)

            // set graph image
            if (config['server_enable_graph']) {
                embed.setImage('attachment://graph_' + instanceId + '.png')
            }
            return embed
        })
}

function getPlayerlist(state, embed, isInline) {
    // recover game data
    let dataKeys = Object.keys(state.players[0])

    // set name as first
    if (dataKeys.includes('name')) {
        dataKeys = dataKeys.filter((e) => e !== 'name')
        dataKeys.splice(0, 0, 'name')
    }

    // remove some unwanted data
    dataKeys = dataKeys.filter(
        (e) =>
            e !== 'frags' &&
            e !== 'score' &&
            e !== 'guid' &&
            e !== 'id' &&
            e !== 'team' &&
            e !== 'squad' &&
            // e !== 'raw' && // need to parse raw data -> time and score
            e !== 'skin'
    )

    // declare field label
    let field_label = 'Time and nickname'

    let fields = []
    let j = 0
    fields[j] = '```\n'
    for (let i = 0; i < state.players.length; i++) {
        if (i + 1 - j * 30 > 30) {
            fields[j] += '```'
            j++
            fields[j] = '```\n'
        }

        // set player data
        if (state.players[i]['name'] != undefined) {
            let player_data = null

            // adding numbers to beginning of name list
            let index = i + 1 > 9 ? i + 1 : '0' + (i + 1)
            if (config['server_enable_numbers']) {
                fields[j] += index + '〕'
            }

            // player time data
            player_data = state.players[i]['raw'].time
            if (player_data == undefined) {
                player_data = 0
            }
            // process time
            let date = new Date(player_data * 1000)
                .toISOString()
                .substring(11, 19)
                .split(':')
            date = date[0] + ':' + date[1]
            fields[j] += date

            fields[j] += '｜'

            // player name data
            player_data = state.players[i]['name']
            if (player_data == '') {
                player_data = '*loading*'
            }
            // process name
            for (let k = 0; k < player_data.length; k++) {
                if (player_data[k] == '^') {
                    player_data =
                        player_data.slice(0, k) + ' ' + player_data.slice(k + 2)
                }
            }
            // handle very long strings
            // maximum char. for every field is 1024, this implimentation reaches ~1000
            // 7 chars for brackets and 32 (9+22+1) per line
            player_data =
                player_data.length > 22
                    ? player_data.substring(0, 22 - 3) + '...'
                    : player_data

            fields[j] += player_data
        }
        fields[j] += '\n'
    }
    fields[j] += '```'

    // add fields to embed
    embed.addFields({
        name: field_label + ' :',
        value: fields[0],
        inline: isInline,
    })
    for (let i = 1; i < fields.length; i++) {
        embed.addFields({ name: '\u200B', value: fields[i], inline: isInline })
    }

    return embed
}

function graphDataPush(time, nbrPlayers) {
    // save data to json file
    fs.readFile(
        __dirname + '/temp/data/serverData_' + instanceId + '.json',
        (err, data) => {
            // create file if does not exist
            if (err) {
                fs.writeFile(
                    __dirname + '/temp/data/serverData_' + instanceId + '.json',
                    JSON.stringify([]),
                    (error) => {
                        if (error) throw error
                    }
                )
                return
            }

            let json
            // read old data and concat new data
            try {
                json = JSON.parse(data)
            } catch (error) {
                sendError("Couldn't read JSON file.", error)
                json = JSON.parse('[]')
            }

            // remove ~24 hour old data
            let nbrMuchData =
                json.length - (24 * 60 * 60) / config['statusUpdateTime']
            if (nbrMuchData > 0) {
                json.splice(0, nbrMuchData)
            }

            json.push({ x: time, y: nbrPlayers })

            // append data file
            fs.writeFile(
                __dirname + '/temp/data/serverData_' + instanceId + '.json',
                JSON.stringify(json),
                () => {}
            )
        }
    )
}

// create graph
const width = 600
const height = 400
const { ChartJSNodeCanvas } = require('chartjs-node-canvas')
require('chartjs-adapter-date-fns')
const { utcToZonedTime } = require('date-fns-tz')
var canvasRenderService = new ChartJSNodeCanvas({ width, height })
var timeFormat = {
    millisecond: 'HH:mm',
    second: 'HH:mm',
    minute: 'HH:mm',
    hour: 'HH:mm',
    day: 'HH:mm',
    week: 'HH:mm',
    month: 'HH:mm',
    quarter: 'HH:mm',
    year: 'HH:mm',
}
async function generateGraph() {
    while (client.token != null) {
        try {
            let data = []

            try {
                data = JSON.parse(
                    fs.readFileSync(
                        __dirname +
                            '/temp/data/serverData_' +
                            instanceId +
                            '.json',
                        { encoding: 'utf8', flag: 'r' }
                    )
                )
            } catch (error) {
                data = []
            }

            let graph_labels = []
            let graph_datas = []

            // set data
            for (let i = 0; i < data.length; i += 1) {
                graph_labels.push(
                    utcToZonedTime(data[i]['x'], config['timezone'])
                )
                graph_datas.push(data[i]['y'])
            }

            let graphConfig = {
                type: 'line',

                data: {
                    labels: graph_labels,
                    datasets: [
                        {
                            label: 'player count',
                            data: graph_datas,

                            pointRadius: 0,

                            backgroundColor: hexToRgb(
                                config['server_color'],
                                0.2
                            ),
                            borderColor: hexToRgb(config['server_color'], 1.0),

                            fill: true,
                            spanGaps: true, // enable for a single dataset
                        },
                    ],
                },

                options: {
                    plugins: {
                        decimation: {
                            enabled: true,
                            algorithm: 'lttb',
                            samples: 500,
                        },
                        legend: {
                            display: true,
                            labels: {
                                color: 'rgb(192,192,192)',
                            },
                        },
                    },

                    scales: {
                        yAxes: {
                            display: true,
                            beginAtZero: true,
                            ticks: {
                                color: 'rgb(192,192,192)',
                                precision: 0,
                            },
                            grid: {
                                color: 'rgba(255,255,255,0.2)',
                                lineWidth: 0.5,
                            },
                        },
                        xAxes: {
                            display: true,
                            type: 'time',
                            ticks: {
                                color: 'rgb(192,192,192)',
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 10,
                            },

                            time: {
                                parser: 'HH:mm',
                                displayFormats: timeFormat,
                                unit: 'hour',
                                stepSize: 1,
                            },
                            grid: {
                                color: 'rgba(255,255,255,0.2)',
                                lineWidth: 0.5,
                            },
                        },
                    },
                    datasets: {
                        normalized: true,
                    },
                    elements: {
                        point: {
                            radius: 0,
                        },
                        line: {
                            borderWidth: 2, // line width
                        },
                    },
                    animation: {
                        duration: 0,
                    },
                    responsiveAnimationDuration: 0,
                    hover: {
                        animationDuration: 0,
                    },
                },
            }

            let graphFile = 'graph_' + instanceId + '.png'

            canvasRenderService
                .renderToBuffer(graphConfig)
                .then((data) => {
                    fs.writeFileSync(
                        __dirname + '/temp/graphs/' + graphFile,
                        data
                    )
                })
                .catch((error) => {
                    sendError("Couldn't render graph.", error)
                })
        } catch (error) {
            sendError("Couldn't generate graph image.", error)
        }

        await Sleep(60 * 1000) // every minute
    }
}

// does what its name says
function hexToRgb(hex, opacity) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
        ? 'rgba(' +
              parseInt(result[1], 16) +
              ', ' +
              parseInt(result[2], 16) +
              ', ' +
              parseInt(result[3], 16) +
              ', ' +
              opacity +
              ')'
        : null
}
