var jsonist = require('jsonist')
var generateDocUrl = require('./generateDocUrl')
/**
 * Make sure there's an up-to-date design doc in place for monitoring
 * progress of the worker
 */

module.exports = function (config, worker, cb) {
  var ddoc = {
    _id: ddocId(config),
    language: 'javascript',
    views: {
      lib: {},
      ignored: {
        map: 'function (doc) {\n' +
          'if ((' + worker.ignored.toString() + '(doc))) emit(doc._id, 1);' +
          '}',
        reduce: '_count'
      },
      not_migrated: {
        map: 'function (doc) {\n' +
          'if (!(' + worker.ignored.toString() + '(doc)) && \n' +
          '!(' + worker.migrated.toString() + '(doc))) emit(doc._id, 1);' +
          '}',
        reduce: '_count'
      },
      migrated: {
        map: 'function (doc) {\n' +
          'if (!(' + worker.ignored.toString() + '(doc)) && \n' +
          '(' + worker.migrated.toString() + '(doc))) emit(doc._id, 1);' +
          '}',
        reduce: '_count'
      }
    }
  }
  if (worker.lib) {
    Object.keys(worker.lib).forEach(function (lib) {
      ddoc.views.lib[lib] = worker.lib[lib]
    })
  }

  var ddoc_url = generateDocUrl(config.view, ddoc._id)
  return jsonist.get(ddoc_url, (err, prev_ddoc) => {

    if (err) return cb(err)
    if (prev_ddoc && prev_ddoc.error === 'not_found') {
      return jsonist.put(ddoc_url, ddoc, cb)
    }
    if (prev_ddoc && prev_ddoc.error) return cb(prev_ddoc.error)

    // check if ddoc is up to date
    var _rev = prev_ddoc._rev
    delete prev_ddoc._rev
    if (JSON.stringify(prev_ddoc) !== JSON.stringify(ddoc)) {
      var newddoc = cloneJSON(ddoc)
      newddoc._rev = _rev
      return jsonist.put(ddoc_url, newddoc, cb)
    }
    return cb()
  })
}

function ddocId (config) {
  return '_design/worker:' + config.name
}

function cloneJSON (doc) {
  return JSON.parse(JSON.stringify(doc))
}
