var okConfig = require('./okConfig')
var generateDocUrl = require('./generateDocUrl')
var txn = require('txn')
var async = require('async')
var request = require('request')
var jsonfilter = require('jsonfilter')
var ndjson = require('ndjson')
var through = require('through2')

exports.createWorker = function (worker) {
  return {
    start: exports.start.bind(null, worker)
  }
}

exports.start = function (worker, config, cb) {
  var ok = okConfig(config)
  if (ok.error) return cb(ok.error)

  var q = async.queue(exports.processor.bind(null, config, worker), config.concurrency || 1)

  request(config.view)
    .pipe(jsonfilter('rows.*'))
    .pipe(ndjson.parse())
    .pipe(through.obj((data, enc, cb) => {
      if (!data.id) cb('no id on row')
      console.log('queing', data.id)
      q.push(data.id)
      cb(null, {queued: true})
    }))
  return q
}

exports.processor = function (config, worker, id, cb) {
  var doc_url = generateDocUrl(config.view, id)
  console.log('processing', id, doc_url)
  txn({uri: doc_url}, worker.migrate, (err, doc) => {
    if (err) return cb(err)
    // verify the doc
    console.log('txn complete', id)
    if (!worker.migrated(doc)) cb('txn completed, but worker migrated function still false')
    console.log('doc migrated successful', id)
    cb()
  })
}
