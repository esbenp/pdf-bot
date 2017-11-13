var uuid = require('uuid')
var debug = require('debug')('pdf:db')
var error = require('./error')
var webhook = require('./webhook')
var utils = require('./utils')

function createQueue (db, options = {}) {
  var createQueueMethod = function (func) {
    return function() {
      var args = Array.prototype.slice.call(arguments, 0)
      return func.apply(func, [db].concat(args))
    }
  }

  return {
    addToQueue: createQueueMethod(addToQueue),
    attemptPing: createQueueMethod(attemptPing),
    close: createQueueMethod(close),
    getById: createQueueMethod(getById),
    getList: createQueueMethod(getList),
    getNext: createQueueMethod(getNext),
    getAllUnfinished: createQueueMethod(getAllUnfinished),
    getNextWithoutSuccessfulPing: createQueueMethod(getNextWithoutSuccessfulPing),
    isBusy: createQueueMethod(isBusy),
    processJob: createQueueMethod(processJob),
    purge: createQueueMethod(purge),
    setIsBusy: createQueueMethod(setIsBusy)
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
    generations: [],
    pings: [],
    storage: {}
  })

  debug('Pushing job to queue with data %s', JSON.stringify(data))

  return db.pushToQueue(data)
}

function close(db) {
  return db.close()
}

// =========
// RETRIEVAL
// =========

function getList (db, failed = false, completed = false, limit) {
  return db.getList(failed, completed, limit)
}

function getById (db, id) {
  return db.getById(id)
}

function getNext (db, shouldWait, maxTries = 5) {
  return getAllUnfinished(db, shouldWait, maxTries).then(function (jobs) {
    return jobs.length > 0 ? jobs[0] : null;
  })
}

function getAllUnfinished (db, shouldWait, maxTries = 5) {
  return db.getAllUnfinished (shouldWait, maxTries)
}

function getNextWithoutSuccessfulPing (db, shouldWait, maxTries = 5) {
  return db.getNextWithoutSuccessfulPing(shouldWait, maxTries)
}

function isBusy (db) {
  return db.isBusy()
}

function purge (db, failed = false, pristine = false, maxTries = 5) {
  return db.purge(failed, pristine, maxTries)
}

function setIsBusy(db, isBusy) {
  return db.setIsBusy(isBusy)
}

// ==========
// PROCESSING
// ==========

function processJob (db, generator, job, webhookOptions) {
  return generator(job.url, job)
    .then(function (response) {
      return _logGeneration(db, job.id, response)
        .then(function (logResponse) {
          if (!error.isError(response)) {
            debug('Job %s was processed, marking job as complete.', job.id)

            return Promise.all([
              _markAsCompleted(db, job.id),
              _setStorage(db, job.id, response.storage)
            ]).then(function () {
              if (!webhookOptions) {
                return response
              }

              // Re-fetch the job as storage has been added
              return getById(db, job.id).then(function (job) {
                // Important to return promise otherwise the npm cli process will exit early
                return attemptPing(db, job, webhookOptions)
                  .then(function() {
                    return response
                  })
              })
            })
          }

          return response
        })
    })
}

// =======
// PINGING
// =======

function attemptPing (db, job, webhookOptions) {
  if (!(typeof webhookOptions === 'object')) {
    throw new Error('No webhook is configured.')
  }

  return webhook.ping(job, webhookOptions)
    .then(response => {
      return _logPing(db, job.id, response)
        .then(function () {
          return response
        })
    })
}

// ===============
// PRIVATE METHODS
// ===============

function _logGeneration (db, id, response) {
  debug('Logging try for job ID %s', id)

  return db.logGeneration(id, response)
}

function _logPing (db, id, response) {
  debug('Logging ping for job ID %s', id)

  return db.logPing(id, response)
}

function _markAsCompleted (db, id) {
  var completed_at = utils.getCurrentDateTimeAsString()

  debug('Marking job ID %s as completed at %s', id, completed_at)

  return db.markAsCompleted(id)
}

function _setStorage (db, id, storage) {
  return db.setStorage(id, storage)
}

module.exports = createQueue
