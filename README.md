# pdf-bot

Easily create a microservice for generating PDFs using headless Chrome.

`pdf-bot` is installed on a server and will receive URLs to turn into PDFs through its API or CLI. `pdf-bot` will manage a queue of PDF jobs. Once a PDF job has run it will notify you using a webhook so you can fetch the API. `pdf-bot` supports storing PDFs on S3 out of the box. Failed PDF generations and Webhook pings will be retryed after a configurable decaying schedule.

![How to use the pdf-bot CLI](http://imgur.com/aRHye2l.gif)

`pdf-bot` uses [`html-pdf-chrome`](https://github.com/westy92/html-pdf-chrome) under the hood and supports all the settings that it supports. Major thanks to [@westy92](https://github.com/westy92/html-pdf-chrome) for making this possible.

## How does it work?

Imagine you have an app that creates invoices. You want to save those invoices as PDF. You install `pdf-bot` on a server as an API. Your app server sends the URL of the invoice to the `pdf-bot` server. A cronjob on the `pdf-bot` server keeps checking for new jobs, generates a PDF using headless Chrome and sends the location back to the application server using a webhook.

## Installation

```bash
$ npm install -g pdf-bot
$ pdf-bot --help
```

> Make sure the node path is in your $PATH

### Configuration

`pdf-bot` comes packaged with sensible defaults. However, if you want to customize your config, simply create a config file that exports a configuration and pass it as a parameter to `pdf-bot`

`pdf-bot.config.js`
```js
var htmlPdf = require('html-pdf-chrome')

module.exports = {
  api: {
    token: 'crazy-secret'
  },
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(1000) // 1 sec timeout
  }
}
```

```bash
$ pdf-bot -c ./pdf-bot.config.js push https://esbenp.github.io
```

[See a full list of the available configuration options.](#options)

## Usage guide

## Options

## Tests

```bash
$ npm run test
```

## License

The MIT License (MIT). Please see [License File](https://github.com/esbenp/pdf-bot/blob/master/LICENSE) for more information.
