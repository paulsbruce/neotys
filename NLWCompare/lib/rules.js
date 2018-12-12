module.exports = {
  id: "GlobalRules",
  create: function(options) {
    return new GlobalRules(options);
  }
};

function GlobalRules(options) { // a container for custom rules

  var lc = (mon) => mon.path.toLowerCase(); // a helper function to lowercase monitor path

  /*
    Rule Definition:
      - name: the name of the rule that will be displayed/grouped on the report
      - fCategoryProcessor: a pre-processor to derive generic category often useful in below determination functions
      - isCritical: determines if a given monitor might be considered critical (organoization-specific)
      - isInViolation: determines if a given monitor is in fact outside the bounds of acceptable (organoization-specific)
  */
  // DO NOT CHANGE // this is what the main server.js will call to obtain a list of custom rules
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

  // (organization-specific) helper functions to refactor lists of known monitor names out of above rules definitions
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
  function jmxCriticals() { return [
    'HeapFreeCurrent'
  ] }
}
