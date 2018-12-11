module.exports = {
  id: "GlobalRules",
  create: function(options) {
    return new GlobalRules(options);
  }
};

function GlobalRules(options) {

  var lc = (mon) => mon.path.toLowerCase();

  this.getMonitorViolationRules = function() {
    return [
      {
        name: 'OS Counters > 10% variance',
        fCategoryProcessor: function(mon) { return (lc(mon).indexOf('linux') > -1 || lc(mon).indexOf('windows') > -1) ? 'OS' : null },
        isCritical: function(mon) { return osCriticals().includes(mon.meta.label) },
        isInViolation: function(mon) { return mon.meta.category == 'OS' && mon.varianceInPercentile > 0.10 }
      },
      {
        name: 'WebLogic Counters > 10% variance',
        fCategoryProcessor: function(mon) { return (lc(mon).indexOf('jvm') > -1) ? 'JMX' : null },
        isCritical: function(mon) { return wlCriticals().includes(mon.meta.label) },
        isInViolation: function(mon) { return mon.meta.category == 'WebLogic' && mon.varianceInPercentile > 0.10 }
      },
      {
        name: 'JMX Counters > 5% variance',
        fCategoryProcessor: function(mon) { return (lc(mon).indexOf('weblogic') > -1) ? 'WebLogic' : null },
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
}
