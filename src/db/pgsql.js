var low = require('lowdb')
var fs = require('fs')
var path = require('path')
var utils = require('../utils')
var pg = require('pg')

function createPostgresDb(options = {}) {
  function parseConfig() {
    var config = {};

    if (options.connectionString != undefined) {
      config.connectionString = options.connectionString;
    } else {
      config.user     = options.user;
      config.host     = options.host || 'localhost';
      config.database = options.database;
      config.password = options.password;
      config.port     = options.port || 5432;
    }

    if (options.ssl != undefined) {
      config.ssl = options.ssl;
    }

    if (options.types != undefined) {
      config.types = options.types;
    }

    if (options.statement_timeout != undefined) {
      config.statement_timeout = options.statement_timeout;
    }

    return config;
  };


  return function (pdfBotConfiguration) {
    var db = new pg.Client(parseConfig());
    db.connect()

    var createDbMethod = function (func) {
      return function() {
        var args = Array.prototype.slice.call(arguments, 0)
        return func.apply(func, [db].concat(args))
      }
    }

    return {
      close: createDbMethod(close),
      destroy: createDbMethod(destroy),
      getAllUnfinished: createDbMethod(getAllUnfinished),
      getById: createDbMethod(getById),
      getList: createDbMethod(getList),
      getNextWithoutSuccessfulPing: createDbMethod(getNextWithoutSuccessfulPing),
      logGeneration: createDbMethod(logGeneration),
      logPing: createDbMethod(logPing),
      isBusy: createDbMethod(isBusy),
      markAsCompleted: createDbMethod(markAsCompleted),
      migrate: createDbMethod(migrate),
      purge: createDbMethod(purge),
      pushToQueue: createDbMethod(pushToQueue),
      setIsBusy: createDbMethod(setIsBusy),
      setStorage: createDbMethod(setStorage)
    }
  }
}

module.exports = createPostgresDb

function close (db) {
  db.end()
}

function pushToQueue (db, data) {
  return db
    .query(
      `INSERT INTO jobs (id, url, meta, created_at) VALUES($1, $2, $3, $4)`,
      [data.id, data.url, data.meta, data.created_at]
    )
    .then(function() {
      return data
    })
}

function getAllUnfinished (db, shouldWait, maxTries = 5) {
  return db.query('SELECT * FROM jobs WHERE completed_at is null').then(function (res) {
    var jobs = res.rows

    return jobs.filter(job => {
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
  })
}

function getById (db, id) {
  return db.query('SELECT * FROM jobs WHERE id = $1', [id])
    .then(function (res) {
      var jobs = res.rows

      return jobs.length > 0 ? jobs[0] : null
    })
}

function getList (db, failed = false, completed = false, limit) {
  var query = 'SELECT * FROM jobs WHERE (completed_at is null AND jsonb_array_length(generations) = 0) '

  if (failed) {
    query += ' OR (completed_at is null AND jsonb_array_length(generations) > 0)'
  }

  if (completed) {
    query += ' OR (completed_at is not null)'
  }

  if (limit) {
    query += ' LIMIT ' + limit
  }

  return db.query(query).then(function(res) {
    var jobs = res.rows

    return jobs
  })
}

function getNextWithoutSuccessfulPing (db, shouldWait, maxTries = 5) {
  return db.query('SELECT * FROM jobs WHERE completed_at is not null order by created_at').then(function(res) {
    var jobs = res.rows.filter(function (job) {
      var currentTries = job.pings.length

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

    return jobs.length > 0 ? jobs[0] : null
  })
}

function isBusy (db) {
  return db.query('SELECT busy FROM worker LIMIT 1').then(function (res) {
    var isBusy = res.rows.length > 0 ? res.rows[0].busy : false
    return isBusy
  })
}

function purge (db, failed = false, pristine = false, maxTries = 5) {
  var query = 'DELETE FROM jobs WHERE (completed_at is not null)'
  var params = []

  if (failed) {
    query += ' OR (completed_at is null and jsonb_array_length(generations) >= $1)'
    params.push(maxTries)
  }

  if (pristine) {
    query += ' OR (completed_at is null and jsonb_array_length(generations) < $2)'
    params.push(maxTries)
  }

  return db.query(query, params)
}

function setIsBusy (db, isBusy) {
  return db.query('UPDATE worker SET busy = $1', [isBusy]);
}

function logGeneration (db, id, response) {
  return getById(db, id).then(function (job) {
    var generations = job.generations.slice(0)
    generations.push(response)

    return db.query('UPDATE jobs SET generations = $1 WHERE id = $2', [JSON.stringify(generations), id])
  })
}

function logPing (db, id, response) {
  return getById(db, id).then(function (job) {
    var pings = job.pings.slice(0)
    pings.push(response)

    return db.query('UPDATE jobs SET pings = $1 WHERE id = $2', [JSON.stringify(pings), id])
  })
}

function markAsCompleted (db, id) {
  var completed_at = utils.getCurrentDateTimeAsString()

  return db.query('UPDATE jobs SET completed_at = $1 WHERE id = $2', [completed_at, id])
}

function setStorage (db, id, storage) {
  return db.query('UPDATE jobs SET storage = $1 WHERE id = $2', [JSON.stringify(storage), id])
}

function _hasWaitedLongEnough (logTimestamp, timeToWait) {
  var diff = (new Date() - new Date(logTimestamp))
  return diff > timeToWait
}

function destroy(db) {
  return db.query(`
    DROP TABLE jobs
  `)
}

function migrate(db) {
  return db.query(`
    CREATE TABLE jobs (
      id character varying(255),
      url text,
      meta jsonb default '{}'::json,
      generations jsonb default '[]'::json,
      pings jsonb default '[]'::json,
      storage jsonb default '{}'::json,
      created_at timestamp without time zone,
      completed_at timestamp without time zone default null
    );
    CREATE TABLE worker (
      busy boolean default false
    );
    INSERT INTO worker (busy) VALUES(false);
  `)
}
