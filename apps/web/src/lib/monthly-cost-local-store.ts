import { DatabaseSync } from 'node:sqlite';
import { applyMonthlyCostCommand, importMonthlyCostSource, restoreErpCostState, type MonthlyCostSource, type CostCommand } from './monthly-cost-erp-domain.ts';

// Isolated server persistence for the local acceptance test. Never uses ERP credentials.
export class LocalMonthlyCostStore {
 private db:DatabaseSync;
 constructor(path:string) {
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS monthly_costs (company_id INTEGER PRIMARY KEY, state TEXT NOT NULL, source TEXT NOT NULL)');
 }
 initialize(source:MonthlyCostSource) {
  const state=importMonthlyCostSource(source);
  this.db.prepare('INSERT OR IGNORE INTO monthly_costs(company_id,state,source) VALUES (?,?,?)').run(source.companyId,JSON.stringify(state),JSON.stringify(source));
 }
 read(companyId:number) {
  const row=this.db.prepare('SELECT state FROM monthly_costs WHERE company_id=?').get(companyId);
  return row?restoreErpCostState(String(row.state)):null;
 }
 mutate(companyId:number,command:CostCommand,actor:string) {
  this.db.exec('BEGIN IMMEDIATE');
  try {
   const state=this.read(companyId);if(!state||state.companyId!==companyId)throw new Error('Empresa sin configuración mensual');
   const next=applyMonthlyCostCommand(state,command,actor);
   this.db.prepare('UPDATE monthly_costs SET state=? WHERE company_id=?').run(JSON.stringify(next),companyId);
   this.db.exec('COMMIT');return next;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
