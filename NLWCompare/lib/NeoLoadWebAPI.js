const Logger = require('./shared.js'), logger = Logger.create()
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
var http = require('https');
var HttpProxyAgent = require('http-proxy-agent');
var HttpsProxyAgent = require('https-proxy-agent');

var sleepBetweenRequests = 20;
var sleepBetweenRpsResampling = 100;
var arrHttpThroughput = []
var maxConcurrentRequests = 20;
var currentRequestCount = 0;
var lastRps = 0;
var maxRps = maxConcurrentRequests;

http.globalAgent.maxSockets = maxConcurrentRequests;

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
    console_log('Toggled [debugHttp]: '+(debugHttp ? 'on' : 'off'))
    console_log(JSON.stringify({
      sleepBetweenRequests: sleepBetweenRequests,
      sleepBetweenRpsResampling: sleepBetweenRpsResampling,
      maxConcurrentRequests: maxConcurrentRequests,
      currentRequestCount: currentRequestCount,
      lastRps: lastRps,
      maxRps: maxRps
    }, null, '\t'))
    console_log(JSON.stringify(arrHttpThroughput,null,'\t'))
    console_log(JSON.stringify(
      {
        collection: 'hashOutstandingRequests',
        size: hashOutstandingRequests.size,
        top: hashOutstandingRequests.keys().slice(0,5)
      }
    ,null,'\t'))
  }
  if(key.sequence === parsekey('ctrl-g').sequence) {
    debugCache = !debugCache
    console_log('Toggled [debugCache]: '+(debugCache ? 'on' : 'off'))
  }
  if(key.sequence === parsekey('ctrl-c').sequence) {
    process.exit();
  }
});

/*process.on('unhandledRejection', error => {
  // Prints "unhandledRejection woops!"
  console_log('unhandledRejection', JSON.stringify(error));
});*/

function NLWAPI(apiKey, host, ssl) {
  this.https = (ssl=="false" ? false : true);

  if(this.https)
    http = require('https')
  else
    http = require('http')

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
    console_log('checking cache');
    var proms = []
    fs.readdirSync(httpCachePath).forEach(file => {
      if(file.endsWith('.json')) {
        var filepath = httpCachePath + '/' + file;
        proms.push(uncacheHttpResponse(this,filepath))
      }
    })
    var prom = Promise.all(proms)
    .then(r => {
      console_log('done uncaching: ' + this.httpResponseCache.count())
      //console_log(JSON.stringify(this.httpResponseCache.values()[0]))
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
          console_log('loading yaml from cache')
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
      console_log('('+fetchesOpened+'/'+fetchesClosed+') ['+context+'] Fetching: ' + url)
    else
      console_log({text: ".", after: ''});

    afterChangeFetchCount()
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

    afterChangeFetchCount()
  }

  function afterChangeFetchCount() {
    var none = (fetchesOpened - fetchesClosed) == 0;
    if(none)
      console_log('Done fetching')
  }

  function monitorHttpQueue() {
    var rate = manageHttpThroughput()
    if(fetchesOpened != fetchesClosed) {
      console_log('('+fetchesOpened+'/'+fetchesClosed+' :: '+Math.round(rate,2)+'/'+maxConcurrentRequests+'rps) Some fetches still outstanding...')
    }
    setTimeout(monitorHttpQueue,1000)
  }
  monitorHttpQueue();

  function monitorHttpThroughput() {
    lastRps = manageHttpThroughput();
    recalcHttpThroughputControls();
    setTimeout(monitorHttpThroughput,sleepBetweenRpsResampling)
  }
  monitorHttpThroughput();

  var timeProcessStarted = (new Date()).getTime();
  function getTimeSinceProcessStarted() { return (new Date()).getTime() - timeProcessStarted; }
  function manageHttpThroughput() {
    var lastClosed = (arrHttpThroughput.length > 0 ? arrHttpThroughput[arrHttpThroughput.length-1].closed : 0)

    var entry = {
      time: getTimeSinceProcessStarted(),
      closed: fetchesClosed,
      closedDelta: fetchesClosed - lastClosed
    }

    var rateNow = [{time: 0, closed: 0, closedDelta: 0}]
      .concat(arrHttpThroughput)
      .map(o => o.closedDelta)
      .reduce((total, amount, index, array) => {
        total += amount;
        if( index === array.length-1)
          return total/array.length;
        return total;
      });
    entry.rate = rateNow;
    arrHttpThroughput.push(entry);

    if(arrHttpThroughput.length >= 3)
      arrHttpThroughput.shift()

    return rateNow;
  }
  function recalcHttpThroughputControls() {
    if(lastRps >= maxRps && maxConcurrentRequests > 1)
      maxConcurrentRequests--
    else if(maxConcurrentRequests < maxRps)
      maxConcurrentRequests++
  }

  function inflateSwagger(specUrl,opts) {
    opts.url = specUrl;
    var swagger = Swagger(opts)
    /*.then(r => {
      var cli = Promise.resolve(r)
      console_log(JSON.stringify(cli,null,'\t'));
      return cli
    })*/
    return swagger;
  }

  function getSwaggerOptions(nlw) {
    return {
      userFetch: (url, opts) => {
        var o = addHttpAgent(opts)
        /*
        incrementFetches('Fetching', url)
        return retryFetch(url,o).catch(err => {
          catchFetchError('Error', err)
        }).finally(r => {
          decrementFetches('Finalizing', url)
        });
        */

        var prom = new Promise(function(resolve,reject) { reject(new Error('Not implemented')) });
        /*console_log("--------------------------------------------")
        console_log("url: " + url + ", opts: " + JSON.stringify(o))
        console_log("--------------------------------------------")*/
        if(o.method == "GET") {
          var key = url;
          if(false && nlw.httpResponseCache.has(key)) {
            prom = new Promise(function(resolve,reject) {
              if(debugHttp || debugCache) console_log('Cached GET: ' + url)
              var val = nlw.httpResponseCache.get(key);
              resolve(val)
            })
            //prom = retryFetch(url, o);
          }
          else {
            incrementFetches('Fetching', url)
            prom = retryFetch(url, o).then(resp  => {
              //console_log('blah: '+JSON.stringify(resp))
              return cacheHttpResponse(nlw,  key, resp, shouldCache)
            }).catch(err => {
              catchFetchError('Error', err)
            }).finally(r => {
              decrementFetches('Finalizing', url)
            })
          }
        }
        return prom
      },
      requestInterceptor: (req) => {
        //console_log('['+req.url.hashCode()+'] '+req.url)
        req.headers['accountToken'] = nlw.getApiKey();
        if (this.proxySpec != null)
          req.agent = new HttpsProxyAgent(this.proxySpec);
      },
      responseInterceptor: (res) => {
        //console_log(JSON.stringify(res))
        //console_log('['+res.url.hashCode()+'] '+res.url)
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
        var fProcess = function() {} // proper pre-ref
        fProcess = function() {
          recalcHttpThroughputControls() // instant recalc
          if(
            (currentRequestCount < maxConcurrentRequests)
            &&
            (lastRps < maxRps)
          ) {
            currentRequestCount++;

            const wrapper = n => {
              fetch(url, fetchOptions)
                  .then(res => {
                    setTimeout(function() { currentRequestCount--; resolve(res)}, sleepBetweenRequests)
                  })
                  .catch(async err => {
                      if(n > 0) {
                          if(debugHttp) console_log('Error in retryFetch['+url+','+(retries-n)+']: '+err)
                          await delay(retryDelay)
                          wrapper(--n)
                      } else {
                        if(debugHttp) console_log('Rejecting retryFetch['+url+','+(retries-n)+']: '+err)
                        currentRequestCount--;
                        reject(err)
                      }
                  })
                }

            wrapper(retries)
          } else {
            if(debugHttp) console_log('waiting')
            setTimeout(fProcess,sleepBetweenRequests);
          }
        }
        fProcess();
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
                    console_log(err)
                      if(n > 0) {
                          console_log(`retrying API spec ${n}`)
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
          //console_log('Uncaching '+file)
          resolve(true)
        }),
        new Promise(function(resolve,reject) {
          fs.readFile(file, (err,data) => {
            if (err) reject(err)
            try {
              var o = JSON.parse(data);
              if(o != undefined && o != null && o.key && o.value) {
                nlw.httpResponseCache.set(o.key, o.value);
                //console_log('[uncached('+nlw.httpResponseCache.count()+')] ' + o.key)
              } else {
                reject("Cached file " + file + " invalid format")
              }
              resolve(data)
            } catch(e) {
              reject(e)
            }
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
            if(debugCache) console_log('Error caching Response: ' + err)
            reject(err)
          } else {
            if(debugCache) console_log('[cached] ' + persisted.key)
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

  function handleError(err,context) {
    console.error('\n\n[Error]'+JSON.stringify(context)+'\n\n'+JSON.stringify(err)+'\n\n');
  }

  this.test = function(id) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTest({testId: id});
    }).catch(err => {
      handleError(err,{id:id})
    }).then(r => {
      return r.body;
    });
  }

  this.testStatistics = function(id) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestStatistics({testId: id});
    }).catch(err => {
      handleError(err,{id:id})
    }).then(r => {
      return r.body;
    });
  }

  this.tests = function(projectName, status, limit) {
    var projectName = (projectName!=undefined ? projectName : null);
    var status = (status==undefined || status==null || (status+"").trim().length < 1 ? null : status);
    var limit = (limit!=undefined && limit!=null && !isNaN(parseInt(limit)) ? limit : null);
    var opts = {}
    if(projectName != null) opts.project = projectName;
    if(status != null) opts.status = status;
    if(limit != null) opts.limit = limit;

    opts.pretty = true;

    return this.getClient().then(cli => {
      return cli.apis.Results.GetTests(opts);
    }).catch(err => {
      handleError(err,{})
    }).then(r => {
      return r.body;
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
    }).catch(err => {
      handleError(err,{test:test,category:category})
    });
  }

  this.values = function(element) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElementsValues({ testId: element.test.id, elementId: element.id });
    }).catch(err => {
      handleError(err,{element:element})
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
      }).catch(err => {
        handleError(err,{element:element, since:since, fields:fields})
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
    }).catch(err => {
      handleError(err,{testId:testId})
    }).then(r => {
      return r.body;
    });
  }
  this.monitorValues = function(testId,counterId) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestMonitorsValues({testId: testId, counterId: counterId});
    }).catch(err => {
      handleError(err,{testId:testId,counterId:counterId})
    });
  }
  this.monitorPoints = function(testId,counterId) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestMonitorsPoints({testId: testId, counterId: counterId});
    }).catch(err => {
      handleError(err,{testId:testId,counterId:counterId})
    });
  }
}

function console_log(opts) {
  logger.log(opts)
}
