var htmlPdf = require('html-pdf-chrome')
var createS3Plugin = require('../src/storage/s3')

module.exports = {
  api: {
    token: '1234'
  },
  /*generatorOptions: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(5000)
  },*/
  debug: true,
  port: 3000,
  webhookOptions: {
    requestOptions: {},
    secret: '12345',
    url: 'http://localhost:3000/hook',
    headerNamespace: 'X-PDF-'
  }
}
