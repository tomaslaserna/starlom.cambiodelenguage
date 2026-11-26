import pg from "pg";
const port = Number(process.env.ARCA_LAB_PGPORT);
const schema = process.env.ARCA_LAB_SCHEMA;
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^arca_lab_[a-f0-9]{12}$/.test(schema)) {
  throw new Error("Se requiere un servidor local de pruebas y un esquema aislado.");
}
export const pool = new pg.Pool({
  host: "127.0.0.1", port, user: "lab_owner", database: "arca_homologacion_lab",
  password: process.env.ARCA_LAB_PGPASSWORD, ssl: false, connectionTimeoutMillis: 4000,
  application_name: process.env.ARCA_LAB_OPERATOR || "arca-lab",
  options: "-c search_path=" + schema,
});
