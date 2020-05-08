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
  // mssql bind types (values interpolated from the mssql module)
  const inputBindTypes1 = {
    id: "${Int}",
    name: "${VarChar}",
    updated: "${DateTime}"
  };
  const rtn = {};

  //-------------------------------------------------------
  // There are two different ways to perform a transaction
  // 1. Explicit (suitable for multiple executions in 1 tx)
  // 2. Implicit (suitable for a single execution in 1 tx)

  // Using an explicit transaction:
  await explicitTransactionUpdate(manager, connName, binds1, binds2, rtn);

  // Using a prepared statement:
  await preparedStatementUpdate(manager, connName, binds1, inputBindTypes1, rtn);

  // Using a prepared statement within a transaction
  await preparedStatementTransactionUpdate(manager, connName, binds1, inputBindTypes1, rtn);

  return rtn;
};

async function explicitTransactionUpdate(manager, connName, binds1, binds2, rtn) {
  rtn.txRslts = new Array(2); // don't exceed connection pool count
  try {
    // start a transaction
    const txId = await manager.db[connName].beginTransaction({
      // illustrate override of isolation level
      // (optional, interpolated from the mssql module)
      isolationLevel: "${SERIALIZABLE}"
    });

    // Example execution in parallel (same transacion)
    // NOTE: Internally, transactions are ran in series since that is the
    // contract definition, but for API compatibility they can be ran in
    // parallel from a Manager perspective
    rtn.txRslts[0] = manager.db[connName].update.table1.rows({
      name: 'TX 1', // name is optional
      autoCommit: false,
      transactionId: txId, // ensure execution takes place within transaction
      binds: binds1
    });
    rtn.txRslts[1] = manager.db[connName].update.table2.rows({
      name: 'TX 2', // name is optional
      autoCommit: false,
      transactionId: txId, // ensure execution takes place within transaction
      binds: binds2
    });
    // could have also ran is series by awaiting when SQL function is called
    rtn.txRslts[0] = await rtn.txRslts[0];
    rtn.txRslts[1] = await rtn.txRslts[1];

    // could commit using either one of the returned results
    await rtn.txRslts[0].commit();
  } catch (err) {
    if (rtn.txRslts[0] && rtn.txRslts[0].rollback) {
      // could rollback using either one of the returned results
      await rtn.txRslts[0].rollback();
    }
    throw err;
  }
}

async function preparedStatementUpdate(manager, connName, binds, inputBindTypes, rtn) {
  rtn.psRslts = new Array(2); // don't exceed connection pool count
  try {
    for (let i = 0; i < rtn.psRslts.length; i++) {
      // update with expanded name
      binds.name += ` | From Prepared Statement iteration #${i}`;
      // Using an implicit transcation (autoCommit defaults to true):
      rtn.psRslts[i] = manager.db[connName].update.table1.rows({
        name: `PS ${i}`, // name is optional
        // flag the SQL execution as a prepared statement
        // this will cause the statement to be prepared
        // and a dedicated connection to be allocated from
        // the pool just before the first SQL executes
        prepareStatement: true,
        driverOptions: {
          // on the first prepared statement call the
          // statement will be registered and a
          // dedicated connection will be allocated
          inputBindTypes
        },
        // include the bind parameters
        binds
      });
    }
    // wait for parallel executions to complete
    for (let i = 0; i < rtn.psRslts.length; i++) {
      rtn.psRslts[i] = await rtn.psRslts[i];
    }
  } finally {
    // could call unprepare using any of the returned execution results
    if (rtn.psRslts[0] && rtn.psRslts[0].unprepare) {
      // since prepareStatement = true, we need to close the statement
      // and release the statement connection back to the pool
      await rtn.psRslts[0].unprepare();
    }
  }
}

async function preparedStatementTransactionUpdate(manager, connName, binds, inputBindTypes, rtn) {
  rtn.psTxRslts = new Array(2); // don't exceed connection pool count
  try {
    // start a transaction
    const txId = await manager.db[connName].beginTransaction();

    for (let i = 0; i < rtn.psTxRslts.length; i++) {
      // update with expanded name
      binds.name += ` | From Prepared Statement with txId "${txId}" iteration #${i}`;
      rtn.psTxRslts[i] = manager.db[connName].update.table1.rows({
        name: `TX/PS ${i}`, // name is optional
        autoCommit: false,
        transactionId: txId, // ensure execution takes place within transaction
        prepareStatement: true, // ensure a prepared statement is used
        driverOptions: {
          inputBindTypes, // required mssql bind types for prepared statements
          outputBindTypes: inputBindTypes // optional
        },
        binds
      });
    }
    // wait for parallel executions to complete
    for (let i = 0; i < rtn.psTxRslts.length; i++) {
      rtn.psTxRslts[i] = await rtn.psTxRslts[i];
    }

    // unprepare will be called when calling commit
    // (alt, could have called unprepare before commit)
    await rtn.psTxRslts[0].commit();
  } catch (err) {
    if (rtn.psTxRslts[0] && rtn.psTxRslts[0].rollback) {
      // unprepare will be called when calling rollback
      // (alt, could have called unprepare before rollback)
      await rtn.psTxRslts[0].rollback();
    }
    throw err;
  }
}