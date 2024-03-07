const sinon = require('sinon');
const request = require('supertest');
const createApi = require('../src/api');

describe('api: POST /', () => {
  let api;

  beforeEach(() => {
    api = createApi(() => {}, { token: '1234' });
  });

  it('should return 401 if no token is given', async () => {
    await request(api).post('/').expect(401);
  });

  it('should return 401 if invalid token is given', async () => {
    await request(api).post('/').set('Authorization', 'Bearer test').expect(401);
  });

  it('should return 422 on erroneous responses', async () => {
    const queue = { addToQueue: () => Promise.resolve({ code: '001', error: true }), close: () => {} };
    const api = createApi(queue, { token: '1234' });

    await request(api).post('/').set('Authorization', 'Bearer 1234').send({}).expect(422);
  });

  it('should run the queue with the correct params', async () => {
    const meta = { id: 1 };
    const addToQueue = sinon.stub().resolves({ id: '1234' });
    const queue = { addToQueue, close: () => {} };
    const api = createApi(queue, { token: '1234' });

    await request(api).post('/').set('Authorization', 'Bearer 1234').send({ url: 'https://google.com', meta: meta }).expect(201);

    sinon.assert.calledWith(addToQueue, { url: 'https://google.com', meta: meta });
  });
});
