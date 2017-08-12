#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var debug = require('debug')('pdf:cli')
var Table = require('cli-table')
var program = require('commander');
var merge = require('lodash.merge')
var createPdfGenerator = require('../src/pdfGenerator')
var createApi = require('../src/api')
var error = require('../src/error')
var createQueue = require('../src/queue')
var webhook = require('../src/webhook')
var pjson = require('../package.json')

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
    //token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {

  },
  queue: {
    generationRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    generationMaxTries: 5,
    webhookRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    webhookMaxTries: 5,
    path: 'storage/db/db.json',
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
    createConfig()

    var apiOptions = configuration.api
    var port = apiOptions.port

    createApi(queue, {
      port: port,
      token: options.token
    }).listen(port, function() {
      debug('Listening to port %d', port)
    })
  })

program
  .command('jobs')
  .description('List all completed jobs')
  .option('--completed', 'Show completed jobs')
  .option('--failed', 'Show failed jobs')
  .option('-l, --limit [limit]', 'Limit how many jobs to show')
  .action(function (options) {
    createConfig()

    listJobs(queue, options.failed, options.completed, options.limit)
  })

program
  .command('ping [jobID]')
  .description('Attempt to ping webhook for job')
  .action(function (jobId, options) {
    createConfig()

    var job = queue.getById(jobId)

    if (!job) {
      console.log('Job not found.')
      return;
    }

    ping(job, configuration.webhook)
  })

program
  .command('ping:retry-failed')
  .action(function() {
    createConfig()

    var maxTries = configuration.queue.webhookMaxTries
    var retryStrategy = configuration.queue.webhookRetryStrategy

    var next = queue.getNextWithoutSuccessfulPing(retryStrategy, maxTries)

    if (next) {
      ping(next, configuration.webhook)
    }
  })

program
  .command('pings [jobId]')
  .description('List pings for a job')
  .action(function (jobId, options) {
    createConfig()

    var job = queue.getById(jobId)

    if (!job) {
      console.log('Job not found')
      return;
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
  })

program
  .command('push [url]')
  .description('Push new job to the queue')
  .option('-m, --meta [meta]', 'JSON string with meta data. Default: \'{}\'')
  .action(function (url, options) {
    createConfig()

    var response = queue.addToQueue({
      url: url,
      meta: JSON.parse(options.meta || '{}')
    })

    if (error.isError(response)) {
      console.error('Could not push to queue: %s', response.message)
      process.exit(1)
    }
  })

program
  .command('shift')
  .description('Run the next job in the queue')
  .action(function (url) {
    createConfig()

    var maxTries = configuration.queue.generationMaxTries
    var retryStrategy = configuration.queue.generationRetryStrategy

    var next = queue.getNext(retryStrategy, maxTries)

    if (next) {
      var generatorOptions = configuration.generator
      var storagePlugins = configuration.storage
      var generator = createPdfGenerator(generatorOptions, storagePlugins)

      queue.processJob(generator, next, configuration.webhook).then(response => {
        if (error.isError(response)) {
          console.error(response.message)
          process.exit(1)
        } else {
          console.log('Job ID ' + next.id + ' was processed.')
          process.exit(0)
        }
      })
    }
  })

program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp();
}

function createConfig() {
  configuration = defaultConfig

  if (program.config) {
    var configPath = path.join(process.cwd(), program.config)

    if (!fs.existsSync(configPath)) {
      throw new Error('No config file was found at ' + configPath)
    }

    debug('Creating CLI using config file %s', configPath)
    merge(configuration, require(configPath))
  }

  var queueOptions = configuration.queue
  var dbPath = queueOptions.path
  queue = createQueue(path.join(process.cwd(), dbPath), queueOptions.lowDbOptions)
}

function listJobs(queue, failed = false, limit) {
  var response = queue.getList(
    failed,
    limit
  )

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
      job.generatorTries,
      formatDate(job.created_at),
      formatDate(job.completed_at)
    ])
  }

  console.log(table.toString());
}

function ping(job, webhookConfiguration) {
  queue.attemptPing(job, webhookConfiguration || {}).then(response => {
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
