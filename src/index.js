const fs = require('fs')
if (!fs.existsSync(__dirname + '/config.json')) {
    console.warn(
        "Config file not found! Check README.md for config.json file and place it in '" +
            __dirname +
            "' folder."
    )
    process.exit(0)
}
const config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'))

if (!fs.existsSync(__dirname + '/temp')) {
    fs.mkdirSync(__dirname + '/temp')
}
if (!fs.existsSync(__dirname + '/temp/graphs')) {
    fs.mkdirSync(__dirname + '/temp/graphs')
}
if (!fs.existsSync(__dirname + '/temp/data')) {
    fs.mkdirSync(__dirname + '/temp/data')
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
function getTime() {
    return new Date().toLocaleString('en-GB', timeZone).replace(/,/, '')
}

require('dns').resolve('www.discord.com', function (err) {
    if (err) {
        console.log('No connection to Discord')
        process.exit(1)
    } else {
        console.log('Connected to Discord')
    }
})

const ChildProcess = require('child_process')
var instances = []

for (let i = 0; i < config['instances'].length; i++) {
    let instance = ChildProcess.fork(__dirname + '/bot.js')

    instance.on('message', (m) => {
        if (m.error) {
            console.error(
                '[%s][%s]: %s\n%s',
                getTime(),
                m.id,
                m.message,
                m.error
            )
        } else {
            console.log('[%s][%s]: %s', getTime(), m.id, m.message)
        }
    })

    instance.send({ id: i })

    instances.push(instance)
}
