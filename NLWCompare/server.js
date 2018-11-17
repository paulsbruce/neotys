const NLWAPI = require('./lib/NeoLoadWebAPI.js')
const argv = require("yargs").argv;
const express = require('express'),
  app = express(),
  port = argv.port || 3000,
  path = require('path'),
  bodyParser = require('body-parser')

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

console.log('NeoLoad flattener RESTful API server started on: ' + port);

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

console.log('Waiting for client connections...')

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Connection","close")
  next();
});

var hashComparisons = new HashMap()

function Comparison(baseId,candId) {
  this.baseId = baseId;
  this.candId = candId;
  this.body = null;
  this.getKey = function() { return this.baseId+this.candId; }
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
}

app.route('/api/comparison')
  .get(function(req, res) {
    var baseId = req.query.baseline;
    var candId = req.query.candidate;

    var comparison = new Comparison(baseId,candId);
    if(hashComparisons.has(comparison.getKey())) {
      comparison = hashComparisons.get(comparison.getKey())
      res.json(comparison.body);
    }
    else {
      var body = {
        baseId: baseId,
        candId: candId,
        generatedOn: (new Date()).getTime(),
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

      Promise.all([
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
        comparison.body = body;
        hashComparisons.set(comparison.getKey(),comparison)
        res.json(body);
      })
    }
  });


  app.route('/report')
    .get(function(req, res) {
      res.sendFile(path.join(__dirname + '/static/report.template.html'))
    });


  app.route('/api/shortSummary')
    .get(function(req, res) {
      promiseTestStatistics(new Aggregator(),req.query.test).then(o => {
        res.json(o)
      });
    });
  function promiseTestStatistics(aggregator,testId) {
    return nlw.test(testId).then(r => {
      var info = r.body;
      return info;
    }).then(info => {
      return nlw.testStatistics(testId).then(r => {
        var stats = r.body;
        var ext = {
          transactionsPerSecond: stats.totalTransactionCountPerSecond,
          averageResponseTime: stats.totalRequestDurationAverage,
          throughput: (stats.totalGlobalDownloadedBytesPerSecond / (1 * 1000 * 1000) * 8),
          errorCount: stats.totalGlobalCountFailure
        };
        for(var k in stats) info[k]=stats[k];
        for(var k in ext) info[k]=ext[k];
        return info;
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
          console.log('here is where we fill transaction percentiles')
        })
    })*/
    /*.then(r => {
      return Promise.all(
        agg.values().filter(v => { return v != null; })
        .map(entry => {
          return Promise.all([
            nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
              //entry.baselineValues = r;
              entry.baselineValue = r.avgDuration;
            }),
            nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
              //entry.candidateValues = r;
              entry.candidateValue = r.avgDuration;
            })
          ])
        })
      )
    })*/
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
        console.log('writing')
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
      console.log('superfluous')
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
        //console.log((agg.values().map(e => (e != undefined && e != null ? e.path : ''))).join('\r\n'))
        return Promise.all(
          aggregator.agg_requests.values().filter(v => { return v != null; })
          .map(entry => {
            return Promise.all([
              nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
                aggregator.request_values.set(baseId+entry.baselineElementId, r);
                entry.baselineFailureCount = r.failureCount;
                entry.baselineAverageDuration = r.avgDuration;
              }),
              nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
                aggregator.request_values.set(candId+entry.baselineElementId, r);
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
                req.basePercentile = calcPercentile(baseValues[0], o => o.AVG_DURATION)
                req.candPercentile = calcPercentile(candValues[0], o => o.AVG_DURATION)
                req.varianceInPercentile = (req.basePercentile != 0 ? (req.candPercentile / req.basePercentile) - 1.0 : 0);
                return req;
              });
          //tran.requests = reqs;
          tran.basePercentile = calcPercentile(baseAll, o => o.AVG_DURATION)
          tran.candPercentile = calcPercentile(candAll, o => o.AVG_DURATION)
          tran.varianceInPercentile = (tran.basePercentile != 0 ? (tran.candPercentile / tran.basePercentile) - 1.0 : 0);
          if(baseAll.length < 1)
            if(debugLogic) console.error('tran['+tran.path+'] has no values, but '+reqs.length+' requests')
        })
      })
    }
  }


  function calcPercentile(arr,fMap) {
    if(arr == undefined || arr == null || !Array.isArray(arr)) {
      console.log('bad array passed to calcPercentile: ' + JSON.stringify(arr))
      return 0;
    }
    else {
      if(arr.length < 1)
        return 0;
      else {
        var values = arr.map(o => fMap(o));
        return get_percentile(90,values)
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
        console.log('superfluous')
        return Promise.resolve();
      } else {
        var fFill = function(testId,fStow,fStashVal) {

          return new Promise(function(resolve,reject) {
              var prom = nlw.monitors(testId)
              .then(r => {
                var rs = r.body;
                stowMonitors(agg,rs,fStow)
                return Promise.all(
                    rs.map(function(el) {
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
                mon.basePercentile = calcPercentile(basePoints, o => o.AVG)
                mon.candPercentile = calcPercentile(candPoints, o => o.AVG)
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
    var lc = mon.path.toLowerCase();
    var arr = mon.path.split('|')
    var heir = arr
    if(lc.indexOf('linux') > -1 || lc.indexOf('windows') > -1)
      cat = 'OS'
    else if(lc.indexOf('jvm') > -1)
      cat = 'JMX'
    else if(lc.indexOf('weblogic') > -1) {
      cat = 'WebLogic';
      //preecomad01.preprod.yourdomain.com_WebLogic Counters/weblogic/youfapps36/JDBC/DataSource/YOURSVCS/ActiveConnectionsHighCount
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

  function getMonitorViolationRules() {
    return [
      {
        name: 'OS Counters >10% variance',
        isCritical: function(mon) { return osCriticals().includes(mon.meta.label) },
        isInViolation: function(mon) { return mon.meta.category == 'OS' && mon.varianceInPercentile > 0.10 }
      },
      {
        name: 'WebLogic Counters >10% variance',
        isCritical: function(mon) { return wlCriticals().includes(mon.meta.label) },
        isInViolation: function(mon) { return mon.meta.category == 'WebLogic' && mon.varianceInPercentile > 0.10 }
      },
      {
        name: 'JMX Counters >10% variance',
        isCritical: function(mon) { return jmxCriticals().includes(mon.meta.label) },
        isInViolation: function(mon) { return mon.meta.category == 'JMX' && mon.varianceInPercentile > 0.05 }
      }
    ]
  }

  function osCriticals() { return [
    '% User Memory',
    'Swap Used',
    'CPU User',
    'Process Runnable'
  ]}
  function wlCriticals() { return [
    'ActiveConnectionsHighCount',
    'ActiveConnectionsAverageCount',
    'CurrCapacity',
    'FailedReserveRequestCount',
    'HighestNumUnavailable',
    'LeakedConnectionCount',
    'PrepStmtCacheAccessCount',
    'ReserveRequestCount',
    'WaitingForConnectionCurrentCount',
    'WaitingForConnectionHighCount',
    'ConnectionDelayTime',
    'ConnectionsTotalCount',
    'NumUnavailable',
    'HoggingThreadCount',
    'HoggingThreadCount',
    'StruckThreadCount',
  ]}
  function jmxCriticals() { return ['HeapFreeCurrent'] }

  function applyViolationCalcs(aggregator) {
    getMonitorViolationRules().map(rule => {
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
































app.listen(port);
