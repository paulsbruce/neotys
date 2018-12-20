const Logger = require('./lib/shared.js'), logger = Logger.create()
const NLWAPI = require('./lib/NeoLoadWebAPI.js')
const argv = require("yargs").argv;
const express = require('express'),
  app = express(),
  port = argv.port || 3000,
  path = require('path'),
  bodyParser = require('body-parser')
const fs = require('fs');

const GlobalRules = require('./lib/rules.js'), globalRules = GlobalRules.create()
var monitorViolationRules = globalRules.getMonitorViolationRules();
/*
  // Setup View Engine
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs'); //specifies the engine we want to use
  app.engine('html', require('ejs').renderFile); //renders files with html extension

  // Set Static Folder
  app.use('/node_modules', express.static(__dirname + '/node_modules'));
  app.use('/styles', express.static(__dirname + '/styles'));
  app.use('/client', express.static(__dirname + '/client'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  app.use('/', index); //sets our home page route
  app.use('/compare', index); //sets our home page route
*/

app.use('/static', express.static(__dirname + '/static'));

const json2csv = require('json2csv');
const HashMap = require('hashmap');

console_log('NeoLoad flattener RESTful API server started on: ' + port);

//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());

var nlwapikey = argv.apikey || process.env.npm_config_apikey || process.env.NLWAPIKEY;
var nlwapihost = argv.host || process.env.npm_config_host || process.env.NLWAPIHOST;
var nlwapissl = argv.ssl || process.env.npm_config_ssl || process.env.NLWAPISSL;

var proxy = argv.proxy;
var debugLogic = false;

if(!nlwapikey) { throw new Error("You must define your NeoLoad Web API key, either as a system environment variable called 'NLWAPIKEY' or as the 'apikey' argument."); }

var nlw = NLWAPI.create(nlwapikey, nlwapihost, nlwapissl);
if(proxy) nlw.proxy(proxy);

console_log('Waiting for client connections...')

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Connection","close")
  next();
});

var hashComparisons = new HashMap()
const DEFAULT_PERCENTILE = 90;

function Comparison(baseId,candId) {
  this.baseId = baseId;
  this.candId = candId;
  this.body = null;
  this.getKey = function() { return this.baseId+this.candId+this.aggregator.percentile; }
  this.aggregator = new Aggregator()
}
function Aggregator() {
  this.agg_trans = new HashMap();
  this.agg_requests = new HashMap();
  this.request_values = new HashMap();
  this.request_points = new HashMap();
  this.agg_monitors = new HashMap();
  this.monitor_values = new HashMap();
  this.monitor_points = new HashMap();
  this.percentile = DEFAULT_PERCENTILE;
}

app.route('/api/comparison')
  .get(function(req, res) {
    var ctx = getContext(req)

    promiseTheBody(ctx)
    .then(body => {
      res.json(body);
    })
  });

  function getContext(req) {
    var baseId = req.query.baseline;
    var candId = req.query.candidate;

    var comparison = new Comparison(baseId,candId);
    var perc = (req.query.percentile != undefined && req.query.percentile != null && !isNaN(parseInt(req.query.percentile))) ? parseInt(req.query.percentile) : DEFAULT_PERCENTILE;
    comparison.aggregator.percentile = (perc >= 0 && perc <= 100 ? perc : DEFAULT_PERCENTILE);

    return {
      baseId: baseId,
      candId: candId,
      comparison: comparison
    }
  }
  function promiseTheBody(ctx) {
    var baseId = ctx.baseId;
    var candId = ctx.candId;
    var comparison = ctx.comparison;

    if(hashComparisons.has(ctx.comparison.getKey())) {
      return new Promise(function(resolve,reject) {
        ctx.comparison = hashComparisons.get(ctx.comparison.getKey())
        resolve(ctx.comparison.body);
      });
    }
    else {

      var body = {
        baseId: baseId,
        candId: candId,
        generatedOn: (new Date()).getTime(),
        haltablesCount: 0,
        links: {
          baseline: {
            overview: nlw.getOverviewUrl(baseId),
            counters: nlw.getCountersUrl(baseId),
            transactions: nlw.getTransactionsUrl(baseId),
            requests: nlw.getRequestsUrl(baseId)
          },
          candidate: {
            overview: nlw.getOverviewUrl(candId),
            counters: nlw.getCountersUrl(candId),
            transactions: nlw.getTransactionsUrl(candId),
            requests: nlw.getRequestsUrl(candId)
          }
        },
        baselineSummary: {},
        candidateSummary: {},
        topTransactions: {},
        topRequests: {},
        errorsByRequest: {},
        violations: [],
        transactionVariances: {},
        monitors: {}
        /*,
        requests: {}
        */
      };

      return Promise.all([
        promiseTestStatistics(comparison.aggregator,baseId).then(o => {
          body.baselineSummary = o
        }),
        promiseTestStatistics(comparison.aggregator,candId).then(o => {
          body.candidateSummary = o
        }),
        promiseMonitors(comparison.aggregator,baseId,candId).then(o => {
          body.monitors = o
        }),
        promiseViolations(comparison.aggregator,baseId,candId).then(o => {
          body.violations = o;
        }),
        promiseErrorsByRequest(comparison.aggregator,baseId,candId).then(o => {
          body.errorsByRequest = o
        }),
        promiseTransactionVariances(comparison.aggregator,baseId,candId).then(o => {
          body.transactionVariances = o
        }),
        promiseTopRequests(comparison.aggregator,baseId,candId).then(o => {
          body.topRequests = o
        }),
        ,
        promiseRequestDetails(comparison.aggregator,baseId,candId).then(o => {
          body.requests = o
        })

      ]).then(r => {
        // greedy grab all transaction data to calculate percentiles before summarizing
        return promiseTopTransactions(comparison.aggregator,baseId,candId).then(o => {
          body.topTransactions = o
        })
      })
      .then(r => {
        var data = body;

        data.haltablesCount = (data.violations.length > 0 ?
          data.violations
            .map(v => v.monitors)
            .reduce(function(arr,sub) { return arr.concat(sub) })
            .map(mon => 1)
            .reduce(function(sum,num) { return sum+num })
            : 0)
            
        body = data
      })
      .then(r => {
        comparison.body = body;
        hashComparisons.set(comparison.getKey(),comparison)
        return body
      })
    }
  }

  app.route('/report')
    .get(function(req, res) {
      res.sendFile(path.join(__dirname + '/static/report.template.html'))
    });

  app.route('/api/listProjects')
    .get(function(req, res) {
      nlw.tests(undefined,undefined,10000)
        .then(tests => {
          return tests
            .group('project')
            .keys()
            .sortBy((a,b) => lcomp(a,b))
        })
        .then(names => {
          res.json(names);
        })
    });
  app.route('/api/listScenarios')
    .get(function(req, res) {
      var project = req.query.project;
      nlw.tests(project,undefined,10000)
        .then(tests => {
          return tests
            .filter(test => lcomp(test.project,project)==0)
            .group('scenario')
            .keys()
            .sortBy((a,b) => lcomp(a,b))
        })
        .then(names => {
          res.json(names);
        })
    });
  app.route('/api/listTests')
    .get(function(req, res) {
      promiseTestList(req,res)
        .then(tests => {
          res.json(tests);
        })
    });
  app.route('/api/getLatestTest')
    .get(function(req, res) {
      if(!requiredParam(req,res,"project")) return;
      if(!requiredParam(req,res,"scenario")) return;
      var status = orNull(req.query.status);
      var qualityStatus = orNull(req.query.qualityStatus);

      promiseTestList(req,res)
        .then(tests => {
          return tests
            .filter(test => (status==null || test.status==status))
            .filter(test => (qualityStatus==null || test.qualityStatus==qualityStatus))
        })
        .then(tests => {
          if(tests.length > 0) {
            res.set('Content-Type', 'text/plain');
            res.json(tests.slice(0,1))
            res.status(200).end();
          } else {
            res.status(404).end();
          }
        })
    });

    function orNull(val) { return (val!=undefined && val != null) ? val : null; }

    function requiredParam(req,res,paramName) {
      var val = req.query[paramName];
      console_log(paramName+": ["+val+"]")
      var provided = (val!=undefined && val!=null && (val+"").trim().length>0);
      if(!provided)
      {
        res.set('Content-Type', 'text/plain');
        res.send(Buffer.from("Missing required query parameter '"+paramName+"'."));
        res.status(406).end();
      }
      return provided;
    }
    function promiseTestList(req,res) {
      var project = req.query.project;
      var scenario = req.query.scenario;
      var status = orNull(req.query.status);
      return nlw.tests(project,status,10000)
        .then(tests => {
          return tests
            .filter(test => lcomp(test.project,project)==0 && lcomp(test.scenario,scenario)==0)
            .sortBy((a,b) => (new Date(b.startDate) - new Date(a.startDate)))
            .flip()
        })
    }
    function lcomp(a,b) {
      if(a == null && b == null) return 0;
      if(a == null) return -1;
      if(b == null) return 1;
      return (a+"").lctrim().localeCompare((b+"").lctrim())
    }
    String.prototype.lctrim = function() {
      return (this == null ? null : this.trim().toLowerCase())
    };
    Array.prototype.flip = function() {
      var arr = this.clone()
      arr.reverse()
      return arr;
    };
    Array.prototype.clone = function() {
    	return this.slice(0);
    };
    Array.prototype.sortBy = function(comparer) {
      var arr = this.clone()
      arr.sort(comparer)
      return arr;
    }
    Array.prototype.group = function(groupProp) {
      const map = new HashMap();
      var keyGetter = (itm) => itm[groupProp]
      this.forEach((item) => {
          const key = keyGetter(item);
          if (!map.has(key))
            map.set(key, [item]);
          else
            map.get(key).push(item);
      });
      return map;
    };

  app.route('/bundle')
    .get(function(req, res) {
      var ctx = getContext(req)
      var temp = fs.readFileSync(path.join(__dirname + '/static/report.template.html'), 'utf8')
      return promiseTheBody(ctx)
      .then(body => {
        return temp.replace('>[[json-dump]]<','>'+JSON.stringify(body)+'<')
      })
      .then(final => {
        res.set('Content-Type', 'text/html');
        res.send(Buffer.from(final));
        res.status(200).end();
      })
    });


  app.route('/api/shortSummary')
    .get(function(req, res) {
      promiseTestStatistics(new Aggregator(),req.query.test).then(o => {
        res.json(o)
      });
    });
  function promiseTestStatistics(aggregator,testId) {
    return nlw.test(testId)
      .then(test => {
        return nlw.testStatistics(testId).then(stats => {
          var ext = {
            transactionsPerSecond: stats.totalTransactionCountPerSecond,
            averageResponseTime: stats.totalRequestDurationAverage,
            throughput: (stats.totalGlobalDownloadedBytesPerSecond / (1 * 1000 * 1000) * 8),
            errorCount: stats.totalGlobalCountFailure
          };
          for(var k in stats) test[k]=stats[k];
          for(var k in ext) test[k]=ext[k];
          return test;
        })
    })
  }


  app.route('/api/topTransactions')
    .get(function(req, res) {
      var baseId = req.query.baseline;
      var candId = req.query.candidate;
      promiseTopTransactions(new Aggregator(), baseId,candId).then(o => {
        res.json(o)
      });
    });
  function promiseTopTransactions(aggregator,baseId,candId) {
    return fillTransactions(aggregator,baseId,candId)
    .then(r => {
      return aggregator.agg_trans.values().filter(v => { return v != null; })
                .filter(v => { return v != null && v.varianceInPercentile > 0; })
                .sort(function(a,b) { return b.varianceInPercentile - a.varianceInPercentile})
                .slice(0,5)
    })
  }

  function promiseTransactionVariances(aggregator,baseId,candId) {
    return fillTransactions(aggregator,baseId,candId)
    .then(r => {
      return aggregator.agg_trans.values().filter(v => { return v != null; })
                .sort(function(a,b) { return b.varianceInPercentile - a.varianceInPercentile})
    })
  }

  function fillTransactions(aggregator,baseId,candId) {
    return Promise.all([

      nlw.elements({ id: baseId },'TRANSACTION').then(rs => {
        stowTransactions(aggregator.agg_trans,rs,function(el,tran) {
          tran.baselineTestId = baseId;
          tran.baselineElementId = el.id;
        })
      }),

      nlw.elements({ id: candId },'TRANSACTION').then(rs => {
        stowTransactions(aggregator.agg_trans,rs,function(el,tran) {
          tran.candidateTestId = candId;
          tran.candidateElementId = el.id;
        })
      })

    ])/*.then(r => {
      return getOrFillRequests(baseId,candId)
        .then(r => {
          console_log('here is where we fill transaction percentiles')
        })
    })*/
    .then(r => {
      return Promise.all(
        aggregator.agg_trans.values().filter(v => { return v != null; })
        .map(entry => {
          return Promise.all([
            nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
              //entry.baselineValues = r;
              entry.baselineCount = r.count;
            }),
            nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
              //entry.candidateValues = r;
              entry.candidateCount = r.count;
            })
          ])
        })
      )
    })
  }

  function stowTransactions(agg,rs,funcSetValues) {
    var results = rs.filter(r => { return r.id != 'all-transactions' });
    for(var i=0; i<results.length; i++) {
      var el = results[i];
      var key = el.path.join('|');
      var tran;
      if(agg.has(key))
        tran = agg.get(key);
      else {
        tran = {
          path: key,
          transactionName: el.name
        }
      }
      funcSetValues(el,tran);
      agg.set(key,tran);
    }
  }



  function promiseTopRequests(aggregator,baseId,candId) {
    var prom = getOrFillRequests(aggregator,baseId,candId);
    return prom
    .then(r => {
      return aggregator.agg_requests.values()
              .filter(v => { return v != null && v.varianceInPercentile > 0; })
              .sort(function(a,b) {
                return b.varianceInPercentile - a.varianceInPercentile
               })
              .slice(0,5)
    })
  }
  function promiseRequestDetails(aggregator,baseId,candId) {
    var prom = getOrFillRequests(aggregator,baseId,candId);
    return prom
    .then(r => {
      return aggregator.agg_requests.values()
              .filter(v => { return v != null; })
              .sort(function(a,b) {
                return b.varianceInPercentile - a.varianceInPercentile || a.path.localeCompare(b.path);
               })
    })
  }


  app.route('/api/errorsByRequest')
    .get(function(req, res) {
      var baseId = req.query.baseline;
      var candId = req.query.candidate;
      promiseErrorsByRequest(new Aggregator(),baseId,candId).then(o => {
        console_log('writing')
        res.json(o)
      });
    });
  function promiseErrorsByRequest(aggregator,baseId,candId) {
    var prom = getOrFillRequests(aggregator,baseId,candId);
    return prom
    .then(r => {
      return aggregator.agg_requests.values()
              .filter(v => { return v != null && v.varianceInFailureCount > 0; })
              .sort(function(a,b) { return b.varianceInFailureCount - a.varianceInFailureCount })
              .slice(0,5)
    })
  }

  function getOrFillRequests(aggregator,baseId,candId) {
    var agg = aggregator.agg_requests;
    if(agg.count() > 0) {
      console_log('superfluous')
      return Promise.resolve();
    } else {
      return Promise.all([

        getRelevantRequestElements(baseId).then(rs => {
          stowRequests(agg,rs,function(el,req) {
            req.baselineTestId = baseId;
            req.baselineElementId = el.id;
          })
        }),

        getRelevantRequestElements(candId).then(rs => {
          stowRequests(agg,rs,function(el,req) {
            req.candidateTestId = candId;
            req.candidateElementId = el.id;
          })
        })

      ]).then(r => {
        //console_log((agg.values().map(e => (e != undefined && e != null ? e.path : ''))).join('\r\n'))
        return Promise.all(
          aggregator.agg_requests.values().filter(v => { return v != null; })
          .map(entry => {
            return Promise.all([
              nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
                aggregator.request_values.set(baseId+entry.baselineElementId, r);
                entry.baselineCount = r.count;
                entry.baselineFailureCount = r.failureCount;
                entry.baselineAverageDuration = r.avgDuration;
              }),
              nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
                aggregator.request_values.set(candId+entry.baselineElementId, r);
                entry.candidateCount = r.count;
                entry.candidateFailureCount = r.failureCount;
                entry.candidateAverageDuration = r.avgDuration;
              }),
              nlw.points({ test: { id: baseId }, id: entry.baselineElementId },0,'AVG_DURATION').then(r => {
                aggregator.request_points.set(baseId+entry.baselineElementId, r);
                //entry.baselineValue = r.avgDuration;
              }),
              nlw.points({ test: { id: candId }, id: entry.candidateElementId },0,'AVG_DURATION').then(r => {
                aggregator.request_points.set(candId+entry.candidateElementId, r);
                //entry.candidateValue = r.avgDuration;
              })
            ])
          })
        )
      }).then(r => {
        aggregator.agg_requests.values().filter(v => { return v != null; })
        .map(entry => {
          entry.varianceInFailureCount = (entry.baselineFailureCount != 0 ? (entry.candidateFailureCount / entry.baselineFailureCount) - 1.0 : 0);
          entry.varianceInAverageDuration = (entry.baselineAverageDuration != 0 ? (entry.candidateAverageDuration / entry.baselineAverageDuration) - 1.0 : 0);
        })
      }).then(r => {
        aggregator.agg_trans.values().filter(v => { return v != null; })
        .map(tran => {
          var baseAll = [];
          var candAll = [];
          var reqs = aggregator.agg_requests.values().filter(v => { return v != null; })
              .filter(req => (
                  (req.path.indexOf(tran.path) > -1)
                  && (
                    true ||
                    (req.baselineTestId==tran.baselineTestId)
                    ||
                    (req.candidateTestId==tran.candidateTestId)
                  )
                )
              ).map(req => {
                var keys = aggregator.request_points.keys();
                var baseValues = keys.filter(v => { return v != null; })
                      .filter(key => (
                        (key == (req.baselineTestId+req.baselineElementId))
                      ))
                      .map(key => aggregator.request_points.get(key))
                var candValues = keys.filter(v => { return v != null; })
                      .filter(key => (
                        (key == (req.candidateTestId+req.candidateElementId))
                      ))
                      .map(key => aggregator.request_points.get(key))
                //req.baseValues = baseValues;
                if(baseValues.length != 1) console.error('baseValues is not a 1-sized array!!!')
                if(candValues.length != 1) console.error('candValues is not a 1-sized array!!!')
                baseAll = baseAll.concat(baseValues[0])
                candAll = candAll.concat(candValues[0])
                req.basePercentile = calcPercentile(aggregator.percentile,baseValues[0], o => o.AVG_DURATION)
                req.candPercentile = calcPercentile(aggregator.percentile,candValues[0], o => o.AVG_DURATION)
                req.varianceInPercentile = calcVariance(req.basePercentile,req.candPercentile)
                return req;
              });
          //tran.requests = reqs;
          tran.basePercentile = calcPercentile(aggregator.percentile,baseAll, o => o.AVG_DURATION)
          tran.candPercentile = calcPercentile(aggregator.percentile,candAll, o => o.AVG_DURATION)
          tran.varianceInPercentile = calcVariance(tran.basePercentile,tran.candPercentile)
          if(baseAll.length < 1)
            if(debugLogic) console.error('tran['+tran.path+'] has no values, but '+reqs.length+' requests')
        })
      })
    }
  }

  function calcVariance(baseValue,candValue) {
    //var flip = baseValue > candValue
    //var diff = parseFloat(flip ? candValue : baseValue) - parseFloat(flip ? baseValue : candValue)
    //var delta = diff / parseFloat(flip ? candValue : baseValue)
    var diff = parseFloat(candValue) - parseFloat(baseValue)
    var delta = diff / parseFloat(
      Math.min(
        (candValue<0?-1:1) * Math.abs(candValue),
        (baseValue<0?-1:1) * Math.abs(baseValue)
      )
    )
    return delta
  }

  function calcPercentile(percentile,arr,fMap) {
    if(arr == undefined || arr == null || !Array.isArray(arr)) {
      console_log('bad array passed to calcPercentile: ' + JSON.stringify(arr))
      return 0;
    }
    else {
      if(arr.length < 1)
        return 0;
      else {
        var values = arr.map(o => fMap(o));
        return get_percentile(percentile,values)
      }
    }
  }

  function get_percentile($percentile, $array) {
      $array.sort()
      $index = ($percentile/100) * $array.length;
      if (Math.floor($index) == $index) {
           $result = ($array[$index-1] + $array[$index])/2;
      }
      else {
          $result = $array[Math.floor($index)];
      }
      return $result;
  }

  function getRelevantRequestElements(testId) {
    return nlw.elements({ id: testId },'REQUEST')
        .then(els => {
          return els.filter(el => {
            return (el.path && Array.isArray(el.path) && isStaticFileExtension(el.path[el.path.length-1]) ? false : true);
          })
        })
  }
  function isStaticFileExtension(namePart) {
    if(namePart && namePart.length > 0) {
      var parts = namePart.split('.');
      var last = parts[parts.length-1].toLowerCase();
      switch(last) {
        case "css":
        case "js":
        case "woff":
        case "jpg":
        case "jpeg":
        case "gif":
        case "png":
        case "ico":
        case "jar":
        case "swf":
        case "svg":
          return true;
      }
    }
    return false;
  }

  function stowRequests(agg,rs,funcSetValues) {
    var results = rs.filter(r => { return r.id != 'all-requests' });
    for(var i=0; i<results.length; i++) {
      var el = results[i];
      var key = el.path.join('|');
      var req;
      if(agg.has(key))
        req = agg.get(key);
      else {
        req = {
          path: key,
          transactionName: el.name
        }
      }
      funcSetValues(el,req);
      agg.set(key,req);
    }
  }

  function getOrFillMonitors(aggregator,baseId,candId) {
    var agg = aggregator.agg_monitors;
    var fInner = function() {
      if(agg.count() > 0) {
        console_log('superfluous')
        return Promise.resolve();
      } else {
        var fFill = function(testId,fStow,fStashVal) {

          return new Promise(function(resolve,reject) {
              var prom = nlw.monitors(testId)
              .then(mons => {
                stowMonitors(agg,mons,fStow)
                return Promise.all(
                    mons.map(function(el) {
                      var key = el.path.join('|');
                      var mon = agg.get(key);
                      return Promise.all([
                        /*nlw.monitorValues(testId, el.id)
                        .then(p => {
                          var vals = p.body;
                          for(var k in vals) fStashVal(mon,vals,k);
                        }),*/
                        nlw.monitorPoints(testId, el.id)
                        .then(p => {
                          var points = p.body; // array of { AVG: 0 }
                          aggregator.monitor_points.set(testId+el.id, points);
                        })
                      ])
                    })
                  )
              }).then(r => {
                resolve(r)
              });
              return prom
          })
        }
        return Promise.all([
            fFill(baseId,function(el,mon) {
              mon.baselineTestId = baseId;
              mon.baselineMonitorId = el.id;
              mon.baselineValues = {}
            },function(mon,vals,k) {
              mon.baselineValues[k]=vals[k]
            }),
            fFill(candId,function(el,mon) {
              mon.candidateTestId = candId;
              mon.candidateMonitorId = el.id;
              mon.candidateValues = {}
            },function(mon,vals,k) {
              mon.candidateValues[k]=vals[k]
            })
          ])
      }
    }
    return fInner()
        .then(p => {
            return aggregator.agg_monitors.values()
              .filter(v => { return v != null; })
              .map(mon => {
                var basePoints = aggregator.monitor_points.get(mon.baselineTestId+mon.baselineMonitorId)
                var candPoints = aggregator.monitor_points.get(mon.candidateTestId+mon.candidateMonitorId)
                mon.basePercentile = calcPercentile(aggregator.percentile,basePoints, o => o.AVG)
                mon.candPercentile = calcPercentile(aggregator.percentile,candPoints, o => o.AVG)
                mon.varianceInPercentile = (mon.basePercentile != 0 ? (mon.candPercentile / mon.basePercentile) - 1.0 : 0);
                mon.meta = deriveMonitorMeta(mon)
              })
        })
  }

  function promiseMonitors(aggregator,baseId,candId) {
    var prom = getOrFillMonitors(aggregator,baseId,candId);
    return prom.then(r => {
      applyViolationCalcs(aggregator)
      return aggregator.agg_monitors.values()
              .filter(v => { return v != null; })
              .sort(function(a,b) { return a.path.localeCompare(b.path); })
    })
  }

  function deriveMonitorMeta(mon) {
    var cat = 'Other'
    var arr = mon.path.split('|')
    var heir = arr

    for(var i=0; i<monitorViolationRules.length; i++) {
      var rule = monitorViolationRules[i]
      var thisCat = (rule.fCategoryProcessor != undefined && rule.fCategoryProcessor != null)
        ? (typeof rule.fCategoryProcessor == 'function' ? rule.fCategoryProcessor(mon) : rule.fCategoryProcessor)
        : null;
      if(thisCat != null) {
        cat = thisCat;
        break;
      }
    }

    var first = arr[0].split('_');
    heir = [
      first[0], //Host
    ]
    if(first.length > 1)
      heir = first;
    heir = heir.concat(arr.slice(heir.length,arr.length))

    var label = arr[arr.length-1]
    var ret = {
      category: cat,
      label: label,
      heirarchy: heir
    };
    return ret;
  }

  function applyViolationCalcs(aggregator) {
    if(!(aggregator.violationsApplied != undefined && aggregator.violationsApplied != null && aggregator.violationsApplied==true))
    {
      aggregator.violationsApplied = true

      monitorViolationRules.map(rule => {
        aggregator.agg_monitors.values()
            .filter(v => { return v != null; })
            .filter(v => { return rule.isInViolation(v); })
            .forEach(mon => {
              if(mon.violations == null || mon.violations == null) mon.violations = []
              mon.violations.push({
                rule: rule.name,
                critical: rule.isCritical(mon)
              })
            })
      })
    }
  }
  function promiseViolations(aggregator,baseId,candId) {
    var prom = getOrFillMonitors(aggregator,baseId,candId);
    var doc = []
    return prom
    .then(r => {
      applyViolationCalcs(aggregator)
      aggregator.agg_monitors.values().filter(v => { return v != null; })
          .filter(mon => { return mon.violations && Array.isArray(mon.violations) })
          .sort(function(a,b) {
            var compareCat = (a.meta.category+"").localeCompare(b.meta.category)
            var compareHeirarchy = compareArrays(a.meta.heirarchy,b.meta.heirarchy,function(a,b) { return a.localeCompare(b) })
            var compareLabel = (a.meta.label+"").localeCompare(b.meta.label)
            return compareCat || compareLabel || compareHeirarchy
          })
          .forEach(mon => {
            var typeNode = doc.filter(d => d.violationType == mon.meta.category);
            if(typeNode.length < 1) {
              typeNode = { violationType: mon.meta.category }
              doc.push(typeNode)
            } else
              typeNode = typeNode[0]

            if(typeNode.monitors == undefined || typeNode.monitors == null)
              typeNode.monitors = []
            typeNode.monitors.push(mon)
          })
      return doc;
    })
  }

  function compareArrays(arr1, arr2, fCompareItems) {
    var oneValid = (arr1 != undefined && arr1 != null && Array.isArray(arr1));
    var twoValid = (arr2 != undefined && arr2 != null && Array.isArray(arr2));
    if(oneValid && !twoValid) return -1;
    if(!oneValid && twoValid) return 1;
    if(oneValid && twoValid)
      for(var i=0; i<Math.max(arr1.length,arr2.length); i++) {
        var one = i<(arr1.length-1) ? arr1[i] : undefined;
        var two = i<(arr2.length-1) ? arr2[i] : undefined;
        if(typeof one == undefined) return 1
        if(typeof two == undefined) return -1
        if(one == null && two != null) return 1
        if(one != null && two == null) return -1
        var res = fCompareItems(one,two)
        if(res != 0) return res;
      }
    return 0;
  }

  function stowMonitors(agg,rs,funcSetValues) {
    var results = rs;
    for(var i=0; i<results.length; i++) {
      var el = results[i];
      var key = el.path.join('|');
      var mon;
      if(agg.has(key))
        mon = agg.get(key);
      else {
        mon = {
          path: key,
          monitorName: el.name
        }
      }
      funcSetValues(el,mon);
      agg.set(key,mon);
    }
  }




  function console_log(opts) {
    logger.log(opts)
  }
























app.listen(port);
