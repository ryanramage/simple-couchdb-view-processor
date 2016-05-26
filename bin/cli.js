#!/usr/bin/env node
var path = require('path')
if (process.argv.length != 5) {
  console.log('usage: simple-couchdb-view-processor config.js worker.js [init]')
  process.exit()
}

var user_config = require(path.resolve('.', process.argv[2]))
var worker = require(path.resolve('.', process.argv[3]))

if (process.argv[4] === 'init') {
  var ensure = require('../lib/ensureDesignDoc')

  ensure(user_config, worker(user_config), (err, result) => {
    console.log(err, result)
  })
} else {
  // no init was supplied. just run
  var q = require('../lib').createWorker(worker).start(user_config)
  setInterval(function () {
    var howMany = q.length()
    console.log(howMany, 'tasks left')
    if (q.length() === 0) {
      console.log('Exiting...')
      process.exit()
    }
  }, 1000)
}
