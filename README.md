# simple-couchdb-view-processor

This is a very simplified [couch-worker](https://github.com/ryanramage/couch-worker)
replacement. Instead of operating on the changes feed, this module

 - Gathers all the document ids from the view
 - Loads a async.queue with the ids
 - processes in parallel each id up to config.concurrency
    * Load the document
    * calls the migrate function
    * checks that the doc meets the migrated function
 - Quits when the last element is processed (drain is called)

```
npm install simple-couchdb-view-processor -g
```

## Usage

``` js
simple-couchdb-view-processor configfile.js workerfile.js [init]
```
the optional 'init' switch is used to put the design doc into couchdb.


## Defining a workerfile.js

```javascript
var jsonist = require('jsonist')

module.exports = function (config) {
  var api = {}
  api.ignored = function (doc) {
    if (!doc['Listing Agent ID']) return true
    return false
  }

  api.migrated = function (doc) {
    if (!doc.ListingAgent) return false
    return true
  }

  api.migrate = function (doc, callback) {
    var agent_doc_url = config.agent_db + '/' + doc['Listing Agent ID']
    jsonist.get(agent_doc_url, (err, agent_doc) => {
      if (err) return callback(err)
      if (agent_doc.error) return callback(agent_doc) // its a tricky one
      doc.ListingAgent = agent_doc
      callback(null, doc)
    })
  }
  return api
}

```

### ignored(doc)

This should be a predicate which returns true if the document is ignored by
the worker, false otherwise. You might want to restrict the worker to
operating on a specific document type, and exclude design docs for example.

**Important:** This function must be self-contained and not use surrounding
scope so that it's suitable for converting to a string and sending to
couchdb. That means no node-specific code or referencing things outside
of the function body.

### migrated(doc)

This should be a predicate which returns true if the doc has already been
migrated, false otherwise. All documents returned from the `migrate()`
function **must** pass this predicate.

**Important:** This function must be self-contained and not use surrounding
scope so that it's suitable for converting to a string and sending to
couchdb. That means no node-specific code or referencing things outside
of the function body.

### migrate(doc, callback)

This is the migration function which can cause whatever effects may be
required to update the document then passes the updated document back to
the callback. You can return multiple documents in an array if you like,
but you **must** return the original document as one of them (modified so
that it passes the `migrated()`predicate).

This function will always be called from Node.js, so you can use
surrounding scope in the module and require other Node modules.


## configfile.js

This sets up the needed configuration to point to the correct view, and set other options described below.

```javascript
var rc = require('rc')
var config_agent = rc('ndjson-to-couchdb')
var config_listings = rc('retssync')

module.exports = {
  name: 'agent-info',
  view: config_listings.couch + '/idx-' + config_listings.name + '/_design/worker:agent-info/_view/not_migrated?reduce=false',
  agent_db: config_agent.url
}
```

### Common configuration options

Your worker can use additional configuration properties as required (for
API keys etc), but all workers have the following options available.

* __name__ (required) - *String* - The unique name for this worker instance
* __view__ (required) *String* - The database view URL (with credentials) to
  migrate documents in
* __concurrency__ - *Number* - Maximum number of documents to process in
  parallel
* __timeout__ - *Number* Time to wait in milliseconds for `migrate()` calls to
  return before causing a timeout error and discarding any future result
* __checkpoint\_size__ - *Number* - The number of documents to process before
  recording a checkpoint (the sequence id the worker will resume processing
  from on a restart)
* __retry\_attempts__ - *Number* - Number of times to retry a `migrate()` when
  an error is returned before recording the error in the log\_database and
  moving onto the next change
* __retry\_interval__ - *Number* - Number of milliseconds to wait before retrying
* __bucket__ - *Object* - An object with `start` and/or `end` properties. This
  causes the worker to hash all document IDs using md5 to put them into fair
  buckets. The worker will only process the document if the hex digest of the md5
  hash is greater than or equal to `start` and less than `end`. All other
  documents will be ignored. This allows you to run multiple instances of
  the same worker to split up processing of documents. Start and end
  properties should be Strings in the hex range ('0000...' to 'ffff..').
  Omitting the start property means "process everything up until 'end'",
  omitting the end property means "process everything from 'start'
  onwards".


## License

MIT
