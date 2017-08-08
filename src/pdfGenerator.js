var htmlPdf = require('html-pdf-chrome')
var uuid = require('uuid')
var debug = require('debug')('pdf:generator')
var error = require('./error')

function createPdfGenerator(options = {}, storagePlugins = {}) {
  return function createPdf (url, job) {
    debug('Creating PDF for url %s with options %s', url, JSON.stringify(options))

    return htmlPdf
      .create(url, options)
      .then((pdf) => {
        var path = 'storage/pdf/' + uuid() + '.pdf'

        debug('Saving PDF to %s', path)

        pdf.toFile(path)

        var storage = {
          local: path
        }
        var storagePluginPromises = []
        for (var i in storagePlugins) {
          storagePluginPromises.push(
            storagePlugins[i](path, job).then(response => Object.assign(response, {
              type: i
            }))
          )
        }

        return Promise.all(storagePluginPromises).then(responses => {
          for(var i in responses) {
            var response = responses[i]

            storage[response.type] = {
              path: response.path,
              meta: response.meta || {}
            }
          }

          return {
            storage: storage
          }
        })
      })
      .catch(msg => {
        var response = error.createErrorResponse(error.ERROR_HTML_PDF_CHROME_ERROR)

        response.message += ' ' + msg

        return response
      })
  }
}

module.exports = createPdfGenerator
