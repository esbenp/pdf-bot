var low = require('lowdb')
var fs = require('fs')
var path = require('path')
var utils = require('../utils')

function createLowDb(options = {}) {
  return function (pdfBotConfiguration) {
    if (!options.path) {
      options.path = path.join(pdfBotConfiguration.storagePath, 'db', 'db.json')
    }

    var db = low(options.path, options.lowDbOptions || {})

    db.defaults({
        queue: options.initialValue || []
      })
      .write()

    var createDbMethod = function (func) {
      return function() {
        var args = Array.prototype.slice.call(arguments, 0)
        return new Promise((resolve) => resolve(func.apply(func, [db].concat(args))))
      }
    }

    return {
      close: createDbMethod(close),
      getAllUnfinished: createDbMethod(getAllUnfinished),
      getById: createDbMethod(getById),
      getList: createDbMethod(getList),
      getNextWithoutSuccessfulPing: createDbMethod(getNextWithoutSuccessfulPing),
      logGeneration: createDbMethod(logGeneration),
      logPing: createDbMethod(logPing),
      isBusy: createDbMethod(isBusy),
      markAsCompleted: createDbMethod(markAsCompleted),
      purge: createDbMethod(purge),
      pushToQueue: createDbMethod(pushToQueue),
      setIsBusy: createDbMethod(setIsBusy),
      setStorage: createDbMethod(setStorage)
    }
  }
}

module.exports = createLowDb

function pushToQueue (db, data) {
  db
    .get('queue')
    .push(data)
    .write()

  return data
}

function close() {
  return true
}

function getAllUnfinished (db, shouldWait, maxTries = 5) {
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
    .value()
}

function getById (db, id) {
  return db
    .get('queue')
    .find({ id: id })
    .value()
}

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

function isBusy (db) {
  return db.get('is_busy').value() || false
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

function setIsBusy (db, isBusy) {
  db.set('is_busy', isBusy).write()
}

function logGeneration (db, id, response) {
  var job = getById(db, id)

  var generations = job.generations.slice(0)
  generations.push(response)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ generations: generations })
    .write()
}

function logPing (db, id, response) {
  var job = getById(db, id)

  var pings = job.pings.slice(0)
  pings.push(response)

  return db
    .get('queue')
    .find({ id: id })
    .assign({ pings: pings })
    .write()
}

function markAsCompleted (db, id) {
  var completed_at = utils.getCurrentDateTimeAsString()

  return db
    .get('queue')
    .find({ id: id })
    .assign({ completed_at: completed_at })
    .write()
}

function setStorage (db, id, storage) {
  return db
    .get('queue')
    .find({ id: id })
    .assign({ storage: storage })
    .write()
}

function _hasWaitedLongEnough (logTimestamp, timeToWait) {
  var diff = (new Date() - new Date(logTimestamp))
  return diff > timeToWait
}
