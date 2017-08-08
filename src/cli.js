var debug = require('debug')('pdf:cli')
var createPdfGenerator = require('./pdfGenerator')
var error = require('./error')
var queue = require('./queue')
var webhook = require('./webhook')
var Table = require('cli-table')
var pjson = require('../package.json')

function createCli (cliOptions = {}) {
  var program = require('commander');

  program.version(pjson.version)

  var queueOptions = cliOptions.queueOptions || {}
  var queueInstance = cliOptions.queue
  if (!queueInstance) {
    queueInstance = queue.createQueue(queueOptions.path, queueOptions.lowDbOptions)
  }

  program
    .command('failed')
    .description('List all failed jobs')
    .option('-l, --limit [limit]', 'Limit how many jobs to show')
    .action(function (options) {
      listJobs(queueInstance, true, options.limit)
    })

  program
    .command('jobs')
    .description('List all completed jobs')
    .option('-l, --limit [limit]', 'Limit how many jobs to show')
    .action(function (options) {
      listJobs(queueInstance, false, options.limit)
    })

  program
    .command('ping [jobID]')
    .description('Attempt to ping webhook for job')
    .action(function (jobId) {
      var job = queueInstance.getById(jobId)

      if (!job) {
        console.log('Job not found.')
        return;
      }

      queueInstance.attemptPing(job, cliOptions.webhookOptions || {}).then(response => {
        var message = response.error ? 'Ping failed: ' : 'Ping succeeded: '
        console.log(message + JSON.stringify(response))

        return response
      })
    })

  program
    .command('pings [jobId]')
    .description('List pings for a job')
    .action(function (jobId) {
      var job = queueInstance.getById(jobId)

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
    .option('-m, --meta [meta]', 'JSON string with meta data')
    .action(function (url, options) {
      var response = queueInstance.addToQueue({
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
      var next = queueInstance.getNext()

      if (!next) {
        console.log('No more jobs to run.')
        process.exit(0)
      }

      var generatorOptions = cliOptions.generatorOptions || {}
      var storagePlugins = cliOptions.storagePlugins || {}
      var webhookOptions = cliOptions.webhookOptions || {}
      var generator = createPdfGenerator(generatorOptions, storagePlugins)

      queueInstance.processJob(generator, next, webhookOptions).then(response => {
        if (error.isError(response)) {
          console.error(response.message)
          process.exit(1)
        } else {
          process.exit(0)
        }
      })
    })

  program
    .command('*')
    .action(function(){
      program.help()
    });

  program.parse(process.argv);
}

module.exports = createCli

function listJobs(queueInstance, failed = false, limit) {
  var response = queueInstance.getList(
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
