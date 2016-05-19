var okConfig = require('./okConfig')
var generateDocUrl = require('./generateDocUrl')
var txn = require('txn')
var async = require('async')
var request = require('request')
var jsonfilter = require('jsonfilter')
var ndjson = require('ndjson')
var through = require('through2')
var devnull = require('dev-null')

exports.createWorker = function (worker) {
  return {
    start: exports.start.bind(null, worker)
  }
}

exports.start = function (worker, config) {
  var ok = okConfig(config)
  if (ok.error) return new Error(ok)

  var q = async.queue(exports.processor.bind(null, config, worker(config)), config.concurrency || 1)
  var total = 0
  request(config.view)
    .pipe(jsonfilter('rows.*'))
    .pipe(ndjson.parse())
    .pipe(through.obj((data, enc, cb) => {
      if (!data.id) cb('no id on row')
      console.log('queing', data.id)
      q.push(data.id)
      total++
      cb(null, {queued: true})
    }), function (cb) {
      console.log('total queued:', total)
      cb()
    })
    .pipe(ndjson.stringify())
    .pipe(devnull())
  return q
}

exports.processor = function (config, worker, id, cb) {
  var doc_url = generateDocUrl(config.view, id)
  console.log('processing', id, doc_url, worker)
  var opts = {
    uri: doc_url,
    timeout: config.timeout || 15000
  }
  txn(opts, worker.migrate, (err, doc) => {
    if (err) {
      console.log('there was an error migrating', id, err)
      return cb(err)
    }
    // verify the doc
    console.log('txn complete', id)
    if (!worker.migrated(doc)) {
      console.log('txn completed, but worker migrated function still false', id)
      cb('txn completed, but worker migrated function still false')
    }
    console.log('doc migrated successful', id)
    cb()
  })
}
