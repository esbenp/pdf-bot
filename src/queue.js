var low = require('lowdb')
var uuid = require('uuid')
var debug = require('debug')('pdf:db')
var error = require('./error')
var webhook = require('./webhook')
var utils = require('./utils')

function createQueue (path, options = {}, initialValue = []) {
  var db = low(path, options)

  db.defaults({
      queue: initialValue
    })
    .write()

  var createQueueMethod = function (func) {
    return function() {
      var args = Array.prototype.slice.call(arguments, 0)
      return func.apply(func, [db].concat(args))
    }
  }

  return {
    addToQueue: createQueueMethod(addToQueue),
    attemptPing: createQueueMethod(attemptPing),
    getById: createQueueMethod(getById),
    getList: createQueueMethod(getList),
    getNext: createQueueMethod(getNext),
    processJob: createQueueMethod(processJob)
  }
}

function addToQueue (db, data) {
  var id = uuid()
  var createdAt = utils.getCurrentDateTimeAsString()

  var defaults = {
    meta: {}
  }

  if (!data.url || !utils.isValidUrl(data.url)) {
    return error.createErrorResponse(error.ERROR_INVALID_URL)
  }

  if (data.meta && typeof data.meta !== 'object') {
    return error.createErrorResponse(error.ERROR_META_IS_NOT_OBJECT)
  }

  data = Object.assign(defaults, data, {
    id: id,
    created_at: createdAt,
    completed_at: null,
    generatorTries: 0,
    pings: [],
    pingTries: 0,
    storage: {}
  })

  debug('Pushing job to queue with data %s', JSON.stringify(data))

  db
    .get('queue')
    .push(data)
    .write()

  return data
}

// =========
// RETRIEVAL
// =========

function getList (db, failed = false, pristine = false, limit) {
  var query = db.get('queue')

  if (failed) {
    // Show failed jobs
    query = query.filter(function (job) {
      return job.completed_at === null && job.generatorTries > -1
    })
  } else {
    // Show completed and optionally new jobs
    query = query.filter(function (job) {
      return job.completed_at !== null || (pristine === true && job.generatorTries === -1)
    })
  }

  if (limit) {
    query = query.take(limit)
  }

  return query.value()
}

function getById (db, id) {
  return db
    .get('queue')
    .find({ id: id })
    .value()
}

function getNext (db) {
  return db
    .get('queue')
    .filter(function (job) {
      return job.completed_at === null && job.generatorTries < 3
    })
    .take(1)
    .value()[0]
}

// ==========
// PROCESSING
// ==========

function processJob (db, generator, job, webhookOptions) {
  return generator(job.url, job)
    .then(response => {
      if (!error.isError(response)) {
        debug('Job %s was processed, marking job as complete.', job.id)

        _bumpGeneratorTries(db, job.id)
        _markAsCompleted(db, job.id)
        _setStorage(db, job.id, response.storage)

        if (webhookOptions) {
          // Important to return promise otherwise the npm cli process will exit early
          return attemptPing(db, job, webhookOptions)
            .then(function() {
              return response
            })
        }
      } else {
        _bumpGeneratorTries(db, job.id)
      }

      return response
    })
}

// =======
// PINGING
// =======

function attemptPing (db, job, webhookOptions) {
  if (!(typeof webhookOptions === 'object')) {
    throw new Error('No webhook is configured.')
  }

  return webhook.ping(job, webhookOptions).then(response => {
    _bumpPingTries(db, job.id)
    _logPing(db, job.id, response)

    return response
  })
}

// ===============
// PRIVATE METHODS
// ===============

function _setStorage (db, id, storage) {
  return db
    .get('queue')
    .find({ id: id })
    .assign({ storage: storage })
    .write()
}

function _bumpGeneratorTries (db, id) {
  debug('Bumping tries for job ID %s', id)

  var job = getById(db, id)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ generatorTries: (job.generatorTries + 1) })
    .write()
}

function _bumpPingTries (db, id) {
  debug('Bumping ping tries for job ID %s', id)

  var job = getById(db, id)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ pingTries: (job.pingTries + 1) })
    .write()
}

function _logPing (db, id, data) {
  debug('Logging ping for job ID %s', id)

  var job = getById(db, id)

  var pings = job.pings.slice(0)
  pings.push(data)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ pings: pings })
    .write()
}

function _markAsCompleted (db, id) {
  var completed_at = utils.getCurrentDateTimeAsString()

  debug('Marking job ID %s as completed at %s', id, completed_at)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ completed_at: completed_at })
    .write()
}

module.exports = createQueue
