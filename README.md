# cachetree-redis [![Build Status](https://secure.travis-ci.org/davidwood/cachetree-redis.png)](http://travis-ci.org/davidwood/cachetree-redis)

A Redis storage backend for [Cachetree](https://github.com/davidwood/cachetree).

## Installation

    npm install cachetree-redis

## Usage

To create a Cachtree instance using a Redis storage backend:

```
var cachetreeRedis = require('cachetree-redis'),
    cachetree = require('cachetree),
    store = cachetreeRedis(),
    cache = cachetree(store);
```

The `cachetree-redis` module exports a single constructor function that accepts an optional options object and returns a Redis storage backend instance.

`cachetreeRedis(options)`

* `options`: An object containing the following configuration options:
    * `client`: Redis client instance. If provided, `port`, `host`, `options`, `pw` and `db` are ignored
    * `port`: Redis server port
    * `host`: Redis server host
    * `options`: [Redis client](https://github.com/mranney/node_redis) options passed to `redis.createClient`
    * `pw`: Password for authenticating with Redis
    * `pass`: Alias for `pw`, if you're not a fan of the whole brevity thing
    * `password`: Alias for `pw`, same as `pass`
    * `db`: Number of the database to select
    * `database`: Alias for `db`
    * `delimiter`: Redis key delimiter, defaults to `:`
    * `autoCast`: Automatically stringify and parse values, defaults to `true` 

The returned store exposes the underlying Redis client through a property named `client`.

## Running Tests

`cachetree-redis` tests require [Mocha](https://mochajs.org/) and can be run with either `npm test` or `make test`.  You can specify Mocha options, such as the reporter, by adding a [mocha.opts](https://mochajs.org/#mochaopts) file, which is ignored by git, to the `test` directory.

By default, the test suite uses [fakeredis](https://npmjs.org/package/fakeredis) to mock a Redis server.  To run the tests against an actual Redis server, add a JSON file named `options.json` to the `test` directory. This file should contain the options to be passed to the `cachetree-redis` constructor function.  Like the `mocha.opts` file, `options.json` is ignored by git.
