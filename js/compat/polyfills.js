(function (global) {
  if (!global.console) {
    global.console = { log: function () {}, warn: function () {}, error: function () {} };
  }

  if (!Array.prototype.find) {
    Array.prototype.find = function (predicate) {
      if (this == null) throw new TypeError('Array.find called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      for (var i = 0; i < this.length; i += 1) {
        if (predicate.call(arguments[1], this[i], i, this)) return this[i];
      }
      return undefined;
    };
  }

  if (!Object.assign) {
    Object.assign = function (target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var i = 1; i < arguments.length; i += 1) {
        var source = arguments[i];
        if (source == null) continue;
        for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) to[key] = source[key];
      }
      return to;
    };
  }

  if (!global.Promise) {
    function TinyPromise(executor) {
      var self = this;
      self._state = 'pending';
      self._value = undefined;
      self._handlers = [];

      function settle(state, value) {
        if (self._state !== 'pending') return;
        self._state = state;
        self._value = value;
        setTimeout(function () {
          while (self._handlers.length) handle(self._handlers.shift());
        }, 0);
      }

      function resolve(value) {
        if (value && typeof value.then === 'function') {
          value.then(resolve, reject);
          return;
        }
        settle('fulfilled', value);
      }

      function reject(reason) {
        settle('rejected', reason);
      }

      function handle(handler) {
        if (self._state === 'pending') {
          self._handlers.push(handler);
          return;
        }
        var cb = self._state === 'fulfilled' ? handler.onFulfilled : handler.onRejected;
        if (!cb) {
          (self._state === 'fulfilled' ? handler.resolve : handler.reject)(self._value);
          return;
        }
        try {
          handler.resolve(cb(self._value));
        } catch (err) {
          handler.reject(err);
        }
      }

      self.then = function (onFulfilled, onRejected) {
        return new TinyPromise(function (resolveNext, rejectNext) {
          handle({ onFulfilled: onFulfilled, onRejected: onRejected, resolve: resolveNext, reject: rejectNext });
        });
      };

      self['catch'] = function (onRejected) {
        return self.then(null, onRejected);
      };

      try {
        executor(resolve, reject);
      } catch (err) {
        reject(err);
      }
    }

    TinyPromise.resolve = function (value) {
      return new TinyPromise(function (resolve) { resolve(value); });
    };

    TinyPromise.reject = function (reason) {
      return new TinyPromise(function (_, reject) { reject(reason); });
    };

    TinyPromise.all = function (items) {
      return new TinyPromise(function (resolve, reject) {
        var arr = items || [];
        if (!arr.length) return resolve([]);
        var out = new Array(arr.length);
        var left = arr.length;
        for (var i = 0; i < arr.length; i += 1) {
          (function (idx) {
            TinyPromise.resolve(arr[idx]).then(function (value) {
              out[idx] = value;
              left -= 1;
              if (left === 0) resolve(out);
            }, reject);
          })(i);
        }
      });
    };

    global.Promise = TinyPromise;
  }

  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  }

  if (!Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var node = this;
      while (node && node.nodeType === 1) {
        if (node.matches(selector)) return node;
        node = node.parentElement || node.parentNode;
      }
      return null;
    };
  }

  if (!global.fetch) {
    global.fetch = function (url, options) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        var method = (options && options.method) || 'GET';
        xhr.open(method, url, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          var response = {
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: function () { return Promise.resolve(xhr.responseText); },
            json: function () {
              try { return Promise.resolve(JSON.parse(xhr.responseText)); }
              catch (err) { return Promise.reject(err); }
            }
          };
          resolve(response);
        };
        xhr.onerror = function () { reject(new Error('Network error')); };
        if (options && options.headers) {
          for (var key in options.headers) {
            if (Object.prototype.hasOwnProperty.call(options.headers, key)) xhr.setRequestHeader(key, options.headers[key]);
          }
        }
        xhr.send((options && options.body) || null);
      });
    };
  }
})(window);
