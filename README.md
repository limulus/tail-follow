# tail-follow

Stream a file as it is appended

## Synopsis

If you are familiar with UNIX's `tail -f`, you have a good idea what this module does. It provides a `Readable` stream interface to a file that emits new data appended to the file in real time.

## API

```javascript
var TailFollow = require("tail-follow")
```

### new TailFollow(path)

Create new TailFollow instance, for the file at the given path. This is a [Readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable), so you should listen for the `error` event and `data` event. Or `pipe()` it to another stream.

## Contributing

This module uses ES2015. To compile the source to ES5 (compatible with Node.js, io.js), run `npm run compile`.

Any changes in behavior need test coverage. To run the tests, run `npm test`.
