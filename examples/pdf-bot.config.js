var htmlPdf = require('html-pdf-chrome')
var createS3Config = require('../src/storage/s3')

module.exports = {
  api: {
    token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(1000), // waits for 1 sec
    //port: 50 // chrome port
  },
  queue: {

  },
  storage: {
    /*'s3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })*/
  },
  webhook: {
    headerNamespace: 'X-PDF-',
    requestOptions: {

    },
    secret: '1234',
    url: 'http://localhost:3000/webhooks/pdf'
  }
}
