const Promise = require('promise');
//const fetch = require('cross-fetch');
const Swagger = require('swagger-client');
const HashMap = require('hashmap');
const fs = require('fs');

var url = require('url');
var http = require('http');
var HttpProxyAgent = require('http-proxy-agent');
var HttpsProxyAgent = require('https-proxy-agent');

http.globalAgent.maxSockets = 20;

var debugHttp = false;
var debugCache = false;
var reportHttpFinalFailures = true;

module.exports = {
  id: "NeoLoadWebAPI",
  create: function(apiKey,host,ssl) {
    return new NLWAPI(apiKey,host,ssl);
  }
};
const httpCachePath = './.cache'

function NLWAPI(apiKey, host, ssl) {
  this.https = (ssl=="false" ? false : true);
  this.host = host ? host : "neoload-api.saas.neotys.com";
  this.apiKey = apiKey;
  this.proxySpec = null;

  this.getApiKey = function() { return this.apiKey; }
  this.setApiKey = function(newApiKey) { this.apiKey = newApiKey; return this; }

  this.getBaseUrl = function() {
    return "http" + (this.https ? "s" : "") + "://" + this.host + "/v1/";
  };
  this.proxy = function(serverSpec) {
    this.proxySpec = serverSpec;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = ((this.proxySpec != null) ? "0" : "1");
  }

  var fetchesOpened = 0;
  var fetchesClosed = 0;

  const maxRetries = 20;
  const retryInMs = 1000;

  this.httpResponseCache = new HashMap();
  var shouldCache = fs.existsSync(httpCachePath);

  if(shouldCache) {
    // resume from file system
    console.log('checking cache');
    fs.readdirSync(httpCachePath).forEach(file => {
      if(file.endsWith('.json')) {
        var filepath = httpCachePath + '/' + file;
        console.log('uncaching: ' + filepath);
        uncacheHttpResponse(this,filepath);
      }
    })
    console.log('done uncaching')
  }

  this.getClient = function() {
    var nlw = this;
    try {
      return retrySwagger("http"+(this.https ? "s" : "")+"://"+this.host+"/explore/swagger.yaml", {
        userFetch: (url, opts) => {
          var o = opts ? opts : {};
          if (this.proxySpec != null)
            o.agent = new HttpsProxyAgent(this.proxySpec);
          else if(o.agent == undefined || o.agent == null)
            o.agent = new http.Agent({ maxSockets: http.globalAgent.maxSockets });

          /*console.log("--------------------------------------------")
          console.log("url: " + url + ", opts: " + JSON.stringify(o))
          console.log("--------------------------------------------")*/
          if(o.method == "GET") {
            var key = url;
            if(nlw.httpResponseCache.has(key))
              return new Promise(function(resolve,reject) {
                if(debugHttp || debugCache) console.log('Cached GET: ' + url)
                resolve(nlw.httpResponseCache.get(key));
              })
            else {
              fetchesOpened += 1;
              if(debugHttp) console.log('('+fetchesOpened+'/'+fetchesClosed+') Fetching: ' + url)
              retryFetch(url, o).then(r => {
                fetchesClosed += 1;
                if(debugHttp) console.log('('+fetchesOpened+'/'+fetchesClosed+') Fetched: ' + url)
                if(shouldCache) cacheHttpResponse(nlw, key, r);
              }).catch(err => {
                fetchesClosed += 1;
                if(debugHttp || reportHttpFinalFailures) console.error('('+fetchesOpened+'/'+fetchesClosed+') Error: ' + err)
              }).finally(r => {
                if(fetchesOpened != fetchesClosed) {
                  console.error('Some fetches still outstanding: ('+fetchesOpened+'/'+fetchesClosed+')')
                }
              })
            }
          }
          return retryFetch(url, o);
        },
        requestInterceptor: (req) => {
          req.headers['accountToken'] = this.getApiKey();
          if (this.proxySpec != null)
            req.agent = new HttpsProxyAgent(this.proxySpec);
        },
        responseInterceptor: (res) => {
          //console.log(res);
        }
      });
    } catch(e) {
      throw e;
    }
  };

const delay = (ms) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, ms)
    })
}
const retryFetch = (url, fetchOptions={}, retries=maxRetries, retryDelay=retryInMs) => {
    return new Promise((resolve, reject) => {
        const wrapper = n => {
            fetch(url, fetchOptions)
                .then(res => { resolve(res) })
                .catch(async err => {
                    if(n > 0) {
                        // console.log(`retrying ${n}`)
                        await delay(retryDelay)
                        wrapper(--n)
                    } else {
                        reject(err)
                    }
                })
        }

        wrapper(retries)
    })
}
const retrySwagger = (yamlUrl, options={}, retries=maxRetries, retryDelay=retryInMs) => {
    return new Promise((resolve, reject) => {
        const wrapper = n => {
            Swagger(yamlUrl, options)
                .then(res => { resolve(res) })
                .catch(async err => {
                    if(n > 0) {
                        // console.log(`retrying ${n}`)
                        await delay(retryDelay)
                        wrapper(--n)
                    } else {
                        reject(err)
                    }
                })
        }

        wrapper(retries)
    })
}

String.prototype.hashCode = function() {
  var hash = 0, i, chr;
  if (this.length === 0) return hash;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

function uncacheHttpResponse(nlw, file) {
  var o = JSON.parse(fs.readFileSync(file));
  if(o != undefined && o != null && o.key && o.value) {
    nlw.httpResponseCache.set(o.key, o.value);
  } else
    console.error('Uncaching error: ' + file)
}
function cacheHttpResponse(nlw, key, oValue) {
  nlw.httpResponseCache.set(key, oValue);
  // persist to file system
  var persisted = {
    key: key,
    value: oValue
  }
  var json = JSON.stringify(persisted);
  var path = httpCachePath + '/' + key.hashCode() + '.json';
  fs.writeFile(path, json, (err) => {
    // throws an error, you could also catch it here
    if (err) throw err;
});
}

  this.createOptions = function(url) {
    return {
      uri: url,
      headers: { 'accountToken' : this.apiKey },
      json: true
    };
  }

  this.test = function(id) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTest({testId: id});
    });
  }

  this.testStatistics = function(id) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestStatistics({testId: id});
    });
  }

  this.tests = function() {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTests({limit: 50, pretty: true});
    });
  }

  this.elements = function(test,category) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElements({ testId: test.id, category: category });
    }).then(res => {
      return res.body.map(el => {
        el.test = test;
        return el;
      });
    });
  }

  this.values = function(element) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElementsValues({ testId: element.test.id, elementId: element.id });
    }).then(res => {
      return res.body;
    });
  }

  this.REQUEST_FIELDS = 'AVG_DURATION,MIN_DURATION,MAX_DURATION,COUNT,THROUGHPUT,ELEMENTS_PER_SECOND,ERRORS,ERRORS_PER_SECOND,ERROR_RATE,AVG_TTFB,MIN_TTFB,MAX_TTFB'.split(',');

  this.points = function(element, since, fields) {
    if(since == undefined || since == null) since = 0;
    if(fields == undefined || fields == null) fields = this.REQUEST_FIELDS;
    if(Array.isArray(fields)) fields = fields.join(',');
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElementsPoints({
        testId: element.test.id,
        elementId: element.id,
        statistics: fields
      }).then(set => {
        return set.body
          .filter(line => {
            var to = element.test.startDate + line.from;
            return (
               since<=0
               ||
               (line.from > 0 && (to <= 0 || to > since))
            );
          })
          .map(line => {
          line.test = element.test;
          line.element = element;
          return line;
        })
      });
    });
  }
}
