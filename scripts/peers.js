const mongoose = require('mongoose')
const db = require('../lib/database')
const lib = require('../lib/explorer')
const settings = require('../lib/settings')

function exit () {
  mongoose.disconnect()
  process.exit(0)
}

var dbString = 'mongodb://' + settings.dbsettings.user
dbString = dbString + ':' + settings.dbsettings.password
dbString = dbString + '@' + settings.dbsettings.address
dbString = dbString + ':' + settings.dbsettings.port
dbString = dbString + '/' + settings.dbsettings.database

async function start () {
  try {
    await mongoose.connect(dbString)
    const peers = await lib.get_peers()

    for (const item of peers) {
      let address = item.addr.split(':')[0]
      let peer = await db.find_peer(address)
      if (!peer) {
        await db.create_peer({
          address: address,
          protocol: item.version,
          version: item.subver.replace('/', '').replace('/', ''),
          country: 'N/A'
        })
      }
    }
    exit()
  } catch (error) {
    console.error(error)
    console.log('Unable to connect to database: %s', dbString)
    console.log('Aborting')
    exit()
  }
}
start()
