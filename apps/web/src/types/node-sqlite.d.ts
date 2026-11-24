// Minimal surface used by the Node 24 local-only acceptance-test database.
declare module 'node:sqlite' {
 export class DatabaseSync {
  constructor(path:string);
  exec(sql:string):void;
  prepare(sql:string):{run(...params:(string|number|null)[]):unknown;get(...params:(string|number|null)[]):Record<string,unknown>|undefined};
  close():void;
 }
}
