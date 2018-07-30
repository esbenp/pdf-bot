#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var debug = require('debug')('pdf:cli')
var Table = require('cli-table')
var program = require('commander');
var merge = require('lodash.merge')
var chunk = require('lodash.chunk')
var clone = require('lodash.clonedeep');
var createPdfGenerator = require('../src/pdfGenerator')
var createApi = require('../src/api')
var error = require('../src/error')
var createQueue = require('../src/queue')
var webhook = require('../src/webhook')
var pjson = require('../package.json')
var execSync = require('child_process').execSync
var prompt = require('prompt')
var lowDb = require('../src/db/lowdb')

program
  .version(pjson.version)
  .option('-c, --config <path>', 'Path to configuration file')

var decaySchedule = [
  1000 * 60, // 1 minute
  1000 * 60 * 3, // 3 minutes
  1000 * 60 * 10, // 10 minutes
  1000 * 60 * 30, // 30 minutes
  1000 * 60 * 60 // 1 hour
];

var configuration, queue
var defaultConfig = {
  api: {
    port: 3000,
    //postPushCommand: '',
    //token: 'api-token'
  },
  db: lowDb(),
  // html-pdf-chrome options
  generator: {

  },
  queue: {
    generationRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    generationMaxTries: 5,
    parallelism: 4,
    webhookRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    webhookMaxTries: 5,
    lowDbOptions: {

    }
  },
  storage: {
    /*
    's3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })
    */
  },
  storagePath: 'storage',
  /*webhook: {
    headerNamespace: 'X-PDF-',
    requestOptions: {

    },
    secret: '12345',
    url: 'http://localhost:3001/hook'
  }*/
}

program
  .command('api')
  .description('Start the API')
  .action(function (options) {
    // We delay initiation of queue. This is because the API will load the DB in memory as
    // copy A. When we make changes through the CLI this creates copy B. But next time the
    // user pushes to the queue using the API copy A will be persisted again.
    var initiateQueue = openConfig(true)

    var apiOptions = configuration.api
    var port = apiOptions.port

    createApi(initiateQueue, {
      port: port,
      postPushCommand: apiOptions.postPushCommand,
      token: apiOptions.token
    }).listen(port, function() {
      debug('Listening to port %d', port)
    })
  })

program
  .command('install')
  .action(function (options) {
    var configPath = program.config || path.join(process.cwd(), 'pdf-bot.config.js')

    function startPrompt() {
      prompt.start({noHandleSIGINT: true})
      prompt.get([
      {
        name: 'storagePath',
        description: 'Enter a path for storage',
        default: path.join(process.cwd(), 'pdf-storage'),
        required: true
      },
      {
        name: 'token',
        description: 'An access token for your API',
        required: false
      }], function (err, result) {
        if (err) {
          process.exit(0)
        }
        var options = {}

        if (result.token) {
          options.api = {token: result.token}
        }

        options.storagePath = result.storagePath

        var configContents = "module.exports = " + JSON.stringify(options, null, 2)

        fs.writeFileSync(configPath, configContents)

        if (!fs.existsSync(options.storagePath)) {
          fs.mkdirSync(options.storagePath, '0775')
          fs.mkdirSync(path.join(options.storagePath, 'db'), '0775')
          fs.mkdirSync(path.join(options.storagePath, 'pdf'), '0775')
        }

        console.log('pdf-bot was installed successfully.')
        console.log('Config file is placed at ' + configPath + ' and contains')
        console.log(configContents)
        console.log('You should add ALIAS pdf-bot="pdf-bot -c ' + configPath + '" to your ~/.profile')
      });
    }

    var existingConfigFileFound = fs.existsSync(configPath)
    if (existingConfigFileFound) {
      prompt.start({noHandleSIGINT: true})
      prompt.get([
        {
          name: 'replaceConfig',
          description: 'A config file already exists, are you sure you want to override (yes/no)'
        }
      ], function (err, result) {
        if (err) {
          process.exit(0)
        }
        if (result.replaceConfig !== 'yes') {
          process.exit(0)
        } else {
          startPrompt()
        }
      })
    } else {
      startPrompt()
    }
  })

program
  .command('db:migrate')
  .action(function() {
    openConfig()

    var db = configuration.db(configuration)

    return db.migrate()
      .then(function () {
        console.log('The database was migrated')
        db.close()
        process.exit(0)
      })
      .catch(handleDbError)
  })

program
  .command('db:destroy')
  .action(function() {
    openConfig()

    var db = configuration.db(configuration)

    prompt.start({noHandleSIGINT: true})
    prompt.get([
      {
        name: 'destroy',
        description: 'This action will remove all data and tables. Are you sure you want to destroy the database? (yes/no)'
      }
    ], function (err, result) {
      if (err) {
        process.exit(0)
      }
      if (result.destroy !== 'yes') {
        process.exit(0)
      } else {
        db.destroy()
          .then(function() {
            console.log('The database has been destroyed.')
            db.close()
            process.exit(0)
          })
          .catch(handleDbError)
      }
    })
  })

program
  .command('generate [jobID]')
  .description('Generate PDF for job')
  .action(function (jobId, options){
    openConfig()

    return queue.getById(jobId)
      .then(function (job) {
        if (!job) {
          console.error('Job not found')
          queue.close()
          process.exit(1)
        }

        return processJob(job, configuration)
      })
      .catch(handleDbError)
  })

program
  .command('jobs')
  .description('List all completed jobs')
  .option('--completed', 'Show completed jobs')
  .option('--failed', 'Show failed jobs')
  .option('-l, --limit [limit]', 'Limit how many jobs to show')
  .action(function (options) {
    openConfig()

    return listJobs(queue, options.failed, options.completed, options.limit)
      .then(function() {
        queue.close()
        process.exit(0)
      })
      .catch(handleDbError)
  })

program
  .command('ping [jobID]')
  .description('Attempt to ping webhook for job')
  .action(function (jobId, options) {
    openConfig()

    return queue.getById(jobId)
      .then(function (job) {
        if (!job) {
          queue.close()
          console.log('Job not found.')
          return;
        }

        return ping(job, configuration.webhook).then(response => {
          queue.close()

          if (response.error) {
            process.exit(1)
          } else {
            process.exit(0)
          }
        })
      })
      .catch(handleDbError)
  })

program
  .command('ping:retry-failed')
  .action(function() {
    openConfig()

    var maxTries = configuration.queue.webhookMaxTries
    var retryStrategy = configuration.queue.webhookRetryStrategy

    queue.getNextWithoutSuccessfulPing(retryStrategy, maxTries)
      .then(function (next) {
        if (!next) {
          queue.close()
          process.exit(0)
        }

        return ping(next, configuration.webhook).then(function (response) {
          queue.close()

          if (response.error) {
            process.exit(1)
          } else {
            process.exit(0)
          }
        })
      })
      .catch(handleDbError)
  })

program
  .command('pings [jobId]')
  .description('List pings for a job')
  .action(function (jobId, options) {
    openConfig()

    var job = queue.getById(jobId)
      .then(function (job) {
        if (!job) {
          queue.close()
          console.log('Job not found')
          process.exit(1)
        }

        var table = new Table({
          head: ['ID', 'URL', 'Method', 'Status', 'Sent at', 'Response', 'Payload'],
          colWidths: [40, 40, 50, 20, 20, 20]
        });

        for(var i in job.pings) {
          var ping = job.pings[i]

          table.push([
            ping.id,
            ping.url,
            ping.method,
            ping.status,
            formatDate(ping.sent_at),
            JSON.stringify(ping.response),
            JSON.stringify(ping.payload)
          ])
        }

        console.log(table.toString())
        queue.close()
        process.exit(0)
      })
      .catch(handleDbError)
  })

program
  .command('purge')
  .description('Will remove all completed jobs')
  .option('--failed', 'Remove all failed jobs')
  .option('--new', 'Remove all new jobs')
  .action(function (options) {
    openConfig()

    return queue.purge(options.failed, options.new)
      .then(function () {
        queue.close()
        console.log('The queue was purged.')
        process.exit(0)
      })
      .catch(handleDbError)
  })

program
  .command('push [url]')
  .description('Push new job to the queue')
  .option('-m, --meta [meta]', 'JSON string with meta data. Default: \'{}\'')
  .action(function (url, options) {
    openConfig()

    return queue
      .addToQueue({
        url: url,
        meta: JSON.parse(options.meta || '{}')
      })
      .then(function (response) {
        queue.close()

        if (error.isError(response)) {
          console.error('Could not push to queue: %s', response.message)
          process.exit(1)
        } else {
          console.log('The job was created with ID ' + response.id)
          process.exit(0)
        }
      })
      .catch(handleDbError)
  })

program
  .command('shift')
  .description('Run the next job in the queue')
  .action(function (url) {
    openConfig()

    var maxTries = configuration.queue.generationMaxTries
    var retryStrategy = configuration.queue.generationRetryStrategy

    return queue.getNext(retryStrategy, maxTries)
      .then(function (next) {
        if (!next) {
          queue.close()
          process.exit(0)
        }

        return processJob(next, configuration)
      })
      .catch(handleDbError)
  })

program
  .command('shift:all')
  .description('Run all unfinished jobs in the queue')
  .action(function (url) {
    openConfig()

    return queue.isBusy()
      .then(function (isBusy) {
        if (isBusy) {
          queue.close()
          process.exit(0)
        }

        var shiftAll = function () {
          var maxTries = configuration.queue.generationMaxTries
          var retryStrategy = configuration.queue.generationRetryStrategy
          var parallelism = configuration.queue.parallelism

          return queue.getAllUnfinished(retryStrategy, maxTries)
            .then(function (jobs) {
              if (jobs.length === 0) {
                queue.close()
                process.exit(0)
              }

              var chunks = chunk(jobs, parallelism)

              function runNextChunk(k = 1) {
                if (chunks.length === 0) {
                  queue.setIsBusy(false).then(shiftAll)
                } else {
                  var chunk = chunks.shift()
                  console.log('Running chunk %s, %s chunks left', k, chunks.length)

                  var promises = []
                  for(var i in chunk) {
                    promises.push(processJob(chunk[i], clone(configuration), false))
                  }

                  Promise.all(promises)
                    .then(function(){
                      return runNextChunk(k + 1)
                    })
                    .catch(function(){
                      return queue.setIsBusy(false).then(function() {
                        queue.close()
                        process.exit(1)
                      })
                    })
                }
              }

              console.log('Found %s jobs, divided into %s chunks', jobs.length, chunks.length)

              queue.setIsBusy(true).then(function () {
                return runNextChunk()
              })
            })
        }

        return shiftAll()
      })
      .catch(handleDbError)
  })

program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

function processJob(job, configuration, exitProcess = true) {
  var generatorOptions = configuration.generator
  var storagePlugins = configuration.storage

  var generator = createPdfGenerator(configuration.storagePath, generatorOptions, storagePlugins)

  return queue.processJob(generator, job, configuration.webhook).then(function (response) {
    if (error.isError(response)) {
      console.error(response.message)
      if (exitProcess) {
        queue.close()
        process.exit(1)
      }
    } else {
      console.log('Job ID ' + job.id + ' was processed.')
      if (exitProcess) {
        queue.close()
        process.exit(0)
      }
    }
  })
}

function openConfig(delayQueueCreation = false) {
  configuration = defaultConfig

  if (!program.config) {
    if (fs.existsSync(path.join(process.cwd(), 'pdf-bot.config.js'))) {
      program.config = 'pdf-bot.config.js'
    } else {
      throw new Error('You need to supply a config file')
    }
  }

  var configPath = path.join(process.cwd(), program.config)

  if (!fs.existsSync(configPath)) {
    throw new Error('No config file was found at ' + configPath)
  }

  debug('Creating CLI using config file %s', configPath)
  merge(configuration, require(configPath))

  if (!fs.existsSync(configuration.storagePath)) {
    throw new Error('Whoops! Looks like your storage folder does not exist. You should run pdf-bot install.')
  }

  if (!fs.existsSync(path.join(configuration.storagePath, 'pdf'))) {
    throw new Error('There is no pdf folder in the storage folder. Create it: storage/pdf')
  }

  function initiateQueue() {
    var db = configuration.db(configuration)
    var queueOptions = configuration.queue
    return createQueue(db, queueOptions)
  }

  if (delayQueueCreation) {
    return initiateQueue
  } else {
    queue = initiateQueue()
  }
}

function listJobs(queue, failed = false, limit) {
  return new Promise((resolve) => {
    var response = queue
      .getList(
        failed,
        limit
      ).then(function (response) {
        var table = new Table({
          head: ['ID', 'URL', 'Meta', 'PDF Gen. tries', 'Created at', 'Completed at'],
          colWidths: [40, 40, 50, 20, 20, 20]
        });

        for(var i in response) {
          var job = response[i]

          table.push([
            job.id,
            job.url,
            JSON.stringify(job.meta),
            job.generations.length,
            formatDate(job.created_at),
            formatDate(job.completed_at)
          ])
        }

        console.log(table.toString());

        resolve()
      })
      .catch(handleDbError)
  })
}

function ping(job, webhookConfiguration) {
  return queue.attemptPing(job, webhookConfiguration || {}).then(response => {
    if (!response.error) {
      console.log('Ping succeeded: ' + JSON.stringify(response))
    } else {
      console.error('Ping failed: ' + JSON.stringify(response))
    }

    return response
  })
}

function formatDate(input) {
  if (!input) {
    return ''
  }

  return (new Date(input)).toLocaleString()
}

function handleDbError(e) {
  console.error(e)
  queue.close()
  process.exit(1)
}
