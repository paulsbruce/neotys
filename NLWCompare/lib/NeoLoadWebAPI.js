const Promise = require('promise');
//const fetch = require('cross-fetch');
const Swagger = require('swagger-client');
const HashMap = require('hashmap');
const fs = require('fs');
const yaml = require('js-yaml');
const Stream = require('stream');
const readline = require('readline');
const parsekey = require('parse-key');

var url = require('url');
var http = require('http');
var HttpProxyAgent = require('http-proxy-agent');
var HttpsProxyAgent = require('https-proxy-agent');

http.globalAgent.maxSockets = 5;
var sleepBetweenRequests = 100;

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

var hashOutstandingRequests = new HashMap();

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

process.stdin.on("keypress", function(str, key) {
  if(key.sequence === parsekey('ctrl-h').sequence) {
    debugHttp = !debugHttp
    console.log('Toggled [debugHttp]: '+(debugHttp ? 'on' : 'off'))
    console.log(JSON.stringify(hashOutstandingRequests,null,'\t'))
  }
  if(key.sequence === parsekey('ctrl-g').sequence) {
    debugCache = !debugCache
    console.log('Toggled [debugCache]: '+(debugCache ? 'on' : 'off'))
  }
  if(key.sequence === parsekey('ctrl-c').sequence) {
    process.exit();
  }
});

/*process.on('unhandledRejection', error => {
  // Prints "unhandledRejection woops!"
  console.log('unhandledRejection', JSON.stringify(error));
});*/

function NLWAPI(apiKey, host, ssl) {
  this.https = (ssl=="false" ? false : true);
  this.host = host ? host : "neoload-api.saas.neotys.com";
  this.apiKey = apiKey;
  this.proxySpec = null;

  this.getApiKey = function() { return this.apiKey; }
  this.setApiKey = function(newApiKey) { this.apiKey = newApiKey; return this; }

  this.getWebBaseUrl = function() {
    return "http" + (this.https ? "s" : "") + "://" + this.host.split(':')[0];
  };
  this.getTestBaseUrl = function(testId) {
    return this.getWebBaseUrl() + '/#!result/' + testId
  }
  this.getOverviewUrl = function(testId) {
    return this.getTestBaseUrl(testId) + '/overview'
  }
  this.getTransactionsUrl = function(testId) {
    return this.getTestBaseUrl(testId) + '/values/transactions'
  }
  this.getRequestsUrl = function(testId) {
    return this.getTestBaseUrl(testId) + '/values/requests'
  }
  this.getCountersUrl = function(testId) {
    return this.getTestBaseUrl(testId) + '/values/counters'
  }
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
    var proms = []
    fs.readdirSync(httpCachePath).forEach(file => {
      if(file.endsWith('.json')) {
        var filepath = httpCachePath + '/' + file;
        proms.push(uncacheHttpResponse(this,filepath))
      }
    })
    var prom = Promise.all(proms)
    .then(r => {
      console.log('done uncaching: ' + this.httpResponseCache.count())
      //console.log(JSON.stringify(this.httpResponseCache.values()[0]))
    })
  }

  this.cli = null;
  this.getClient = function() {
    if(this.cli == null) {
      var nlw = this;
      var specUrl = "http"+(this.https ? "s" : "")+"://"+this.host+"/explore/swagger.yaml";
      var specPath = httpCachePath+'/_spec.yaml';
      var opts = getSwaggerOptions(nlw);
      var specOpts = addHttpAgent({ compres: true})

      if(shouldCache) {
        if(fs.existsSync(specPath)) {
          console.log('loading yaml from cache')
          opts.spec = yaml.safeLoad(fs.readFileSync(specPath, 'utf8'))
          this.cli = inflateSwagger(specUrl,opts);
        } else {
          incrementFetches('Caching API spec',specUrl)
          return retryFetch(specUrl,specOpts)
          .then(res => res.text())
          .then(yamlText => {
            fs.writeFileSync(specPath, yamlText, 'utf8');
            return yamlText;
          }).then(yamlText => {
            opts.spec = yaml.safeLoad(yamlText)
            this.cli = inflateSwagger(specUrl,opts);
            return this.cli;
          })
          .catch(err => catchFetchError('Failed to obtain API spec',err))
          .finally(r => decrementFetches('Done fetching API spec', specUrl))
        }
      } else {
        this.cli = retrySwagger(specUrl, opts);
      }
    }
    return this.cli;
  };

  function incrementFetches(context,url) {
    fetchesOpened += 1;

    hashOutstandingRequests.set(url,
      (hashOutstandingRequests.has(url) ? hashOutstandingRequests.get(url) : 0)+1
    )

    if(debugHttp)
      console.log('('+fetchesOpened+'/'+fetchesClosed+') ['+context+'] Fetching: ' + url)
    else
      process.stdout.write(".");
  }
  function catchFetchError(context,err) {
    if(debugHttp || reportHttpFinalFailures) console.error('('+fetchesOpened+'/'+fetchesClosed+') ['+context+'] Error: ' + err)
  }
  function decrementFetches(context,url) {
    fetchesClosed += 1;

    if(hashOutstandingRequests.has(url)) {
      var newCount = hashOutstandingRequests.get(url)-1;
      if(newCount > 0)
        hashOutstandingRequests.set(url, newCount)
      else
        hashOutstandingRequests.remove(url)
    }
  }
  function monitorHttpQueue() {
    if(fetchesOpened != fetchesClosed) {
      console.error('('+fetchesOpened+'/'+fetchesClosed+') Some fetches still outstanding...')
    }
    setTimeout(monitorHttpQueue,1000)
  }
  monitorHttpQueue();

  function inflateSwagger(specUrl,opts) {
    opts.url = specUrl;
    var swagger = Swagger(opts)
    /*.then(r => {
      var cli = Promise.resolve(r)
      console.log(JSON.stringify(cli,null,'\t'));
      return cli
    })*/
    return swagger;
  }

  function getSwaggerOptions(nlw) {
    return {
      userFetch: (url, opts) => {
        var o = addHttpAgent(opts)
        incrementFetches('Fetching', url)
        return retryFetch(url,o).catch(err => {
          catchFetchError('Error', err)
        }).finally(r => {
          decrementFetches('Finalizing', url)
        });

        var prom = new Promise(function(resolve,reject) { reject(new Error('Not implemented')) });
        /*console.log("--------------------------------------------")
        console.log("url: " + url + ", opts: " + JSON.stringify(o))
        console.log("--------------------------------------------")*/
        if(o.method == "GET") {
          var key = url;
          if(nlw.httpResponseCache.has(key)) {
            prom = new Promise(function(resolve,reject) {
              if(debugHttp || debugCache) console.log('Cached GET: ' + url)
              var val = nlw.httpResponseCache.get(key);
              if(val == undefined || val == null || val.ok == undefined) console.log('trapped '+key)
              var resp_opts = {
        				url: val.url,
        				status: val.statusCode,
        				statusText: val.statusText,
        				headers: val.headers
        			}
              var stm = new Stream();
              for(var k in val.body) stm[k]=val.body[k];
              var resp = new Response(stm,resp_opts)
              console.log(resp.json())
              resolve(resp);//resolve(val);
            })
            //prom = retryFetch(url, o);
          }
          else {
            incrementFetches('Fetching', url)
            prom = retryFetch(url, o).then(resp  => {
              //console.log('blah: '+JSON.stringify(resp))
              return cacheHttpResponse(nlw,  key, resp, shouldCache)
            }).catch(err => {
              catchFetchError('Error', err)
            }).finally(r => {
              decrementFetches('Finalizing', url)
            })
          }
        }
        console.log('returning promise '+url)
        return prom
          .catch(err => {
            console.log('Caught!!!'+err)
          })
          .then(r => {
            //console.log(JSON.stringify(r))
          })
      },
      requestInterceptor: (req) => {
        //console.log('['+req.url.hashCode()+'] '+req.url)
        req.headers['accountToken'] = nlw.getApiKey();
        if (this.proxySpec != null)
          req.agent = new HttpsProxyAgent(this.proxySpec);
      },
      responseInterceptor: (res) => {
        //console.log(JSON.stringify(res))
        //console.log('['+res.url.hashCode()+'] '+res.url)
      }
    }
  }

  function addHttpAgent(opts) {
    var o = opts ? opts : {};
    if (this.proxySpec != null)
      o.agent = new HttpsProxyAgent(this.proxySpec);
    else if(o.agent == undefined || o.agent == null)
      o.agent = new http.Agent({ maxSockets: http.globalAgent.maxSockets });
    return o;
  }

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
                .then(res => {
                  setTimeout(function() { resolve(res)},sleepBetweenRequests)
                })
                .catch(async err => {
                    if(n > 0) {
                        if(debugHttp) console.log('Error in retryFetch['+url+','+(retries-n)+']: '+err)
                        await delay(retryDelay)
                        wrapper(--n)
                    } else {
                      if(debugHttp) console.log('Rejecting retryFetch['+url+','+(retries-n)+']: '+err)
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
                .then(res => {
                  setTimeout(function() { resolve(res)},100)
                 })
                .catch(async err => {
                  console.log(err)
                    if(n > 0) {
                        console.log(`retrying API spec ${n}`)
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
  return Promise.all([
      new Promise(function(resolve,reject) {
        //console.log('Uncaching '+file)
        resolve(true)
      }),
      new Promise(function(resolve,reject) {
        fs.readFile(file, (err,data) => {
          if (err) reject(err)
          var o = JSON.parse(data);
          if(o != undefined && o != null && o.key && o.value) {
            nlw.httpResponseCache.set(o.key, o.value);
            //console.log('[uncached('+nlw.httpResponseCache.count()+')] ' + o.key)
          } else {
            reject("Cached file " + file + " invalid format")
          }
          resolve(data)
        })
      })
    ])
    .catch(err => {
      console.error('Uncaching error: ' + file + ' ::: ' + err)
    })
}
function cacheHttpResponse(nlw, key, oValue, persistToFile) {
  return new Promise(function(resolve,reject) {
    nlw.httpResponseCache.set(key, oValue);
    if(persistToFile) {
      // persist to file system
      var persisted = {
        key: key,
        value: oValue
      }
      var json = JSON.stringify(persisted);
      if(nlw.filetick == undefined || isNaN(parseInt(nlw.filetick))) nlw.filetick = 0;
      var fileid = nlw.filetick++ // key.hashCode()
      var path = httpCachePath + '/' + fileid + '.json';
      return fs.writeFile(path, json, (err) => {
        // throws an error, you could also catch it here
        if (err)  {
          console.log('Error caching Response: ' + err)
          reject(err)
        } else {
          console.log('[cached] ' + persisted.key)
          resolve(oValue)
        }
      });
    } else
      resolve(oValue)
  })
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

  this.monitors = function(testId) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestMonitors({testId: testId});
    });
  }
  this.monitorValues = function(testId,counterId) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestMonitorsValues({testId: testId, counterId: counterId});
    });
  }
  this.monitorPoints = function(testId,counterId) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestMonitorsPoints({testId: testId, counterId: counterId});
    });
  }
}
