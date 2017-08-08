# pdf-bot

Easily create a microservice for generating PDFs using headless Chrome.

`pdf-bot` is installed on a server and will receive URLs to turn into PDFs through its API or CLI. `pdf-bot` will manage a queue of PDF jobs. Once a PDF job has run it will notify you using a webhook so you can fetch the API. `pdf-bot` supports storing PDFs on S3 out of the box.

![How to use the pdf-bot CLI](http://imgur.com/aRHye2l.gif)

`pdf-bot` uses [`html-pdf-chrome`](https://github.com/westy92/html-pdf-chrome) under the hood and supports all the settings that it supports. Major thanks to [@westy92](https://github.com/westy92/html-pdf-chrome) for making this possible.

## How does it work?

Imagine you have an app that creates invoices. You want to save those invoices as PDF. You install `pdf-bot` on server as an API. Your app server sends the URL of the invoice to the `pdf-bot` server. A cronjob on the `pdf-bot` server keeps checking for new jobs, generates a PDF using headless Chrome and sends the location back to the application server using a webhook.

## Installation

Create a new npm project and install `pdf-bot`.

```
npm init
npm install --save pdf-bot
```

Create a `index.js` file that will create your CLI

`index.js`
```
var pdfBot = require('pdf-bot');

pdfBot({
  // CLI options
  api: {
    token: '1234'
  },
  port: 3000
})
```

You can see a full list of [available options here.](#options)
