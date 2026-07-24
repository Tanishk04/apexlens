/**
 * A realistic multi-feature debug log used for local development / preview when
 * the app tab is opened without a real logId+domain. Covers a trigger, handler
 * methods, a SOQL-in-loop, DML, a flow, debug output, an exception, and a
 * cumulative governor-limit block.
 *
 * It also deliberately includes the shapes that used to break the Apex Debug tab,
 * so a regression is visible the moment you open the demo:
 *  - a very long single-line debug payload (wrapped rows used to overlap the
 *    rows beneath them — issue #1)
 *  - a debug statement split across several untimestamped continuation lines
 *    (everything after line 1 used to be dropped)
 *  - a debug message containing pipes (the first segment used to be eaten)
 *  - LIMIT_USAGE / STATIC_VARIABLE_LIST profiling noise, which used to render as
 *    GENERIC rows and pollute neighbouring row text
 */
export const SAMPLE_LOG = `61.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DB,INFO;VALIDATION,INFO;WORKFLOW,INFO
14:22:33.100 (100000)|EXECUTION_STARTED
14:22:33.100 (200000)|CODE_UNIT_STARTED|[EXTERNAL]|01q000000000001|AccountTrigger on Account trigger event BeforeUpdate|__sfdc_trigger/AccountTrigger
14:22:33.100 (300000)|METHOD_ENTRY|[1]|01p000000000001|AccountTriggerHandler.beforeUpdate()
14:22:33.100 (400000)|METHOD_ENTRY|[12]|01p000000000001|AccountService.recalculate(List<Account>)
14:22:33.100 (500000)|SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id, Name FROM Contact WHERE AccountId = :accountId
14:22:33.100 (2500000)|SOQL_EXECUTE_END|[15]|Rows:3
14:22:33.100 (2600000)|SOQL_EXECUTE_BEGIN|[15]|Aggregations:0|SELECT Id, Name FROM Contact WHERE AccountId = :accountId
14:22:33.100 (5200000)|SOQL_EXECUTE_END|[15]|Rows:5
14:22:33.100 (5300000)|USER_DEBUG|[18]|DEBUG|Recalculated totals for account batch
14:22:33.100 (5310000)|LIMIT_USAGE|[18]|SCRIPT_STATEMENTS|412|200000
14:22:33.100 (5320000)|USER_DEBUG|[19]|DEBUG|payload={"accountId":"001000000000001","name":"Acme Corporation Holdings International","rating":"Hot","annualRevenue":18500000,"contacts":[{"id":"003000000000001","name":"Rene Ortiz","email":"rene.ortiz@example.com","title":"VP Operations"},{"id":"003000000000002","name":"Adaeze Okafor","email":"adaeze.okafor@example.com","title":"Director of Procurement"}],"flags":["recalculated","bulk","needs-review"]}
14:22:33.100 (5330000)|USER_DEBUG|[20]|DEBUG|(Account:{Id=001000000000001, Name=Acme Corporation},
Account:{Id=001000000000002, Name=Globex Industries},
Account:{Id=001000000000003, Name=Initech Systems})
14:22:33.100 (5340000)|USER_DEBUG|[21]|WARN|batch=3|retries=1|status=partial success
14:22:33.100 (5350000)|STATIC_VARIABLE_LIST|
  int:BYTES:0
  byte[]:DigitOnes:0
  byte[]:DigitTens:0
14:22:33.100 (5400000)|DML_BEGIN|[22]|Op:Update|Type:Account|Rows:2
14:22:33.100 (6900000)|DML_END|[22]
14:22:33.100 (7000000)|METHOD_EXIT|[12]|01p000000000001|AccountService.recalculate(List<Account>)
14:22:33.100 (7100000)|METHOD_EXIT|[1]|01p000000000001|AccountTriggerHandler.beforeUpdate()
14:22:33.100 (7200000)|CODE_UNIT_FINISHED|AccountTrigger on Account trigger event BeforeUpdate
14:22:33.100 (7300000)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:301000000000abc
14:22:33.100 (7400000)|FLOW_START_INTERVIEW_BEGIN|301000000000abc|Account_After_Save
14:22:33.100 (7500000)|FLOW_ELEMENT_BEGIN|301000000000abc|FlowDecision|Check_Type
14:22:33.100 (7600000)|FLOW_ELEMENT_END|301000000000abc|FlowDecision|Check_Type
14:22:33.100 (7700000)|FLOW_ELEMENT_BEGIN|301000000000abc|FlowRecordUpdate|Update_Rating
14:22:33.100 (8900000)|FLOW_ELEMENT_END|301000000000abc|FlowRecordUpdate|Update_Rating
14:22:33.100 (9000000)|FLOW_START_INTERVIEW_END|301000000000abc|Account_After_Save
14:22:33.100 (9100000)|EXCEPTION_THROWN|[24]|System.NullPointerException: Attempt to de-reference a null object
14:22:33.100 (9200000)|CODE_UNIT_FINISHED|Flow:301000000000abc
14:22:33.100 (9300000)|CUMULATIVE_LIMIT_USAGE
14:22:33.100 (9300000)|LIMIT_USAGE_FOR_NS|(default)|
  Number of SOQL queries: 2 out of 100
  Number of query rows: 8 out of 50000
  Number of DML statements: 1 out of 150
  Number of DML rows: 2 out of 10000
  Maximum CPU time: 4200 out of 10000
  Maximum heap size: 120000 out of 6000000
  Number of callouts: 0 out of 100
14:22:33.100 (9300000)|CUMULATIVE_LIMIT_USAGE_END
14:22:33.100 (9400000)|EXECUTION_FINISHED`;
