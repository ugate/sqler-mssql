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
    const txId = await manager.db[connName].beginTransaction({
      // override isolation level
      // (optional, see mssql module for available options)
      isolationLevel: "${SERIALIZABLE}"
    });

    // Example execution in parallel (same transacion)
    // NOTE: Internally, transactions are ran in series since that is the
    // contract definition, but for API compatibility they can be ran in
    // parallel from a Manager perspective
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
    // could have also ran is series by awaiting when SQL function is called
    rtn[0] = await rtn[0];
    rtn[1] = await rtn[1];

    // could commit using either one of the returned results
    await rtn[0].commit();
  } catch (err) {
    if (rtn[0]) {
      // could rollback using either one of the returned results
      await rtn[0].rollback();
    }
    throw err;
  }

  // Example execution of prepared statements (in parallel)
  // Using an implicit transcation (autoCommit defaults to true):
  rtn.psRslts = new Array(2); // don't exceed connection pool count
  const bindTypes = {
    id: "${Int}",
    name: "${VarChar}",
    updated: "${DateTime}"
  };
  try {
    for (let i = 0; i < rtn.psRslts.length; i++) {
      binds1.name += ` From Prepared Statement iteration #${i}`;
      rtn.psRslts[i] = manager.db[connName].update.table1.rows({
        // flag the SQL execution as a prepared statement
        // this will cause the statement to be prepared
        // and a dedicated connection to be allocated from
        // the pool just before the first SQL executes
        prepareStatement: true,
        driverOptions: {
          // really only need the bind types on the first
          // prepared statement call since that is when
          // the statement is prepared
          bindTypes
        },
        binds: binds1
      });
    }
    // wait for parallel executions to complete
    for (let i = 0; i < rtn.psRslts.length; i++) {
      rtn.psRslts[i] = await rtn.psRslts[i];
    }
  } finally {
    // could call unprepare using any of the returned execution results
    if (rtn.psRslts[0]) {
      // since prepareStatement = true, we need to close the statement
      // and release the statement connection back to the pool
      await rtn.psRslts[0].unprepare();
    }
  }

  return rtn;
};