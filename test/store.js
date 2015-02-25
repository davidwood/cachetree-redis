/*global describe: true, it:true, beforeEach: true, afterEach: true, before: true, after: true */
var assert = require('assert'),
    EventEmitter = require('events').EventEmitter,
    fakeredis = require('fakeredis'),
    client = fakeredis.createClient(),
    RedisStore = require('../');

describe('RedisStore', function() {

  var store;
  before(function() {
    var options;
    try {
      options = require('./options.json');
    } catch (e) {
    }
    store = new RedisStore(options || { client: client });
  });
  
  function clear(store, cb) {
    store.client.keys('*', function(err, keys) {
      if (Array.isArray(keys)) {
        store.client.del(keys, function() {
          cb();
        });
      } else {
        cb();
      }
    });
  }

  var data = {
    icao: {
      alpha: 'dot dash',
      bravo: 'dash dot dot dot',
      charlie: 'dash dot dash dot',
      delta: 'dash dot dot',
      xray: '13'
    }
  },
  data2 = {
    icao: {
      alpha: 'dot dash',
      bravo: 'dash dot dot dot'
    },
    'icao:more': {
      charlie: 'dash dot dash dot',
      delta: 'dash dot dot'
    },
    itu: {
      echo: 'dot',
      foxtrot: 'dot dot dash dot'
    },
    'alpha:icao': {
      golf: 'dash dash dot',
      hotel: 'dot dot dot dot'
    }
  };

  describe('new RedisStore(options)', function() {

    it('should not require new to be constructed', function() {
      var inst = RedisStore({ client: store.client });
      assert.strictEqual(inst instanceof RedisStore, true);
    });

    it('should accept a custom delimiter', function() {
      var inst = new RedisStore({ client: store.client, delimiter: '-' });
      assert.strictEqual(inst.delimiter, '-');
    });

    it('should be an EventEmitter', function(done) {
      var inst = new RedisStore({ client: store.client });
      assert.strictEqual(inst instanceof EventEmitter, true);
      inst.on('test', done);
      inst.emit('test');
    });

  });

  describe('.get(key, field, cb)', function() {
    
    before(function(done) {
      store.client.hmset('icao', data.icao, function() {
        done();
      });
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.get(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.get(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should return a value if a single field is specified', function(done) {
      store.get('icao', 'charlie', function(err, value) {
        assert.ok(!err);
        assert.strictEqual(value, 'dash dot dash dot');
        done();
      });
    });

    it('should accept an array for the key', function(done) {
      store.get(['icao'], 'charlie', function(err, value) {
        assert.ok(!err);
        assert.strictEqual(value, 'dash dot dash dot');
        done();
      });
    });

    it('should return null if a single field is specified but does not exist', function(done) {
      store.get('icao', 'echo', function(err, value) {
        assert.ok(!err);
        assert.strictEqual(value, null);
        done();
      });
    });

    it('should return an object if multiple fields are specified', function(done) {
      store.get('icao', 'charlie', 'alpha', function(err, values) {
        assert.ok(!err);
        assert.deepEqual(values, { charlie: 'dash dot dash dot', alpha: 'dot dash' });
        done();
      });
    });

    it('should return an object with values of null if multiple fields are specified but do not exist', function(done) {
      store.get('icao', 'echo', 'foxtrot', function(err, values) {
        assert.ok(!err);
        assert.strictEqual(values, Object(values));
        assert.deepEqual(Object.keys(values), ['echo', 'foxtrot']);
        assert.deepEqual(values, { echo: null, foxtrot: null });
        done();
      });
    });

    it('should return an object with all fields if no fields are specified', function(done) {
      store.get('icao', function(err, values) {
        assert.ok(!err);
        assert.notStrictEqual(values, data.icao);
        assert.deepEqual(values, data.icao);
        assert.strictEqual(typeof values.xray, 'number');
        assert.strictEqual(values.xray, 13);
        done();
      });
    });

    it('should return numeric values as a number', function(done) {
      store.get('icao', 'xray', function(err, value) {
        assert.ok(!err);
        assert.strictEqual(typeof value, 'number');
        assert.strictEqual(value, 13);
        done();
      });
    });

  });

  describe('.set(key, field, value, cb)', function() {

    beforeEach(function(done) {
      clear(store, done);
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.set(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.set(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should accept single field and value arguments', function(done) {
      store.set('icao', 'alpha', 'dot dash', function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { alpha: 'dot dash' });
          done();
        });
      });
    });

    it('should accept an array for the key', function(done) {
      store.set(['icao'], 'alpha', 'dot dash', function(err) {
        assert.strictEqual(err, null);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { alpha: 'dot dash' });
          done();
        });
      });
    });

    it('should accept multiple field and value arguments', function(done) {
      store.set('icao', 'alpha', 'dot dash', 'bravo', 'dash dot dot dot', 'charlie', 'dash dot dash dot', 'delta', function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot' });
          done();
        });
      });
    });

    it('should accept an array of field and value arguments', function(done) {
      store.set('icao', ['alpha', 'dot dash', 'bravo', 'dash dot dot dot', 'charlie', 'dash dot dash dot', 'delta'], function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot' });
          done();
        });
      });
    });

    it('should accept an object of field and values', function(done) {
      store.set('icao', { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', xray: 13 }, function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', xray: '13' });
          done();
        });
      });
    });

  });

  describe('.keys(pattern, cb)', function() {

    before(function(done) {
      var keys = Object.keys(data2),
          active = keys.length;
      if (active === 0) {
        return done();
      }
      keys.forEach(function(key) {
        store.client.hmset(key, data2[key], function() {
          if (--active === 0) {
            done();
          }
        });
      });
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.keys(), store);
    });

    it('should return an error if the pattern is not defined', function(done) {
      store.keys(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid pattern');
        done();
      });
    });

    it('should return an error if the pattern is not a string or regular expression', function(done) {
      store.keys({}, function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid pattern');
        done();
      });
    });

    it('should accept a string pattern', function(done) {
      store.keys('ic*', function(err, keys) {
        assert.ok(!err);
        assert.ok(Array.isArray(keys));
        assert.deepEqual(keys, ['icao', 'icao:more']);
        done();
      });
    });

    it('should return an empty array if pattern is not found', function(done) {
      store.keys('phonetic', function(err, keys) {
        assert.ok(!err);
        assert.ok(Array.isArray(keys));
        assert.strictEqual(keys.length, 0);
        done();
      });
    });

  });

  describe('.exists(key, field, cb)', function() {

    before(function(done) {
      store.client.hmset('icao', data.icao, function() {
        done();
      });
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.exists(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.exists(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should return an error if the field is not defined', function(done) {
      store.exists('icao', function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid field');
        done();
      });
    });

    it('should accept an array for the key', function(done) {
      store.exists(['icao'], 'bravo', function(err, exists) {
        assert.ok(!err);
        assert.strictEqual(exists, true);
        done();
      });
    });

    it('should return true if the field exists', function(done) {
      store.exists('icao', 'bravo', function(err, exists) {
        assert.ok(!err);
        assert.strictEqual(exists, true);
        done();
      });
    });

    it('should return false if the field exists', function(done) {
      store.exists('icao', 'foxtrot', function(err, exists) {
        assert.ok(!err);
        assert.strictEqual(exists, false);
        done();
      });
    });

  });

  describe('.del(key, field, cb)', function() {

    before(function(done) {
      store.client.hmset('icao', data.icao, function() {
        done();
      });
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.del(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.del(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should accept a single field', function(done) {
      store.del('icao', 'alpha', function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', delta: 'dash dot dot', xray: '13' });
          done();
        });
      });
    });

    it('should accept an array for the key', function(done) {
      store.del(['icao'], 'alpha', function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', delta: 'dash dot dot', xray: '13' });
          done();
        });
      });
    });

    it('should accept multiple fields', function(done) {
      store.del('icao', 'alpha', 'charlie', 'echo', function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { bravo: 'dash dot dot dot', delta: 'dash dot dot', xray: '13' });
          done();
        });
      });
    });

    it('should accept an array of fields', function(done) {
      store.del('icao', ['alpha', 'charlie', 'alpha'], function(err) {
        assert.ok(!err);
        store.client.hgetall('icao', function(err, data) {
          assert.deepEqual(data, { bravo: 'dash dot dot dot', delta: 'dash dot dot', xray: '13' });
          done();
        });
      });
    });
    
  });

  describe('.flush(key, cb)', function() {

    beforeEach(function(done) {
      var keys = Object.keys(data2),
          active = keys.length;
      if (active === 0) {
        return done();
      }
      keys.forEach(function(key) {
        store.client.hmset(key, data2[key], function() {
          if (--active === 0) {
            done();
          }
        });
      });
    });

    afterEach(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.flush(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.flush(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should accept a single field', function(done) {
      store.flush('icao', 'alpha', function(err) {
        assert.ok(!err);
        store.client.exists('icao', function(err, exists) {
          assert.strictEqual(exists, 0);
          done();
        });
      });
    });

    it('should accept an array for they key', function(done) {
      store.flush(['icao'], 'alpha', function(err) {
        assert.ok(!err);
        store.client.exists('icao', function(err, exists) {
          assert.strictEqual(exists, 0);
          done();
        });
      });
    });

    it('should accept multiple fields', function(done) {
      store.flush('icao', 'icao:more', 'echo', function(err) {
        assert.ok(!err);
        store.client.exists('icao', function(err, exists) {
          assert.strictEqual(exists, 0);
          store.client.exists('icao:more', function(err, exists) {
            assert.strictEqual(exists, 0);
            done();
          });
        });
      });
    });

    it('should accept an array of fields', function(done) {
      store.flush(['icao', 'icao:more', 'icao'], function(err) {
        assert.ok(!err);
        store.client.exists('icao', function(err, exists) {
          assert.strictEqual(exists, 0);
          store.client.exists('icao:more', function(err, exists) {
            assert.strictEqual(exists, 0);
            done();
          });
        });
      });
    });

  });

  describe('.cacheKey(key)', function() {
    
    it('should return an array concatenated with delimiter', function() {
      assert.strictEqual(store.cacheKey(['alpha', 'bravo']), 'alpha:bravo');
      var inst = new RedisStore({ client: store.client, delimiter: '-' });
      assert.strictEqual(inst.cacheKey(['alpha', 'bravo']), 'alpha-bravo');
    });

    it('should return the value if a string or number', function() {
      assert.strictEqual(store.cacheKey(['alpha', 'bravo']), 'alpha:bravo');
      assert.strictEqual(store.cacheKey(1234), 1234);
    });

  });

  describe('.fields(key, cb)', function() {

    before(function(done) {
      store.client.hmset('icao', data.icao, function() {
        done();
      });
    });

    after(function(done) {
      clear(store, done);
    });

    it('should return self for chaining', function() {
      assert.strictEqual(store.fields(), store);
    });

    it('should return an error if the key is not defined', function(done) {
      store.fields(function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid key');
        done();
      });
    });

    it('should accept an array for the key', function(done) {
      store.fields(['icao'], function(err, fields) {
        assert.ok(!err);
        assert.ok(Array.isArray(fields));
        assert.deepEqual(fields, ['alpha', 'bravo', 'charlie', 'delta', 'xray']);
        done();
      });
    });

    it('should return an array of fields keys', function(done) {
      store.fields('icao', function(err, fields) {
        assert.ok(!err);
        assert.ok(Array.isArray(fields));
        assert.deepEqual(fields, ['alpha', 'bravo', 'charlie', 'delta', 'xray']);
        done();
      });
    });

    it('should return any empty array if no fields exist', function(done) {
      store.fields('itu', function(err, fields) {
        assert.ok(!err);
        assert.ok(Array.isArray(fields));
        assert.strictEqual(fields.length, 0);
        done();
      });
    });

  });
  describe('._parse(value)', function() {

    it('should not parse the value if the autoCast property is false', function() {
      var inst = new RedisStore({ client: store.client, autoCast: false });
      assert.strictEqual(inst._parse('1234'), '1234');
    });

    it('should not parse the value if a buffer', function() {
      var inst = new RedisStore({ client: store.client }),
          buffer = new Buffer(100);
      assert.strictEqual(inst._parse(buffer), buffer);
    });

    it('should parse string values', function() {
      var inst = new RedisStore({ client: store.client });
      assert.strictEqual(inst._parse('1234'), 1234);
    });

  });

  describe('._stringify(value)', function() {
    
    it('should not stringify the value if the autoCast property is false', function() {
      var inst = new RedisStore({ client: store.client, autoCast: false });
      assert.strictEqual(inst._stringify(1234), 1234);
    });

    it('should not stringify the value if a buffer', function() {
      var inst = new RedisStore({ client: store.client }),
          buffer = new Buffer(100);
      assert.strictEqual(inst._stringify(buffer), buffer);
    });

    it('should stringify string values', function() {
      var inst = new RedisStore({ client: store.client });
      assert.strictEqual(inst._stringify(1234), '1234');
    });

  });

});
