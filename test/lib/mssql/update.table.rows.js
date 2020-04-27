'use strict';

// export just to illustrate module usage
module.exports = async function runExample(manager, connName) {

  const date = new Date();

  // binds
  const binds1 = {
    id: 1, name: 'TABLE: 1, ROW: 1 (UPDATE)', updated: date
  };
  const binds2 = {
    id2: 1, name2: 'TABLE: 2, ROW: 1 (UPDATE)', updated2: date
  };
  let rtn = new Array(4), rtnIdx = 0;

  //-------------------------------------------------------
  // There are two different ways to perform a transaction
  // 1. Explicit (suitable for multiple executions in 1 tx)
  // 2. Implicit (suitable for a single execution in 1 tx)

  // Using an explicit transaction:
  try {
    // start a transaction
    const txId = await manager.db[connName].beginTransaction();

    // Example execution in parallel (same transacion)
    rtn[rtnIdx++] = manager.db[connName].update.table1.rows({
      autoCommit: false,
      transactionId: txId, // ensure execution takes place within transaction
      binds: binds1
    });
    rtn[rtnIdx++] = manager.db[connName].update.table2.rows({
      autoCommit: false,
      transactionId: txId, // ensure execution takes place within transaction
      binds: binds2
    });
    rtn[0] = await rtn[0];
    rtn[1] = await rtn[1];

    // could commit using either one of the returned results
    await rtn[0].commit();
  } catch (err) {
    if (rtn[0]) {
      // could rollbakc using either one of the returned results
      await rtn[0].rollback();
    }
    throw err;
  }

  // Example execution in series (different implicit transactions)
  // Using an implicit transcation (autoCommit defaults to true):
  rtn[rtnIdx++] = await manager.db[connName].update.table1.rows({
    binds: binds1
  });
  rtn[rtnIdx++] = await manager.db[connName].update.table2.rows({
    binds: binds2
  });

  return rtn;
};