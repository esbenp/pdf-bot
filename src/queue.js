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
    getNextWithoutSuccessfulPing: createQueueMethod(getNextWithoutSuccessfulPing),
    processJob: createQueueMethod(processJob),
    purge: createQueueMethod(purge)
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

  db
    .get('queue')
    .push(data)
    .write()

  return data
}

// =========
// RETRIEVAL
// =========

function getList (db, failed = false, completed = false, limit) {
  var query = db.get('queue')

  query = query.filter(function (job) {
    // failed jobs
    if (!failed && job.completed_at === null && job.generations.length > 0) {
      return false
    }

    // completed jobs
    if (!completed && job.completed_at !== null) {
      return false
    }

    return true
  })

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

function getNext (db, shouldWait, maxTries = 5) {
  return db
    .get('queue')
    .filter(function (job) {
      if (job.completed_at !== null) {
        return false
      }

      var currentTries = job.generations.length

      if (currentTries === 0) {
        return true
      }

      if (currentTries < maxTries) {
        var lastRun = job.generations[currentTries - 1].generated_at

        if (_hasWaitedLongEnough(lastRun, shouldWait(job, currentTries))) {
          return true
        }
      }

      return false
    })
    .take(1)
    .value()[0]
}

function getNextWithoutSuccessfulPing (db, shouldWait, maxTries = 5) {
  return db
    .get('queue')
    .filter(function (job) {
      var currentTries = job.pings.length

      if (job.completed_at === null) {
        return false
      }

      if (currentTries === 0) {
        return true
      }

      if (currentTries >= maxTries) {
        return false
      }

      var unsuccessfulPings = job.pings.filter(ping => ping.error)

      // There are some successful ping(s)
      if (unsuccessfulPings.length !== job.pings.length) {
        return false
      }

      var lastTry = unsuccessfulPings[unsuccessfulPings.length - 1].sent_at
      if (_hasWaitedLongEnough(lastTry, shouldWait(job, currentTries))) {
        return true
      }

      return false
    })
    .take(1)
    .value()[0]
}

function purge (db, failed = false, pristine = false, maxTries = 5) {
  var query = db.get('queue').slice(0)

  query = query.filter(function (job) {
    // failed jobs
    if (failed && job.completed_at === null && job.generations.length >= maxTries) {
      return true
    }

    // new jobs
    if (pristine && job.completed_at === null && job.generations.length < maxTries) {
      return true
    }

    // completed jobs
    if (job.completed_at !== null) {
      return true
    }

    return false
  })

  var queue = query.value()

  for(var i in queue) {
    db.get('queue').remove({ id: queue[i].id }).write()
  }
}

// ==========
// PROCESSING
// ==========

function processJob (db, generator, job, webhookOptions) {
  return generator(job.url, job)
    .then(response => {
      _logGeneration(db, job.id, response)

      if (!error.isError(response)) {
        debug('Job %s was processed, marking job as complete.', job.id)

        _markAsCompleted(db, job.id)
        _setStorage(db, job.id, response.storage)

        if (webhookOptions) {
          // Important to return promise otherwise the npm cli process will exit early
          return attemptPing(db, job, webhookOptions)
            .then(function() {
              return response
            })
        }
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

  return webhook.ping(job, webhookOptions)
    .then(response => {
      _logPing(db, job.id, response)

      return response
    })
}

// ===============
// PRIVATE METHODS
// ===============

function _hasWaitedLongEnough (logTimestamp, timeToWait) {
  var diff = (new Date() - new Date(logTimestamp))
  return diff > timeToWait
}

function _logGeneration (db, id, response) {
  debug('Logging try for job ID %s', id)

  var job = getById(db, id)

  var generations = job.generations.slice(0)
  generations.push(response)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ generations: generations })
    .write()
}

function _logPing (db, id, response) {
  debug('Logging ping for job ID %s', id)

  var job = getById(db, id)

  var pings = job.pings.slice(0)
  pings.push(response)

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

function _setStorage (db, id, storage) {
  return db
    .get('queue')
    .find({ id: id })
    .assign({ storage: storage })
    .write()
}

module.exports = createQueue
