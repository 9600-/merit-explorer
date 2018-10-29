const mongoose = require('mongoose')
const db = require('../lib/database')
const Tx = require('../models/tx')
const Address = require('../models/address')
const Richlist = require('../models/richlist')
const Stats = require('../models/stats')
const settings = require('../lib/settings')
const fs = require('fs')

mongoose.Promise = Promise

var mode = 'update'
var database = 'index'

// displays usage and exits
function usage () {
  console.log('Usage: node scripts/sync.js [database] [mode]')
  console.log('')
  console.log('database: (required)')
  console.log('index [mode] Main index: coin info/stats, transactions & addresses')
  console.log('market       Market data: summaries, orderbooks, trade history & chartdata')
  console.log('')
  console.log('mode: (required for index database only)')
  console.log('update       Updates index from last sync to current block')
  console.log('check        checks index for (and adds) any missing transactions/addresses')
  console.log('reindex      Clears index then resyncs from genesis to current block')
  console.log('')
  console.log('notes:') 
  console.log('* \'current block\' is the latest created block when script is executed.')
  console.log('* The market database only supports (& defaults to) reindex mode.')
  console.log('* If check mode finds missing data(ignoring new data since last sync),') 
  console.log('  index_timeout in settings.json is set too low.')
  console.log('')
  process.exit(0)
}

// check options
if (process.argv[2] === 'index') {
  if (process.argv.length < 3) {
    usage()
  } else {
    switch (process.argv[3]) {
      case 'update':
        mode = 'update'
        break
      case 'check':
        mode = 'check'
        break
      case 'reindex':
        mode = 'reindex'
        break
      default:
        usage()
    }
  }
} else if (process.argv[2] === 'market') {
  database = 'market'
} else {
  usage()
}

function create_lock () {
  if (database === 'index') {
    var fname = './tmp/' + database + '.pid'
    fs.appendFileSync(fname, process.pid, function (err) {
      if (err) {
        console.log('Error: unable to create %s', fname)
        process.exit(1)
      }
    })
  }
}

function remove_lock () {
  if (database === 'index') {
    var fname = './tmp/' + database + '.pid'
    try {
      fs.unlinkSync(fname)
    } catch (error) {
      console.log('unable to remove lock: %s', fname)
      process.exit(1)
    }
  }
}

function is_locked () {
  if (database === 'index') {
    var fname = './tmp/' + database + '.pid'
    try {
      fs.statSync(fname)
      return true
    } catch (error) {
      return false
    }
  }
}

function exit () {
  remove_lock()
  mongoose.disconnect()
  process.exit(0)
}

var dbString = 'mongodb://' + settings.dbsettings.user
dbString = dbString + ':' + settings.dbsettings.password
dbString = dbString + '@' + settings.dbsettings.address
dbString = dbString + ':' + settings.dbsettings.port
dbString = dbString + '/' + settings.dbsettings.database

async function start () {
  if (is_locked()) {
    console.log('Script already running..')
    process.exit(0)
  } else {
    create_lock()
    console.log('script launched with pid: ' + process.pid)
    await mongoose.connect(dbString)
    if (database === 'index') {
      const exists = await db.check_stats(settings.coin)
      if (exists === false) {
        console.log('Run \'npm start\' to create database structures before running this script.')
        exit()
      } else {
        await db.update_db(settings.coin)
        const stats = await db.get_stats(settings.coin)
        if (settings.heavy === true) {
          await db.update_heavy(settings.coin, stats.count, 20)
        }
        if (mode === 'reindex') {
          await Tx.remove({})
          await Address.remove({})
          await Richlist.update({ coin: settings.coin }, {
            received: [],
            balance: [],
            inviteBalance: [],
          })
          Stats.update({ coin: settings.coin }, { last: 0 })
          console.log('index cleared (reindex)')

          await db.update_tx_db(settings.coin, 1, stats.count, settings.update_timeout)
          await db.update_richlist('received')
          await db.update_richlist('balance')
          await db.update_richlist('invites')
          const nstats = await db.get_stats(settings.coin)
          console.log('reindex complete (block: %s)', nstats.last)
          exit()
        } else if (mode === 'check') {
          await db.update_tx_db(settings.coin, 1, stats.count, settings.check_timeout)
          const nstats = db.get_stats(settings.coin)
          console.log('check complete (block: %s)', nstats.last)
          exit()
        } else if (mode === 'update') {
          await db.update_tx_db(settings.coin, stats.last, stats.count, settings.update_timeout)
          await db.update_richlist('received')
          await db.update_richlist('balance')
	  await db.update_richlist('invites')
          const nstats = await db.get_stats(settings.coin)
          console.log('update complete (block: %s)', nstats.last)
          exit()
        }
      }
    } else {
      console.log('Markets not implemented')
      // update markets
      // var markets = settings.markets.enabled
      // var complete = 0
      // for (var x = 0; x < markets.length; x++) {
      //   var market = markets[x]
      //     db.check_market(market, function (mkt, exists) {
      //       if (exists) {
      //         db.update_markets_db(mkt, function (err) {
      //           if (!err) {
      //             console.log('%s market data updated successfully.', mkt)
      //             complete++
      //             if (complete == markets.length) {
      //               exit()
      //             }
      //           } else {
      //             console.log('%s: %s', mkt, err)
      //             complete++
      //             if (complete == markets.length) {
      //               exit()
      //             }
      //           }
      //         })
      //       } else {
      //         console.log('error: entry for %s does not exists in markets db.', mkt)
      //         complete++
      //         if (complete == markets.length) {
      //           exit()
      //         }
      //       }
      //     })
      //   }
    }
  }
}
start()
