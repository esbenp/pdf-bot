var htmlPdf = require('html-pdf-chrome')
var createS3Config = require('../src/storage/s3')

var decaySchedule = [
  1000, //After 1 seconds
  1000 * 5, //After 5 seconds
  1000 * 15, //After 15 seconds
  1000 * 30, //After 30 seconds
  1000 * 60, //After 1 minute
  1000 * 60 * 3, //After 3 minutes
  1000 * 60 * 5, //After 5 minutes
  1000 * 60 * 10, //After 10 minutes
  1000 * 60 * 30, //After 30 minutes
  1000 * 60 * 60 //After 1 hour
];

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
    /*
    's3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })
    */
  },
  webhook: {
    headerNamespace: 'X-PDF-',
    requestOptions: {

    },
    secret: '12345',
    url: 'http://localhost:3001/hook'
  }
}
