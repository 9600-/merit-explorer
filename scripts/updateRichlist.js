var mongoose = require('mongoose')
  , db = require('../lib/database')
  , Tx = require('../models/tx')  
  , Address = require('../models/address')  
  , Richlist = require('../models/richlist')  
  , Stats = require('../models/stats')  
  , settings = require('../lib/settings')


var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

async function updateRichlist() {
  try {
    await mongoose.connect(dbString)
    await db.update_richlist('received')
    await db.update_richlist('balance')
    await db.update_richlist('inviteBalance')
    console.log('Done?')
    await mongoose.connection.close()
  } catch (err) {
    console.error(err)
  }
}
updateRichlist();
