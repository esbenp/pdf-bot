var sinon = require('sinon')
var s3 = require('s3')
var createS3Storage = require('../../src/storage/s3')

var job = {
  id: 1
}

describe('storage:s3', function() {
  var createClientStub, uploadFileStub, onSpy
  beforeEach(function(){
    onSpy = sinon.stub().callsFake(function(type, func) {
      if (type === 'end') {
        func({})
      }
    })
    uploadFileStub = sinon.stub().returns({
      on: onSpy
    })
    createClientStub = sinon.stub(s3, 'createClient').returns({
      uploadFile: uploadFileStub
    })
  })

  afterEach(function(){
    createClientStub.restore()
  })

  it('should throw when access key id is not passed', function() {
    var didThrow = false
    try {
      createS3Storage({})
    } catch(e) {
      if (e.toString() === 'Error: S3: No access key given') {
        didThrow = true
      }
    }
    if (!didThrow) {
      throw new Error('Error was not thrown when no access key id was given')
    }
  })

  it('should throw when secret access key is not passed', function() {
    var didThrow = false
    try {
      createS3Storage({ accessKeyId: '1234' })
    } catch(e) {
      if (e.toString() === 'Error: S3: No secret access key given') {
        didThrow = true
      }
    }
    if (!didThrow) {
      throw new Error('Error was not thrown when no access key id was given')
    }
  })

  it('should throw when region is not passed', function() {
    var didThrow = false
    try {
      createS3Storage({ accessKeyId: '1234', secretAccessKey: '1234' })
    } catch(e) {
      if (e.toString() === 'Error: S3: No region specified') {
        didThrow = true
      }
    }
    if (!didThrow) {
      throw new Error('Error was not thrown when no access key id was given')
    }
  })

  it('should throw when bucket is not passed', function() {
    var didThrow = false
    try {
      createS3Storage({ accessKeyId: '1234', secretAccessKey: '1234', region: 'us-west-1' })
    } catch(e) {
      if (e.toString() === 'Error: S3: No bucket was specified') {
        didThrow = true
      }
    }
    if (!didThrow) {
      throw new Error('Error was not thrown when no access key id was given')
    }
  })

  it('create client with correct settings', function(done) {
    createS3Storage({
      accessKeyId: '1234',
      secretAccessKey: '4321',
      region: 'us-west-1',
      bucket: 'bucket',
      s3ClientOptions: {
        test: true
      }
    })('path', job).then(() => {
      var expectedOptions = {
        s3Options: {
          accessKeyId: '1234',
          secretAccessKey: '4321',
          region: 'us-west-1'
        },
        test: true
      }

      if (!createClientStub.calledOnce || !createClientStub.calledWith(expectedOptions)) {
        throw new Error('Client was not created with correct options')
      }

      done()
    })
  })

  it('should attempt to upload file with correct params', function(done){
    createS3Storage({
      accessKeyId: '1234',
      secretAccessKey: '4321',
      region: 'us-west-1',
      bucket: 'bucket',
      path: 'remote-folder',
      s3ClientOptions: {
        test: true
      }
    })('some/epic/path', job).then(() => {
      var expectedOptions = {
        localFile: 'some/epic/path',
        s3Params: {
          Bucket: 'bucket',
          Key: 'remote-folder/path'
        }
      }
      if (!uploadFileStub.calledOnce || !uploadFileStub.calledWith(expectedOptions)) {
        throw new Error('uploadFile was not called with correct options')
      }

      done()
    })
  })

  it('should call path if a function is passed', function(done) {
    var path = sinon.stub().returns('remote-path')
    createS3Storage({
      accessKeyId: '1234',
      secretAccessKey: '4321',
      region: 'us-west-1',
      bucket: 'bucket',
      path: path,
      s3ClientOptions: {
        test: true
      }
    })('path', job).then(() => {
      if (!path.calledOnce || !path.calledWith('path', job)) {
        throw new Error('Path function was not called')
      }

      done()
    })
  })
})
