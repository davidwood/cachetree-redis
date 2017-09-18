/*global describe: true, it:true, beforeEach: true, afterEach: true, before: true, after: true */
var assert = require('assert'),
    EventEmitter = require('events').EventEmitter,
    fakeredis = require('fakeredis'),
    RedisStore = require('../');

/**
 * Test data
 */
var data = Object.freeze({
  icao: {
    alpha: 'dot dash',
    bravo: 'dash dot dot dot',
    charlie: 'dash dot dash dot',
    delta: 'dash dot dot',
    xray: '13'
  }
});
var data2 = Object.freeze({
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
});

/**
  * Convert Buffers if returned
  *
  * @param   {Object}    data    Data to convert
  * @returns {Object}    with converted buffers
  */
function convertObject(data) {
  var output = {};
  Object.keys(data).forEach(function(key) {
    var value = data[key];
    output[key] = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  });
  return output;
}

describe('RedisStore', function() {
  [true].forEach(function(returnBuffers) {
    describe('return_buffers = ' + returnBuffers, function() {
      var client = fakeredis.createClient(null, null, { return_buffers: returnBuffers });
      var store;
      var inst;
      before(function() {
        var options;
        try {
          options = require('./options.json');
        } catch (e) {
        }
        store = new RedisStore(options || { client: client });
      });

      afterEach(function() {
        if (inst) {
          inst.client.removeAllListeners();
          inst = null;
        }
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

      describe('new RedisStore(options)', function() {

        it('should not require new to be constructed', function() {
          inst = RedisStore({ client: store.client });
          assert.strictEqual(inst instanceof RedisStore, true);
        });

        it('should accept a custom delimiter', function() {
          inst = new RedisStore({ client: store.client, delimiter: '-' });
          assert.strictEqual(inst.delimiter, '-');
        });

        it('should set auto cast enabled by default', function() {
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst.autoCast, true);
        });

        it('should accept a boolean auto cast option', function() {
          inst = new RedisStore({ client: store.client, autoCast: false });
          assert.strictEqual(inst.autoCast, false);
        });

        it('should be an EventEmitter', function(done) {
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst instanceof EventEmitter, true);
          inst.on('test', done);
          inst.emit('test');
        });

      });

      describe('.get(key, [asBuffer], field, cb)', function() {

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

        it('should return an object of buffers if multiple fields are specified and asBuffer is true', function(done) {
          store.get('icao', true, 'charlie', 'alpha', function(err, values) {
            var keys;
            assert.ok(!err);
            assert.strictEqual(typeof values, 'object');
            keys = Object.keys(values);
            assert.strictEqual(keys.length, 2);
            keys.forEach(function iterator(key) {
              assert.strictEqual(Buffer.isBuffer(values[key]), true);
            });
            assert.deepEqual(convertObject(values), { charlie: 'dash dot dash dot', alpha: 'dot dash' });
            done();
          });
        });

        it('should return an object with values of null if multiple fields are specified but do not exist', function(done) {
          var complete = 0;
          function check(err, values) {
            assert.ok(!err);
            assert.strictEqual(values, Object(values));
            assert.deepEqual(Object.keys(values), ['echo', 'foxtrot']);
            assert.deepEqual(values, { echo: null, foxtrot: null });
            if (++complete === 2) {
              done();
            }
          }
          store.get('icao', 'echo', 'foxtrot', check);
          store.get('icao', true, 'echo', 'foxtrot', check);
        });

        it('should return an object with all fields if no fields are specified and asBuffer is not true', function(done) {
          var complete = 0;
          function check(err, values) {
            assert.ok(!err);
            assert.notStrictEqual(values, data.icao);
            assert.deepEqual(values, data.icao);
            assert.strictEqual(typeof values.xray, 'number');
            assert.strictEqual(values.xray, 13);
            if (++complete === 2) {
              done();
            }
          }
          store.get('icao', check);
          store.get('icao', false, check);
        });

        it('should return an object of buffers for all if no fields are specified and asBuffer is true', function(done) {
          store.get('icao', true, function(err, values) {
            var keys;
            var converted;
            assert.ok(!err);
            assert.strictEqual(typeof values, 'object');
            keys = Object.keys(values);
            assert.strictEqual(keys.length > 0, true);
            keys.forEach(function iterator(key) {
              assert.strictEqual(Buffer.isBuffer(values[key]), true);
            });
            converted = convertObject(values);
            assert.deepEqual(converted, data.icao);
            done();
          });
        });

        it('should return numeric values as a number if asBuffer is not true', function(done) {
          var complete = 0;
          function check(err, value) {
            assert.ok(!err);
            assert.strictEqual(typeof value, 'number');
            assert.strictEqual(value, 13);
            if (++complete === 2) {
              done();
            }
          }
          store.get('icao', 'xray', check);
          store.get('icao', false, 'xray', check);
        });

        it('should return numeric values as a buffer if asBuffer is true', function(done) {
         store.get('icao', true, 'xray', function(err, value) {
            assert.ok(!err);
            assert.strictEqual(Buffer.isBuffer(value), true);
            assert.strictEqual(parseInt(value.toString('utf8'), 10), 13);
            done();
          });
        });

        it('should return a connection error', function(done) {
          this.timeout(10000);
          inst = new RedisStore({ host: 'bad.local', port: 6379, options: { retry_strategy: function strategy() { return; }  } });
          inst.get('test', function(err) {
            assert.strictEqual(err instanceof Error, true);
            assert.strictEqual(err.message, 'Stream connection ended and command aborted.');
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
              assert.deepEqual(convertObject(data), { alpha: 'dot dash' });
              done();
            });
          });
        });

        it('should accept an array for the key', function(done) {
          store.set(['icao'], 'alpha', 'dot dash', function(err) {
            assert.strictEqual(err, null);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { alpha: 'dot dash' });
              done();
            });
          });
        });

        it('should accept multiple field and value arguments', function(done) {
          store.set('icao', 'alpha', 'dot dash', 'bravo', 'dash dot dot dot', 'charlie', 'dash dot dash dot', 'delta', function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot' });
              done();
            });
          });
        });

        it('should accept an array of field and value arguments', function(done) {
          store.set('icao', ['alpha', 'dot dash', 'bravo', 'dash dot dot dot', 'charlie', 'dash dot dash dot', 'delta'], function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot' });
              done();
            });
          });
        });

        it('should accept an object of field and values', function(done) {
          store.set('icao', { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', xray: 13 }, function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { alpha: 'dot dash', bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', xray: '13' });
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
              assert.deepEqual(convertObject(data), { bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', delta: 'dash dot dot', xray: '13' });
              done();
            });
          });
        });

        it('should accept an array for the key', function(done) {
          store.del(['icao'], 'alpha', function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { bravo: 'dash dot dot dot', charlie: 'dash dot dash dot', delta: 'dash dot dot', xray: '13' });
              done();
            });
          });
        });

        it('should accept multiple fields', function(done) {
          store.del('icao', 'alpha', 'charlie', 'echo', function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { bravo: 'dash dot dot dot', delta: 'dash dot dot', xray: '13' });
              done();
            });
          });
        });

        it('should accept an array of fields', function(done) {
          store.del('icao', ['alpha', 'charlie', 'alpha'], function(err) {
            assert.ok(!err);
            store.client.hgetall('icao', function(err, data) {
              assert.deepEqual(convertObject(data), { bravo: 'dash dot dot dot', delta: 'dash dot dot', xray: '13' });
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

        /**
         * Parse the exists value
         *
         * @param   {*}         value     Client value
         * @return  {Boolean}   true if exists
         */
        function castExists(value) {
          if (returnBuffers === false) {
            return value === 1;
          }
          if (Buffer.isBuffer(value)) {
            return parseInt(value.toString('utf8'), 10) === 1;
          }
          return false;
        }

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
          store.client.exists('icao', function(err, exists) {
            assert.strictEqual(castExists(exists), true);
            store.flush('icao', 'alpha', function(err) {
              assert.ok(!err);
              store.client.exists('icao', function(err, exists) {
                assert.strictEqual(castExists(exists), false);
                done();
              });
            });
          });
        });

        it('should accept an array for they key', function(done) {
          store.client.exists('icao', function(err, exists) {
            assert.strictEqual(castExists(exists), true);
            store.flush(['icao'], 'alpha', function(err) {
              assert.ok(!err);
              store.client.exists('icao', function(err, exists) {
                assert.strictEqual(castExists(exists), false);
                done();
              });
            });
          });
        });

        it('should accept multiple fields', function(done) {
          store.client.exists('icao', function(err, exists) {
            assert.strictEqual(castExists(exists), true);
            store.client.exists('icao:more', function(err, exists) {
              assert.strictEqual(castExists(exists), true);
              store.flush('icao', 'icao:more', 'echo', function(err) {
                assert.ok(!err);
                store.client.exists('icao', function(err, exists) {
                  assert.strictEqual(castExists(exists), false);
                  store.client.exists('icao:more', function(err, exists) {
                    assert.strictEqual(castExists(exists), false);
                    done();
                  });
                });
              });
            });
          });
        });

        it('should accept an array of fields', function(done) {
          store.client.exists('icao', function(err, exists) {
            assert.strictEqual(castExists(exists), true);
            store.client.exists('icao:more', function(err, exists) {
              assert.strictEqual(castExists(exists), true);
              store.flush(['icao', 'icao:more', 'icao'], function(err) {
                assert.ok(!err);
                store.client.exists('icao', function(err, exists) {
                  assert.strictEqual(castExists(exists), false);
                  store.client.exists('icao:more', function(err, exists) {
                    assert.strictEqual(castExists(exists), false);
                    done();
                  });
                });
              });
            });
          });
        });

      });

      describe('.cacheKey(key)', function() {

        it('should return an array concatenated with delimiter', function() {
          assert.strictEqual(store.cacheKey(['alpha', 'bravo']), 'alpha:bravo');
          inst = new RedisStore({ client: store.client, delimiter: '-' });
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
          inst = new RedisStore({ client: store.client, autoCast: false });
          assert.strictEqual(inst._parse('1234'), '1234');
        });

        it('should not parse the value if a buffer', function() {
          var buffer = new Buffer(100);
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst._parse(buffer), buffer);
        });

        it('should parse string values', function() {
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst._parse('1234'), 1234);
        });

      });

      describe('._stringify(value)', function() {

        it('should not stringify the value if the autoCast property is false', function() {
          inst = new RedisStore({ client: store.client, autoCast: false });
          assert.strictEqual(inst._stringify(1234), 1234);
        });

        it('should not stringify the value if a buffer', function() {
          var buffer = new Buffer(100);
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst._stringify(buffer), buffer);
        });

        it('should stringify string values', function() {
          inst = new RedisStore({ client: store.client });
          assert.strictEqual(inst._stringify(1234), '1234');
        });

      });

    });
  });
});
