SELECT TST.ID AS "id", TST.NAME AS "name", NULL AS "report",
TST.CREATED_AT AS "created", TST.UPDATED_AT AS "updated"
FROM sqlermssql.TEST TST
WHERE UPPER(TST.NAME) LIKE CONCAT(CONCAT('%', UPPER(:name)), '%') 
UNION
SELECT TST2.ID AS "id", TST2.NAME AS "name", /*CONVERT(varchar(max), TST2.REPORT, 2)*/TST2.REPORT AS "report",
TST2.CREATED_AT AS "created", TST2.UPDATED_AT AS "updated"
FROM sqlermssql.TEST2 TST2
WHERE UPPER(TST2.NAME) LIKE CONCAT(CONCAT('%', UPPER(:name)), '%')