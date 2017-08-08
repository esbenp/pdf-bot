var low = require('lowdb')
var uuid = require('uuid')
var debug = require('debug')('pdf:db')
var error = require('./error')
var webhook = require('./webhook')
var utils = require('./utils')

function createQueue (path = '../storage/db/db.json', options = {}) {
  var db = low(__dirname + '/' + path, options)

  db.defaults({
      queue: []
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
    markAsCompleted: createQueueMethod(markAsCompleted),
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
    generatorTries: -1,
    pings: [],
    pingTries: -1,
    storage: {}
  })

  debug('Pushing job to queue with data %s', JSON.stringify(data))

  db
    .get('queue')
    .push(data)
    .write()

  return data
}

function getList (db, failed = false, limit) {
  var query = db.get('queue')

  if (failed) {
    query = query.filter(function (job) {
      return job.completed_at === null || job.generatorTries > -1
    })
  } else {
    query = query.filter(function (job) {
      return job.completed_at !== null
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

function bumpGeneratorTries (db, id) {
  debug('Bumping tries for job ID %s', id)

  var job = getById(db, id)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ generatorTries: (job.generatorTries + 1) })
    .write()
}

function bumpPingTries (db, id) {
  debug('Bumping ping tries for job ID %s', id)

  var job = getById(db, id)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ pingTries: (job.pingTries + 1) })
    .write()
}

function logPing (db, id, data) {
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

function markAsCompleted (db, id) {
  var completed_at = utils.getCurrentDateTimeAsString()

  debug('Marking job ID %s as completed at %s', id, completed_at)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ completed_at: completed_at })
    .write()
}

function processJob (db, generator, job, webhookOptions) {
  return generator(job.url, job)
    .then(response => {
      if (!error.isError(response)) {
        debug('Job %s was processed, marking job as complete.', job.id)

        markAsCompleted(db, job.id)
        setStorage(db, job.id, response.storage)

        if (webhookOptions) {
          // Important to return promise otherwise the npm cli process will exit early
          return attemptPing(db, job, webhookOptions)
            .then(function() {
              return response
            })
        }
      } else {
        bumpGeneratorTries(db, job.id)
      }

      return response
    })
}

function attemptPing (db, job, webhookOptions) {
  if (!(typeof webhookOptions === 'object')) {
    throw new Error('No webhook is configured.')
  }

  return webhook.ping(job, webhookOptions).then(response => {
    bumpPingTries(db, job.id)
    logPing(db, job.id, response)

    return response
  })
}

function setStorage (db, id, storage) {
  return db
    .get('queue')
    .find({ id: id })
    .assign({ storage: storage })
    .write()
}

module.exports = {
  addToQueue: addToQueue,
  attemptPing: attemptPing,
  createQueue: createQueue,
  getById: getById,
  getList: getList,
  getNext: getNext,
  markAsCompleted: markAsCompleted,
  processJob: processJob
}
