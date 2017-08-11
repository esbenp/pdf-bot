var express = require('express')
var bodyParser = require('body-parser')

var api = express()
api.use(bodyParser.json())

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

api.listen(3001, function() {
  console.log('Listening to port 3001')
})
