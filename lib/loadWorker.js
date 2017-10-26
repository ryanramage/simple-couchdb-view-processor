exports.loadWorker = function (worker, config) {
  if (typeof worker !== 'function') {
    throw new Error('Worker should expose a function as module.exports')
  }
  var w = worker(config)
  function checkFunction (prop) {
    if (!w[prop]) throw new Error('Worker should expose "' + prop + '" property as a function or string')
    if (typeof w[prop] === 'string') {
      w[prop] = exports.funcFromString(w[prop])
      return
    }
    if (typeof w[prop] !== 'function') {
      throw new Error(
        'Worker should expose "' + prop + '" property as a function or string'
      )
    }
  }
  checkFunction('ignored')
  checkFunction('migrated')
  checkFunction('migrate')
  return w
}

exports.funcFromString = function (str) {
  return new Function('doc', str) // eslint-disable-line
}
