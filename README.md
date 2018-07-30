# 🤖 pdf-bot

[![npm](https://img.shields.io/npm/v/pdf-bot.svg)](https://www.npmjs.com/package/pdf-bot) [![Build Status](https://travis-ci.org/esbenp/pdf-bot.svg?branch=master)](https://travis-ci.org/esbenp/pdf-bot) [![Coverage Status](https://coveralls.io/repos/github/esbenp/pdf-bot/badge.svg?branch=master)](https://coveralls.io/github/esbenp/pdf-bot?branch=master)

Easily create a microservice for generating PDFs using headless Chrome.

`pdf-bot` is installed on a server and will receive URLs to turn into PDFs through its API or CLI. `pdf-bot` will manage a queue of PDF jobs. Once a PDF job has run it will notify you using a webhook so you can fetch the API. `pdf-bot` supports storing PDFs on S3 out of the box. Failed PDF generations and Webhook pings will be retried after a configurable decaying schedule.

![How to use the pdf-bot CLI](http://imgur.com/aRHye2l.gif)

`pdf-bot` uses [`html-pdf-chrome`](https://github.com/westy92/html-pdf-chrome) under the hood and supports all the settings that it supports. Major thanks to [@westy92](https://github.com/westy92/html-pdf-chrome) for making this possible.

## How does it work?

Imagine you have an app that creates invoices. You want to save those invoices as PDF. You install `pdf-bot` on a server as an API. Your app server sends the URL of the invoice to the `pdf-bot` server. A cronjob on the `pdf-bot` server keeps checking for new jobs, generates a PDF using headless Chrome and sends the location back to the application server using a webhook.

## Prerequisites

* Node.js v6 or later

## Installation

```bash
$ npm install -g pdf-bot
$ pdf-bot install
```

> Make sure the node path is in your $PATH

`pdf-bot install` will prompt for some basic configurations and then create a storage folder where your database and pdf files will be saved.

### Configuration

`pdf-bot` comes packaged with sensible defaults. At the very minimum you must have a config file in the same folder from which you are executing `pdf-bot` with a `storagePath` given. However, in reality what you probably want to do is use the `pdf-bot install` command to generate a configuration file and then use an alias `ALIAS pdf-bot = "pdf-bot -c /home/pdf-bot.config.js"`

`pdf-bot.config.js`
```js
var htmlPdf = require('html-pdf-chrome')

module.exports = {
  api: {
    token: 'crazy-secret'
  },
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(1000) // 1 sec timeout
  },
  storagePath: 'storage'
}
```

```bash
$ pdf-bot -c ./pdf-bot.config.js push https://esbenp.github.io
```

[See a full list of the available configuration options.](#options)

## Usage guide

### Structure and concept

`pdf-bot` is meant to be a microservice that runs a server to generate PDFs for you. That usually means you will send requests from your application server to the PDF server to request an url to be generated as a PDF. `pdf-bot` will manage a queue and retry failed generations. Once a job is successfully generated a path to it will be sent back to your application server.

Let us check out the flow for an app that generates PDF invoices.

```
1. (App server): An invoice is created ----> Send URL to invoice to pdf-bot server
2. (pdf-bot server): Put the URL in the queue
3. (pdf-bot server): PDF is generated using headless Chrome
4. (pdf-bot server): (if failed try again using 1 min, 3 min, 10 min, 30 min, 60 min delay)
5. (pdf-bot server): Upload PDF to storage (e.g. Amazon S3)
6. (pdf-bot server): Send S3 location of PDF back to the app server
7. (App server): Receive S3 location of PDF -> Check signature sum matches for security
8. (App server): Handle PDF however you see fit (move it, download it, save it etc.)
```

You can send meta data to the `pdf-bot` server that will be sent back to the application. This can help you identify what PDF you are receiving.

### Setup

On your `pdf-bot` server start by creating a config file `pdf-bot.config.js`. [You can see an example file here](https://github.com/esbenp/pdf-bot/blob/master/examples/pdf-bot.config.js)

`pdf-bot.config.js`
```js
module.exports = {
  api: {
    port: 3000,
    token: 'api-token'
  },
  storage: {
    's3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })
  },
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

As a minimum you should configure an access token for your API. This will be used to authenticate jobs sent to your `pdf-bot` server. You also need to add a `webhook` configuration to have pdf notifications sent back to your application server. You should add a `secret` that will be used to generate a signature used to check that the request has not been tampered with during transfer.

Start your API using

`pdf-bot -c ./pdf-bot.config.js api`

This will start an [express server](http://expressjs.com) that listens for new jobs on port `3000`.

#### Setting up Chrome

`pdf-bot` uses [html-pdf-chrome](https://github.com/westy92/html-pdf-chrome) which in turns uses [chrome-launcher](https://github.com/GoogleChrome/lighthouse/tree/master/chrome-launcher) to launch chrome. You should check out those two resources on how to properly setup Chrome. However, with `chrome-launcher` Chrome should be started automatically. Otherwise, `html-pdf-chrome` has a small guide on how to have it running as a process using `pm2`.

You can install chrome on Ubuntu using

```
sudo apt-get update && apt-get install chromium-browser
```

If you are testing things on OSX or similar, `chrome-launcher` should be able to find and automatically startup Chrome for you.

#### Setting up the receiving API

In the [examples folder](https://github.com/esbenp/pdf-bot/blob/master/examples/receiving-api.js) there is a small example on how the application API could look. Basically, you just have to define an endpoint that will receive the webhook and check that the signature matches.

```javascript
api.post('/hook', function (req, res) {
  var signature = req.get('X-PDF-Signature', 'sha1=')

  var bodyCrypted = require('crypto')
    .createHmac('sha1', '12345')
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (bodyCrypted !== signature) {
    res.status(401).send()
    return
  }

  console.log('PDF webhook received', JSON.stringify(req.body))

  res.status(204).send()
})
```

### Setup production environment

[Follow the guide under `production/` to see how to setup `pdf-bot` using `pm2` and `nginx`](https://github.com/esbenp/pdf-bot/blob/master/production/README.md)

### Setup crontab

We setup our crontab to continuously look for jobs that have not yet been completed.

```bash
* * * * * node $(npm bin -g)/pdf-bot -c ./pdf-bot.config.js shift:all >> /var/log/pdfbot.log 2>&1
* * * * * node $(npm bin -g)/pdf-bot -c ./pdf-bot.config.js ping:retry-failed >> /var/log/pdfbot.log 2>&1
```

### Quick example using the CLI

Let us assume I want to generate a PDF for `https://esbenp.github.io`. I can add the job using the `pdf-bot` CLI.

```bash
$ pdf-bot -c ./pdf-bot.config.js push https://esbenp.github.io --meta '{"id":1}'
```

Next, if my crontab is not setup to run it automatically I can run it using the `shift:all` command

```bash
$ pdf-bot -c ./pdf-bot.config.js shift:all
```

This will look for the oldest uncompleted job and run it.

### How can I generate PDFs for sites that use Javascript?

This is a common issue with PDF generation. Luckily, `html-pdf-chrome` has a really awesome API for dealing with Javascript. You can specify a timeout in milliseconds, wait for elements or custom events. To add a wait simply configure the `generator` key in your configuration. Below are a few examples.

**Wait for 5 seconds**

```javascript
var htmlPdf = require('html-pdf-chrome')

module.exports = {
  api: {
    token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(5000), // waits for 5 sec
  },
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

**Wait for event**

```javascript
var htmlPdf = require('html-pdf-chrome')

module.exports = {
  api: {
    token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Event(
      'myEvent', // name of the event to listen for
      '#myElement', // optional DOM element CSS selector to listen on, defaults to body
      5000 // optional timeout (milliseconds)
    )
  },
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

In your Javascript trigger the event when rendering is complete

```javascript
document.getElementById('myElement').dispatchEvent(new CustomEvent('myEvent'));
```

**Wait for variable**

```javascript
var htmlPdf = require('html-pdf-chrome')

module.exports = {
  api: {
    token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Variable(
      'myVarName', // optional, name of the variable to wait for.  Defaults to 'htmlPdfDone'
      5000 // optional, timeout (milliseconds)
    )
  },
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

In your Javascript set the variable when the rendering is complete

```javascript
window.myVarName = true;
```

[You can find more completion triggers in html-pdf-chrome's documentation](https://github.com/westy92/html-pdf-chrome#trigger-render-completion)

## API

Below are given the endpoints that are exposed by `pdf-server`'s REST API

### Push URL to queue: POST /

key | type | required | description
--- | ---- | -------- | -----------
url | string | yes | The URL to generate a PDF from
meta | object | | Optional meta data object to send back to the webhook url

#### Example

```bash
curl -X POST -H 'Authorization: Bearer api-token' -H 'Content-Type: application/json' http://pdf-bot.com/ -d '
  {
    "url":"https://esbenp.github.io",
    "meta":{
      "type":"invoice",
      "id":1
    }
  }'
```

## Database

### LowDB (file-database) (default)

If you have low conurrency (run a job every now and then) you can use the default database driver that uses LowDB.

```javascript
var LowDB = require('pdf-bot/src/db/lowdb')

module.exports = {
  api: {
    token: 'api-token'
  },
  db: LowDB({
    lowDbOptions: {},
    path: '' // defaults to $storagePath/db/db.json
  }),
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

### PostgreSQL

```javascript
var pgsql = require('pdf-bot/src/db/pgsql')

module.exports = {
  api: {
    token: 'api-token'
  },
  db: pgsql({
    database: 'pdfbot',
    username: 'pdfbot',
    password: 'pdfbot',
    port: 5432
  }),
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

Optionally, you can specify a database url by specifying a `connectionString`.

To install the necessary database tables, run `db:migrate`. You can also destroy the database by running `db:destroy`.

## Storage

Currently `pdf-bot` comes bundled with build-in support for storing PDFs on Amazon S3.

[Feel free to contribute a PR if you want to see other storage plugins in `pdf-bot`](https://github.com/esbenp/pdf-bot/compare)!

### Amazon S3

To install S3 storage add a key to the `storage` configuration. Notice, you can add as many different locations you want by giving them different keys.

```javascript
var createS3Config = require('pdf-bot/src/storage/s3')

module.exports = {
  api: {
    token: 'api-token'
  },
  storage: {
    'my_s3': createS3Config({
      bucket: '[YOUR BUCKET NAME]',
      accessKeyId: '[YOUR ACCESS KEY ID]',
      region: '[YOUR REGION]',
      secretAccessKey: '[YOUR SECRET ACCESS KEY]'
    })
  },
  webhook: {
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}

```

## Options

```javascript
var decaySchedule = [
  1000 * 60, // 1 minute
  1000 * 60 * 3, // 3 minutes
  1000 * 60 * 10, // 10 minutes
  1000 * 60 * 30, // 30 minutes
  1000 * 60 * 60 // 1 hour
];

module.exports = {
  // The settings of the API
  api: {
    // The port your express.js instance listens to requests from. (default: 3000)
    port: 3000,
    // Spawn command when a job has been pushed to the API
    postPushCommand: ['/home/user/.npm-global/bin/pdf-bot', ['-c', './pdf-bot.config.js', 'shift:all']],
    // The token used to validate requests to your API. Not required, but 100% recommended.
    token: 'api-token'
  },
  db: LowDB(), // see other drivers under Database
  // html-pdf-chrome
  generator: {
    // Triggers that specify when the PDF should be generated
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(1000), // waits for 1 sec
    // The port to listen for Chrome (default: 9222)
    port: 9222
  },
  queue: {
    // How frequent should pdf-bot retry failed generations?
    // (default: 1 min, 3 min, 10 min, 30 min, 60 min)
    generationRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    // How many times should pdf-bot try to generate a PDF?
    // (default: 5)
    generationMaxTries: 5,
    // How many generations to run at the same time when using shift:all
    parallelism: 4,
    // How frequent should pdf-bot retry failed webhook pings?
    // (default: 1 min, 3 min, 10 min, 30 min, 60 min)
    webhookRetryStrategy: function(job, retries) {
      return decaySchedule[retries - 1] ? decaySchedule[retries - 1] : 0
    },
    // How many times should pdf-bot try to ping a webhook?
    // (default: 5)
    webhookMaxTries: 5
  },
  storage: {
    's3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })
  },
  webhook: {
    // The prefix to add to all pdf-bot headers on the webhook response.
    // I.e. X-PDF-Transaction and X-PDF-Signature. (default: X-PDF-)
    headerNamespace: 'X-PDF-',
    // Extra request options to add to the Webhook ping.
    requestOptions: {

    },
    // The secret used to generate the hmac-sha1 signature hash.
    // !Not required, but should definitely be included!
    secret: '1234',
    // The endpoint to send PDF messages to.
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
```

## CLI

`pdf-bot` comes with a full CLI included! Use `-c` to pass a configuration to `pdf-bot`. You can also use `--help` to get a list of all commands. An example is given below.

```bash
$ pdf-bot.js --config ./examples/pdf-bot.config.js --help


  Usage: pdf-bot [options] [command]


  Options:

    -V, --version        output the version number
    -c, --config <path>  Path to configuration file
    -h, --help           output usage information


  Commands:

    api                   Start the API
    db:migrate
    db:destroy
    install
    generate [jobID]      Generate PDF for job
    jobs [options]        List all completed jobs
    ping [jobID]          Attempt to ping webhook for job
    ping:retry-failed
    pings [jobId]         List pings for a job
    purge [options]       Will remove all completed jobs
    push [options] [url]  Push new job to the queue
    shift                 Run the next job in the queue
    shift:all             Run all unfinished jobs in the queue
```

## Debug mode

`pdf-bot` uses `debug` for debug messages. You can turn on debugging by setting the environment variable `DEBUG=pdf:*` like so

```bash
DEBUG=pdf:* pdf-bot jobs
```

## Tests

```bash
$ npm run test
```

## Issues

[Please report issues to the issue tracker](https://github.com/esbenp/pdf-bot/issues/new)

## License

The MIT License (MIT). Please see [License File](https://github.com/esbenp/pdf-bot/blob/master/LICENSE) for more information.
