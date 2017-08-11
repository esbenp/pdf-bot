#!/usr/bin/env node

var fs = require('fs')
var path = require('path')
var debug = require('debug')('pdf:cli')
var Table = require('cli-table')
var program = require('commander');
var createPdfGenerator = require('../src/pdfGenerator')
var createApi = require('../src/api')
var error = require('../src/error')
var createQueue = require('../src/queue')
var webhook = require('../src/webhook')
var pjson = require('../package.json')

program
  .version(pjson.version)
  .option('-c, --config <path>', 'Path to configuration file')

var configuration, queue

program
  .command('api')
  .description('Start the API')
  .action(function (options) {
    createConfig()

    var apiOptions = configuration.api || {}
    var port = apiOptions.port || 3000

    createApi(queue, {
      port: port,
      token: options.token
    }).listen(port, function() {
      debug('Listening to port %d', port)
    })
  })

program
  .command('failed')
  .description('List all failed jobs')
  .option('-l, --limit [limit]', 'Limit how many jobs to show')
  .action(function (options) {
    createConfig()

    listJobs(queue, true, false, options.limit)
  })

program
  .command('jobs')
  .description('List all completed jobs')
  .option('-l, --limit [limit]', 'Limit how many jobs to show')
  .option('-n, --new', 'Show jobs that have yet to be run')
  .action(function (options) {
    createConfig()

    listJobs(queue, false, options.new, options.limit)
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

    queue.attemptPing(job, configuration.webhook || {}).then(response => {
      var message = response.error ? 'Ping failed: ' : 'Ping succeeded: '
      console.log(message + JSON.stringify(response))

      return response
    })
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
  .action(function (url, options) {
    createConfig()

    var next = queue.getNext()

    if (!next) {
      console.log('No more jobs to run.')
      process.exit(0)
    }

    var generatorOptions = configuration.generator || {}
    var storagePlugins = configuration.storage || {}
    var generator = createPdfGenerator(generatorOptions, storagePlugins)

    queue.processJob(generator, next, configuration.webhook || {}).then(response => {
      if (error.isError(response)) {
        console.error(response.message)
        process.exit(1)
      } else {
        process.exit(0)
      }
    })
  })

program.parse(process.argv)

function createConfig() {
  var configPath = path.join(process.cwd(), program.config)

  debug('Creating CLI using config file %s', configPath)

  if (!program.config || !fs.existsSync(configPath)) {
    throw new Error('Invalid config file given.')
  }

  configuration = require(configPath)
  var queueOptions = configuration.queue || {}
  var dbPath = queueOptions.path || 'storage/db/db.json'
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

function formatDate(input) {
  if (!input) {
    return ''
  }

  return (new Date(input)).toLocaleString()
}
