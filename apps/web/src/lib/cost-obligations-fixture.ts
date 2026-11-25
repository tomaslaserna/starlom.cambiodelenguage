// Synthetic local data only.

const state = {
  schema: 1,
  revision: 0,
  companyId: 1,
  baselineMonth: "2026-11",
  capturedAt: "2026-11-24T12:00:00Z",
  excluded: [],
  decisions: { "2026-11": { "expense:rent": true, "expense:internet": true } },
  snapshots: {},
  events: [],
  costs: [
    {id:"salary:9",name:"Empleado · ejemplo",source:"salary",start:"2026-11",durationMonths:null,versions:[{from:"2026-11",amountCents:80000000,active:true,bonus:true,chargesPercent:20}]},
    {
      id: "expense:rent",
      name: "Alquiler · ejemplo",
      source: "expense",
      start: "2026-11",
      durationMonths: null,
      versions: [
        {
          from: "2026-11",
          amountCents: 80000000,
          active: true,
          bonus: false,
          chargesPercent: 0,
        },
      ],
    },

    {
      id: "expense:internet",
      name: "Internet · ejemplo",
      source: "expense",
      start: "2026-11",
      durationMonths: null,
      versions: [
        {
          from: "2026-11",
          amountCents: 5000000,
          active: true,
          bonus: false,
          chargesPercent: 0,
        },
      ],
    },

    {
      id: "expense:pending",
      name: "Mantenimiento · por confirmar",
      source: "expense",
      start: "2026-11",
      durationMonths: null,
      versions: [
        {
          from: "2026-11",
          amountCents: 1000000,
          active: true,
          bonus: false,
          chargesPercent: 0,
        },
      ],
    },
  ],
};

export const obligationFixtureSql = `

 CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE ROLE starlim_app;

 CREATE TABLE empresas(id bigint PRIMARY KEY);INSERT INTO empresas VALUES(1),(2);

 CREATE TABLE profiles(id uuid PRIMARY KEY);INSERT INTO profiles VALUES('11111111-1111-4111-8111-111111111111');

 CREATE TABLE admin_monthly_cost_ledger(empresa_id bigint PRIMARY KEY,state jsonb);INSERT INTO admin_monthly_cost_ledger VALUES(1,'${JSON.stringify(state)}');

 CREATE TABLE admin_sueldos_config(id bigint,empresa_id bigint,profile_id uuid);
 CREATE TABLE admin_sueldo_movimientos(empresa_id bigint,profile_id uuid,periodo date,tipo text,monto numeric);
 INSERT INTO admin_sueldos_config VALUES(9,1,'11111111-1111-4111-8111-111111111111');
 CREATE TABLE admin_finance_monthly_closures(id serial,empresa_id bigint,month date,status text);

 CREATE TABLE admin_treasury_accounts(id bigint PRIMARY KEY,empresa_id bigint,name text,active boolean,currency text);INSERT INTO admin_treasury_accounts VALUES(1,1,'Santander · demo',true,'ARS'),(2,2,'Otra empresa',true,'ARS'),(3,1,'Inactiva',false,'ARS'),(4,1,'Efectivo · demo',true,'ARS');

 CREATE TABLE admin_treasury_movements(id bigserial PRIMARY KEY,empresa_id bigint,account_id bigint REFERENCES admin_treasury_accounts(id),movement_date date,direction text,amount numeric(16,2),concept text,source_type text,source_id text,reference text,notes text,created_by uuid,created_at timestamptz DEFAULT now());

 CREATE UNIQUE INDEX movement_source ON admin_treasury_movements(empresa_id,source_type,source_id) WHERE source_id<>'';

 INSERT INTO admin_treasury_movements(id,empresa_id,account_id,movement_date,direction,amount,concept,source_type,source_id) VALUES(10,1,1,'2026-11-24','outflow',50,'Egreso manual de ejemplo','manual','');

 SELECT setval('admin_treasury_movements_id_seq',10);

`;
