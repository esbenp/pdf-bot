var sinon = require('sinon')
var htmlPdf = require('html-pdf-chrome')
var createGenerator = require('../src/pdfGenerator')
var error = require('../src/error')

describe('PDF Generator', function() {
  var generator
  var pdf
  var createStub
  beforeEach(function(){
    pdf = {
      toFile: sinon.stub().returns(new Promise(function(resolve){
        resolve()
      }))
    }
    createStub = sinon.stub(htmlPdf, 'create');
    createStub.onCall(0).returns(new Promise((resolve) => resolve(pdf)))
    generator = createGenerator('storage')
  })

  afterEach(function(){
    createStub.restore()
  })

  it('should call html-pdf-chrome with the correct options', function() {
    var options = {options: true}
    generator = createGenerator('storage', options)('url', {id: 1})

    if (!createStub.calledOnce || !createStub.calledWith('url', options)) {
      throw new Error('Correct options not passed')
    }
  })

  it('should attempt to write pdf to storage', function(done) {
    generator('url', {id: 1}).then(() => {
      if (!pdf.toFile.calledOnce || !pdf.toFile.args[0][0].match(/storage\/pdf\/(.+)\.pdf$/)) {
        throw new Error('PDF was not attempted to saved')
      }

      done()
    })
  })

  it('should apply all passed storage configurations', function(done) {
    var storage = {
      storage_1: function() {
        return new Promise((resolve) => resolve({ path: 'file_1' }))
      },
      storage_2: function() {
        return new Promise((resolve) => resolve({ path: 'file_2' }))
      }
    }

    createGenerator('storage', {}, storage)('url', {id: 1}).then(response => {
      var storage = response.storage

      if (storage.storage_1.path !== 'file_1' || storage.storage_2.path !== 'file_2') {
        throw new Error('Storage response not properly set')
      }

      done()
    })
  })

  it('should return error response thrown promises', function(done) {
    createStub.onCall(0).returns(new Promise((resolve, reject) => reject('error')))

    createGenerator('storage', {}, {})('url', {id: 1}).then(response => {
      if (!error.isError(response)) {
        throw new Exception('Generator rejection did not resolve in error promise')
      }

      done()
    })
  })
})
